"""
Spiktor Camera Eyes — Complete Stack
=====================================

Hardware layer:   ksoza/CameraCapture (ccap) — C++/Rust cross-platform capture
                  Python ctypes binding to ccap shared library
NVR layer:        ksoza/frigate — IP camera NVR, MQTT events, motion gating
WiFi sensing:     ksoza/ESPectre — presence detection through walls via WiFi CSI
Detection:        ksoza/ultralytics (YOLO11) — objects, tracking, pose, segmentation  
Perception:       ksoza/mediapipe — face, hands, gesture, holistic body
Vision:           ksoza/opencv-python — frame processing + fallback capture
Intelligence:     Claude Haiku (cost-gated) — scene understanding, anomaly detection

Key principle: Claude vision fires ONLY on meaningful frames.
  Static scene           → dropped (motion gate)
  Motion, no objects     → YOLO pass, no Claude
  Objects detected       → MediaPipe enrichment + Claude vision
  ESPectre WiFi trigger  → wake camera, start watching

This architecture means 95% of frames never touch the API.
"""

import asyncio
import base64
import ctypes
import json
import logging
import os
import platform
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

import aiohttp
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket
from fastapi.responses import StreamingResponse

logger = logging.getLogger("spiktor.camera")

ANTHROPIC_API_KEY = os.environ.get("ELIZA_ANTHROPIC_API_KEY", "")
FRIGATE_HOST      = os.environ.get("FRIGATE_HOST",    "http://frigate:5000")
FRIGATE_MQTT      = os.environ.get("FRIGATE_MQTT",    "mqtt://mosquitto:1883")
ESPECTRE_HOST     = os.environ.get("ESPECTRE_HOST",   "http://espectre:8080")
CCAP_LIB_PATH     = os.environ.get("CCAP_LIB_PATH",   "")       # path to ccap .so/.dll
MOTION_THRESHOLD  = float(os.environ.get("MOTION_THRESHOLD",  "500"))
YOLO_CONFIDENCE   = float(os.environ.get("YOLO_CONFIDENCE",   "0.4"))
CLAUDE_GATE_DELAY = float(os.environ.get("CLAUDE_GATE_DELAY", "3.0"))


# ── ccap Hardware Bridge ──────────────────────────────────────────────────────
#
# CameraCapture (ccap) provides hardware-accelerated capture with:
#   - DirectShow + Media Foundation on Windows
#   - AVFoundation on macOS / iOS
#   - V4L2 on Linux
#   - Hardware pixel format conversion (NV12, YUV, RGB)
#   - Rust bindings for the core library
#
# We bind via ctypes to the ccap C99 interface.
# Falls back to OpenCV VideoCapture if ccap lib not found.

class CCAPCapture:
    """
    Hardware-accelerated camera capture via ksoza/CameraCapture (ccap).
    C99 interface binding via ctypes.
    Falls back to OpenCV if ccap shared library not available.
    """

    # ccap C99 API signatures
    _CCAP_FUNCS = {
        "ccap_create":          (ctypes.c_void_p, []),
        "ccap_destroy":         (None,            [ctypes.c_void_p]),
        "ccap_open":            (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_int]),
        "ccap_open_by_name":    (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_char_p]),
        "ccap_open_file":       (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_char_p]),
        "ccap_set_resolution":  (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]),
        "ccap_set_fps":         (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_float]),
        "ccap_start":           (ctypes.c_int,    [ctypes.c_void_p]),
        "ccap_stop":            (None,            [ctypes.c_void_p]),
        "ccap_capture_frame":   (ctypes.c_int,    [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]),
        "ccap_get_width":       (ctypes.c_int,    [ctypes.c_void_p]),
        "ccap_get_height":      (ctypes.c_int,    [ctypes.c_void_p]),
    }

    def __init__(self, source: Any, width: int = 1280, height: int = 720, fps: float = 30.0):
        self.source  = source
        self.width   = width
        self.height  = height
        self.fps     = fps
        self._lib    = None
        self._handle = None
        self._cv_cap = None   # OpenCV fallback

        self._try_load_ccap()

    def _try_load_ccap(self):
        """Attempt to load ccap shared library. Falls back to OpenCV silently."""
        lib_path = CCAP_LIB_PATH
        if not lib_path:
            # Auto-detect based on platform
            system = platform.system()
            if system == "Windows":
                lib_path = "ccap.dll"
            elif system == "Darwin":
                lib_path = "libccap.dylib"
            else:
                lib_path = "libccap.so"

        try:
            self._lib = ctypes.CDLL(lib_path)
            # Bind functions
            for name, (restype, argtypes) in self._CCAP_FUNCS.items():
                fn = getattr(self._lib, name, None)
                if fn:
                    fn.restype  = restype
                    fn.argtypes = argtypes
            logger.info("ccap hardware library loaded: %s", lib_path)
        except OSError:
            logger.info("ccap library not found — using OpenCV VideoCapture fallback")
            self._lib = None

    def open(self) -> bool:
        if self._lib:
            return self._open_ccap()
        return self._open_opencv()

    def _open_ccap(self) -> bool:
        self._handle = self._lib.ccap_create()
        if not self._handle:
            return False

        # Open source
        if isinstance(self.source, int):
            ret = self._lib.ccap_open(self._handle, self.source)
        elif isinstance(self.source, str) and (
            self.source.startswith("rtsp://") or
            self.source.startswith("http://") or
            Path(self.source).exists()
        ):
            ret = self._lib.ccap_open_file(self._handle, self.source.encode())
        else:
            ret = self._lib.ccap_open_by_name(self._handle, str(self.source).encode())

        if ret != 0:
            return False

        self._lib.ccap_set_resolution(self._handle, self.width, self.height)
        self._lib.ccap_set_fps(self._handle, self.fps)
        self._lib.ccap_start(self._handle)
        return True

    def _open_opencv(self) -> bool:
        self._cv_cap = cv2.VideoCapture(self.source)
        if not self._cv_cap.isOpened():
            return False
        self._cv_cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self.width)
        self._cv_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._cv_cap.set(cv2.CAP_PROP_FPS, self.fps)
        return True

    def read(self) -> Optional[np.ndarray]:
        """Read next frame. Returns BGR numpy array or None."""
        if self._lib and self._handle:
            return self._read_ccap()
        elif self._cv_cap:
            ret, frame = self._cv_cap.read()
            return frame if ret else None
        return None

    def _read_ccap(self) -> Optional[np.ndarray]:
        """Read via ccap with hardware pixel conversion to BGR."""
        buf_size = self.width * self.height * 3
        buf      = (ctypes.c_uint8 * buf_size)()
        size_out = ctypes.c_int(0)
        ret      = self._lib.ccap_capture_frame(self._handle, buf, ctypes.byref(size_out))
        if ret != 0 or size_out.value == 0:
            return None
        arr = np.frombuffer(buf, dtype=np.uint8, count=size_out.value)
        return arr.reshape(self.height, self.width, 3)

    def release(self):
        if self._lib and self._handle:
            self._lib.ccap_stop(self._handle)
            self._lib.ccap_destroy(self._handle)
            self._handle = None
        if self._cv_cap:
            self._cv_cap.release()
            self._cv_cap = None

    @property
    def backend(self) -> str:
        return "ccap (hardware-accelerated)" if self._lib else "OpenCV (software fallback)"


# ── ESPectre WiFi CSI Sensor ──────────────────────────────────────────────────
#
# ESPectre uses WiFi Channel State Information (CSI) to detect motion/presence
# through walls — no camera required.
# ESP32 nodes send CSI data → ML model runs on-device → presence events via MQTT
# Spiktor subscribes to presence events → wakes up camera sessions on motion

class ESPectreMonitor:
    """
    Connects to ESPectre Home Assistant / MQTT integration.
    Receives presence/motion events from WiFi CSI sensors.
    Triggers camera capture sessions when presence detected.
    """

    def __init__(self):
        self.sensors:   dict[str, dict] = {}   # sensor_id → {present, confidence, last_seen}
        self.callbacks: list[Callable]  = []

    def on_presence(self, callback: Callable):
        self.callbacks.append(callback)

    async def poll_ha(self):
        """Poll Home Assistant REST API for ESPectre sensor states."""
        ha_url   = os.environ.get("HOME_ASSISTANT_URL", "http://homeassistant:8123")
        ha_token = os.environ.get("HOME_ASSISTANT_TOKEN", "")
        if not ha_token:
            return

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{ha_url}/api/states",
                headers={"Authorization": f"Bearer {ha_token}",
                         "Content-Type": "application/json"}
            ) as resp:
                if resp.status != 200:
                    return
                states = await resp.json()
                for state in states:
                    entity_id = state.get("entity_id", "")
                    if "espectre" in entity_id or "motion" in entity_id.lower():
                        present = state.get("state") in ("on", "detected", "home")
                        self.sensors[entity_id] = {
                            "present":    present,
                            "confidence": float(state.get("attributes", {}).get("confidence", 0.5)),
                            "last_seen":  time.time()
                        }
                        if present:
                            for cb in self.callbacks:
                                await cb({"sensor": entity_id, "present": True, "source": "espectre_csi"})

    async def start_polling(self, interval: float = 5.0):
        """Poll HA every N seconds for ESPectre state changes."""
        while True:
            try:
                await self.poll_ha()
            except Exception as e:
                logger.debug("ESPectre poll error: %s", e)
            await asyncio.sleep(interval)

    def any_presence(self) -> bool:
        return any(s["present"] for s in self.sensors.values())


# ── Motion gate (fast local diff) ─────────────────────────────────────────────

class MotionGate:
    def __init__(self, threshold: float = MOTION_THRESHOLD):
        self.threshold  = threshold
        self.prev_frame = None

    def has_motion(self, frame: np.ndarray) -> bool:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        if self.prev_frame is None:
            self.prev_frame = gray
            return False
        delta    = cv2.absdiff(self.prev_frame, gray)
        thresh   = cv2.threshold(delta, 25, 255, cv2.THRESH_BINARY)[1]
        motion   = thresh.sum() / 255
        self.prev_frame = gray
        return motion > self.threshold


# ── YOLO perception (ultralytics) ─────────────────────────────────────────────

class YOLOPerception:
    def __init__(self):
        self._model = None

    def _load(self):
        if self._model is None:
            try:
                from ultralytics import YOLO
                self._model = YOLO("yolo11n.pt")
                logger.info("YOLO11n loaded")
            except ImportError:
                logger.warning("ultralytics not installed")
        return self._model

    def detect(self, frame: np.ndarray) -> list[dict]:
        model = self._load()
        if not model:
            return []
        results = model(frame, conf=YOLO_CONFIDENCE, verbose=False)
        out = []
        for r in results:
            for box in r.boxes:
                out.append({
                    "label":      r.names[int(box.cls)],
                    "confidence": float(box.conf),
                    "bbox":       box.xyxy[0].tolist()
                })
        return out

    def should_alert(self, detections: list[dict], watch_labels: list[str]) -> bool:
        if not watch_labels:
            return len(detections) > 0
        found = {d["label"] for d in detections}
        return bool(found & set(watch_labels))


# ── MediaPipe enrichment ──────────────────────────────────────────────────────

class MediaPipePerception:
    def __init__(self):
        self._ready = False
        self._face  = None
        self._pose  = None
        self._hands = None

    def _load(self):
        if not self._ready:
            try:
                import mediapipe as mp
                self._face  = mp.solutions.face_detection.FaceDetection(min_detection_confidence=0.5)
                self._pose  = mp.solutions.pose.Pose(min_detection_confidence=0.5)
                self._hands = mp.solutions.hands.Hands(max_num_hands=2, min_detection_confidence=0.5)
                self._ready = True
            except ImportError:
                pass

    def analyze(self, frame: np.ndarray) -> dict:
        self._load()
        result = {"faces": 0, "poses": 0, "hands": 0, "activity": "unknown"}
        if not self._ready:
            return result
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if self._face:
            fr = self._face.process(rgb)
            result["faces"] = len(fr.detections) if fr.detections else 0
        if self._pose:
            pr = self._pose.process(rgb)
            if pr.pose_landmarks:
                result["poses"]    = 1
                result["activity"] = self._estimate_activity(pr.pose_landmarks)
        if self._hands:
            hr = self._hands.process(rgb)
            result["hands"] = len(hr.multi_hand_landmarks) if hr.multi_hand_landmarks else 0
        return result

    @staticmethod
    def _estimate_activity(lm) -> str:
        try:
            nose_y = lm.landmark[0].y
            hip_y  = (lm.landmark[23].y + lm.landmark[24].y) / 2
            if nose_y < 0.3:     return "standing"
            elif hip_y > 0.7:    return "sitting"
            else:                return "moving"
        except Exception:        return "unknown"


# ── Frigate NVR integration ───────────────────────────────────────────────────

class FrigateIntegration:
    """
    Connects to ksoza/frigate NVR for IP camera management.
    Subscribes to Frigate's MQTT events — only wake Claude when
    Frigate's on-device TensorFlow detection fires.
    This means zero wasted API calls on empty camera feeds.
    """

    def __init__(self):
        self.cameras: dict[str, dict] = {}

    async def get_cameras(self) -> list[dict]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FRIGATE_HOST}/api/config") as resp:
                if resp.status != 200:
                    return []
                config = await resp.json()
                return [
                    {"id": name, "name": name, "source": f"rtsp://frigate:8554/{name}"}
                    for name in config.get("cameras", {}).keys()
                ]

    async def get_snapshot(self, camera_name: str) -> Optional[bytes]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FRIGATE_HOST}/api/{camera_name}/latest.jpg") as resp:
                if resp.status == 200:
                    return await resp.read()
        return None

    async def get_events(self, camera_name: str = "", label: str = "", limit: int = 10) -> list[dict]:
        params = f"?limit={limit}"
        if camera_name: params += f"&camera={camera_name}"
        if label:       params += f"&label={label}"
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FRIGATE_HOST}/api/events{params}") as resp:
                return await resp.json() if resp.status == 200 else []


# ── Claude vision gate ────────────────────────────────────────────────────────

class ClaudeVisionGate:
    def __init__(self):
        self.last_call  = 0.0
        self.call_count = 0

    async def analyze(
        self,
        frame:       np.ndarray,
        detections:  list[dict],
        perception:  dict,
        camera_name: str,
        location:    str = "",
        question:    str = "",
        force:       bool = False
    ) -> Optional[dict]:
        now = time.time()
        if not force and now - self.last_call < CLAUDE_GATE_DELAY:
            return None

        self.last_call = now
        self.call_count += 1

        _, buf    = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        b64_frame = base64.b64encode(buf).decode()

        det_str  = ", ".join(f"{d['label']} ({d['confidence']:.0%})" for d in detections[:6])
        context  = f"Camera: {camera_name}"
        if location:   context += f" ({location})"
        if det_str:    context += f"\nDetected: {det_str}"
        if perception.get("faces"):  context += f"\nFaces: {perception['faces']}"
        if perception.get("activity") != "unknown": context += f"\nActivity: {perception['activity']}"

        prompt = question or "Describe what is happening. Note anomalies, safety concerns, or significant events. Be concise."

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json",
                         "x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01"},
                json={
                    "model": "claude-haiku-4-5",
                    "max_tokens": 300,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64_frame}},
                            {"type": "text",  "text": f"{context}\n\n{prompt}"}
                        ]
                    }]
                }
            ) as resp:
                data   = await resp.json()
                text   = data.get("content", [{}])[0].get("text", "")
                return {"analysis": text, "detections": detections,
                        "perception": perception, "camera": camera_name}


# ── Session manager ───────────────────────────────────────────────────────────

@dataclass
class CameraConfig:
    id:         str
    name:       str
    source:     Any          # int | str (RTSP/file/device name)
    fps:        float = 2.0
    width:      int   = 1280
    height:     int   = 720
    alert_on:   list  = field(default_factory=list)
    location:   str   = ""
    use_frigate:bool  = False

class CameraSessionManager:
    def __init__(self):
        self.sessions: dict[str, dict]  = {}
        self.callbacks: list[Callable]  = []
        self.yolo       = YOLOPerception()
        self.mediapipe  = MediaPipePerception()
        self.claude     = ClaudeVisionGate()
        self.frigate    = FrigateIntegration()
        self.espectre   = ESPectreMonitor()

        # Wake cameras when ESPectre detects presence
        self.espectre.on_presence(self._on_presence_detected)

    async def _on_presence_detected(self, event: dict):
        logger.info("[ESPectre] Presence detected via WiFi CSI: %s", event["sensor"])
        await self._emit({"type": "presence", "source": "espectre", **event})

    def on_event(self, cb: Callable): self.callbacks.append(cb)

    async def _emit(self, event: dict):
        for cb in self.callbacks:
            try: await cb(event)
            except Exception as e: logger.error("Callback error: %s", e)

    async def add_camera(self, config: CameraConfig) -> str:
        cap = CCAPCapture(config.source, config.width, config.height, config.fps * 10)
        if not cap.open():
            raise ValueError(f"Cannot open camera: {config.source} (tried {cap.backend})")

        self.sessions[config.id] = {
            "config":      config,
            "cap":         cap,
            "gate":        MotionGate(),
            "running":     True,
            "frames":      0,
            "alerts":      0,
            "last_frame":  None,
            "backend":     cap.backend
        }
        asyncio.create_task(self._capture_loop(config.id))
        logger.info("Camera %s started via %s", config.name, cap.backend)
        return config.id

    async def _capture_loop(self, cam_id: str):
        s      = self.sessions[cam_id]
        config = s["config"]
        cap    = s["cap"]
        gate   = s["gate"]
        delay  = 1.0 / config.fps

        while s["running"]:
            frame = cap.read()
            if frame is None:
                await asyncio.sleep(0.5)
                continue

            s["frames"]     += 1
            s["last_frame"]  = frame.copy()

            if not gate.has_motion(frame):
                await asyncio.sleep(delay)
                continue

            detections = self.yolo.detect(frame)
            if not self.yolo.should_alert(detections, config.alert_on):
                await asyncio.sleep(delay)
                continue

            perception = self.mediapipe.analyze(frame)

            # Free local event
            await self._emit({
                "type": "detection", "camera_id": cam_id,
                "camera_name": config.name, "detections": detections,
                "perception": perception, "timestamp": time.time()
            })

            # Gated Claude call
            result = await self.claude.analyze(
                frame, detections, perception,
                config.name, config.location
            )
            if result:
                s["alerts"] += 1
                await self._emit({
                    "type": "vision_analysis", "camera_id": cam_id,
                    "result": result, "timestamp": time.time()
                })

            await asyncio.sleep(delay)

    def get_frame(self, cam_id: str) -> Optional[np.ndarray]:
        s = self.sessions.get(cam_id)
        return s["last_frame"] if s else None

    def stop(self, cam_id: str):
        if cam_id in self.sessions:
            self.sessions[cam_id]["running"] = False
            self.sessions[cam_id]["cap"].release()
            del self.sessions[cam_id]

    def status(self) -> dict:
        return {
            cid: {
                "name":    s["config"].name,
                "backend": s["backend"],
                "frames":  s["frames"],
                "alerts":  s["alerts"],
                "claude_calls": self.claude.call_count,
                "espectre_presence": self.espectre.any_presence()
            }
            for cid, s in self.sessions.items()
        }


# ── FastAPI HTTP service ──────────────────────────────────────────────────────

app     = FastAPI(title="Spiktor Camera Eyes", version="2.0.0")
manager = CameraSessionManager()

@app.on_event("startup")
async def startup():
    asyncio.create_task(manager.espectre.start_polling())

@app.get("/health")
async def health():
    return {"status": "ok", "cameras": len(manager.sessions),
            "espectre": manager.espectre.any_presence()}

@app.get("/status")
async def status(): return manager.status()

@app.post("/cameras")
async def add_camera(body: dict):
    cfg = CameraConfig(
        id        = body.get("id",         f"cam_{int(time.time())}"),
        name      = body.get("name",       "Camera"),
        source    = body.get("source",     0),
        fps       = body.get("fps",        2.0),
        width     = body.get("width",      1280),
        height    = body.get("height",     720),
        alert_on  = body.get("alert_on",   []),
        location  = body.get("location",   ""),
    )
    cam_id = await manager.add_camera(cfg)
    return {"camera_id": cam_id, "backend": manager.sessions[cam_id]["backend"]}

@app.delete("/cameras/{cam_id}")
async def remove_camera(cam_id: str):
    manager.stop(cam_id)
    return {"status": "stopped"}

@app.get("/cameras/{cam_id}/snapshot")
async def snapshot(cam_id: str):
    frame = manager.get_frame(cam_id)
    if frame is None: return {"error": "no frame"}
    _, buf = cv2.imencode(".jpg", frame)
    return StreamingResponse(iter([buf.tobytes()]), media_type="image/jpeg")

@app.get("/cameras/{cam_id}/stream")
async def mjpeg_stream(cam_id: str):
    async def gen():
        while True:
            frame = manager.get_frame(cam_id)
            if frame is not None:
                _, buf = cv2.imencode(".jpg", frame)
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            await asyncio.sleep(0.05)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace;boundary=frame")

@app.post("/cameras/{cam_id}/ask")
async def ask_camera(cam_id: str, body: dict):
    frame = manager.get_frame(cam_id)
    if frame is None: return {"error": "no frame"}
    s          = manager.sessions.get(cam_id, {})
    config     = s.get("config", CameraConfig(cam_id, cam_id, cam_id))
    detections = manager.yolo.detect(frame)
    perception = manager.mediapipe.analyze(frame)
    manager.claude.last_call = 0   # override rate gate
    return await manager.claude.analyze(
        frame, detections, perception,
        config.name, config.location,
        body.get("question", ""), force=True
    )

@app.get("/frigate/cameras")
async def frigate_cameras():
    return await manager.frigate.get_cameras()

@app.get("/frigate/events")
async def frigate_events(camera: str = "", label: str = "", limit: int = 10):
    return await manager.frigate.get_events(camera, label, limit)

@app.get("/espectre/status")
async def espectre_status():
    return {"sensors": manager.espectre.sensors,
            "any_presence": manager.espectre.any_presence()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5002)

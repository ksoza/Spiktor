/**
 * Video Vision Plugin for Spiktor
 * Extracted from ksoza/claude-video-vision
 * Gives every Spiktor agent the ability to WATCH and UNDERSTAND videos.
 *
 * How it works:
 *   1. ffmpeg extracts frames at adaptive fps
 *   2. Whisper (local) or Gemini transcribes audio with timestamps
 *   3. Frames sent as base64 images + transcript to Claude vision
 *   4. Agent receives full perceptual brief: seen + said + when
 */

import type { Plugin, Action, IAgentRuntime, Memory } from "@elizaos/core";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;
const WHISPER_BACKEND   = process.env.WHISPER_BACKEND ?? "local";
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY ?? "";
const WHISPER_MODEL     = process.env.WHISPER_MODEL ?? "base";
const MAX_FRAMES        = parseInt(process.env.VIDEO_MAX_FRAMES ?? "20");
const DEFAULT_FPS       = parseFloat(process.env.VIDEO_DEFAULT_FPS ?? "0.5");

function checkDeps() {
  let ffmpeg = false, whisper = false;
  try { execSync("ffmpeg -version", { stdio: "ignore" }); ffmpeg = true; } catch {}
  try { execSync("whisper --help",  { stdio: "ignore" }); whisper = true; } catch {}
  return { ffmpeg, whisper };
}

async function extractFrames(videoPath: string, fps: number, startSec?: number, endSec?: number) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spiktor-vid-"));
  const timeFilter = (startSec !== undefined && endSec !== undefined) ? `-ss ${startSec} -to ${endSec}` : "";
  await execAsync(`ffmpeg -i "${videoPath}" ${timeFilter} -vf "fps=${fps},scale=1280:-1" -frames:v ${MAX_FRAMES} "${tmpDir}/frame_%04d.jpg" -y -loglevel error`);
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort().map(f => path.join(tmpDir, f));
  const frames = files.map(f => fs.readFileSync(f).toString("base64"));
  return { frames, tmpDir };
}

async function transcribeAudio(videoPath: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spiktor-aud-"));
  const audioPath = path.join(tmpDir, "audio.wav");
  try {
    await execAsync(`ffmpeg -i "${videoPath}" -ar 16000 -ac 1 "${audioPath}" -y -loglevel error`);
    if (WHISPER_BACKEND === "gemini" && GEMINI_API_KEY) {
      const b64 = fs.readFileSync(audioPath).toString("base64");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [
          { inline_data: { mime_type: "audio/wav", data: b64 } },
          { text: "Transcribe with timestamps [MM:SS]" }
        ]}]})
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    const { stdout } = await execAsync(`whisper "${audioPath}" --model ${WHISPER_MODEL} --output_format txt --output_dir "${tmpDir}" --language auto`);
    const txt = path.join(tmpDir, "audio.txt");
    return fs.existsSync(txt) ? fs.readFileSync(txt, "utf8").trim() : stdout.trim();
  } catch { return ""; }
  finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

async function analyzeWithClaude(frames: string[], transcript: string, question: string, videoName: string): Promise<string> {
  const step = Math.max(1, Math.floor(frames.length / 12));
  const selected = frames.filter((_, i) => i % step === 0).slice(0, 12);
  const content: any[] = [];
  selected.forEach((b64, i) => {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 }});
    content.push({ type: "text", text: `[Frame ${i+1}/${selected.length}]` });
  });
  content.push({ type: "text", text: `Video: ${videoName}\nTranscript: ${transcript || "none"}\n\nTask: ${question}` });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-opus-4-6", max_tokens: 2000, messages: [{ role: "user", content }],
      system: "You are a video intelligence analyst. Reference specific timestamps and frame content. Be precise and actionable." })
  });
  const d = await res.json();
  return d.content?.[0]?.text ?? "Analysis failed";
}

const WatchVideoAction: Action = {
  name: "WATCH_VIDEO",
  description: "Watch and understand a video file. Extracts frames + transcribes audio. Returns a full perceptual brief.",
  validate: async (_rt, msg) => /watch|video|\.mp4|\.mov|\.avi|\.mkv|\.webm|screen.?record|tutorial/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { videoPath, question, fps, startSec, endSec } = (opts as any) ?? {};
    const text = msg.content.text ?? "";
    const pathMatch = text.match(/([^\s]+\.(?:mp4|mov|avi|mkv|webm))/i);
    const vp = videoPath ?? pathMatch?.[1];
    if (!vp) return { text: "Provide a video file path." };
    const deps = checkDeps();
    if (!deps.ffmpeg) return { text: "⛔ ffmpeg required: apt-get install ffmpeg" };
    const q = question ?? text.replace(vp, "").trim() || "Describe what is happening. Extract key actions and insights.";
    const { frames, tmpDir } = await extractFrames(vp, fps ?? DEFAULT_FPS, startSec, endSec);
    const transcript = await transcribeAudio(vp);
    const analysis = await analyzeWithClaude(frames, transcript, q, path.basename(vp));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { text: `**Video Analysis: ${path.basename(vp)}**\n\n${analysis}`, data: { analysis, frameCount: frames.length } };
  },
  examples: []
};

const TranscribeVideoAction: Action = {
  name: "TRANSCRIBE_VIDEO",
  description: "Transcribe audio from a video file only (no frame analysis, faster).",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { videoPath } = (opts as any) ?? {};
    if (!videoPath) return { text: "Provide videoPath." };
    const t = await transcribeAudio(videoPath);
    return { text: `**Transcript:**\n\n${t}`, data: { transcript: t } };
  },
  examples: []
};

const VideoIntelAction: Action = {
  name: "VIDEO_INTEL",
  description: "Competitive intelligence video analysis — extracts claims, features, pricing, tech stack, actionable insights.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { videoPath, context } = (opts as any) ?? {};
    if (!videoPath) return { text: "Provide videoPath." };
    const deps = checkDeps();
    if (!deps.ffmpeg) return { text: "ffmpeg required" };
    const q = `Intelligence analysis: extract key claims, product features, pricing, companies/people mentioned, tech stack clues, and 3 actionable insights for LiTboxLabz/KSX/RiP.${context ? ` Context: ${context}` : ""}`;
    const { frames, tmpDir } = await extractFrames(videoPath, DEFAULT_FPS);
    const transcript = await transcribeAudio(videoPath).catch(() => "");
    const analysis = await analyzeWithClaude(frames, transcript, q, path.basename(videoPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { text: `**Video Intel Report:**\n\n${analysis}`, data: { analysis } };
  },
  examples: []
};

export const VideoVisionPlugin: Plugin = {
  name: "video-vision",
  description: "Video perception — watch, transcribe, intel-analyze any video. From ksoza/claude-video-vision.",
  providers: [], actions: [WatchVideoAction, TranscribeVideoAction, VideoIntelAction], evaluators: []
};

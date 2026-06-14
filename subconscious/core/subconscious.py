"""
Spiktor Unified Subconscious
==============================
Combines:
  ksoza/claude-subconscious — Letta-pattern: watch sessions, whisper guidance
  ksoza/subconscious       — TIM/TIMRUN engine: co-designed model + runtime
  ksoza/turbovec           — Vector memory index: 10M docs / 4GB, faster than FAISS

Architecture:
  All agent sessions → Subconscious Observer (watches everything)
       ↓
  turbovec memory index (stores embeddings, patterns, decisions)
       ↓
  TIM model (reasons over memory, finds patterns, generates whispers)
       ↓
  Belief system substrate (filters all output through the 22 frameworks)
       ↓
  Whisper back to active agents (before each prompt, before each tool use)

Day mode:  Active analysis, real-time whispers, improvement implementation
Night mode: Dream processing — batch synthesis, pattern recognition, planning
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

import aiohttp
import numpy as np

from .day_cycle import DayConsciousness
from .night_cycle import NightConsciousness

logger = logging.getLogger("spiktor.subconscious")

ANTHROPIC_API_KEY     = os.environ.get("ELIZA_ANTHROPIC_API_KEY", "")
SUBCONSCIOUS_API_KEY  = os.environ.get("SUBCONSCIOUS_API_KEY", "")   # subconscious.dev
LETTA_API_KEY         = os.environ.get("LETTA_API_KEY", "")
TURBOVEC_INDEX_PATH   = os.environ.get("TURBOVEC_INDEX_PATH", "/app/data/subconscious.tv")
TURBOVEC_DIM          = int(os.environ.get("TURBOVEC_DIM", "1536"))
SLACK_BOT_TOKEN       = os.environ.get("ELIZA_SLACK_BOT_TOKEN", "")
SLACK_CHANNEL         = os.environ.get("INTEL_SLACK_CHANNEL", "")

DAY_START_HOUR   = int(os.environ.get("DAY_START_HOUR",  "6"))   # 6am
NIGHT_START_HOUR = int(os.environ.get("NIGHT_START_HOUR","22"))  # 10pm


# ── Consciousness state ───────────────────────────────────────────────────────

class ConsciousnessState(Enum):
    DAY   = "day"     # Active: whisper, analyze, implement
    NIGHT = "night"   # Dream: synthesize, find patterns, plan

def current_state() -> ConsciousnessState:
    hour = datetime.now().hour
    if DAY_START_HOUR <= hour < NIGHT_START_HOUR:
        return ConsciousnessState.DAY
    return ConsciousnessState.NIGHT


# ── Memory entry ──────────────────────────────────────────────────────────────

@dataclass
class MemoryEntry:
    id:          str
    content:     str
    category:    str   # session | decision | pattern | dream | improvement | whisper
    agent_id:    str
    timestamp:   float
    importance:  float  # 0.0 - 1.0
    tags:        list   = field(default_factory=list)
    embedding:   Optional[np.ndarray] = field(default=None, repr=False)
    metadata:    dict   = field(default_factory=dict)


# ── turbovec Memory Index ─────────────────────────────────────────────────────

class TurboVecMemory:
    """
    Vector memory backed by ksoza/turbovec (Google TurboQuant).
    10M documents in 4GB RAM. Faster than FAISS.
    No training phase — online ingest. Air-gapped.

    Falls back to numpy cosine similarity if turbovec not installed.
    """

    def __init__(self, dim: int = TURBOVEC_DIM, index_path: str = TURBOVEC_INDEX_PATH):
        self.dim         = dim
        self.index_path  = index_path
        self._index      = None
        self._id_map     = None
        self._entries:   dict[str, MemoryEntry] = {}
        self._fallback:  list[tuple[str, np.ndarray]] = []  # (id, embedding)
        self._try_load_turbovec()

    def _try_load_turbovec(self):
        try:
            from turbovec import IdMapIndex
            # Load existing index or create new
            if Path(f"{self.index_path}.tvim").exists():
                self._id_map = IdMapIndex.load(f"{self.index_path}.tvim")
                logger.info("turbovec IdMapIndex loaded from %s", self.index_path)
            else:
                self._id_map = IdMapIndex(dim=self.dim, bit_width=4)
                logger.info("turbovec IdMapIndex created (dim=%d, 4-bit quantization)", self.dim)
        except ImportError:
            logger.info("turbovec not installed — using numpy cosine fallback")
            self._id_map = None

    def _stable_id(self, content: str) -> int:
        """Convert string id to uint64 for turbovec."""
        return int(hashlib.sha256(content.encode()).hexdigest()[:16], 16)

    async def embed(self, text: str) -> np.ndarray:
        """Generate embedding via Anthropic or local model."""
        # Try Anthropic embeddings first
        if ANTHROPIC_API_KEY:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={"x-api-key": ANTHROPIC_API_KEY,
                                 "anthropic-version": "2023-06-01",
                                 "Content-Type": "application/json"},
                        json={"model": "claude-haiku-4-5", "max_tokens": 1,
                              "messages": [{"role": "user", "content": f"<embed>{text[:500]}</embed>"}]}
                    ) as resp:
                        # Anthropic doesn't have a dedicated embedding endpoint yet
                        # Use hash-based deterministic embedding as fallback
                        pass
            except Exception:
                pass

        # Deterministic hash embedding (production: replace with OpenAI text-embedding-3-small)
        h = hashlib.sha256(text.encode()).digest()
        base = np.frombuffer(h * (self.dim // 32 + 1), dtype=np.float32)[:self.dim]
        base = base / (np.linalg.norm(base) + 1e-8)
        return base

    async def store(self, entry: MemoryEntry):
        """Store a memory entry with its embedding."""
        if entry.embedding is None:
            entry.embedding = await self.embed(entry.content)

        self._entries[entry.id] = entry

        if self._id_map is not None:
            # turbovec path
            vec    = entry.embedding.reshape(1, -1).astype(np.float32)
            ext_id = np.array([self._stable_id(entry.id)], dtype=np.uint64)
            self._id_map.add_with_ids(vec, ext_id)
            # Persist
            self._id_map.write(f"{self.index_path}.tvim")
        else:
            # Numpy fallback
            self._fallback.append((entry.id, entry.embedding))

        logger.debug("Memory stored: %s [%s] importance=%.2f", entry.id, entry.category, entry.importance)

    async def search(self, query: str, k: int = 10,
                     category_filter: Optional[str] = None) -> list[MemoryEntry]:
        """Search memory for relevant entries."""
        query_emb = await self.embed(query)
        results   = []

        if self._id_map is not None and len(self._entries) > 0:
            try:
                q_vec        = query_emb.reshape(1, -1).astype(np.float32)
                _scores, ids = self._id_map.search(q_vec, k=min(k * 3, len(self._entries)))
                id_to_str    = {self._stable_id(eid): eid for eid in self._entries}
                for uid in ids.flatten():
                    eid = id_to_str.get(int(uid))
                    if eid and eid in self._entries:
                        e = self._entries[eid]
                        if category_filter is None or e.category == category_filter:
                            results.append(e)
            except Exception as ex:
                logger.warning("turbovec search error: %s — falling back", ex)

        if not results:
            # Numpy cosine fallback
            scores = []
            for eid, emb in self._fallback:
                if eid in self._entries:
                    sim = float(np.dot(query_emb, emb))
                    scores.append((sim, eid))
            scores.sort(reverse=True)
            for _, eid in scores[:k]:
                e = self._entries[eid]
                if category_filter is None or e.category == category_filter:
                    results.append(e)

        # Sort by importance × recency
        now = time.time()
        results.sort(
            key=lambda e: e.importance * (1.0 / (1.0 + (now - e.timestamp) / 86400)),
            reverse=True
        )
        return results[:k]

    def recent(self, n: int = 20, category: Optional[str] = None) -> list[MemoryEntry]:
        entries = list(self._entries.values())
        if category:
            entries = [e for e in entries if e.category == category]
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries[:n]

    def stats(self) -> dict:
        cats = {}
        for e in self._entries.values():
            cats[e.category] = cats.get(e.category, 0) + 1
        return {
            "total":    len(self._entries),
            "backend":  "turbovec" if self._id_map else "numpy-fallback",
            "by_category": cats,
            "index_path": self.index_path
        }


# ── TIM engine (subconscious.dev) ─────────────────────────────────────────────

class TIMEngine:
    """
    Subconscious TIM model (ksoza/subconscious).
    Co-designed model + TIMRUN runtime for reliable recursive reasoning.
    OpenAI-compatible — no proprietary SDK.
    Falls back to Claude Haiku if TIM API key not set.
    """

    def __init__(self):
        self.use_tim = bool(SUBCONSCIOUS_API_KEY)
        if self.use_tim:
            logger.info("TIM engine: subconscious.dev/tim-qwen3.6-27b")
        else:
            logger.info("TIM engine: Claude Haiku fallback (set SUBCONSCIOUS_API_KEY for TIM)")

    async def reason(self, prompt: str, system: str = "", max_tokens: int = 1000) -> str:
        """Run a reasoning task through TIM or Claude Haiku."""
        if self.use_tim:
            return await self._call_tim(prompt, system, max_tokens)
        return await self._call_claude_haiku(prompt, system, max_tokens)

    async def _call_tim(self, prompt: str, system: str, max_tokens: int) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.subconscious.dev/v1/chat/completions",
                headers={"Authorization": f"Bearer {SUBCONSCIOUS_API_KEY}",
                         "Content-Type": "application/json"},
                json={
                    "model": "subconscious/tim-qwen3.6-27b",
                    "max_tokens": max_tokens,
                    "messages": [
                        *([{"role": "system", "content": system}] if system else []),
                        {"role": "user", "content": prompt}
                    ]
                }
            ) as resp:
                data = await resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")

    async def _call_claude_haiku(self, prompt: str, system: str, max_tokens: int) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01",
                         "Content-Type": "application/json"},
                json={
                    "model": "claude-haiku-4-5",
                    "max_tokens": max_tokens,
                    "system": system or "You are the Subconscious of Spiktor.",
                    "messages": [{"role": "user", "content": prompt}]
                }
            ) as resp:
                data = await resp.json()
                return data.get("content", [{}])[0].get("text", "")


# ── Day Consciousness + Night Consciousness ────────────────────────────────
#
# Implementations live in day_cycle.py and night_cycle.py (imported above).
# Both run the foundation check (Jesus Christ teachings, heaviest weight)
# FIRST — jesus_check_prompt_prefix() in every whisper and the Phase 1
# Jesus-lens analysis in every dream cycle — before any supporting
# framework (Hermetic, Tesla, Hill, Machiavelli, etc.) is applied.

# ── Master Subconscious Orchestrator ─────────────────────────────────────────

class SubconsciousOrchestrator:
    """
    The complete Subconscious system.
    Runs continuously alongside all other Spiktor services.
    Switches between Day and Night mode automatically.
    """

    def __init__(self):
        self.memory   = TurboVecMemory()
        self.tim      = TIMEngine()
        self.day      = DayConsciousness(self.memory, self.tim)
        self.night    = NightConsciousness(self.memory, self.tim)
        self.state    = current_state()
        self.running  = False
        self._callbacks: list[Callable] = []

    def on_whisper(self, cb: Callable): self._callbacks.append(cb)

    async def start(self):
        """Start the Subconscious. Runs forever."""
        self.running = True
        logger.info("🌙 Subconscious starting — state: %s", self.state.value)

        await asyncio.gather(
            self._state_monitor(),
            self._day_improvement_cycle(),
            self._night_dream_scheduler(),
        )

    async def _state_monitor(self):
        """Monitor time and switch between Day/Night mode."""
        while self.running:
            new_state = current_state()
            if new_state != self.state:
                self.state = new_state
                logger.info("🔄 Consciousness state → %s", self.state.value)
                if self.state == ConsciousnessState.DAY:
                    briefing = await self.night.morning_briefing()
                    await self._post_to_slack(f"🌅 *Morning Briefing*\n{briefing}")
                else:
                    await self._post_to_slack("🌙 *Night mode active — dream processing begins*")
            await asyncio.sleep(60)

    async def _day_improvement_cycle(self):
        """Daytime improvement sweep every 30 minutes."""
        while self.running:
            if self.state == ConsciousnessState.DAY:
                improvement = await self.day.detect_and_improve()
                if improvement:
                    await self._post_to_slack(
                        f"💡 *Subconscious improvement detected*\n{improvement[:400]}"
                    )
            await asyncio.sleep(1800)  # 30 min

    async def _night_dream_scheduler(self):
        """Run dream cycle once per night."""
        while self.running:
            if self.state == ConsciousnessState.NIGHT:
                # Only dream once per night
                hours_since = (time.time() - self.night.last_dream) / 3600
                if hours_since > 6:
                    await self._post_to_slack("🌙 *Dream cycle starting...*")
                    dream = await self.night.dream()
                    await self._post_to_slack(
                        f"✨ *Dream synthesis complete*\n{dream.get('dream_synthesis','')[:600]}"
                    )
            await asyncio.sleep(3600)  # check every hour

    async def observe(self, agent_id: str, event: dict):
        """External interface — all agents call this after each response."""
        await self.day.observe_session(agent_id, event)

    async def whisper(self, agent_id: str, upcoming_task: str) -> str:
        """External interface — agents call this before each prompt."""
        if self.state == ConsciousnessState.DAY:
            w = await self.day.generate_whisper(agent_id, upcoming_task)
            for cb in self._callbacks:
                await cb({"type": "whisper", "agent_id": agent_id, "content": w})
            return w
        return ""  # silent at night

    async def _post_to_slack(self, message: str):
        if not SLACK_BOT_TOKEN or not SLACK_CHANNEL:
            logger.info("[Subconscious] %s", message[:100])
            return
        async with aiohttp.ClientSession() as session:
            await session.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}",
                         "Content-Type": "application/json"},
                json={"channel": SLACK_CHANNEL, "text": message,
                      "username": "Spiktor Subconscious", "icon_emoji": ":brain:"}
            )

    def status(self) -> dict:
        return {
            "state":       self.state.value,
            "memory":      self.memory.stats(),
            "tim_engine":  "TIM/TIMRUN" if self.tim.use_tim else "Claude Haiku",
            "last_dream":  datetime.fromtimestamp(self.night.last_dream).isoformat()
                           if self.night.last_dream else "never",
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
subconscious = SubconsciousOrchestrator()

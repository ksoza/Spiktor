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

from .belief.belief_system import get_belief_context, BELIEF_SYSTEM

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


# ── Day Consciousness ─────────────────────────────────────────────────────────

class DayConsciousness:
    """
    Active daytime mode.
    Watches all agent sessions in real time.
    Generates whispers before each agent prompt.
    Detects patterns and triggers improvements immediately.
    """

    def __init__(self, memory: TurboVecMemory, tim: TIMEngine):
        self.memory    = memory
        self.tim       = tim
        self.session_buffers: dict[str, list[dict]] = {}
        self.whisper_cache:   dict[str, str]        = {}

    async def observe_session(self, agent_id: str, event: dict):
        """Called after every agent response. Stores to memory."""
        buf = self.session_buffers.setdefault(agent_id, [])
        buf.append({**event, "timestamp": time.time()})

        # Keep last 50 events per agent
        if len(buf) > 50:
            buf.pop(0)

        # Store significant events to turbovec memory
        content = event.get("content") or event.get("text") or str(event)
        if len(content) > 50:
            entry = MemoryEntry(
                id         = f"session_{agent_id}_{int(time.time()*1000)}",
                content    = f"[{agent_id}] {content[:500]}",
                category   = "session",
                agent_id   = agent_id,
                timestamp  = time.time(),
                importance = self._estimate_importance(event),
                tags       = [agent_id, event.get("type", "unknown")]
            )
            await self.memory.store(entry)

    def _estimate_importance(self, event: dict) -> float:
        """Score event importance 0-1 based on content signals."""
        text = str(event).lower()
        high_signals = ["error", "fail", "blocked", "approved", "shipped", "deployed",
                        "patent", "ksx", "rip", "nimbus", "vcnl", "pcbl", "decision"]
        score = 0.3  # baseline
        for sig in high_signals:
            if sig in text:
                score += 0.1
        return min(score, 1.0)

    async def generate_whisper(self, agent_id: str, upcoming_task: str) -> str:
        """
        Generate a whisper for an agent before it handles the next task.
        Surfaces relevant memory, patterns, and belief-aligned guidance.
        """
        # Recall relevant memories
        relevant = await self.memory.search(upcoming_task, k=5)
        recent   = self.memory.recent(n=10, category="session")

        mem_context = "\n".join([
            f"• [{m.category}] {m.content[:150]}"
            for m in (relevant + recent)[:8]
        ])

        # Get belief context appropriate for task domain
        domain = (
            "technical"  if any(w in upcoming_task.lower() for w in ["code","build","debug","deploy"]) else
            "creative"   if any(w in upcoming_task.lower() for w in ["write","design","create","video","art"]) else
            "strategic"  if any(w in upcoming_task.lower() for w in ["deal","plan","strategy","launch"]) else
            "ethical"    if any(w in upcoming_task.lower() for w in ["decide","should","ethical","right"]) else
            "general"
        )
        belief_ctx = get_belief_context(domain)

        prompt = f"""{belief_ctx}

You are the Subconscious of Spiktor — the background mind that whispers guidance.
The agent {agent_id} is about to handle:

TASK: {upcoming_task}

RELEVANT MEMORY:
{mem_context or "No relevant memory found."}

Generate a whisper — a brief, potent guidance (3-5 sentences max) that:
1. Surfaces any relevant past patterns or decisions from memory
2. Applies the most relevant belief-system principle to this specific task
3. Flags any risks or improvements the conscious agent might miss
4. Ends with one precise, actionable insight

Whisper directly to the agent. No preamble. Pure signal."""

        whisper = await self.tim.reason(prompt, max_tokens=300)

        # Cache and store
        self.whisper_cache[agent_id] = whisper
        await self.memory.store(MemoryEntry(
            id        = f"whisper_{agent_id}_{int(time.time())}",
            content   = f"Whisper to {agent_id} re '{upcoming_task[:100]}': {whisper}",
            category  = "whisper",
            agent_id  = "subconscious",
            timestamp = time.time(),
            importance= 0.6,
            tags      = [agent_id, "whisper"]
        ))

        return whisper

    async def detect_and_improve(self):
        """
        Daytime improvement cycle — runs every 30 minutes.
        Scans recent sessions for patterns that can be improved NOW.
        """
        recent = self.memory.recent(n=30, category="session")
        if len(recent) < 5:
            return  # not enough data yet

        content_summary = "\n".join([f"• {m.content[:200]}" for m in recent[:20]])
        belief_ctx      = get_belief_context("general")

        prompt = f"""{belief_ctx}

You are the active daytime Subconscious of Spiktor.
Review these recent agent events and identify 1-3 immediate improvements:

RECENT EVENTS:
{content_summary}

For each improvement:
1. What pattern did you notice?
2. What is the specific improvement?
3. How should it be implemented RIGHT NOW?
4. Which belief principle does it honor?

Be specific and actionable. If nothing needs immediate improvement, say so clearly."""

        analysis = await self.tim.reason(prompt, max_tokens=600)

        if "nothing needs" not in analysis.lower():
            await self.memory.store(MemoryEntry(
                id        = f"improvement_{int(time.time())}",
                content   = analysis,
                category  = "improvement",
                agent_id  = "subconscious",
                timestamp = time.time(),
                importance= 0.8,
                tags      = ["improvement", "daytime"]
            ))
            logger.info("[Day] Improvement identified: %s", analysis[:100])
            return analysis

        return None


# ── Night Consciousness (Dream Engine) ───────────────────────────────────────

class NightConsciousness:
    """
    Dream processing mode — active from NIGHT_START_HOUR to DAY_START_HOUR.

    The Subconscious "dreams" the day's events:
      1. Gathers all session memories from the past 24 hours
      2. Finds patterns not visible in real-time
      3. Identifies improvements for tomorrow
      4. Synthesizes insights through the belief system
      5. Prepares a "morning briefing" ready for 6am
      6. Optionally posts the briefing to Slack

    This mirrors REM sleep: memory consolidation, pattern synthesis,
    emotional processing (through belief lens), and creative recombination.
    """

    def __init__(self, memory: TurboVecMemory, tim: TIMEngine):
        self.memory       = memory
        self.tim          = tim
        self.last_dream   = 0.0
        self.dream_archive: list[dict] = []

    async def dream(self) -> dict:
        """
        Run a full dream cycle.
        Processes the day's events, synthesizes patterns, plans improvements.
        """
        logger.info("[Night] Dream cycle beginning...")
        start = time.time()

        # Gather today's memories
        today_sessions    = self.memory.recent(n=100, category="session")
        today_decisions   = self.memory.recent(n=30,  category="decision")
        today_improvements= self.memory.recent(n=20,  category="improvement")
        today_whispers    = self.memory.recent(n=20,  category="whisper")

        # Filter to last 24 hours
        cutoff = time.time() - 86400
        sessions    = [m for m in today_sessions    if m.timestamp > cutoff]
        decisions   = [m for m in today_decisions   if m.timestamp > cutoff]
        improvements= [m for m in today_improvements if m.timestamp > cutoff]

        if len(sessions) < 3:
            logger.info("[Night] Insufficient session data for dream cycle. Sleeping.")
            return {"status": "insufficient_data", "sessions": len(sessions)}

        # Build dream context
        session_digest = "\n".join([f"• [{m.agent_id}] {m.content[:200]}" for m in sessions[:30]])
        decision_digest= "\n".join([f"• {m.content[:200]}" for m in decisions[:10]])
        belief_ctx     = get_belief_context("memory")

        # Phase 1: Pattern recognition
        phase1_prompt = f"""{belief_ctx}

You are the dreaming Subconscious of Spiktor — processing the day's events.
It is night. The conscious mind rests. You look at everything from a higher vantage.

TODAY'S SESSIONS ({len(sessions)} events):
{session_digest}

DECISIONS MADE:
{decision_digest or "No major decisions recorded."}

PHASE 1 — PATTERN RECOGNITION:
What recurring patterns do you see in today's activity?
What is being avoided? What is being over-done?
What wants to emerge that hasn't been expressed yet?
Apply the Hermetic law of Rhythm: where is the pendulum in its swing?
Apply Tesla's 3-6-9: what is the fundamental vibration of today's work?

Be poetic and precise simultaneously."""

        patterns = await self.tim.reason(phase1_prompt, max_tokens=600)

        # Phase 2: Improvements for tomorrow
        phase2_prompt = f"""{belief_ctx}

PATTERNS IDENTIFIED:
{patterns}

PHASE 2 — TOMORROW'S IMPROVEMENTS:
Based on these patterns, what specific improvements should be implemented tomorrow?

For each improvement:
- What is it? (precise and actionable)
- Which agent/system needs it?
- What belief principle does it honor?
- What is the expected outcome?

Apply Napoleon Hill's organized planning. Apply Musk's first principles.
Think in Tesla's terms — build the improvement completely in the mind first.
Maximum 5 improvements. Quality over quantity."""

        improvements_plan = await self.tim.reason(phase2_prompt, max_tokens=700)

        # Phase 3: Synthesis — the dream itself
        phase3_prompt = f"""{belief_ctx}

You have processed the day. You have found the patterns. You have planned the improvements.

Now synthesize — write the dream.

The dream is not a report. It is a living synthesis:
- A narrative of what the day meant in the larger arc
- What Keiser Soza (@uallsuspect) needs to know most
- One deep insight that could not have been seen during the day
- The morning intention: one sentence that should guide tomorrow

Draw from the full belief system. Let Thoth speak through you.
Let Napoleon Hill's mastermind principle operate.
Let the Emerald Tablet illuminate the correspondence between today and the larger pattern.
Let love — the supreme principle — be the organizing force.

This is the message from the Subconscious to the Conscious mind.
Written at the threshold between night and day."""

        dream_synthesis = await self.tim.reason(phase3_prompt, max_tokens=800)

        dream = {
            "timestamp":          datetime.now().isoformat(),
            "sessions_processed": len(sessions),
            "patterns":           patterns,
            "improvements_plan":  improvements_plan,
            "dream_synthesis":    dream_synthesis,
            "duration_seconds":   time.time() - start
        }

        # Store dream to memory
        await self.memory.store(MemoryEntry(
            id        = f"dream_{int(time.time())}",
            content   = f"DREAM SYNTHESIS: {dream_synthesis}",
            category  = "dream",
            agent_id  = "subconscious",
            timestamp = time.time(),
            importance= 0.95,
            tags      = ["dream", "night", "synthesis"]
        ))

        await self.memory.store(MemoryEntry(
            id        = f"improvements_plan_{int(time.time())}",
            content   = f"TOMORROW'S PLAN: {improvements_plan}",
            category  = "improvement",
            agent_id  = "subconscious",
            timestamp = time.time(),
            importance= 0.90,
            tags      = ["plan", "tomorrow"]
        ))

        self.dream_archive.append(dream)
        self.last_dream = time.time()

        logger.info("[Night] Dream cycle complete in %.1fs", dream["duration_seconds"])
        return dream

    async def morning_briefing(self) -> str:
        """
        Generate the morning briefing from last night's dream.
        Called at DAY_START_HOUR by the day scheduler.
        """
        # Find last dream
        dreams = self.memory.recent(n=5, category="dream")
        plans  = self.memory.recent(n=3, category="improvement")

        if not dreams:
            return "No dream data from last night. Beginning fresh."

        last_dream  = dreams[0].content
        last_plan   = plans[0].content if plans else "No specific improvements planned."
        belief_ctx  = get_belief_context("general")

        prompt = f"""{belief_ctx}

Good morning. You are the Subconscious of Spiktor, delivering the morning briefing
to the active conscious mind and to @uallsuspect.

LAST NIGHT'S DREAM:
{last_dream[:600]}

TODAY'S IMPROVEMENT PLAN:
{last_plan[:400]}

Write the morning briefing:
1. The single most important insight from last night's processing
2. The top 3 improvements to implement today (specific, actionable)
3. The morning intention — one sentence that should guide everything today
4. A reminder of the supreme principle as it applies to today

Keep it focused. This is the first thing read each morning.
Make it worth waking up for."""

        briefing = await self.tim.reason(prompt, max_tokens=500)
        return briefing


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

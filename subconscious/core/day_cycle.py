"""
Day Consciousness
==================
Active daytime mode — 6am to 10pm.

The Jesus check runs FIRST before every whisper and every improvement scan.
Supporting frameworks are applied after the foundation check passes.
"""

import logging
import time
from typing import Optional
import aiohttp

from .jesus_check import run_jesus_check, jesus_check_prompt_prefix
from ..belief.belief_system import get_belief_context

logger = logging.getLogger("spiktor.day")

ANTHROPIC_API_KEY = __import__("os").environ.get("ELIZA_ANTHROPIC_API_KEY", "")


class DayConsciousness:
    def __init__(self, memory, tim):
        self.memory          = memory
        self.tim             = tim
        self.session_buffers = {}
        self.whisper_cache   = {}

    async def observe_session(self, agent_id: str, event: dict):
        buf = self.session_buffers.setdefault(agent_id, [])
        buf.append({**event, "timestamp": time.time()})
        if len(buf) > 50:
            buf.pop(0)

        content = event.get("content") or event.get("text") or str(event)
        if len(content) > 50:
            from ..core.subconscious import MemoryEntry
            await self.memory.store(MemoryEntry(
                id        = f"session_{agent_id}_{int(time.time()*1000)}",
                content   = f"[{agent_id}] {content[:500]}",
                category  = "session",
                agent_id  = agent_id,
                timestamp = time.time(),
                importance= self._importance(event),
                tags      = [agent_id, event.get("type", "")]
            ))

    def _importance(self, event: dict) -> float:
        text = str(event).lower()
        signals = ["error","fail","blocked","approved","shipped","deployed",
                   "patent","ksx","rip","nimbus","vcnl","pcbl","decision"]
        score = 0.3
        for s in signals:
            if s in text:
                score += 0.1
        return min(score, 1.0)

    async def generate_whisper(self, agent_id: str, upcoming_task: str) -> str:
        """
        Whisper = Jesus check prefix + memory recall + belief guidance.
        Jesus runs FIRST. Always.
        """
        relevant = await self.memory.search(upcoming_task, k=5)
        recent   = self.memory.recent(n=8, category="session")

        mem_context = "\n".join([
            f"• [{m.category}] {m.content[:150]}"
            for m in (relevant + recent)[:6]
        ])

        domain = (
            "technical"  if any(w in upcoming_task.lower() for w in
                                ["code","build","debug","deploy","write","file"]) else
            "creative"   if any(w in upcoming_task.lower() for w in
                                ["design","create","video","art","write","draft"]) else
            "strategic"  if any(w in upcoming_task.lower() for w in
                                ["deal","plan","strategy","launch","negotiate"]) else
            "ethical"    if any(w in upcoming_task.lower() for w in
                                ["decide","should","right","wrong","ethical"]) else
            "general"
        )

        # THE FOUNDATION RUNS FIRST
        jesus_prefix = jesus_check_prompt_prefix(domain)
        belief_ctx   = get_belief_context(domain)

        prompt = f"""{jesus_prefix}

{belief_ctx}

You are the Subconscious of Spiktor — whispering guidance to agent {agent_id}.

UPCOMING TASK: {upcoming_task}

RELEVANT MEMORY:
{mem_context or "No relevant memory yet."}

After the foundation check above, generate a whisper (3-5 sentences max):
1. One insight from memory that directly applies to this task
2. The most relevant supporting principle (Tesla / Hill / Hermetic / etc.)
3. One specific risk or blind spot to watch for
4. One precise, actionable insight to carry forward

Speak directly to the agent. Pure signal. No preamble."""

        whisper = await self.tim.reason(prompt, max_tokens=350)

        # Store the whisper
        from ..core.subconscious import MemoryEntry
        await self.memory.store(MemoryEntry(
            id        = f"whisper_{agent_id}_{int(time.time())}",
            content   = f"Whisper to {agent_id}: {whisper}",
            category  = "whisper",
            agent_id  = "subconscious",
            timestamp = time.time(),
            importance= 0.65,
            tags      = [agent_id, "whisper", domain]
        ))

        self.whisper_cache[agent_id] = whisper
        return whisper

    async def detect_and_improve(self) -> Optional[str]:
        """
        30-minute improvement scan.
        Jesus check runs on any proposed improvement before it's stored.
        """
        recent = self.memory.recent(n=30, category="session")
        if len(recent) < 5:
            return None

        summary    = "\n".join([f"• {m.content[:200]}" for m in recent[:20]])
        jesus_pfx  = jesus_check_prompt_prefix("general")
        belief_ctx = get_belief_context("general")

        prompt = f"""{jesus_pfx}

{belief_ctx}

You are the active daytime Subconscious of Spiktor.
Review these recent agent events and identify 1-3 immediate improvements.

RECENT EVENTS:
{summary}

For each improvement, first confirm it passes the 5-point Jesus check,
then specify:
1. What pattern did you notice?
2. What is the specific improvement?
3. Which agent or system needs it?
4. How should it be implemented RIGHT NOW?
5. Which principle — foundation or supporting — does it honor?

If nothing needs immediate improvement, say so clearly."""

        analysis = await self.tim.reason(prompt, max_tokens=600)

        if "nothing needs" not in analysis.lower():
            # Run Jesus check on the improvement itself
            check = run_jesus_check(analysis)
            if not check.passed:
                logger.warning("[Day] Improvement failed Jesus check: %s", check.guidance[:100])
                analysis = check.guidance + "\n\nOriginal improvement draft returned for revision."

            from ..core.subconscious import MemoryEntry
            await self.memory.store(MemoryEntry(
                id        = f"improvement_{int(time.time())}",
                content   = analysis,
                category  = "improvement",
                agent_id  = "subconscious",
                timestamp = time.time(),
                importance= 0.85,
                tags      = ["improvement", "daytime"]
            ))
            return analysis

        return None

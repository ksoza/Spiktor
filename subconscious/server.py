"""
Spiktor Subconscious HTTP Server
==================================
FastAPI wrapper around SubconsciousOrchestrator.
Exposes the Subconscious as a microservice that eliza-runtime
and all other Spiktor services can call.

Endpoints:
  POST /observe          — agent sends event to Subconscious
  POST /whisper          — agent requests whisper before task
  GET  /status           — current state + memory stats
  GET  /dream/latest     — last dream synthesis
  GET  /morning          — morning briefing
  GET  /improvements     — pending improvements
  POST /belief           — query the belief system on a topic
  GET  /memory/search    — search turbovec memory
"""

import asyncio
import logging
import os
import sys

sys.path.insert(0, "/app")

from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from subconscious.core.subconscious import subconscious, ConsciousnessState
from subconscious.belief.belief_system import get_belief_context, BELIEF_SYSTEM
from subconscious.memory.turbovec_manager import TurboVecManager

logger = logging.getLogger("spiktor.subconscious.server")
app    = FastAPI(title="Spiktor Subconscious", version="1.0.0")


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    TurboVecManager.preload_all()
    asyncio.create_task(subconscious.start())
    logger.info("Subconscious started — state: %s", subconscious.state.value)


# ── Models ────────────────────────────────────────────────────────────────────

class ObserveRequest(BaseModel):
    agent_id: str
    content:  str
    event_type: str = "response"
    metadata: dict  = {}

class WhisperRequest(BaseModel):
    agent_id:     str
    upcoming_task: str

class BeliefRequest(BaseModel):
    topic:  str
    domain: str = "general"

class MemorySearchRequest(BaseModel):
    query:    str
    k:        int    = 10
    category: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "state":  subconscious.state.value,
        "memory": subconscious.memory.stats()
    }

@app.get("/status")
async def status():
    return subconscious.status()

@app.post("/observe")
async def observe(req: ObserveRequest, background_tasks: BackgroundTasks):
    """Agent sends event to Subconscious — fire and forget."""
    event = {"content": req.content, "type": req.event_type, **req.metadata}
    background_tasks.add_task(subconscious.observe, req.agent_id, event)
    return {"status": "received"}

@app.post("/whisper")
async def whisper(req: WhisperRequest):
    """Agent requests whisper before handling a task."""
    w = await subconscious.whisper(req.agent_id, req.upcoming_task)
    return {"whisper": w, "state": subconscious.state.value}

@app.get("/dream/latest")
async def dream_latest():
    """Return the most recent dream synthesis."""
    dreams = subconscious.memory.recent(n=1, category="dream")
    if not dreams:
        return {"dream": None, "message": "No dreams yet. Check back after 10pm."}
    return {
        "dream":     dreams[0].content,
        "timestamp": dreams[0].timestamp,
        "state":     subconscious.state.value
    }

@app.get("/morning")
async def morning_briefing():
    """Generate this morning's briefing from last night's dream."""
    briefing = await subconscious.night.morning_briefing()
    return {"briefing": briefing, "timestamp": __import__("time").time()}

@app.get("/improvements")
async def pending_improvements():
    """Return all planned improvements from dream cycles."""
    improvements = subconscious.memory.recent(n=10, category="improvement")
    return {
        "improvements": [
            {"content": i.content[:400], "timestamp": i.timestamp,
             "importance": i.importance, "tags": i.tags}
            for i in improvements
        ]
    }

@app.post("/belief")
async def belief_query(req: BeliefRequest):
    """Query the belief system for guidance on a topic."""
    ctx = get_belief_context(req.domain)

    # Find most relevant belief principles
    relevant_principles = []
    topic_lower = req.topic.lower()
    for framework, content in BELIEF_SYSTEM.items():
        if isinstance(content, dict):
            for key, val in content.items():
                if isinstance(val, str) and (
                    any(word in val.lower() for word in topic_lower.split()[:3])
                ):
                    relevant_principles.append(f"[{framework}] {val[:200]}")
                    break

    return {
        "topic":      req.topic,
        "domain":     req.domain,
        "context":    ctx[:800],
        "relevant":   relevant_principles[:5]
    }

@app.post("/memory/search")
async def memory_search(req: MemorySearchRequest):
    """Search turbovec memory for relevant entries."""
    results = await subconscious.memory.search(req.query, k=req.k,
                                                category_filter=req.category)
    return {
        "query":   req.query,
        "results": [
            {"content": r.content[:300], "category": r.category,
             "importance": r.importance, "timestamp": r.timestamp}
            for r in results
        ]
    }

@app.get("/turbovec/stats")
async def turbovec_stats():
    """Memory index statistics for all turbovec indices."""
    return TurboVecManager.all_stats()


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=5004)


# ── Jesus check endpoint ──────────────────────────────────────────────────────

class JesusCheckRequest(BaseModel):
    content:  str
    agent_id: str = "unknown"

@app.post("/jesus-check")
async def jesus_check(req: JesusCheckRequest):
    """
    Run the 5-point foundation check on any content.
    Called by the eliza evaluator on every agent response.
    Fast — no LLM call. Pure pattern check.
    """
    from subconscious.core.jesus_check import run_jesus_check
    result = run_jesus_check(req.content)
    return {
        "passed":          result.passed,
        "guidance":        result.guidance,
        "revision_needed": result.revision_needed,
        "checks": [
            {
                "id":      c["id"],
                "status":  c["status"],
                "teaching": c["teaching"]
            }
            for c in result.checks
        ]
    }

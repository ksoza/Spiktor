"""
Pineal Gland HTTP Server
FastAPI wrapper — exposes synthesis engine to eliza-runtime and n8n
"""

import sys
sys.path.insert(0, "/app")

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
import os

from brain.pineal.synthesis_engine import PinealSynthesisEngine, BrainSignal

app    = FastAPI(title="Spiktor Pineal Gland", version="1.0.0")
engine = PinealSynthesisEngine(
    use_real_connectome=os.environ.get("USE_REAL_CONNECTOME", "false") == "true"
)

class SignalInput(BaseModel):
    hemisphere: str
    agent_id:   str
    content:    str
    confidence: float = 0.7
    metadata:   dict  = {}
    tags:       list  = []

class SynthesisRequest(BaseModel):
    task:          str
    left_signals:  list[SignalInput] = []
    right_signals: list[SignalInput] = []
    context:       dict = {}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "pineal-synthesis"}

@app.post("/synthesize")
async def synthesize(req: SynthesisRequest):
    left  = [BrainSignal(**s.dict()) for s in req.left_signals]  if req.left_signals  else \
            [BrainSignal("left",  "spiktor-coder",   req.task, 0.7)]
    right = [BrainSignal(**s.dict()) for s in req.right_signals] if req.right_signals else \
            [BrainSignal("right", "spiktor-ideator", req.task, 0.7)]

    plan = await engine.synthesize(left, right, req.task, req.context)
    return plan.__dict__

@app.get("/confidence")
async def confidence(task: str = "test"):
    """Quick confidence check without full synthesis."""
    from brain.pineal.synthesis_engine import BrainSignal
    left  = [BrainSignal("left",  "spiktor-coder",   task, 0.7)]
    right = [BrainSignal("right", "spiktor-ideator", task, 0.7)]
    result = engine.connectome.simulate_deliberation(left, right)
    return result

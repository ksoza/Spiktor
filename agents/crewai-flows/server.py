"""
SpiktorFlow HTTP Server
=========================
Exposes the CrewAI Flow as an async HTTP service.

POST /flow/start   — kick off a new flow, returns flow_id immediately
GET  /flow/{id}    — poll status / get final state
GET  /flow/{id}/stream — SSE stream of phase transitions (optional)
GET  /health

Flows run in background threads (CrewAI Flow.kickoff is synchronous/blocking
and CPU+IO bound across many LLM calls — a thread per flow is fine for
the expected concurrency, gated by AIOS_SCHEDULER_MAX_CONCURRENT upstream).
"""

import logging
import os
import threading
import uuid
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from spiktor_flow.main import SpiktorFlow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spiktor.flow.server")

app = FastAPI(title="Spiktor CrewAI Flow", version="1.0.0")

# In-memory flow registry. For production, back this with Supabase/turbovec.
_flows: dict[str, dict] = {}
_lock = threading.Lock()


class FlowStartRequest(BaseModel):
    task:  str
    owner: str = "ksoza"
    repo:  str = "Spiktor"


@app.get("/health")
async def health():
    return {"status": "ok", "active_flows": len([f for f in _flows.values() if f["status"] == "running"])}


@app.post("/flow/start")
async def start_flow(req: FlowStartRequest):
    flow_id = str(uuid.uuid4())[:8]

    with _lock:
        _flows[flow_id] = {
            "flow_id":    flow_id,
            "task":       req.task,
            "status":     "running",
            "started_at": datetime.utcnow().isoformat(),
            "result":     None,
            "error":      None,
        }

    def _run():
        try:
            flow = SpiktorFlow()
            flow.state.task  = req.task
            flow.state.owner = req.owner
            flow.state.repo  = req.repo
            flow.kickoff()
            with _lock:
                _flows[flow_id]["status"] = "completed"
                _flows[flow_id]["result"] = flow.state.model_dump()
        except Exception as e:
            logger.exception("Flow %s failed", flow_id)
            with _lock:
                _flows[flow_id]["status"] = "error"
                _flows[flow_id]["error"]  = str(e)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {"flow_id": flow_id, "status": "running"}


@app.get("/flow/{flow_id}")
async def get_flow(flow_id: str):
    with _lock:
        flow = _flows.get(flow_id)
    if not flow:
        raise HTTPException(404, "flow not found")
    return flow


@app.get("/flow")
async def list_flows():
    with _lock:
        return [
            {"flow_id": f["flow_id"], "task": f["task"][:80],
             "status": f["status"], "started_at": f["started_at"]}
            for f in _flows.values()
        ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5006")))

"""
Subconscious Tool for CrewAI Agents
======================================
Every crew agent has access to this tool.
Wraps the Subconscious service (port 5004):
  - get_whisper:  foundation-checked guidance before acting
  - jesus_check:  5-point foundation check on any output
  - store_memory: write decisions/results to turbovec
  - recall:       search turbovec memory
"""

import os
import requests
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

SUBCONSCIOUS_HOST = os.environ.get("SUBCONSCIOUS_HOST", "http://subconscious:5004")


class WhisperInput(BaseModel):
    agent_id: str = Field(..., description="Your crew role, e.g. 'spiktor-coder'")
    task:     str = Field(..., description="The task you are about to perform")


class SubconsciousWhisperTool(BaseTool):
    name: str = "subconscious_whisper"
    description: str = (
        "Get foundation-checked guidance before starting a task. "
        "Returns relevant memory, the most applicable belief principle "
        "(Jesus Christ foundation first, then supporting frameworks), "
        "and one actionable insight. ALWAYS call this before significant actions."
    )
    args_schema: type[BaseModel] = WhisperInput

    def _run(self, agent_id: str, task: str) -> str:
        try:
            r = requests.post(
                f"{SUBCONSCIOUS_HOST}/whisper",
                json={"agent_id": agent_id, "upcoming_task": task},
                timeout=15
            )
            data = r.json()
            return data.get("whisper", "No whisper available.")
        except Exception as e:
            return f"[Subconscious unavailable: {e}] Proceed with standard judgment."


class JesusCheckInput(BaseModel):
    content: str = Field(..., description="The output/decision to check")


class JesusCheckTool(BaseTool):
    name: str = "jesus_check"
    description: str = (
        "Run the 5-point foundation check (Jesus Christ teachings — heaviest weight "
        "in the belief system) on your output BEFORE finalizing it. "
        "Checks: self-knowledge, kingdom within (capacity present), love commandment, "
        "sacrifice pattern (greater good), truth liberation. "
        "If revision_needed=true, revise your output before returning it."
    )
    args_schema: type[BaseModel] = JesusCheckInput

    def _run(self, content: str) -> str:
        try:
            r = requests.post(
                f"{SUBCONSCIOUS_HOST}/jesus-check",
                json={"content": content},
                timeout=10
            )
            data = r.json()
            if data.get("passed"):
                return "✅ Foundation check PASSED. Proceed."
            return f"⚠️ REVISION NEEDED:\n{data.get('guidance', '')}"
        except Exception as e:
            return f"[Jesus check unavailable: {e}] Proceed with care."


class MemoryStoreInput(BaseModel):
    agent_id: str = Field(..., description="Your crew role")
    content:  str = Field(..., description="What to remember — decision, result, pattern")
    category: str = Field(default="decision", description="session|decision|pattern")


class MemoryStoreTool(BaseTool):
    name: str = "subconscious_remember"
    description: str = (
        "Store a decision, result, or pattern in turbovec memory "
        "so future agents (and tonight's dream cycle) can build on it."
    )
    args_schema: type[BaseModel] = MemoryStoreInput

    def _run(self, agent_id: str, content: str, category: str = "decision") -> str:
        try:
            requests.post(
                f"{SUBCONSCIOUS_HOST}/observe",
                json={"agent_id": agent_id, "content": content, "event_type": category},
                timeout=10
            )
            return "✅ Stored in turbovec memory."
        except Exception as e:
            return f"[Memory store failed: {e}]"


class MemorySearchInput(BaseModel):
    query: str = Field(..., description="What to search for")
    k:     int  = Field(default=5, description="Number of results")


class MemorySearchTool(BaseTool):
    name: str = "subconscious_recall"
    description: str = (
        "Search turbovec memory for relevant past decisions, patterns, "
        "or session history before starting work."
    )
    args_schema: type[BaseModel] = MemorySearchInput

    def _run(self, query: str, k: int = 5) -> str:
        try:
            r = requests.post(
                f"{SUBCONSCIOUS_HOST}/memory/search",
                json={"query": query, "k": k},
                timeout=15
            )
            results = r.json().get("results", [])
            if not results:
                return "No relevant memory found."
            return "\n".join(f"• [{r['category']}] {r['content']}" for r in results)
        except Exception as e:
            return f"[Memory search unavailable: {e}]"

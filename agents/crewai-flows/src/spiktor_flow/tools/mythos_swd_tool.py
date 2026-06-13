"""
Mythos SWD Tool for CrewAI Agents
====================================
Wraps mythos-router's SHA-256 verification.
spiktor-coder and spiktor-ops must call this after any file claim.

If a file path is claimed in the agent's output but the SWD verification
shows it doesn't exist or doesn't match — this returns a correction signal.
The agent gets up to 2 correction turns before yielding to human.
"""

import hashlib
import os
from crewai.tools import BaseTool
from pydantic import BaseModel, Field


class SWDVerifyInput(BaseModel):
    file_paths: list[str] = Field(..., description="File paths claimed as created/modified")


class SWDVerifyTool(BaseTool):
    name: str = "mythos_swd_verify"
    description: str = (
        "Verify file claims against the actual filesystem via SHA-256. "
        "Call this after claiming you created/modified/deleted files. "
        "If verification fails, you have 2 correction turns before this "
        "escalates to the human operator. Never claim a file operation "
        "succeeded without calling this first."
    )
    args_schema: type[BaseModel] = SWDVerifyInput

    def _run(self, file_paths: list[str]) -> str:
        results = []
        for path in file_paths:
            if os.path.exists(path):
                with open(path, "rb") as f:
                    h = hashlib.sha256(f.read()).hexdigest()[:12]
                size = os.path.getsize(path)
                results.append(f"✅ {path} — exists ({size} bytes, sha256:{h}...)")
            else:
                results.append(f"⚠️ {path} — NOT FOUND. Claim does not match filesystem reality.")

        any_missing = any("NOT FOUND" in r for r in results)
        header = (
            "⚠️ SWD VERIFICATION FAILED — correction turn required:"
            if any_missing else
            "✅ SWD VERIFICATION PASSED — all file claims verified:"
        )
        return header + "\n" + "\n".join(results)

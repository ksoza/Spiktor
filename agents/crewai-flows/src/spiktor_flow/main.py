"""
SpiktorFlow — Master Orchestration Flow
==========================================
The actual implementation of the pipeline described in AGENTS.md:

    INTENT → PLAN → CODE → REVIEW → EVIDENCE → SHIP

Built with CrewAI Flows (@start, @listen, @router) — event-driven,
not a fixed sequential script. Each crew is a specialized team of one
(for now — crews can grow additional agents later without changing
this Flow's structure).

State management via Pydantic — the SpiktorFlowState persists across
all steps and is what gets logged to turbovec at the end.

Loop-back logic:
  - critic FIX     → back to coder for the SAME step (max 2 retries/step)
  - judge NO-SHIP  → back to coder with judge's required changes
  - judge SHIP     → ops executes
  - critic ESCALATE → flow halts, posts to Slack for @uallsuspect

Every crew has subconscious_whisper + jesus_check tools — the foundation
check (Jesus Christ teachings, heaviest weight) runs inside every crew's
task, not just at the Flow level.
"""

import json
import logging
import os
from typing import Optional

import requests
from pydantic import BaseModel, Field

from crewai.flow.flow import Flow, start, listen, router

from spiktor_flow.crews.planner_crew.planner_crew import PlannerCrew
from spiktor_flow.crews.coder_crew.coder_crew import CoderCrew
from spiktor_flow.crews.critic_crew.critic_crew import CriticCrew
from spiktor_flow.crews.judge_crew.judge_crew import JudgeCrew
from spiktor_flow.crews.ops_crew.ops_crew import OpsCrew

logger = logging.getLogger("spiktor.flow")

SUBCONSCIOUS_HOST = os.environ.get("SUBCONSCIOUS_HOST", "http://subconscious:5004")
SLACK_BOT_TOKEN   = os.environ.get("ELIZA_SLACK_BOT_TOKEN", "")
SLACK_CHANNEL     = os.environ.get("INTEL_SLACK_CHANNEL", "")

MAX_STEP_RETRIES  = 2   # coder<->critic loop per step
MAX_SHIP_RETRIES  = 2   # judge NO-SHIP -> coder loop


# ── Flow state ────────────────────────────────────────────────────────────────

class StepRecord(BaseModel):
    step_number:     int
    description:     str
    coder_output:    str = ""
    critic_verdict:  str = ""
    retries:         int = 0
    passed:          bool = False


class SpiktorFlowState(BaseModel):
    task:           str = ""
    owner:          str = "ksoza"
    repo:           str = "Spiktor"

    plan_raw:       str = ""
    scope_files:    list[str] = Field(default_factory=list)
    steps:          list[StepRecord] = Field(default_factory=list)

    judge_verdict:  str = ""
    ship_retries:   int = 0

    ops_report:     str = ""
    status:         str = "started"   # started|planning|coding|judging|shipped|halted|escalated
    halt_reason:    str = ""


# ── Helper: parse plan into steps ────────────────────────────────────────────

def _parse_plan_steps(plan_raw: str) -> list[StepRecord]:
    """
    Parse the planner's numbered output into StepRecords.
    Planner output is free-form text with numbered steps —
    we extract lines starting with a number followed by '.' or ')'.
    """
    steps = []
    for line in plan_raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Match "1. ..." or "1) ..." or "Step 1: ..."
        import re
        m = re.match(r"^(?:Step\s+)?(\d+)[\.\)\:]\s+(.+)", line, re.IGNORECASE)
        if m:
            steps.append(StepRecord(
                step_number=int(m.group(1)),
                description=m.group(2).strip()
            ))
    return steps


def _parse_scope_files(plan_raw: str) -> list[str]:
    """Extract file paths mentioned in the plan (anything matching a path-like pattern)."""
    import re
    return list(set(re.findall(r"[`\"]?([\w\-/.]+\.[a-zA-Z]{1,5})[`\"]?", plan_raw)))[:30]


# ── Slack notification helper ────────────────────────────────────────────────

def _post_to_slack(message: str):
    if not SLACK_BOT_TOKEN or not SLACK_CHANNEL:
        logger.info("[Flow] %s", message[:200])
        return
    try:
        requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}", "Content-Type": "application/json"},
            json={"channel": SLACK_CHANNEL, "text": message,
                  "username": "Spiktor Flow", "icon_emoji": ":gear:"},
            timeout=10
        )
    except Exception as e:
        logger.warning("Slack post failed: %s", e)


# ── The Flow ──────────────────────────────────────────────────────────────────

class SpiktorFlow(Flow[SpiktorFlowState]):
    """
    INTENT → PLAN → CODE → REVIEW → EVIDENCE → SHIP

    Each @listen method represents a phase transition.
    @router methods implement the loop-back logic.
    """

    # ── PLAN ──────────────────────────────────────────────────────────────────

    @start()
    def intent_and_plan(self):
        logger.info("[Flow] PLAN — %s", self.state.task)
        self.state.status = "planning"
        _post_to_slack(f"🧠 *Spiktor Flow started*\nTask: {self.state.task}")

        result = PlannerCrew().crew().kickoff(inputs={
            "task":  self.state.task,
            "owner": self.state.owner,
            "repo":  self.state.repo,
        })

        plan_text = str(result)
        self.state.plan_raw    = plan_text
        self.state.steps       = _parse_plan_steps(plan_text)
        self.state.scope_files = _parse_scope_files(plan_text)

        if not self.state.steps:
            self.state.status     = "halted"
            self.state.halt_reason = (
                "Planner returned no numbered steps — likely requested "
                "clarification instead of a plan."
            )
            _post_to_slack(
                f"⛔ *Plan halted — clarification needed*\n{plan_text[:500]}"
            )
            return "halted"

        _post_to_slack(
            f"📋 *Plan ready* — {len(self.state.steps)} steps, "
            f"{len(self.state.scope_files)} files in scope"
        )
        return "planned"

    # ── CODE + REVIEW (per-step loop) ────────────────────────────────────────

    @listen(intent_and_plan)
    def code_and_review(self, plan_status: str):
        if plan_status == "halted":
            return "halted"

        self.state.status = "coding"

        for step in self.state.steps:
            step_passed = False

            while step.retries <= MAX_STEP_RETRIES and not step_passed:
                # CODE
                coder_result = CoderCrew().crew().kickoff(inputs={
                    "plan":            self.state.plan_raw,
                    "step_description": step.description,
                    "scope_files":     ", ".join(self.state.scope_files),
                    "owner":           self.state.owner,
                    "repo":            self.state.repo,
                    "critic_feedback": step.critic_verdict if step.retries > 0 else "(none — first attempt)",
                })
                step.coder_output = str(coder_result)

                # REVIEW
                critic_result = CriticCrew().crew().kickoff(inputs={
                    "step_description": step.description,
                    "scope_files":      ", ".join(self.state.scope_files),
                    "coder_output":     step.coder_output,
                })
                step.critic_verdict = str(critic_result)

                if step.critic_verdict.strip().upper().startswith("PASS"):
                    step.passed = True
                    step_passed = True
                elif step.critic_verdict.strip().upper().startswith("ESCALATE"):
                    self.state.status     = "escalated"
                    self.state.halt_reason = (
                        f"Step {step.step_number} escalated by critic: "
                        f"{step.critic_verdict[:300]}"
                    )
                    _post_to_slack(
                        f"🚨 *Critic ESCALATION — step {step.step_number}*\n"
                        f"@uallsuspect review needed:\n{step.critic_verdict[:400]}"
                    )
                    return "escalated"
                else:
                    # FIX — loop back to coder
                    step.retries += 1
                    if step.retries > MAX_STEP_RETRIES:
                        self.state.status     = "escalated"
                        self.state.halt_reason = (
                            f"Step {step.step_number} exceeded {MAX_STEP_RETRIES} "
                            f"correction attempts. Last critic verdict: "
                            f"{step.critic_verdict[:300]}"
                        )
                        _post_to_slack(
                            f"🚨 *Step {step.step_number} stuck after "
                            f"{MAX_STEP_RETRIES} retries — @uallsuspect needed*\n"
                            f"{step.critic_verdict[:400]}"
                        )
                        return "escalated"

            _post_to_slack(
                f"✅ Step {step.step_number}/{len(self.state.steps)} passed "
                f"({step.retries} retr{'y' if step.retries == 1 else 'ies'})"
            )

        return "coded"

    # ── EVIDENCE + SHIP ───────────────────────────────────────────────────────

    @router(code_and_review)
    def evidence_and_ship(self, code_status: str):
        if code_status in ("halted", "escalated"):
            return code_status

        self.state.status = "judging"

        evidence_bundle = "\n\n".join(
            f"--- Step {s.step_number}: {s.description} ---\n"
            f"Coder: {s.coder_output[:500]}\n"
            f"Critic: {s.critic_verdict[:200]}"
            for s in self.state.steps
        )

        while self.state.ship_retries <= MAX_SHIP_RETRIES:
            judge_result = JudgeCrew().crew().kickoff(inputs={
                "task":           self.state.task,
                "plan":           self.state.plan_raw,
                "evidence_bundle": evidence_bundle,
            })
            self.state.judge_verdict = str(judge_result)

            if self.state.judge_verdict.strip().upper().startswith("SHIP"):
                return "ship"

            # NO-SHIP — judge identified required changes
            self.state.ship_retries += 1
            if self.state.ship_retries > MAX_SHIP_RETRIES:
                self.state.status     = "escalated"
                self.state.halt_reason = (
                    f"Judge returned NO-SHIP {MAX_SHIP_RETRIES + 1} times. "
                    f"Last verdict: {self.state.judge_verdict[:300]}"
                )
                _post_to_slack(
                    f"🚨 *Judge NO-SHIP x{self.state.ship_retries} — "
                    f"@uallsuspect needed*\n{self.state.judge_verdict[:400]}"
                )
                return "escalated"

            _post_to_slack(
                f"⚠️ *Judge: NO-SHIP* (attempt {self.state.ship_retries}/{MAX_SHIP_RETRIES})\n"
                f"{self.state.judge_verdict[:300]}\nReturning to coder..."
            )

            # Feed judge's required changes back into the last step's critic_verdict
            # so coder addresses them on the loop-back
            if self.state.steps:
                self.state.steps[-1].critic_verdict = (
                    f"JUDGE REQUIRED CHANGES: {self.state.judge_verdict}"
                )
                self.state.steps[-1].retries = 0  # allow fresh attempts
                # Re-run code_and_review for the last step only would require
                # restructuring; for now we re-run the full code_and_review.
                requeue_status = self.code_and_review("planned")
                if requeue_status in ("halted", "escalated"):
                    return requeue_status
                evidence_bundle = "\n\n".join(
                    f"--- Step {s.step_number}: {s.description} ---\n"
                    f"Coder: {s.coder_output[:500]}\n"
                    f"Critic: {s.critic_verdict[:200]}"
                    for s in self.state.steps
                )

        return "escalated"

    @listen(evidence_and_ship)
    def ship_or_close(self, ship_status: str):
        if ship_status == "halted":
            self.state.status = "halted"
            _store_final(self.state)
            return self.state

        if ship_status == "escalated":
            self.state.status = "escalated"
            _store_final(self.state)
            return self.state

        # SHIP — invoke ops
        self.state.status = "shipped"

        files_payload = []  # In production: extracted from coder_output structured data
        ops_result = OpsCrew().crew().kickoff(inputs={
            "task":          self.state.task,
            "owner":         self.state.owner,
            "repo":          self.state.repo,
            "judge_verdict": self.state.judge_verdict,
            "files_payload": json.dumps(files_payload),
        })
        self.state.ops_report = str(ops_result)

        _post_to_slack(
            f"🚀 *Shipped*\n{self.state.task}\n\n{self.state.ops_report[:500]}"
        )

        _store_final(self.state)
        return self.state


def _store_final(state: SpiktorFlowState):
    """Persist the flow outcome to turbovec via Subconscious."""
    try:
        requests.post(
            f"{SUBCONSCIOUS_HOST}/observe",
            json={
                "agent_id": "spiktor-flow",
                "content": (
                    f"Flow completed: '{state.task}' -> {state.status}. "
                    f"Steps: {len(state.steps)}, ship_retries: {state.ship_retries}. "
                    + (f"Halt reason: {state.halt_reason}" if state.halt_reason else "")
                ),
                "event_type": "decision"
            },
            timeout=10
        )
    except Exception as e:
        logger.warning("Failed to store final flow state: %s", e)


def kickoff(task: str, owner: str = "ksoza", repo: str = "Spiktor") -> dict:
    """Entry point — used by server.py."""
    flow = SpiktorFlow()
    flow.state.task  = task
    flow.state.owner = owner
    flow.state.repo  = repo
    flow.kickoff()
    return flow.state.model_dump()

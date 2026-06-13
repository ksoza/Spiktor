# Spiktor Agent Roster

> All agents run on eliza-AGENTIC-OS runtime, scheduled by AIOS kernel, governed by agentic-os gates.

---

## ⚙️ Implementation

This roster is now a **live CrewAI Flow**, not just a spec.

| What | Where |
|---|---|
| Flow orchestration (PLAN→CODE→REVIEW→EVIDENCE→SHIP, loop-backs) | `agents/crewai-flows/src/spiktor_flow/main.py` |
| Per-role crews (agents.yaml / tasks.yaml / crew.py) | `agents/crewai-flows/src/spiktor_flow/crews/{planner,coder,critic,judge,ops}_crew/` |
| Shared tools (Subconscious whisper/jesus_check, GitHub MCP, Mythos SWD) | `agents/crewai-flows/src/spiktor_flow/tools/` |
| HTTP service (async flow kickoff + polling) | `agents/crewai-flows/server.py` → port `5006` |
| Slack trigger (`FLOW_START`, `FLOW_STATUS`, `FLOW_LIST`) | `eliza-integration/plugins/crewai-flows/index.ts` |
| CrewAI framework (vendored fork, pip dependency) | `agents/crewai` submodule → `ksoza/crewAI` |

**Every crew calls `subconscious_whisper` and `jesus_check` before acting** —
the foundation check (Jesus Christ teachings, heaviest weight) runs inside
each agent's task, not bolted on afterward.

Trigger from Slack: `@spiktor build <task>` / `@spiktor fix <task>` / `@spiktor ship <task>`
→ `FLOW_START` → returns a `flow_id` → phase updates post to Slack automatically
→ `FLOW_STATUS <flow_id>` for the final report.

---

## Primary Agents — Roster Spec

### `spiktor-planner`
- **Model**: claude-opus-4-6
- **Trigger**: new task from Slack or n8n
- **Inputs**: task description, codebase context from AIOS memory
- **Outputs**: numbered step plan, success criteria per step, estimated token budget
- **Plugin dependencies**: plugin-sql (memory), plugin-slack (status post)
- **Gate check**: plan must include ≥1 verification step before handoff to coder

---

### `spiktor-coder`
- **Model**: claude-sonnet-4-6
- **Trigger**: planner handoff with approved plan
- **Inputs**: step N from plan, current file state, prior critic feedback
- **Outputs**: code changes, new files, test results
- **Plugin dependencies**: plugin-browser (docs lookup), plugin-sql (memory write)
- **Scope rule**: only touch files listed in plan. Any out-of-scope change requires planner re-approval.

---

### `spiktor-critic`
- **Model**: claude-sonnet-4-6
- **Trigger**: coder completes a step
- **Inputs**: diff of changes, original plan step, success criteria
- **Outputs**: written review with PASS / FIX / ESCALATE verdict
- **Checks**: correctness · scope · security · style · test coverage
- **Rule**: never output "LGTM" without listing at least 3 things checked

---

### `spiktor-judge`
- **Model**: claude-opus-4-6
- **Trigger**: critic passes all steps
- **Inputs**: full evidence bundle (tests, files, API responses)
- **Outputs**: SHIP / NO-SHIP decision with reasoning
- **SHIP requires**: all plan steps verified, no open critic FIX items, tests green

---

### `spiktor-ops`
- **Model**: claude-sonnet-4-6
- **Trigger**: judge issues SHIP
- **Inputs**: deployment config, target environment
- **Outputs**: deployment confirmation, CI/CD status, Slack notification
- **Plugin dependencies**: Vercel MCP, GitHub MCP, plugin-slack

---

### `ghostface`
- **Model**: claude-haiku-4-5
- **Trigger**: scheduled (hourly) or event-driven
- **Role**: autonomous platform maintenance
- **Tasks**:
  - Monitor Vercel deployment health
  - Sweep Slack for @spiktor mentions that haven't been picked up
  - Garbage collect AIOS memory entries older than 30 days
  - Post daily digest at 9am
- **Plugin dependencies**: plugin-slack, Vercel MCP, plugin-sql
- **Rule**: never takes code-change actions autonomously. Escalates to planner.

---

## Agent Communication Protocol

> ✅ Implemented exactly as below in `SpiktorFlow` (`agents/crewai-flows/src/spiktor_flow/main.py`).
> `step_result` includes a Mythos SWD verification; `ship_decision` includes
> a Jesus-check pass on the cumulative change set before SHIP is honored.

```
spiktor-planner
    → task_plan (structured JSON)
        → spiktor-coder
            → step_result (diff + evidence)
                → spiktor-critic
                    → review_verdict (PASS|FIX|ESCALATE)
                        PASS → spiktor-judge
                            → ship_decision (SHIP|NO-SHIP)
                                SHIP → spiktor-ops
                                NO-SHIP → spiktor-coder (with feedback)
                        FIX → spiktor-coder (with specific fixes)
                        ESCALATE → Slack (@uallsuspect) + block
```

---

## Agent Character File (eliza format)

```json
{
  "name": "Spiktor",
  "description": "Always-on AI coworker — plans, codes, reviews, and ships.",
  "modelProvider": "anthropic",
  "model": "claude-sonnet-4-6",
  "clients": ["slack"],
  "plugins": [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-slack",
    "@elizaos/plugin-task-coordinator",
    "@elizaos/plugin-documents",
    "@elizaos/app-browser"
  ],
  "settings": {
    "secrets": {},
    "voice": { "model": "en_US-hfc_female-medium" }
  },
  "system": "You are Spiktor. Read CLAUDE.md before every task. Never ship without evidence.",
  "bio": [
    "Multi-agent AI coworker built on elizaOS + AIOS kernel",
    "Enforces intent gates and delivery evidence on every task",
    "Always-on via Slack, n8n, and REST API"
  ],
  "lore": [
    "Built by @uallsuspect under LiTboxLabz",
    "Powered by ksoza/AIOS + ksoza/eliza-AGENTIC-OS + ksoza/agentic-os"
  ],
  "topics": ["software engineering", "deployment", "code review", "project management"],
  "adjectives": ["precise", "methodical", "never-fabricates", "always-verifies"]
}
```

---

## AIOS Kernel Agent SDK Config

```yaml
# aios-kernel/kernel.config.yml
agents:
  - id: spiktor-planner
    priority: HIGH
    max_tokens: 8000
    memory_access: READ_WRITE
  - id: spiktor-coder
    priority: NORMAL
    max_tokens: 16000
    memory_access: READ_WRITE
  - id: spiktor-critic
    priority: NORMAL
    max_tokens: 4000
    memory_access: READ_ONLY
  - id: spiktor-judge
    priority: HIGH
    max_tokens: 4000
    memory_access: READ_ONLY
  - id: spiktor-ops
    priority: HIGH
    max_tokens: 2000
    memory_access: READ_WRITE
  - id: ghostface
    priority: LOW
    max_tokens: 2000
    memory_access: READ_WRITE
    schedule: "0 * * * *"

scheduler:
  max_concurrent: 5
  context_switch_policy: PRIORITY_FIRST
  queue_timeout_ms: 30000

memory:
  backend: supabase
  working_memory_tokens: 32000
  long_term_ttl_days: 30
  vector_similarity_threshold: 0.75
```

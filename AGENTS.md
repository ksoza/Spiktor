# Spiktor Agent Roster

> All agents run on eliza-AGENTIC-OS runtime, scheduled by AIOS kernel, governed by agentic-os gates.

---

## Primary Agents

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

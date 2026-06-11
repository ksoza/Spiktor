# Spiktor Agentic OS

> Three-layer autonomous operating system for Spiktor built on `ksoza/AIOS`, `ksoza/eliza-AGENTIC-OS`, and `ksoza/agentic-os`.

---

## Layer Map

```
┌─────────────────────────────────────────────────────────┐
│               SPIKTOR INTERFACE                         │
│        Slack · n8n · REST API · CLI                     │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│   L3 · GOVERNANCE LAYER  (ksoza/agentic-os)             │
│   Intent gates · Delivery evidence · 14 skills          │
│   CLAUDE.md · AGENTS.md · Ship gates                    │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│   L2 · AGENT RUNTIME  (ksoza/eliza-AGENTIC-OS)          │
│   AgentRuntime · task-coordinator · plugin-sql           │
│   plugin-browser · plugin-phone · plugin-slack           │
│   RAG (plugin-documents) · multi-agent spawn/kill       │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│   L1 · AIOS KERNEL  (ksoza/AIOS)                        │
│   LLM scheduler · context switch · memory manager       │
│   storage manager · tool manager · agent SDK            │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│   HOST · Docker / VPS                                   │
│   Files · processes · terminal · Slack · GitHub         │
└─────────────────────────────────────────────────────────┘
```

---

## Repo Roles

| Repo | Layer | Replaces in old Spiktor | Adds |
|---|---|---|---|
| `ksoza/AIOS` | L1 kernel | Gobii "always-on" execution | Real LLM scheduling, context switching, memory/tool/storage management |
| `ksoza/eliza-AGENTIC-OS` | L2 runtime | Verdent Brain + Browserable | Full multi-agent orchestration, 30+ plugins, RAG, voice, browser |
| `ksoza/agentic-os` | L3 governance | None (new) | Intent gates, delivery evidence, engineering guardrails, CLAUDE.md skills |

---

## Directory Structure (this folder)

```
agentic-os/           ← L3 governance files (mirrored from ksoza/agentic-os)
  CLAUDE.md           ← Spiktor-specific agent instructions
  AGENTS.md           ← Agent roster and capabilities
  skills/             ← 14 professional skills

eliza-integration/    ← L2 glue code
  spiktor-agent/      ← Spiktor character definition for eliza
  plugins.json        ← Active plugin manifest
  start-runtime.ts    ← Boot script

aios-kernel/          ← L1 kernel config
  kernel.config.yml   ← AIOS scheduling + memory policy
  tool-registry.yml   ← All MCP/n8n tools registered with AIOS

config/
  .env.example        ← All required env vars
  docker-compose.yml  ← Full stack (AIOS + eliza + Spiktor)

scripts/
  bootstrap.sh        ← One-command setup
  sync-repos.sh       ← Pull latest from all three upstream repos
```

---

## Quick Start

```bash
# 1. Clone Spiktor and submodules
git clone https://github.com/ksoza/Spiktor.git
cd Spiktor

# 2. Add the three agentic-os repos as submodules
git submodule add https://github.com/ksoza/AIOS.git aios-kernel/AIOS
git submodule add https://github.com/ksoza/eliza-AGENTIC-OS.git eliza-runtime
git submodule add https://github.com/ksoza/agentic-os.git agentic-os/governance

# 3. Copy this folder's config files
cp agentic-os/config/.env.example .env
# Edit .env with your keys

# 4. Bootstrap
chmod +x agentic-os/scripts/bootstrap.sh
./agentic-os/scripts/bootstrap.sh
```

---

## How the Layers Talk

```
User message → Slack bot
    → L3 governance: intent gate check
        → PASS: forward to L2 runtime
        → FAIL: return gate error, do not execute
    → L2 eliza runtime: task-coordinator picks up task
        → spawns Planner agent
        → Planner calls L1 AIOS kernel for LLM slot
        → AIOS schedules call, manages context window
        → response flows back up through runtime
        → Coder / Critic agents spin up via task-coordinator
    → L3 governance: delivery evidence check before ship
    → Result posted back to Slack
```

---

## Environment Variables

```env
# L1 — AIOS Kernel
AIOS_LLM_PROVIDER=anthropic          # anthropic | openai | ollama
AIOS_SCHEDULER_MAX_CONCURRENT=5
AIOS_MEMORY_BACKEND=supabase         # supabase | sqlite | postgres

# L2 — eliza runtime
ELIZA_ANTHROPIC_API_KEY=sk-ant-...
ELIZA_SLACK_BOT_TOKEN=xoxb-...
ELIZA_SLACK_APP_TOKEN=xapp-...
ELIZA_SUPABASE_URL=https://...
ELIZA_SUPABASE_KEY=...

# L3 — governance
AGENTIC_OS_STRICT_GATES=true         # enforce all delivery gates
AGENTIC_OS_SKILLS_PATH=./agentic-os/governance/skills

# Spiktor existing vars
N8N_HOST=...
SLACK_BOT_TOKEN=...
GOBII_TOKEN=...                      # keep for fallback only
```

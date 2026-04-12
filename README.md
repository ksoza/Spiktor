# Spiktor — AI Coworker (Viktor Clone)

> Open-source AI coworker that plans, codes, reviews, and ships — always-on, self-hosted.

## Stack

| Layer | Component | Role |
|---|---|---|
| **Brain** | Verdent AI (ksoza fork) | Multi-agent coding (Planner/Coder/Critic/Judge) |
| **Runtime** | Gobii Platform | Always-on execution, Slack, browser, web tasks |
| **Automation** | n8n (ksoza fork) | Workflow triggers, scheduling, 400+ app integrations |
| **Memory** | OpenMemory | Long-term temporal knowledge graph |
| **Web** | Browserable | AI-native web automation (90.4% benchmark) |
| **CI/CD** | GitHub Actions | Automated testing & deployment |
| **Container** | Docker | Self-contained packaging |
| **OS** | Zo-Ksoza | Living layer — email, calendar, files, API |
| **IM** | Slack (upgraded) | Thread memory, daily digests, action blocks |

## Quick Start

\`\`\`bash
git clone https://github.com/ksoza/Spiktor.git
cd Spiktor
cp .env.example .env
# add your API keys (Zo API key, Gobii token, etc.)
./bootstrap.sh
\`\`\`

## Environment Variables

| Variable | Description |
|---|---|
| `ZO_API_KEY` | Zo Computer access token (from Settings → Advanced) |
| `GOBII_TOKEN` | Gobii platform auth token |
| `GEMINI_API_KEY` | LLM provider (Gemini or Ollama) |
| `OLLAMA_BASE_URL` | Local Ollama endpoint (default: localhost:11434) |
| `N8N_HOST` | Your n8n instance URL |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |

## Architecture

```
User → Zo Space / Slack → Gobii (always-on) → Spiktor Hub
                                              ↓
                    ┌────────────────────────┼────────────────────────┐
                    ↓                        ↓                        ↓
              Verdent Brain           OpenMemory              Browserable / CI-CD
              (Planner/Coder/         (long-term               (web & deploy)
               Critic/Judge)           knowledge)
                    ↓                        ↓                        ↓
              GitHub / Notion         Temporal Graph            GitHub Actions
              Linear / GDrive        + Vector Store            Docker Build
                    ↓
              Zo-Ksoza (results, email, calendar, files)
\`\`\`

## Integrations

| Integration | Tools |
|---|---|
| **Zo-Ksoza** | Email, Calendar, Files, Web Search, Zo API |
| **Verdent MCP** | GitHub, Slack, Notion, Linear, Google Drive |
| **Gobii** | Web search, browser, Slack, always-on execution |
| **OpenMemory** | `memory_recall`, `memory_remember`, `memory_recent`, `memory_build_context` |
| **Browserable** | `web_navigate`, `web_screenshot`, `web_click`, `web_type` |
| **CI/CD** | GitHub Actions workflow creation and status polling |
| **Docker** | Dockerfile generation, docker-compose for self-host |
| **Slack Bot** | Thread memory, daily digests, action blocks, @mention triggers |

## Deploy

```bash
# Self-host with Docker
docker build -t spiktor .
docker run -e ZO_API_KEY=your_key spiktor

# Or use the VPS layer (n8n + Gobii + Slack bot)
cd spiktor-vps && docker-compose up -d
```

## License

MIT — your AI coworker, your infrastructure.

## 🚀 Running Standalone (No Zo)

See **STANDALONE.md** for complete Docker-based setup. Spiktor runs 100% without Zo — just Docker, Ollama, and your API keys. Zero subscription costs.

## 📦 Components

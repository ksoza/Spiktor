# Spiktor Standalone — Self-Hosted AI Coworker

> No Zo. No cloud subscription. No per-call costs. Just spin it up and it runs.

## What You Get

```
Spiktor Core
├── Verdent Agent      ← multi-agent coding brain (Planner → Coder → Critic → Judge)
├── Gobii Runtime      ← always-on, listens to Slack 24/7, executes tasks
├── n8n                ← workflow automation (300+ app integrations)
├── Ollama (optional)   ← free local LLM, no internet needed
└── MCP Tools          ← GitHub, Notion, Linear, Slack, GDrive, Database
```

## Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for local dev)
- A Slack workspace (for bot interaction)
- GitHub token (for repo access)
- Gemini API key OR local Ollama instance (for LLM)

---

## Quick Start (Full Stack)

### 1. Extract Spiktor

```bash
tar -xzf Spiktor-v3.tar.gz
cd spiktor
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
# LLM - pick ONE
GEMINI_API_KEY=your_gemini_key_here
# OR use local Ollama (free)
OLLAMA_BASE_URL=http://localhost:11434

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Slack Bot
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_APP_TOKEN=xapp-your-app-token

# Optional: n8n
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_password

# Optional: Database for n8n
POSTGRES_DB=n8n
POSTGRES_USER=n8n
POSTGRES_PASSWORD=n8n_password
```

### 3. Start Everything

```bash
docker-compose up -d
```

This starts:
- **Port 3000** — Spiktor Dashboard (Verdent UI)
- **Port 5678** — n8n Workflows
- **Port 11434** — Ollama (if enabled)

### 4. Open the Dashboard

```
http://localhost:3000
```

---

## Individual Component Setup

### Verdent Agent (Coding Brain)

```bash
cd verdent-mcp
npm install
npm run dev
```

```bash
# In another terminal — start Gobii (Slack listener)
cd gobii-integration
pip install -r requirements.txt
python -m gobii start
```

**API Endpoint:** `POST http://localhost:3000/api/chat`

```json
{
  "jsonrpc": "2.0",
  "method": "sendMessage",
  "params": {
    "message": "Build a REST API for a todo app with Next.js",
    "state": "IDLE",
    "taskId": "todo-api-1"
  },
  "id": 1
}
```

---

### n8n Workflows (300+ Integrations)

```bash
# Start n8n standalone
docker run --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=password \
  n8nio/n8n
```

Open → http://localhost:5678

**Import workflows from** `n8n-workflows/*.json`

---

### Gobii (Always-On Slack Bot)

```bash
# Requires Python 3.10+
pip install gobii-core slack-bolt

# Create a bot config
cat > gobii.config.json
{
  "slack": {
    "bot_token": "xoxb-...",
    "app_token": "xapp-...",
    "signing_secret": "..."
  },
  "verdent_url": "http://localhost:3000/api/chat",
  "llm": {
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}

# Start the bot
python -m gobii run --config gobii.config.json
```

---

### Ollama (Local LLM — Free)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a coding model
ollama pull codellama:7b
ollama pull mistral:7b

# It runs on http://localhost:11434 automatically

# In Spiktor .env:
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=codellama:7b
```

---

### Adding MCP Tools (GitHub, Notion, Linear, etc.)

Edit `verdent-mcp/src/lib/mcp/registry.ts` and add credentials:

```typescript
// Already wired:
github: process.env.GITHUB_TOKEN,
notion: process.env.NOTION_API_KEY,
linear: process.env.LINEAR_API_KEY,
slack: process.env.SLACK_BOT_TOKEN,
gdrive: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
```

---

## Architecture Diagram

```
User (Slack/Chat)
        ↓
  ┌─────────────┐
  │   Gobii     │  ← always-on, listens 24/7
  │  (Runtime)  │
  └──────┬──────┘
         ↓ JSON-RPC
  ┌─────────────┐
  │   Verdent   │  ← Planner → Coder → Critic → Judge
  │  (Brain)    │  ← MCP tools: GitHub, Notion, Slack...
  └──────┬──────┘
         ↓
  ┌─────────────┐
  │    Ollama   │  ← local LLM (free) or Gemini (cloud)
  └─────────────┘

  ┌─────────────┐
  │     n8n     │  ← automation, 300+ integrations
  └──────┬──────┘
         ↓ webhooks
  External APIs (Stripe, Jira, Gmail, etc.)
```

---

## Troubleshooting

**Verdent won't start?**
```bash
# Check Node version
node --version  # must be 20+

# Reinstall deps
cd verdent-mcp && npm install

# Check env
cat .env | grep -v PASSWORD
```

**Gobii not responding?**
```bash
# Check Slack bot token is valid
curl -H "Authorization: Bearer xoxb-..." https://slack.com/api/auth.test

# Check Gobii logs
docker logs gobii 2>&1 | tail -50
```

**n8n won't connect to database?**
```bash
docker-compose down -v  # wipe DB
docker-compose up -d    # fresh start
```

---

## Scaling to Production

```bash
# Use a VPS (DigitalOcean, Hetzner, etc.)
# Minimum: 2GB RAM, 1 vCPU

# Clone onto your VPS
git clone https://github.com/ksoza/Spiktor
cd Spiktor

# Start with systemd (runs forever)
sudo cp spiktor.service /etc/systemd/system/
sudo systemctl enable spiktor
sudo systemctl start spiktor

# SSL with Caddy (auto HTTPS)
sudo apt install caddy
# Add to Caddyfile:
# spiktor.yourdomain.com {
#   reverse_proxy localhost:3000
# }
```

---

## Compare: Spiktor vs Viktor

| Feature | Viktor ($$$) | Spiktor (Free) |
|---------|-------------|----------------|
| AI Coding Agent | ✅ | ✅ Verdent |
| Slack Integration | ✅ | ✅ Gobii |
| GitHub Integration | ✅ | ✅ MCP |
| Notion, Linear, Jira | ✅ | ✅ MCP |
| Always-on 24/7 | ✅ | ✅ |
| Self-hosted | ❌ | ✅ |
| Per-month cost | $500+/mo | $0 |
| Your data | shared | 100% yours |
| Custom models | ❌ | ✅ Ollama |

---

## What's Already Wired

✅ Slack bot (Gobii)
✅ GitHub (MCP tools)
✅ Notion (read/write pages, databases)
✅ Linear (issues, projects)
✅ Google Drive (file search)
✅ n8n (300+ app automations)
✅ Ollama (free local LLM)
✅ Gemini (cloud LLM)
✅ Docker Compose (one-command start)

## What's Ready to Add

→ Browserable (AI web scraping, form fill)
→ CI/CD (GitHub Actions generator)
→ Docker (auto-generate Dockerfiles)
→ Long-term memory (OpenMemory)
→ Zo integration (optional — uses your Zo connected apps)

---

*Spiktor is built by [@ksoza](https://github.com/ksoza) — open-source Viktor clone*

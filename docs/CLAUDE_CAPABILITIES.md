# Claude Capability Addons
# =========================
# These repos extend what I (Claude / Spiktor) can DO in this workspace.
# Read this before any task that might involve video, free API routing, or file verification.

---

## Capability 1: Video Vision (ksoza/claude-video-vision)

**I can now watch and understand videos.**

When you give me a video file path, I can:
- Extract frames at adaptive fps via ffmpeg
- Transcribe audio with timestamps (local Whisper or Gemini backend)
- Receive frames as images + transcript simultaneously
- Return a full perceptual brief: what was seen, what was said, when

**How to invoke:**
```
/watch-video path/to/video.mp4
/watch-video tutorial.mp4 "what language is used?"
/watch-video recording.mov "diagnose the bug shown at 2:34"
```

Or naturally: "Watch this screen recording and tell me why the login fails"

**Backends:**
- `WHISPER_BACKEND=local` — fully offline, Whisper base/medium/large
- `WHISPER_BACKEND=gemini` — cloud, timestamped, more accurate
- `WHISPER_BACKEND=openai` — cloud fallback

**What this unlocks for Spiktor:**
- spiktor-artist watches competitor product demos → intel report
- spiktor-writer watches a tutorial → extracts steps → drafts documentation  
- spiktor-coder watches a screen recording → diagnoses the bug → writes the fix
- GhOSTface watches deployment recordings → auto-generates runbooks
- RiP platform: video content moderation, thumbnail extraction, remix intelligence

---

## Capability 2: Free Claude Code (ksoza/free-claude-code)

**I can route my own API calls to free providers when Anthropic tokens are expensive.**

Zero-cost providers available:
| Provider | Model | Cost | Use for |
|---|---|---|---|
| NVIDIA NIM | Llama 3.1 405B | 40 req/min free | Planning, judge decisions |
| OpenRouter | DeepSeek R1, Mistral 7B | Free tier | Critic, routine tasks |
| DeepSeek | deepseek-coder | ~$0.001/Mtok | ALL coding tasks |
| LM Studio | local Qwen2.5-Coder | Zero | ghostface, background |
| llama.cpp | local quantized | Zero | GhOSTface, drafts |

**Per-agent routing (auto, no config needed):**
```
spiktor-planner  → OpenRouter (free reasoning)
spiktor-coder    → DeepSeek Coder (best free coder, $0.001/Mtok)
spiktor-critic   → OpenRouter free tier
spiktor-judge    → NVIDIA NIM Llama 405B (free, high-stakes)
spiktor-ops      → DeepSeek (cheap)
ghostface        → llama.cpp local (zero cost)
```

**Rule:** Claude Opus/Sonnet (real Anthropic API) only fires for:
- Final synthesis in the Pineal
- IP-sensitive tasks (VCNL, PCBL, KSX, QCNA)
- Anything requiring Claude's specific reasoning capabilities

Everything else routes to free providers automatically.

**Setup:** Set 2 env vars, no other changes:
```bash
ANTHROPIC_BASE_URL=http://localhost:8090  # free-claude proxy
ANTHROPIC_API_KEY=any-string              # proxy handles auth
```

---

## Capability 3: Mythos Router — Strict Write Discipline (ksoza/mythos-router)

**Every file claim I make is now verified against the actual filesystem.**

This means I (Claude/Spiktor) can no longer hallucinate file state. If I say "I created file X", that claim is checked against a SHA-256 snapshot taken before and after. If it doesn't match reality, I get a correction turn.

**What SWD adds to my behavior:**
1. **Pre-snapshot** → I take a SHA-256 hash of all relevant files before acting
2. **Execute** → perform the task
3. **Post-snapshot** → rehash everything
4. **Verify** → diff before/after against my claims
5. **If mismatch** → correction turn (max 2 retries)
6. **If still mismatch** → yield to @uallsuspect
7. **Receipt issued** → permanent audit trail in `.mythos/receipts.json`

**Receipt undo:** Any action can be reversed:
```
MYTHOS_RECEIPT_UNDO receiptId=abc123
MYTHOS_RECEIPT_UNDO receiptId=latest dryRun=false
```

**Project policy** (`.mythos/policy.json`):
```json
{
  "sensitive_paths": ["aios-kernel/", "guardrails/", "ksx-config/"],
  "require_judge_approval": true,
  "branch_prefix": "mythos/"
}
```

**CI mode:** `mythos verify --ci` runs read-only PR checks without API key.
Checks: command-surface risks, sensitive-file access, receipt integrity.

**MCP adapter:** `mythos mcp` exposes SWD as MCP tools — any external agent routes file ops through SWD.

---

## Capability Summary

| Capability | Repo | What I can do now |
|---|---|---|
| **Watch videos** | claude-video-vision | Frame extraction + audio transcription + Claude vision analysis |
| **Free LLM routing** | free-claude-code | Route cheap tasks to free providers, save Anthropic tokens |
| **Verified file ops** | mythos-router | SHA-256 verification, correction turns, receipts, undo |
| **Repo intelligence** | GhOSTface | Deep GitHub analysis, HuggingFace search, Code Brain |
| **Undetectable scraping** | Scrapling | Web data extraction that bypasses anti-bot systems |
| **Native GitHub** | github-mcp-server | Full GitHub platform via MCP protocol |
| **Neural synthesis** | neurolib + TVB | Whole-brain agent coordination with real connectome |

---

## Usage in conversation

These capabilities activate naturally. You don't need to reference them by name:
- "Watch this recording" → video-vision activates
- "Don't burn my API credits on this" → free-claude routing activates  
- "Make sure the files actually got created" → SWD activates
- "Analyze our repo" → GhOSTface activates
- "Scrape this site" → Scrapling activates

For Spiktor agents, all capabilities are available as AIOS-registered tools.

---

## Capability 4: Live Stream Intelligence (ksoza/live-stream-chat-ai-agent)

**I can now watch live streams in real time and participate intelligently.**

Platforms: YouTube Live, Twitch, Bilibili (Huya/Douyu planned)

What this gives me:
- Watch any live stream and receive audio (STT), chat messages, and screenshots simultaneously
- Generate intel reports: key claims, sentiment, trending topics, hot moments
- Deploy a configurable AI persona that participates in chat
- Run silent monitoring (intel mode) or active participation
- Harvest sentiment across multiple streams simultaneously

**Spiktor use cases:**

| Persona | Stream target | Purpose |
|---|---|---|
| BoBooBot 🙈🙊🙉 | KSX/crypto streams | Community building, KSX awareness |
| KSX Community Manager | Crypto/DeFi launches | Answer questions, onboard users |
| NIMBUS Advocate | Tech/wearable streams | Pre-launch buzz, interest capture |
| RiP Scout | Creator/remix streams | Recruit creators to the platform |
| GhOSTface Intel | Competitor launches | Silent competitive intelligence |

**How to invoke:**
```
STREAM_WATCH url="https://youtube.com/watch?v=..." mode="intel"
STREAM_WATCH url="https://twitch.tv/..." mode="participate" persona="BoBooBot"
STREAM_INTEL sessionId="abc123" focus="product announcements"
STREAM_HARVEST topic="crypto sentiment"
STREAM_STOP sessionId="abc123"
```

Or naturally: "Watch this Twitch stream and tell me what they're saying about CPU mining"

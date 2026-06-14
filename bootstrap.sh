#!/usr/bin/env bash
# Spiktor Neurogenetic Brain — Complete Bootstrap
# Adds all submodules and starts the full stack

set -e
G="\033[0;32m"; R="\033[0;31m"; B="\033[1m"; X="\033[0m"

echo -e "${B}🧠 Spiktor Neurogenetic Brain — Complete Bootstrap${X}\n"

add() {
  local repo=$1 dest=$2
  if [ ! -d "$dest/.git" ]; then
    git submodule add "https://github.com/ksoza/$repo.git" "$dest" 2>/dev/null && \
      echo -e "  ${G}✓${X} $repo" || \
      echo -e "  ${R}✗${X} $repo (private or not found)"
  else
    echo -e "  ✓ $repo (exists)"
  fi
}

echo "→ Core agentic OS"
add AIOS             aios-kernel/AIOS
add eliza-AGENTIC-OS eliza-runtime
add agentic-os       agentic-os/governance
add github-mcp-server github-mcp-server
add GhOSTface        ghostface

echo "→ Neurogenetic brain"
add neurolib         brain/neurolib
add tvb-root         brain/tvb

echo "→ Subconscious"
add turbovec            turbovec
add claude-subconscious subconscious/claude-sub
add subconscious        subconscious/tim

echo "→ Guardrails"
add llama2-nemo-guardrails guardrails/nemo
add AWSGRail                guardrails/awsgrail
add Provenance              guardrails/provenance
add research-mode           guardrails/research-mode
add mythos-router           guardrails/mythos

echo "→ Camera eyes"
add CameraCapture    camera/ccap
add frigate          camera/frigate
add opencv-python    camera/opencv
add ultralytics      camera/ultralytics
add mediapipe        camera/mediapipe
add ESPectre         camera/espectre

echo "→ Intelligence"
add claude-video-vision     plugins/video-vision
add live-stream-chat-ai-agent plugins/livestream
add Scrapling                tools/scrapling
add browser-use              tools/browser-use

echo "→ LLM stack"
add vllm             llm-stack/vllm
add new-api          llm-stack/new-api
add TileKernels      llm-stack/tile-kernels
add free-claude-code llm-stack/free-claude
add litellm          tools/litellm
add DSPy             tools/dspy

echo "→ Agent frameworks"
add crewAI           agents/crewai
add OpenHands        agents/openhands
add OpenSwarm        agents/openswarm
add mem0             tools/mem0
add goose            agents/goose

echo "→ Skills"
add agent-skills     agents/agent-skills
add pm-skills        agents/pm-skills

echo "→ Generation"
add hyperframes      plugins/hyperframes
add Open-Generative-AI plugins/open-gen-ai
add Wan2.1           video/wan2
add CogVideo         video/cogvideo
add VidMuse          video/vidmuse
add Multimodal-Audio-Creator video/audio-creator
add ComfyUI          video/comfyui
add OpenCut          video/opencut
add librosa          video/librosa

echo "→ Social + distribution"
add AiToEarn         plugins/aitoearn
add postiz-app       ops/postiz

echo "→ Backend + ops"
add InsForge         plugins/insforge
add rustdesk         tools/rustdesk
add uptime-kuma      ops/uptime-kuma
add pi-hole          ops/pihole
add codeburn         ops/codeburn
add rip-web          ops/rip-web

echo "→ KSX ecosystem"
add Kingcoin         ksx/kingcoin
add BoBooBot         ksx/booboobot

echo "→ Reference + governance"
add claude-code                 plugins/claude-code
add claude-code-best-practice   governance/best-practice
add andrej-karpathy-skills      governance/karpathy-skills

git submodule update --init --recursive
echo -e "\n${G}✓ All submodules initialized${X}"

# .env
if [ ! -f ".env" ]; then
  cp eliza-integration/complete/.env.example .env
  echo -e "${R}⚠  Fill in .env with your API keys before starting${X}"
  exit 1
fi

echo
read -p "Start the complete neurogenetic stack? (y/N) " -n 1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker compose -f docker-compose.complete.yml up -d --build
  echo -e "\n${B}${G}🧠 Spiktor is LIVE${X}\n"
  echo "  Slack @spiktor  → task intake"
  echo "  Pineal          → http://localhost:5000"
  echo "  AIOS            → http://localhost:8080"
  echo "  GitHub MCP      → http://localhost:8081"
  echo "  Camera eyes     → http://localhost:5002"
  echo "  Intel service   → http://localhost:5003"
  echo "  Livestream      → http://localhost:5001"
  echo "  HyperFrames     → http://localhost:3080"
  echo "  Open-Gen-AI     → http://localhost:3090"
  echo "  LLM gateway     → http://localhost:3000"
  echo "  vLLM local      → http://localhost:8000"
  echo "  InsForge        → http://localhost:8090"
  echo "  ComfyUI         → http://localhost:8188"
  echo "  n8n             → http://localhost:5678"
  echo "  Uptime Kuma     → http://localhost:3001"
  echo "  Pi-hole         → http://localhost:8085"
  echo "  RustDesk        → :21114-21117"
fi

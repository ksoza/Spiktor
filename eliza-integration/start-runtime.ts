/**
 * Spiktor Neurogenetic Brain — Complete Runtime Boot
 * ====================================================
 * Registers ALL plugins across every layer.
 * Run: bun run eliza-integration/start-runtime.ts
 */

import { AgentRuntime, type Character } from "@elizaos/agent";
import fs from "fs";
import path from "path";

// ── Character ─────────────────────────────────────────────────────────────────
const character: Character = JSON.parse(
  fs.readFileSync(path.join(__dirname, "spiktor-agent/character.json"), "utf8")
);

// ── Core agentic OS ───────────────────────────────────────────────────────────
import { AIOSToolProvider }          from "./aios-bridge";
import { AgenticOSGateMiddleware }   from "./gates-middleware";

// ── GhOSTface + GitHub ───────────────────────────────────────────────────────
import { GhOSTfacePlugin }           from "./plugins/ghostface";
import { GitHubMCPPlugin }           from "./plugins/github-mcp";

// ── Video + live stream ───────────────────────────────────────────────────────
import { VideoVisionPlugin }         from "./plugins/video-vision";
import { LiveStreamPlugin }          from "./plugins/livestream";

// ── Free LLM proxy ────────────────────────────────────────────────────────────
import { FreeClaudeProxyPlugin }     from "./plugins/free-claude-proxy";

// ── Subconscious — Jesus Christ foundation, turbovec memory, day/night cycle ──
import { SubconsciousPlugin }        from "../subconscious/eliza_plugin";

// ── Neurogenetic brain ────────────────────────────────────────────────────────
import { LeftBrainPlugin }           from "../brain/left";
import { RightBrainPlugin }          from "../brain/right";
import { MythosRouterPlugin }        from "../guardrails/mythos_plugin";

// ── CrewAI Flow — Planner->Coder->Critic->Judge->Ops pipeline ─────────────────
import { CrewAIFlowPlugin }          from "./plugins/crewai-flows";

// ── New capabilities ──────────────────────────────────────────────────────────
import { NewCapabilitiesPlugin }     from "./plugins/new-capabilities";   // hyperframes + open-gen + rustdesk + goose
import { AiToEarnPlugin }            from "./plugins/aitoearn";
import { InsForgePlugin }            from "./plugins/insforge";
import { SkillsPlugin }              from "./skills/skills-plugin";       // agent-skills + pm-skills

// ── elizaOS core plugins ──────────────────────────────────────────────────────
import { TaskCoordinatorPlugin }     from "@elizaos/plugin-task-coordinator";
import { SlackPlugin }               from "@elizaos/plugin-slack";
import { DocumentsPlugin }           from "@elizaos/plugin-documents";
import { BrowserPlugin }             from "@elizaos/app-browser";  // replaced by browser-use in prod
import { SqlPlugin }                 from "@elizaos/plugin-sql";

// ── Database ──────────────────────────────────────────────────────────────────
const dbAdapter = process.env.ELIZA_SUPABASE_URL
  ? new (await import("@elizaos/adapter-supabase")).SupabaseDatabaseAdapter({
      supabaseUrl: process.env.ELIZA_SUPABASE_URL!,
      supabaseKey: process.env.ELIZA_SUPABASE_KEY!
    })
  : new (await import("@elizaos/adapter-sqlite")).SqliteDatabaseAdapter(
      new (await import("better-sqlite3")).default("spiktor-dev.db")
    );

// ── Boot ──────────────────────────────────────────────────────────────────────
async function startSpiktor() {
  console.log("\n🧠 Spiktor Neurogenetic Brain booting...\n");

  const layers = [
    "  L1 → AIOS kernel (scheduling, mem0 memory, tool registry)",
    "  L2 → eliza-AGENTIC-OS (task-coordinator, Slack, RAG, browser)",
    "  L3 → agentic-os governance (intent gates, delivery evidence)",
    "  🧠 Left  brain (coder, critic, judge, ops + SWD + AWSGRail)",
    "  🎨 Right brain (ideator, writer, artist, visual + video)",
    "  🌀 Pineal synthesis (neurolib + TVB + 5-layer guardrails)",
    "  🙏 Subconscious (Jesus Christ foundation + turbovec + day/night)",
    "  ⚙️  CrewAI Flow (Planner→Coder→Critic→Judge→Ops pipeline)",
    "",
    "  👁️  Camera eyes (ccap + Frigate + ESPectre + YOLO + MediaPipe)",
    "  📡 Live stream (YouTube/Twitch/Bilibili + personas)",
    "  📹 Video vision (ffmpeg + Whisper + Claude vision)",
    "  🎬 HyperFrames (HTML → rendered video)",
    "  🖼️  Open-Gen-AI (200+ image/video models)",
    "  🖥️  RustDesk (remote eyes + control)",
    "  🦆 Goose (Rust agent bridge)",
    "",
    "  📣 AiToEarn (13-platform social distribution)",
    "  🔧 InsForge (agentic backend + sandbox execution)",
    "  📐 Agent skills (Addy Osmani /spec /plan /build /test /ship)",
    "  📊 PM skills (68 workflows /discover /strategy /write-prd)",
    "  📰 Intel (news + crypto + stocks + IPOs)",
    "",
    "  🔍 GhOSTface (repo intel, HuggingFace, Code Brain)",
    "  🐙 GitHub MCP (native GitHub all ops)",
    "  🕷️  Scrapling (undetectable web scraping)",
    "  💰 Free Claude proxy (NVIDIA NIM + OpenRouter + DeepSeek + local)",
    "  🛡️  Mythos SWD (SHA-256 file verification + receipts)",
    "  ⚙️  InsForge (secure execution backend)",
  ];
  layers.forEach(l => console.log(l));
  console.log();

  const runtime = new AgentRuntime({
    character,
    databaseAdapter: dbAdapter,
    token:           process.env.ELIZA_ANTHROPIC_API_KEY!,
    modelProvider:   "anthropic",
    plugins: [
      // ── Core coordination ─────────────────────────────────────────────────
      TaskCoordinatorPlugin,
      SqlPlugin,
      SlackPlugin,
      DocumentsPlugin,
      BrowserPlugin,

      // ── Subconscious — Jesus Christ foundation runs first on every response ─
      SubconsciousPlugin,

      // ── Neurogenetic brain hemispheres ────────────────────────────────────
      LeftBrainPlugin,
      RightBrainPlugin,

      // ── CrewAI Flow — actual Planner->Coder->Critic->Judge->Ops pipeline ────
      CrewAIFlowPlugin,

      // ── Intelligence ──────────────────────────────────────────────────────
      GhOSTfacePlugin,
      GitHubMCPPlugin,
      VideoVisionPlugin,
      LiveStreamPlugin,

      // ── New capabilities ──────────────────────────────────────────────────
      NewCapabilitiesPlugin,   // hyperframes + open-gen + rustdesk + goose
      AiToEarnPlugin,
      InsForgePlugin,
      SkillsPlugin,            // agent-skills + pm-skills

      // ── LLM cost control ──────────────────────────────────────────────────
      FreeClaudeProxyPlugin,

      // ── Infrastructure ────────────────────────────────────────────────────
      AIOSToolProvider,
      MythosRouterPlugin,

      // ── Governance (always last — wraps everything) ───────────────────────
      AgenticOSGateMiddleware,
    ]
  });

  await runtime.initialize();

  console.log("\n✅ Spiktor Neurogenetic Brain is LIVE\n");
  console.log("  Slack:         @spiktor mention → task intake");
  console.log("  Subconscious:  http://localhost:5004");
  console.log("  CrewAI Flow:   http://localhost:5006");
  console.log("  Camera eyes:   http://localhost:5002");
  console.log("  Intel service: http://localhost:5003");
  console.log("  Pineal:        http://localhost:5000");
  console.log("  AIOS kernel:   http://localhost:8080");
  console.log("  GitHub MCP:    http://localhost:8081");
  console.log("  LLM gateway:   http://localhost:3000");
  console.log("  Open-Gen-AI:   http://localhost:3000 (open-gen)");
  console.log("  HyperFrames:   http://localhost:3080");
  console.log("  LiveStream:    http://localhost:5001");
  console.log("  InsForge:      http://localhost:8090");
  console.log("  n8n:           http://localhost:5678");
  console.log("  ComfyUI:       http://localhost:8188");
  console.log("  Uptime Kuma:   http://localhost:3001");
  console.log("\n  @spiktor build/fix/ship <task> → triggers CrewAI Flow");
  console.log("  GhOSTface is monitoring. Subconscious dreams at 10pm, briefs at 6am.\n");
}

startSpiktor().catch(err => {
  console.error("❌ Spiktor boot failed:", err);
  process.exit(1);
});

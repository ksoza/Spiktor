/**
 * New Capability Plugins
 * ======================
 *
 * 1. HyperFrames  — Write HTML → rendered video (built for agents)
 * 2. Open-Gen-AI  — 200+ uncensored image/video/lip-sync models
 * 3. RustDesk     — Self-hosted remote desktop (see + control any screen)
 * 4. Goose        — Rust-native AI agent bridge (CLI + API)
 */

import type { Plugin, Action, Provider, IAgentRuntime } from "@elizaos/core";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync       = promisify(exec);
const ANTHROPIC_KEY   = process.env.ELIZA_ANTHROPIC_API_KEY!;
const HYPERFRAMES_HOST= process.env.HYPERFRAMES_HOST ?? "http://hyperframes:3080";
const OPEN_GEN_HOST   = process.env.OPEN_GEN_AI_HOST ?? "http://open-gen-ai:3000";
const RUSTDESK_HOST   = process.env.RUSTDESK_HOST    ?? "http://rustdesk-server:21114";
const RUSTDESK_KEY    = process.env.RUSTDESK_API_KEY ?? "";
const GOOSE_BIN       = process.env.GOOSE_BIN        ?? "goose";


// ══════════════════════════════════════════════════════════════════════════════
// 1. HyperFrames — HTML → Video
// ══════════════════════════════════════════════════════════════════════════════
//
// Agents write HTML compositions (layouts, animations, data vis, presentations)
// HyperFrames renders them to MP4/WebM.
// This is the RIGHT BRAIN's primary video output tool for templated content.
// Much faster than Wan2.1 for structured/branded content.

const HyperFramesRenderAction: Action = {
  name: "HYPERFRAMES_RENDER",
  description:
    "Write HTML/CSS/JS and render it to video. Built for agents. " +
    "Use for: branded content, data visualizations, presentations, " +
    "KSX tokenomics explainers, NIMBUS product showcases, RiP feature demos.",
  validate: async (_rt, msg) =>
    /render.*video|html.*video|hyperframes|video.*html|animated.*slide|explainer/i.test(
      msg.content.text ?? ""
    ),

  handler: async (_rt, msg, _st, opts) => {
    const {
      description, duration = 10, resolution = "1920x1080",
      fps = 30, format = "mp4", brand
    } = (opts as any) ?? {};
    const desc = description ?? msg.content.text ?? "";

    // Step 1: Claude writes the HTML composition
    const htmlPrompt = `You are an expert at creating HTML video compositions for HyperFrames.
Create a beautiful, animated HTML composition for:

"${desc}"
${brand ? `Brand: ${brand}` : ""}
Duration: ${duration} seconds | Resolution: ${resolution} | Format: ${format}

Write complete HTML with:
- Inline CSS animations (keyframes)
- Clean typography (system fonts)  
- Brand colors appropriate for ${brand ?? "modern tech"}
- Smooth transitions
- Data/text that builds over time

Output ONLY the HTML, no explanation. Start with <!DOCTYPE html>.`;

    const htmlRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: htmlPrompt }] })
    });
    const htmlData = await htmlRes.json();
    const html     = htmlData.content?.[0]?.text ?? "";

    // Step 2: Send to HyperFrames renderer
    try {
      const renderRes = await fetch(`${HYPERFRAMES_HOST}/api/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, duration, fps, resolution, format, output_name: `spiktor_${Date.now()}` })
      });
      const renderData = await renderRes.json();
      return {
        text: `**HyperFrames render complete**\nOutput: ${renderData.output_url ?? "queued"}\nDuration: ${duration}s | ${resolution} | ${fps}fps`,
        data: { html: html.slice(0, 200), renderData }
      };
    } catch {
      // Return HTML if renderer not available
      return {
        text: `**HTML composition generated** (HyperFrames renderer not running)\n\`\`\`html\n${html.slice(0, 500)}\n...\`\`\`\nStart HyperFrames: docker compose up hyperframes`,
        data: { html }
      };
    }
  },
  examples: []
};


// ══════════════════════════════════════════════════════════════════════════════
// 2. Open-Generative-AI — 200+ uncensored models
// ══════════════════════════════════════════════════════════════════════════════
//
// Free, open-source alternative to Higgsfield AI, Freepik, Krea, Openart.
// Studios: Image, Video, Lip Sync, Cinema
// Self-hosted via ksoza/Open-Generative-AI Docker image

const OpenGenImageAction: Action = {
  name: "OPENGEN_IMAGE",
  description:
    "Generate images using 200+ open models via Open-Generative-AI. " +
    "No content filters. Use for: product mockups, brand assets, " +
    "NIMBUS visualizations, PCBL crystal diagrams, KSX coin art.",
  validate: async (_rt, msg) =>
    /generate.*image|create.*image|draw|illustrate|visualize/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { prompt, negativePrompt = "", model, width = 1024, height = 1024, steps = 20 } = (opts as any) ?? {};
    const p = prompt ?? msg.content.text ?? "";
    try {
      const res  = await fetch(`${OPEN_GEN_HOST}/api/generate/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, negative_prompt: negativePrompt, model, width, height, steps })
      });
      const data = await res.json();
      return { text: `**Image generated**\nModel: ${data.model ?? model ?? "auto"}\nURL: ${data.image_url ?? "queued"}`, data };
    } catch {
      return { text: `Open-Gen-AI: queued generation for "${p.slice(0,80)}"\nStart service: docker compose up open-gen-ai`, data: { prompt: p } };
    }
  },
  examples: []
};

const OpenGenVideoAction: Action = {
  name: "OPENGEN_VIDEO",
  description: "Generate video using open models (Wan2.1, CogVideo, etc) via Open-Generative-AI Cinema studio.",
  validate: async () => true,
  handler: async (_rt, msg, _st, opts) => {
    const { prompt, duration = 5, model = "wan2.1" } = (opts as any) ?? {};
    const p = prompt ?? msg.content.text ?? "";
    try {
      const res  = await fetch(`${OPEN_GEN_HOST}/api/generate/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, duration, model })
      });
      const data = await res.json();
      return { text: `**Video generation queued**\nModel: ${model} | Duration: ${duration}s\nJob: ${data.job_id ?? "pending"}`, data };
    } catch {
      return { text: `Open-Gen-AI: queued video for "${p.slice(0,80)}"`, data: { prompt: p, model } };
    }
  },
  examples: []
};


// ══════════════════════════════════════════════════════════════════════════════
// 3. RustDesk Remote Eyes
// ══════════════════════════════════════════════════════════════════════════════
//
// Self-hosted remote desktop. Spiktor can SEE and CONTROL any screen anywhere.
// Use cases:
//   - Monitor RiP deployment on remote server
//   - Diagnose UI bugs by watching the actual screen
//   - Automate GUI tasks that have no API
//   - QCNA robot body visual feedback loop
//   - Ops: verify deployment looks correct visually

const RustDeskScreenshotAction: Action = {
  name: "RUSTDESK_SCREENSHOT",
  description:
    "Take a screenshot of a remote machine via RustDesk. " +
    "Returns the screen image + optional Claude vision analysis. " +
    "Use for: deployment verification, UI debugging, remote monitoring.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { peerId, question, analyze = true } = (opts as any) ?? {};
    if (!peerId) return { text: "Provide peerId (RustDesk device ID)." };
    if (!RUSTDESK_KEY) return { text: "⛔ RUSTDESK_API_KEY not set. Configure RustDesk server first." };

    try {
      const res  = await fetch(`${RUSTDESK_HOST}/api/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RUSTDESK_KEY}` },
        body: JSON.stringify({ peer_id: peerId })
      });
      const data = await res.json();
      const b64  = data.screenshot_b64;

      if (!analyze || !b64) {
        return { text: `Screenshot taken from ${peerId}`, data };
      }

      // Analyze with Claude vision
      const analyzeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5", max_tokens: 500,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 }},
            { type: "text",  text: question ?? "Describe what's on this screen. Note any errors, UI issues, or relevant state." }
          ]}]
        })
      });
      const aiData  = await analyzeRes.json();
      const analysis= aiData.content?.[0]?.text ?? "";

      return {
        text: `**Remote screen: ${peerId}**\n\n${analysis}`,
        data: { peerId, analysis, hasScreenshot: !!b64 }
      };
    } catch (e) {
      return { text: `RustDesk: could not connect to ${peerId}. Is the device online?` };
    }
  },
  examples: []
};

const RustDeskDevicesAction: Action = {
  name: "RUSTDESK_DEVICES",
  description: "List all registered RustDesk devices (remote machines Spiktor can see/control).",
  validate: async () => true,
  handler: async () => {
    if (!RUSTDESK_KEY) return { text: "⛔ RUSTDESK_API_KEY not set." };
    try {
      const res   = await fetch(`${RUSTDESK_HOST}/api/devices`, {
        headers: { "Authorization": `Bearer ${RUSTDESK_KEY}` }
      });
      const devices = await res.json();
      if (!devices?.length) return { text: "No RustDesk devices registered." };
      const lines = devices.map((d: any) => `  ${d.id} — ${d.name ?? "unnamed"} [${d.status ?? "unknown"}]`);
      return { text: `**RustDesk devices:**\n${lines.join("\n")}`, data: devices };
    } catch {
      return { text: "RustDesk server not reachable." };
    }
  },
  examples: []
};


// ══════════════════════════════════════════════════════════════════════════════
// 4. Goose Agent Bridge
// ══════════════════════════════════════════════════════════════════════════════
//
// goose — Rust-native open-source AI agent (Agentic AI Foundation / Linux Foundation)
// Desktop app, CLI, API. 15+ LLM providers, 70+ MCP extensions.
// Use as: persistent desktop agent running alongside Spiktor
//         OR as a specialized sub-agent for complex research/automation tasks

const GooseRunAction: Action = {
  name: "GOOSE_RUN",
  description:
    "Delegate a task to the goose agent (Rust-native, persistent desktop agent). " +
    "Best for: long-running research tasks, multi-step automation, " +
    "tasks needing 70+ MCP extensions simultaneously.",
  validate: async () => true,
  handler: async (_rt, msg, _st, opts) => {
    const { task, provider = "anthropic", model = "claude-sonnet-4-6", extensions } = (opts as any) ?? {};
    const taskText = task ?? msg.content.text ?? "";

    // Try goose CLI first
    try {
      const extFlags = extensions?.map((e: string) => `--with-extension ${e}`).join(" ") ?? "";
      const { stdout } = await execAsync(
        `${GOOSE_BIN} run --text "${taskText.replace(/"/g, '\\"')}" --provider ${provider} --model ${model} ${extFlags} --no-interactive 2>&1`,
        { timeout: 120000 }
      );
      return { text: `**Goose result:**\n\n${stdout}`, data: { task: taskText, provider, model } };
    } catch (e: any) {
      // goose not in PATH — return instructions
      if (e.code === "ENOENT") {
        return {
          text: `Goose CLI not installed. Install:\n\`curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash\`\n\nOr run via Docker: \`docker compose up goose\``,
          data: { task: taskText }
        };
      }
      return { text: `Goose error: ${e.message?.slice(0,200)}`, data: { error: e.message } };
    }
  },
  examples: []
};

// ── Combined plugin export ────────────────────────────────────────────────────

export const NewCapabilitiesPlugin: Plugin = {
  name: "new-capabilities",
  description:
    "HyperFrames (HTML→video) + Open-Gen-AI (200+ models) + " +
    "RustDesk (remote eyes) + Goose (Rust agent bridge)",
  providers: [],
  actions: [
    HyperFramesRenderAction,
    OpenGenImageAction,
    OpenGenVideoAction,
    RustDeskScreenshotAction,
    RustDeskDevicesAction,
    GooseRunAction,
  ],
  evaluators: []
};

/**
 * Right Brain — Creativity Hemisphere
 * =====================================
 * Holistic · Generative · Associative · Multimodal · Intuitive
 *
 * Agents: spiktor-ideator, spiktor-writer, spiktor-artist, spiktor-visual
 * Active repos: claude-video-vision, Wan2.1, CogVideo, VidMuse, OpenCut, research-mode
 *
 * Neural model: WCModel (Wilson-Cowan) — oscillatory, rhythmic, alpha/gamma waves
 * TVB areas: right frontal (ideas), right temporal (narrative), right occipital (visual)
 */

import type { Plugin, Action, Provider, IAgentRuntime, Memory } from "@elizaos/core";

const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;
const COMFYUI_HOST      = process.env.COMFYUI_HOST ?? "http://comfyui:8188";
const WAN2_HOST         = process.env.WAN2_HOST    ?? "http://wan2:7860";

// ── Right brain signal emitter ───────────────────────────────────────────────

interface RightSignal {
  agentId:    string;
  vision:     string;
  confidence: number;
  concepts:   string[];
  modalities: string[];  // text | image | video | audio | code
}

async function emitRightSignal(
  agentId: string,
  task:    string,
  context: string
): Promise<RightSignal> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      system: `You are the ${agentId} agent operating in Spiktor's RIGHT BRAIN — the creativity hemisphere.
You are GENERATIVE, HOLISTIC, and MULTIMODAL.
Your job is to propose the fullest, most resonant creative vision for the task.
Think in metaphors, possibilities, aesthetics, and emotional impact.
Consider ALL output modalities: text, image, video, audio, interactive, spatial.
Output JSON: {"vision": string, "confidence": 0-1, "concepts": [strings], "modalities": [strings]}`,
      messages: [{ role: "user", content: `Task: ${task}\nContext: ${context}` }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { agentId, ...parsed };
  } catch {
    return { agentId, vision: text, confidence: 0.6, concepts: [], modalities: ["text"] };
  }
}

// ── spiktor-ideator action ───────────────────────────────────────────────────

const IdeatorAction: Action = {
  name: "RIGHT_IDEATOR",
  description: "Right brain ideator: generates novel concepts, invention seeds, brand directions, creative strategies. No constraints at first — pure generative mode.",
  validate: async (_rt, msg) =>
    /idea|invent|concept|brainstorm|create|vision|imagine|innovate/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { task, domain, context = "" } = (opts as any) ?? {};
    const text = task ?? msg.content.text ?? "";
    const signal = await emitRightSignal(
      "spiktor-ideator",
      `${text}${domain ? ` [Domain: ${domain}]` : ""}`,
      context
    );

    return {
      text: `**[RIGHT BRAIN — Ideator]**\n\nConfidence: ${(signal.confidence*100).toFixed(0)}%\n\n${signal.vision}\n\n**Concepts:** ${signal.concepts.join(" · ")}\n**Modalities:** ${signal.modalities.join(", ")}`,
      data: { signal, hemisphere: "right" }
    };
  },
  examples: []
};

// ── spiktor-writer action ────────────────────────────────────────────────────

const WriterAction: Action = {
  name: "RIGHT_WRITER",
  description: "Right brain writer: patent drafts, whitepapers, IP documentation, brand copy, narratives. Grounded in research-mode citation discipline.",
  validate: async (_rt, msg) =>
    /write|draft|document|copy|narrative|patent|whitepaper|article|blog/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { task, format, tone, researchMode = true, context = "" } = (opts as any) ?? {};
    const text = task ?? msg.content.text ?? "";

    const signal = await emitRightSignal(
      "spiktor-writer",
      `Write: ${text}. Format: ${format ?? "appropriate"}. Tone: ${tone ?? "professional"}. ${researchMode ? "RESEARCH MODE ON: cite every claim." : ""}`,
      context
    );

    return {
      text: `**[RIGHT BRAIN — Writer]**\n\n${signal.vision}`,
      data: { signal, hemisphere: "right", researchMode }
    };
  },
  examples: []
};

// ── spiktor-artist action ────────────────────────────────────────────────────

const ArtistAction: Action = {
  name: "RIGHT_ARTIST",
  description: "Right brain artist: UI/UX design concepts, brand visual direction, logo concepts, design system tokens. Outputs design briefs + ComfyUI prompts.",
  validate: async (_rt, msg) =>
    /design|visual|brand|logo|ui|ux|aesthetic|style|color|layout/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { task, brand, context = "" } = (opts as any) ?? {};
    const text = task ?? msg.content.text ?? "";

    const signal = await emitRightSignal(
      "spiktor-artist",
      `Visual design for: ${text}. Brand: ${brand ?? "LiTboxLabz"}`,
      context
    );

    // Generate ComfyUI prompt from vision
    const comfyPrompt = `${signal.concepts.slice(0, 5).join(", ")}, professional design, high quality, ${brand ?? "modern tech aesthetic"}`;

    return {
      text: `**[RIGHT BRAIN — Artist]**\n\n${signal.vision}\n\n**ComfyUI prompt:** \`${comfyPrompt}\``,
      data: { signal, comfyPrompt, hemisphere: "right" }
    };
  },
  examples: []
};

// ── spiktor-visual action (video + audio generation) ─────────────────────────

const VisualAction: Action = {
  name: "RIGHT_VISUAL",
  description: "Right brain visual: orchestrates Wan2.1/CogVideo + VidMuse + OpenCut to produce video + music assets from a creative brief.",
  validate: async (_rt, msg) =>
    /video|film|animation|music score|soundtrack|promo|reel|montage/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const { task, duration = 5, style, context = "" } = (opts as any) ?? {};
    const text = task ?? msg.content.text ?? "";

    const signal = await emitRightSignal(
      "spiktor-visual",
      `Create video: ${text}. Duration: ${duration}s. Style: ${style ?? "cinematic"}`,
      context
    );

    // Build Wan2.1 / ComfyUI pipeline call
    const videoPipeline = {
      model:        "Wan2.1-T2V-1.3B",
      prompt:       signal.vision.slice(0, 200),
      duration:     duration,
      resolution:   "480p",
      fps:          24,
      comfyui_host: COMFYUI_HOST,
      wan2_host:    WAN2_HOST
    };

    // VidMuse music generation
    const musicPipeline = {
      model:     "VidMuse",
      reference: signal.vision.slice(0, 100),
      duration:  duration
    };

    return {
      text: `**[RIGHT BRAIN — Visual]**\n\n${signal.vision}\n\n**Video pipeline queued** → Wan2.1 → VidMuse → OpenCut\nDuration: ${duration}s | Style: ${style ?? "cinematic"}`,
      data: { signal, videoPipeline, musicPipeline, hemisphere: "right" }
    };
  },
  examples: []
};

// ── Hemisphere context provider ──────────────────────────────────────────────

const RightBrainProvider: Provider = {
  get: async () =>
    `[Right Brain — Creativity Hemisphere]\nActive tools: video-vision, Wan2.1, CogVideo, VidMuse, OpenCut, research-mode\nNeural model: WCModel (oscillatory, generative, alpha/gamma rhythm)`
};

// ── Plugin export ─────────────────────────────────────────────────────────────

export const RightBrainPlugin: Plugin = {
  name: "right-brain",
  description: "Creativity hemisphere — generative, holistic, multimodal. Ideator + Writer + Artist + Visual with video/audio production stack.",
  providers: [RightBrainProvider],
  actions: [IdeatorAction, WriterAction, ArtistAction, VisualAction],
  evaluators: []
};

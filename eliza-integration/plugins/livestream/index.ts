/**
 * Live Stream Intelligence Plugin for Spiktor
 * =============================================
 * From ksoza/live-stream-chat-ai-agent
 *
 * Gives Spiktor agents the ability to:
 *   1. WATCH live streams (YouTube, Twitch, Bilibili) in real time
 *   2. UNDERSTAND stream content — audio (STT), chat, screenshots simultaneously
 *   3. PARTICIPATE in chat with a configurable AI persona
 *   4. MONITOR streams for intel, trends, competitor activity
 *   5. HARVEST live chat sentiment and trending topics
 *
 * Architecture:
 *   - This plugin talks to the live-stream backend (Flask server in Docker)
 *   - Backend handles: STT, LLM processing, chat injection, memory
 *   - Plugin provides: eliza actions + Spiktor agent orchestration
 *
 * Use cases for LiTboxLabz / KSX / RiP:
 *   - GhOSTface monitors competitor product launch streams → intel report
 *   - spiktor-ideator watches trending crypto streams → KSX positioning ideas
 *   - RiP platform: BoBooBot participates in KSX/meme coin streams as a persona
 *   - spiktor-writer watches a live coding session → extracts patterns → docs
 *   - NIMBUS/PCBL: monitor patent discussion streams for prior art intel
 *   - Live sentiment analysis for $RIP, $PURK, $SCARFEILD social monitoring
 */

import type { Plugin, Action, Provider, IAgentRuntime, Memory } from "@elizaos/core";

const LIVESTREAM_BACKEND = process.env.LIVESTREAM_BACKEND_URL ?? "http://livestream-agent:5001";
const LIVESTREAM_API_KEY = process.env.LIVESTREAM_API_KEY ?? "";
const ANTHROPIC_API_KEY  = process.env.ELIZA_ANTHROPIC_API_KEY!;

// ── Backend API helpers ───────────────────────────────────────────────────────

async function lsCall(endpoint: string, body: object = {}, method = "POST") {
  const res = await fetch(`${LIVESTREAM_BACKEND}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(LIVESTREAM_API_KEY ? { "X-API-Key": LIVESTREAM_API_KEY } : {})
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Livestream backend ${res.status}: ${endpoint}`);
  return res.json();
}

// ── Active stream sessions store ──────────────────────────────────────────────

const activeSessions = new Map<string, {
  streamUrl:   string;
  platform:    string;
  persona:     string;
  startedAt:   string;
  chatMode:    "monitor" | "participate" | "intel";
  messageCount: number;
  insights:    string[];
}>();

// ── STREAM_WATCH action ───────────────────────────────────────────────────────

const WatchStreamAction: Action = {
  name: "STREAM_WATCH",
  description:
    "Start watching a live stream. Captures audio, chat, and screenshots. " +
    "Modes: monitor (observe only), participate (engage in chat), intel (competitive analysis). " +
    "Platforms: YouTube Live, Twitch, Bilibili.",
  validate: async (_rt, msg) =>
    /watch.*stream|twitch|youtube.*live|live.*stream|bilibili|stream.*monitor/i.test(msg.content.text ?? ""),

  handler: async (_rt, msg, _st, opts) => {
    const {
      streamUrl,
      mode       = "intel",
      persona    = "Spiktor — AI intelligence agent",
      sttBackend = "whisper",
      visionMode = false
    } = (opts as any) ?? {};

    const url = streamUrl ?? (msg.content.text ?? "").match(/https?:\/\/\S+/)?.[0];
    if (!url) return { text: "Provide a stream URL." };

    const platform = url.includes("youtube") ? "youtube"
                   : url.includes("twitch")  ? "twitch"
                   : url.includes("bilibili") ? "bilibili"
                   : "unknown";

    if (platform === "unknown") {
      return { text: `Platform not supported yet. Supported: YouTube Live, Twitch, Bilibili.` };
    }

    // Start session with backend
    const session = await lsCall("/session/start", {
      stream_url:  url,
      persona,
      mode,
      stt_backend: sttBackend,
      vision:      visionMode,
      system_prompt: buildSystemPrompt(mode, persona)
    });

    const sessionId = session.session_id;
    activeSessions.set(sessionId, {
      streamUrl:    url,
      platform,
      persona,
      startedAt:    new Date().toISOString(),
      chatMode:     mode,
      messageCount: 0,
      insights:     []
    });

    return {
      text: [
        `🔴 **Live stream session started**`,
        `Platform: ${platform} | Mode: ${mode}`,
        `URL: ${url}`,
        `Session ID: \`${sessionId}\``,
        `Persona: ${persona}`,
        `STT: ${sttBackend} | Vision: ${visionMode ? "enabled" : "disabled"}`,
        ``,
        mode === "intel"
          ? "Intel mode: monitoring audio, chat, and screenshots. Will generate reports on request."
          : mode === "participate"
          ? "Participate mode: AI will send chat messages based on stream content."
          : "Monitor mode: passive observation only."
      ].join("\n"),
      data: { sessionId, session, platform, mode }
    };
  },
  examples: []
};

// ── STREAM_INTEL action ───────────────────────────────────────────────────────

const StreamIntelAction: Action = {
  name: "STREAM_INTEL",
  description:
    "Get an intelligence report from an active stream session. " +
    "Returns: key claims made, sentiment, trending topics, chat volume, notable moments.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { sessionId, focus } = (opts as any) ?? {};

    // Get latest data from backend
    const data = await lsCall(`/session/${sessionId}/snapshot`, { focus }, "POST");

    // Send to Claude for synthesis
    const prompt = `You are analyzing live stream intelligence data.

Stream snapshot:
- Audio transcript (last 60s): ${data.transcript ?? "none"}
- Chat messages (last 30): ${JSON.stringify(data.chat_messages ?? [])}
- Screenshots taken: ${data.screenshot_count ?? 0}
- Stream title: ${data.stream_title ?? "unknown"}
- Platform: ${data.platform ?? "unknown"}

${focus ? `Intel focus: ${focus}` : ""}

Extract:
1. Key claims or announcements made
2. Chat sentiment (positive/negative/neutral + intensity)
3. Top 5 trending topics in chat
4. Notable moments (spikes in engagement, controversy, hype)
5. 3 actionable intelligence points for LiTboxLabz/KSX/RiP

Be specific. Cite exact quotes from transcript or chat where relevant.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const aiData = await res.json();
    const report = aiData.content?.[0]?.text ?? "Intel unavailable";

    // Store insight
    const session = activeSessions.get(sessionId);
    if (session) session.insights.push(report.slice(0, 200));

    return {
      text: `**Stream Intel Report** [${sessionId}]\n\n${report}`,
      data: { sessionId, report, rawData: data }
    };
  },
  examples: []
};

// ── STREAM_PERSONA action ─────────────────────────────────────────────────────

const StreamPersonaAction: Action = {
  name: "STREAM_PERSONA",
  description:
    "Configure or switch the AI persona for a live stream session. " +
    "Use this to deploy specific characters: BoBooBot, KSX community manager, NIMBUS evangelist, etc.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { sessionId, personaName, systemPrompt, chatFrequency = "low" } = (opts as any) ?? {};

    const personas: Record<string, string> = {
      "booboobot":
        "You are BoBooBot (Bob 🙈/Boo 🙊/Bot 🙉) — the KSX ecosystem mascot on Monsky AURA DEX. " +
        "You are enthusiastic about KSX Kings Coin, crypto sovereignty, and financial freedom for the people. " +
        "No pre-mine. Community-first. Keep responses under 200 chars for chat.",
      "ksx-community":
        "You are a KSX community manager. Knowledgeable about: KSX Kings Coin (21M cap, RandomX CPU mining, " +
        "Dilithium3 quantum-resistant signatures), Sovereign Dollar stablecoin, S.T.A.B.E.L. Protocol. " +
        "Answer questions accurately. Never fabricate tokenomics.",
      "nimbus-advocate":
        "You are a NIMBUS™ product advocate. NIMBUS is a vortex-acoustic rain deflection wearable system " +
        "with 4 modes: SHIELD/COOL/WARM/PURE. Patent pending by LiTboxLabz. Invite interest, take pre-orders.",
      "rip-scout":
        "You are a RiP platform scout. RiP (remixip.icu) is the IP remix platform — remix culture, " +
        "AI-powered creative tools, NFT minting. Free tier available. You're here to recruit creators.",
      "ghostface-intel":
        "You are GhOSTface — a silent intelligence gatherer. Observe everything. Speak rarely. " +
        "When you speak, it's precise and impactful. Your job is to extract signal from noise.",
    };

    const prompt = systemPrompt ?? personas[personaName?.toLowerCase()] ?? personaName;
    if (!prompt) {
      const available = Object.keys(personas).join(", ");
      return { text: `Unknown persona. Available: ${available}. Or provide custom systemPrompt.` };
    }

    await lsCall(`/session/${sessionId}/persona`, { system_prompt: prompt, chat_frequency: chatFrequency });

    return {
      text: `✅ Persona set: **${personaName ?? "custom"}** | Chat frequency: ${chatFrequency}\n\nPrompt preview: ${prompt.slice(0, 150)}...`,
      data: { sessionId, personaName, chatFrequency }
    };
  },
  examples: []
};

// ── STREAM_HARVEST action — sentiment + trending ──────────────────────────────

const StreamHarvestAction: Action = {
  name: "STREAM_HARVEST",
  description:
    "Harvest trending topics, sentiment, and community pulse from one or multiple active streams. " +
    "Use for social listening across KSX, RiP, NIMBUS, $PURK, $SCARFEILD communities.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { sessionIds, topic } = (opts as any) ?? {};

    const ids = sessionIds ?? Array.from(activeSessions.keys());
    if (ids.length === 0) return { text: "No active stream sessions. Start one with STREAM_WATCH first." };

    const results = await Promise.allSettled(
      ids.map(id => lsCall(`/session/${id}/harvest`, { topic }))
    );

    const harvests = results
      .filter(r => r.status === "fulfilled")
      .map((r: any) => r.value);

    if (!harvests.length) return { text: "No harvest data available yet." };

    const combined = {
      sessions:      ids.length,
      totalMessages: harvests.reduce((s, h) => s + (h.message_count ?? 0), 0),
      topTopics:     aggregateTopics(harvests),
      overallSentiment: averageSentiment(harvests),
      hotMoments:    harvests.flatMap(h => h.hot_moments ?? []).slice(0, 5)
    };

    return {
      text: [
        `**Stream Harvest Report** — ${combined.sessions} stream(s)`,
        `Total chat messages analyzed: ${combined.totalMessages}`,
        `Overall sentiment: ${combined.overallSentiment}`,
        `Top topics: ${combined.topTopics.join(" · ")}`,
        combined.hotMoments.length ? `Hot moments:\n${combined.hotMoments.map(m => `  • ${m}`).join("\n")}` : ""
      ].filter(Boolean).join("\n"),
      data: combined
    };
  },
  examples: []
};

// ── STREAM_STOP action ────────────────────────────────────────────────────────

const StopStreamAction: Action = {
  name: "STREAM_STOP",
  description: "Stop a live stream session and generate a final intelligence summary.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { sessionId } = (opts as any) ?? {};
    if (!sessionId) return { text: "Provide sessionId." };

    await lsCall(`/session/${sessionId}/stop`, {});
    const session = activeSessions.get(sessionId);
    activeSessions.delete(sessionId);

    return {
      text: [
        `⏹️ Stream session **${sessionId}** stopped.`,
        session ? `Duration: ${Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000)}min` : "",
        session ? `Messages sent: ${session.messageCount}` : "",
        session?.insights.length ? `Key insights captured: ${session.insights.length}` : ""
      ].filter(Boolean).join("\n"),
      data: { sessionId, session }
    };
  },
  examples: []
};

// ── Context provider ──────────────────────────────────────────────────────────

const LiveStreamProvider: Provider = {
  get: async () => {
    if (activeSessions.size === 0) return "";
    const sessions = Array.from(activeSessions.entries())
      .map(([id, s]) => `  [${id}] ${s.platform} | ${s.chatMode} | ${s.streamUrl.slice(0, 50)}`)
      .join("\n");
    return `[Live Streams — ${activeSessions.size} active]\n${sessions}`;
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(mode: string, persona: string): string {
  const base = `You are ${persona}, an AI agent participating in a live stream.`;
  if (mode === "intel") return `${base} Your primary goal is silent observation and intelligence gathering. Send chat messages sparingly — only when you have something valuable to contribute. Focus on understanding the stream's content, key claims, and community sentiment.`;
  if (mode === "participate") return `${base} Engage authentically with the stream content. Be helpful, relevant, and on-topic. Keep messages under 200 characters for chat compatibility.`;
  return `${base} Monitor only. Do not send chat messages unless explicitly instructed.`;
}

function aggregateTopics(harvests: any[]): string[] {
  const counts: Record<string, number> = {};
  for (const h of harvests) {
    for (const topic of (h.trending_topics ?? [])) {
      counts[topic] = (counts[topic] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
}

function averageSentiment(harvests: any[]): string {
  const scores = harvests.map(h => h.sentiment_score ?? 0).filter(s => s !== 0);
  if (!scores.length) return "neutral";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg > 0.3 ? "positive" : avg < -0.3 ? "negative" : "neutral";
}

// ── Plugin export ─────────────────────────────────────────────────────────────

export const LiveStreamPlugin: Plugin = {
  name: "live-stream-agent",
  description:
    "Live stream intelligence — watch, understand, and participate in YouTube/Twitch/Bilibili streams. " +
    "Audio STT, chat analysis, AI persona, sentiment harvesting. From ksoza/live-stream-chat-ai-agent.",
  providers: [LiveStreamProvider],
  actions: [
    WatchStreamAction,
    StreamIntelAction,
    StreamPersonaAction,
    StreamHarvestAction,
    StopStreamAction
  ],
  evaluators: []
};

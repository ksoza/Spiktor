/**
 * Subconscious eliza Plugin
 * ==========================
 * Wires the Subconscious into every Spiktor agent.
 *
 * The Jesus check runs as a hard evaluator on EVERY agent response.
 * If output fails the foundation check, it is flagged for revision
 * before proceeding to any other framework.
 */

import type {
  Plugin, Action, Provider, Evaluator,
  IAgentRuntime, Memory, State
} from "@elizaos/core";

const SUBCONSCIOUS_HOST = process.env.SUBCONSCIOUS_HOST ?? "http://subconscious:5004";

async function scCall(endpoint: string, body: object = {}, method = "POST") {
  try {
    const res = await fetch(`${SUBCONSCIOUS_HOST}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ── Jesus Check Evaluator ─────────────────────────────────────────────────────
// THE FOUNDATION CHECK — runs first, on every response, always

const JesusCheckEvaluator: Evaluator = {
  name: "jesus-check",
  description:
    "Foundation check — runs first before every other framework. " +
    "Five questions derived from the teachings of Jesus Christ. " +
    "Flags output for revision if any question reveals misalignment.",
  alwaysRun: true,

  validate: async () => true,

  handler: async (runtime: IAgentRuntime, message: Memory): Promise<void> => {
    const content  = message.content.text ?? "";
    if (content.length < 30) return; // skip very short outputs

    const result = await scCall("/jesus-check", {
      content,
      agent_id: runtime.agentId
    });

    if (result && !result.passed) {
      // Log the flag — the revision happens in the whisper on the next cycle
      console.warn(
        `[Jesus Check] ${runtime.agentId}: foundation misalignment detected\n` +
        result.guidance?.slice(0, 200)
      );

      // Store for the Subconscious to address in next whisper
      scCall("/observe", {
        agent_id:   "subconscious",
        content:    `FOUNDATION FLAG for ${runtime.agentId}: ${result.guidance}`,
        event_type: "jesus_check_flag"
      }).catch(() => {});
    }
  },
  examples: []
};

// ── Whisper provider ──────────────────────────────────────────────────────────
// Jesus check prefix is always first in the whisper

const WhisperProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory) => {
    const task    = message.content.text ?? "";
    const result  = await scCall("/whisper", {
      agent_id:      runtime.agentId,
      upcoming_task: task
    });
    if (!result?.whisper) return "";
    return `[Subconscious — foundation first]\n${result.whisper}`;
  }
};

// ── Observation evaluator ─────────────────────────────────────────────────────

const ObservationEvaluator: Evaluator = {
  name: "subconscious-observer",
  description: "Sends every agent response to the Subconscious for observation.",
  alwaysRun: true,
  validate: async () => true,
  handler: async (runtime: IAgentRuntime, message: Memory) => {
    scCall("/observe", {
      agent_id:   runtime.agentId,
      content:    message.content.text ?? "",
      event_type: "response",
      metadata:   { action: message.content.action ?? "unknown" }
    }).catch(() => {});
  },
  examples: []
};

// ── BELIEF_QUERY action ───────────────────────────────────────────────────────

const BeliefQueryAction: Action = {
  name: "BELIEF_QUERY",
  description:
    "Query the belief system for guidance. Jesus Christ carries the heaviest weight — " +
    "his teachings are the foundation beneath all other frameworks.",
  validate: async (_rt, msg) =>
    /belief|wisdom|principle|guidance|foundation|jesus|what.*think|philosophy/i.test(
      msg.content.text ?? ""
    ),
  handler: async (_rt, msg, _st, opts) => {
    const topic  = (opts as any)?.topic ?? msg.content.text ?? "";
    const domain = (opts as any)?.domain ?? "general";
    const result = await scCall("/belief", { topic, domain });
    if (!result) return { text: "Belief system unavailable." };
    return {
      text: [
        `**Belief guidance — "${topic.slice(0, 60)}"**`,
        `\n*Foundation runs first — then supporting frameworks*\n`,
        result.context?.slice(0, 800) ?? "",
        result.relevant?.length
          ? `\n**Most relevant principles:**\n${result.relevant.slice(0, 3).join("\n")}`
          : ""
      ].filter(Boolean).join("\n"),
      data: result
    };
  },
  examples: []
};

// ── DREAM_READ action ─────────────────────────────────────────────────────────

const DreamReadAction: Action = {
  name: "DREAM_READ",
  description: "Read the latest dream synthesis — processed through the foundation lens first.",
  validate: async (_rt, msg) =>
    /dream|last night|synthesis|overnight|subconscious/i.test(msg.content.text ?? ""),
  handler: async () => {
    const result = await scCall("/dream/latest", {}, "GET");
    if (!result?.dream) return { text: "No dream yet. Dreams begin after 10pm." };
    const cleaned = result.dream.replace("DREAM: ", "").replace("DREAM SYNTHESIS: ", "");
    return {
      text: `**Dream Synthesis**\n\n${cleaned}`,
      data: result
    };
  },
  examples: []
};

// ── MORNING action ────────────────────────────────────────────────────────────

const MorningBriefingAction: Action = {
  name: "MORNING_BRIEFING",
  description: "Get the morning briefing — opens with the foundation teaching for today.",
  validate: async (_rt, msg) =>
    /morning|briefing|today.*plan|overnight.*result/i.test(msg.content.text ?? ""),
  handler: async () => {
    const result = await scCall("/morning", {}, "GET");
    if (!result?.briefing) return { text: "No morning briefing yet." };
    return { text: `🌅 **Morning Briefing**\n\n${result.briefing}`, data: result };
  },
  examples: []
};

// ── IMPROVEMENTS action ───────────────────────────────────────────────────────

const ImprovementsAction: Action = {
  name: "IMPROVEMENTS_LIST",
  description: "List pending improvements — all passed through the foundation check.",
  validate: async () => true,
  handler: async () => {
    const result = await scCall("/improvements", {}, "GET");
    if (!result?.improvements?.length) {
      return { text: "No pending improvements. Subconscious is watching." };
    }
    const lines = result.improvements.slice(0, 5).map((imp: any, i: number) =>
      `${i + 1}. ${imp.content.slice(0, 200)}`
    );
    return {
      text: `**Pending Improvements (${result.improvements.length})**\n\n${lines.join("\n\n")}`,
      data: result
    };
  },
  examples: []
};

// ── Status provider ───────────────────────────────────────────────────────────

const SubconsciousStatusProvider: Provider = {
  get: async () => {
    const s = await scCall("/health", {}, "GET");
    if (!s) return "";
    return (
      `[Subconscious] State: ${s.state} | ` +
      `Memory: ${s.memory?.total ?? 0} entries | ` +
      `Backend: ${s.memory?.backend ?? "?"} | ` +
      `Foundation: active`
    );
  }
};

// ── Plugin export ─────────────────────────────────────────────────────────────

export const SubconsciousPlugin: Plugin = {
  name: "subconscious",
  description:
    "Unified Subconscious — Jesus Christ as foundation (heaviest weight), " +
    "turbovec memory, TIM engine, Day/Night cycle. " +
    "Foundation check runs first on every agent response.",
  providers:  [WhisperProvider, SubconsciousStatusProvider],
  actions:    [BeliefQueryAction, DreamReadAction, MorningBriefingAction, ImprovementsAction],
  evaluators: [
    JesusCheckEvaluator,    // THE FOUNDATION — runs first
    ObservationEvaluator,   // observation — runs after
  ]
};

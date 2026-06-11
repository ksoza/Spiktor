/**
 * AIOS ↔ eliza bridge
 *
 * Registers AIOS kernel capabilities as an elizaOS plugin so agents
 * can call the AIOS tool manager, memory manager, and scheduler
 * directly through the eliza action/provider interface.
 *
 * AIOS kernel must be running on AIOS_HOST (default: localhost:8080)
 */

import type { Plugin, IAgentRuntime, Action, Provider } from "@elizaos/core";

const AIOS_HOST = process.env.AIOS_HOST ?? "http://localhost:8080";

// ── AIOS API helpers ────────────────────────────────────────────────────────────

async function aioskCall(endpoint: string, body: object) {
  const res = await fetch(`${AIOS_HOST}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AIOS kernel error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Memory provider — injects AIOS long-term memory into agent context ──────────

const AIOSMemoryProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: any) => {
    try {
      const result = await aioskCall("/memory/recall", {
        agent_id: runtime.agentId,
        query: message.content.text,
        limit: 5,
      });
      if (!result.memories?.length) return "";
      return `[AIOS Memory — relevant context from prior tasks]\n${result.memories
        .map((m: any) => `• ${m.content}`)
        .join("\n")}`;
    } catch {
      return ""; // memory unavailable, continue without it
    }
  },
};

// ── Tool invoke action — lets agents call any AIOS-registered tool ─────────────

const AIOSToolAction: Action = {
  name: "AIOS_TOOL_CALL",
  description: "Invoke a tool registered with the AIOS tool manager (MCP, n8n, APIs)",
  validate: async () => true,
  handler: async (_runtime, message, _state, options) => {
    const { tool_name, parameters } = options as { tool_name: string; parameters: object };
    const result = await aioskCall("/tools/invoke", { tool_name, parameters });
    return {
      text: `Tool ${tool_name} result: ${JSON.stringify(result.output, null, 2)}`,
      data: result,
    };
  },
  examples: [],
};

// ── Memory store action — writes decisions/outputs to AIOS long-term memory ────

const AIOSMemoryStoreAction: Action = {
  name: "AIOS_MEMORY_STORE",
  description: "Store a summary, decision, or output in AIOS long-term memory",
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    const { content, tags } = options as { content: string; tags?: string[] };
    await aioskCall("/memory/remember", {
      agent_id: runtime.agentId,
      content,
      tags: tags ?? [],
    });
    return { text: "Stored in AIOS memory." };
  },
  examples: [],
};

// ── Scheduler yield action — yields CPU slice back to AIOS scheduler ───────────

const AIOSYieldAction: Action = {
  name: "AIOS_YIELD",
  description: "Yield current task back to AIOS scheduler (use when blocked or waiting)",
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    const { reason, resume_after_ms } = options as {
      reason: string;
      resume_after_ms?: number;
    };
    await aioskCall("/scheduler/yield", {
      agent_id: runtime.agentId,
      reason,
      resume_after_ms: resume_after_ms ?? 0,
    });
    return { text: `Yielded: ${reason}` };
  },
  examples: [],
};

// ── Plugin export ───────────────────────────────────────────────────────────────

export const AIOSToolProvider: Plugin = {
  name: "aios-bridge",
  description: "Connects Spiktor eliza agents to the AIOS kernel (L1)",
  providers: [AIOSMemoryProvider],
  actions: [AIOSToolAction, AIOSMemoryStoreAction, AIOSYieldAction],
  evaluators: [],
};

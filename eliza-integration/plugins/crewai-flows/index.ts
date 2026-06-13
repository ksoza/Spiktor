/**
 * CrewAI Flow Trigger Plugin
 * ============================
 * Connects Spiktor's Slack interface to the actual
 * Planner->Coder->Critic->Judge->Ops pipeline (agents/crewai-flows).
 *
 * This is the missing link: previously @spiktor build/fix/ship requests
 * had no concrete multi-agent pipeline behind them. Now they do.
 *
 * FLOW_START   — kick off a new pipeline run
 * FLOW_STATUS  — check progress / get final report
 * FLOW_LIST    — list recent runs
 */

import type { Plugin, Action, Provider } from "@elizaos/core";

const FLOW_HOST = process.env.CREWAI_FLOW_HOST ?? "http://crewai-flow:5006";

async function flowCall(path: string, body?: object, method = "POST") {
  const res = await fetch(`${FLOW_HOST}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`crewai-flow ${res.status}: ${path}`);
  return res.json();
}

// ── FLOW_START ────────────────────────────────────────────────────────────────

const FlowStartAction: Action = {
  name: "FLOW_START",
  description:
    "Start the Planner->Coder->Critic->Judge->Ops pipeline for a build/fix/ship task. " +
    "This is THE entry point for any non-trivial engineering request — " +
    "'@spiktor build X', '@spiktor fix Y', '@spiktor implement Z'. " +
    "Runs asynchronously; returns a flow_id to poll with FLOW_STATUS.",
  validate: async (_rt, msg) =>
    /build|implement|fix|add|create|refactor|ship|deploy/i.test(msg.content.text ?? ""),

  handler: async (_rt, msg, _st, opts) => {
    const { task, owner = "ksoza", repo = "Spiktor" } = (opts as any) ?? {};
    const taskText = task ?? msg.content.text ?? "";

    try {
      const result = await flowCall("/flow/start", { task: taskText, owner, repo });
      return {
        text: [
          `🧠 **Flow started** \`${result.flow_id}\``,
          `Task: ${taskText}`,
          `Repo: ${owner}/${repo}`,
          ``,
          `Pipeline: PLAN → CODE → REVIEW → EVIDENCE → SHIP`,
          `Each phase posts updates here. Check progress: \`FLOW_STATUS ${result.flow_id}\``
        ].join("\n"),
        data: result
      };
    } catch (e: any) {
      return { text: `⛔ Flow service unreachable: ${e.message}. Is crewai-flow running?` };
    }
  },
  examples: []
};

// ── FLOW_STATUS ───────────────────────────────────────────────────────────────

const FlowStatusAction: Action = {
  name: "FLOW_STATUS",
  description: "Check the status of a running or completed Spiktor flow by flow_id.",
  validate: async (_rt, msg) => /flow.*status|check.*flow|flow.*\b[a-f0-9]{8}\b/i.test(msg.content.text ?? ""),
  handler: async (_rt, msg, _st, opts) => {
    const flowId = (opts as any)?.flowId ?? (msg.content.text ?? "").match(/\b([a-f0-9]{8})\b/)?.[1];
    if (!flowId) return { text: "Provide a flow_id." };

    try {
      const f = await flowCall(`/flow/${flowId}`, undefined, "GET");

      if (f.status === "running") {
        return { text: `🔄 Flow \`${flowId}\` still running — task: ${f.task}`, data: f };
      }
      if (f.status === "error") {
        return { text: `⛔ Flow \`${flowId}\` errored: ${f.error}`, data: f };
      }

      const r = f.result ?? {};
      const lines = [
        `**Flow \`${flowId}\` — ${r.status?.toUpperCase()}**`,
        `Task: ${f.task}`,
        `Steps: ${r.steps?.length ?? 0}`,
      ];
      if (r.status === "shipped") {
        lines.push(`\n🚀 ${r.ops_report?.slice(0, 400) ?? ""}`);
      } else if (r.status === "halted" || r.status === "escalated") {
        lines.push(`\n⛔ ${r.halt_reason ?? ""}`);
      }
      return { text: lines.join("\n"), data: f };
    } catch (e: any) {
      return { text: `⛔ Could not fetch flow status: ${e.message}` };
    }
  },
  examples: []
};

// ── FLOW_LIST ─────────────────────────────────────────────────────────────────

const FlowListAction: Action = {
  name: "FLOW_LIST",
  description: "List recent Spiktor flow runs and their status.",
  validate: async (_rt, msg) => /list.*flows|recent.*flows|flow.*history/i.test(msg.content.text ?? ""),
  handler: async () => {
    try {
      const flows = await flowCall("/flow", undefined, "GET");
      if (!flows.length) return { text: "No flows have run yet." };
      const lines = flows.slice(-10).reverse().map((f: any) =>
        `\`${f.flow_id}\` [${f.status}] ${f.task}`
      );
      return { text: `**Recent flows:**\n${lines.join("\n")}`, data: flows };
    } catch (e: any) {
      return { text: `⛔ Flow service unreachable: ${e.message}` };
    }
  },
  examples: []
};

// ── Status provider ───────────────────────────────────────────────────────────

const FlowStatusProvider: Provider = {
  get: async () => {
    try {
      const h = await flowCall("/health", undefined, "GET");
      return `[CrewAI Flow] ${h.active_flows} flow(s) running`;
    } catch {
      return "";
    }
  }
};

export const CrewAIFlowPlugin: Plugin = {
  name: "crewai-flow",
  description:
    "Planner->Coder->Critic->Judge->Ops pipeline via CrewAI Flows. " +
    "The concrete implementation behind @spiktor build/fix/ship requests.",
  providers: [FlowStatusProvider],
  actions: [FlowStartAction, FlowStatusAction, FlowListAction],
  evaluators: []
};

/**
 * InsForge Agentic Backend Integration
 * =====================================
 * ksoza/InsForge — Backend platform built for agentic development
 *
 * What InsForge provides:
 *   - MCP server with Docker-based tool execution
 *   - Persistent agent state management
 *   - Secure sandboxed code execution environment
 *   - File system abstraction for agents
 *   - Background task queue
 *   - Webhook receiver for external triggers
 *
 * In Spiktor: InsForge becomes the execution backend that
 * spiktor-ops and spiktor-coder use for all file/code operations.
 * Replaces ad-hoc bash_tool calls with a structured, audited backend.
 */

import type { Plugin, Action, Provider, IAgentRuntime } from "@elizaos/core";

const INSFORGE_HOST   = process.env.INSFORGE_HOST    ?? "http://insforge:8090";
const INSFORGE_TOKEN  = process.env.INSFORGE_TOKEN   ?? "";

async function insforgeCall(endpoint: string, body: object = {}) {
  const res = await fetch(`${INSFORGE_HOST}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(INSFORGE_TOKEN ? { "Authorization": `Bearer ${INSFORGE_TOKEN}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`InsForge ${res.status}: ${endpoint}`);
  return res.json();
}

// ── Execute code in InsForge sandbox ─────────────────────────────────────────

const ExecuteAction: Action = {
  name: "INSFORGE_EXECUTE",
  description:
    "Execute code in InsForge's secure Docker sandbox. " +
    "Supports Python, Node.js, Bash. All execution is logged and audited. " +
    "Use for: running scripts, data processing, build tasks.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { code, language = "python", timeout = 30 } = (opts as any) ?? {};
    if (!code) return { text: "Provide code to execute." };

    const result = await insforgeCall("/execute", { code, language, timeout });
    return {
      text: [
        `**InsForge execution [${language}]**`,
        `Exit code: ${result.exit_code ?? 0}`,
        result.stdout ? `Output:\n\`\`\`\n${result.stdout.slice(0, 1000)}\n\`\`\`` : "",
        result.stderr ? `Stderr:\n\`\`\`\n${result.stderr.slice(0, 500)}\n\`\`\`` : "",
      ].filter(Boolean).join("\n"),
      data: result
    };
  },
  examples: []
};

// ── File operations via InsForge ──────────────────────────────────────────────

const FileWriteAction: Action = {
  name: "INSFORGE_WRITE",
  description: "Write files through InsForge's audited file system layer.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { path, content, encoding = "utf8" } = (opts as any) ?? {};
    if (!path || content === undefined) return { text: "Provide path and content." };
    const result = await insforgeCall("/files/write", { path, content, encoding });
    return {
      text: `✅ InsForge wrote ${path} (${result.bytes_written ?? "?"} bytes)`,
      data: result
    };
  },
  examples: []
};

const FileReadAction: Action = {
  name: "INSFORGE_READ",
  description: "Read files through InsForge.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { path } = (opts as any) ?? {};
    if (!path) return { text: "Provide path." };
    const result = await insforgeCall("/files/read", { path });
    return {
      text: `**${path}:**\n\`\`\`\n${(result.content ?? "").slice(0, 2000)}\n\`\`\``,
      data: result
    };
  },
  examples: []
};

// ── Background task queue ─────────────────────────────────────────────────────

const QueueTaskAction: Action = {
  name: "INSFORGE_QUEUE",
  description: "Queue a background task in InsForge. Returns immediately, task runs async.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { taskType, payload, scheduleAt } = (opts as any) ?? {};
    const result = await insforgeCall("/tasks/queue", { task_type: taskType, payload, schedule_at: scheduleAt });
    return {
      text: `✅ Task queued: ${taskType} | ID: ${result.task_id ?? "?"}`,
      data: result
    };
  },
  examples: []
};

// ── Status provider ───────────────────────────────────────────────────────────

const InsForgeProvider: Provider = {
  get: async () => {
    try {
      const res = await fetch(`${INSFORGE_HOST}/health`);
      const data = await res.json();
      return `[InsForge backend] Status: ${data.status ?? "ok"} | Tasks queued: ${data.queued ?? 0}`;
    } catch {
      return "[InsForge backend] Not reachable — start with docker compose up insforge";
    }
  }
};

export const InsForgePlugin: Plugin = {
  name: "insforge",
  description:
    "InsForge agentic backend — secure code execution, audited file ops, " +
    "background task queue. From ksoza/InsForge.",
  providers: [InsForgeProvider],
  actions: [ExecuteAction, FileWriteAction, FileReadAction, QueueTaskAction],
  evaluators: []
};

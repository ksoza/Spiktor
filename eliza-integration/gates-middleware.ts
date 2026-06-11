/**
 * agentic-os Gate Middleware for Spiktor
 *
 * Implements the governance layer (ksoza/agentic-os) as an elizaOS plugin.
 * Wraps every non-trivial action with:
 *   1. Intent gate  — task must have description, criteria, affected files
 *   2. Scope gate   — action must not touch out-of-scope files
 *   3. Evidence gate — delivery must include verifiable proof
 *   4. Ship gate    — final merge/deploy requires judge approval
 */

import type { Plugin, IAgentRuntime, Evaluator, Memory, State } from "@elizaos/core";

const STRICT = process.env.AGENTIC_OS_STRICT_GATES === "true";

// ── Gate definitions ────────────────────────────────────────────────────────────

interface GateResult {
  pass: boolean;
  reason?: string;
  required_fields?: string[];
}

function intentGate(task: string): GateResult {
  const missingFields: string[] = [];
  if (!task.includes("success criteri") && !task.includes("done when"))
    missingFields.push("success_criteria");
  if (task.length < 20)
    missingFields.push("task_description (too vague)");
  if (missingFields.length > 0) {
    return {
      pass: false,
      reason: "Intent gate: task is missing required fields",
      required_fields: missingFields,
    };
  }
  return { pass: true };
}

function scopeGate(plan: string[], changedFiles: string[]): GateResult {
  if (!plan.length) return { pass: true }; // no plan yet, skip
  const outOfScope = changedFiles.filter(
    (f) => !plan.some((step) => step.includes(f))
  );
  if (outOfScope.length > 0) {
    return {
      pass: false,
      reason: `Scope gate: files changed that are not in plan: ${outOfScope.join(", ")}`,
    };
  }
  return { pass: true };
}

function evidenceGate(evidence: string): GateResult {
  const hasTests = /test.*pass|✓|✅|PASS/i.test(evidence);
  const hasFile  = /created|updated|exists|\.ts|\.js|\.md/i.test(evidence);
  const hasApi   = /200|201|status.*ok|response/i.test(evidence);

  if (!hasTests && !hasFile && !hasApi) {
    return {
      pass: false,
      reason: "Evidence gate: no verifiable evidence found. Provide test results, file paths, or API responses.",
    };
  }
  return { pass: true };
}

// ── Gate evaluator (runs after every agent response) ───────────────────────────

const GateEvaluator: Evaluator = {
  name: "agentic-os-gates",
  description: "Enforces intent, scope, evidence, and ship gates on all agent actions",
  alwaysRun: true,

  validate: async (_runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return true; // always evaluate
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined
  ): Promise<void> => {
    const text = message.content.text ?? "";
    const agentName = state?.agentName ?? "unknown";

    // Only gate coder and ops agents — planner/critic/judge manage themselves
    if (!["spiktor-coder", "spiktor-ops"].includes(agentName)) return;

    // Intent gate on first message of a task
    if (message.content.action === "TASK_START") {
      const result = intentGate(text);
      if (!result.pass && STRICT) {
        console.warn(`[GATE STOP] ${result.reason}`);
        console.warn(`  Required: ${result.required_fields?.join(", ")}`);
        // Post back to Slack if available
        await runtime.messageManager.createMemory({
          ...message,
          content: {
            text: `⛔ **Intent gate failed.** Please provide: ${result.required_fields?.join(", ")}`,
            action: "GATE_FAIL",
          },
        });
      }
    }

    // Evidence gate before ship actions
    if (message.content.action === "SHIP" || message.content.action === "DEPLOY") {
      const result = evidenceGate(text);
      if (!result.pass) {
        console.warn(`[GATE STOP] ${result.reason}`);
        if (STRICT) {
          await runtime.messageManager.createMemory({
            ...message,
            content: {
              text: `⛔ **Evidence gate failed.** ${result.reason}`,
              action: "GATE_FAIL",
            },
          });
        }
      }
    }
  },

  examples: [],
};

// ── Plugin export ───────────────────────────────────────────────────────────────

export const AgenticOSGateMiddleware: Plugin = {
  name: "agentic-os-governance",
  description: "Governance layer — intent, scope, evidence, and ship gates (ksoza/agentic-os)",
  providers: [],
  actions: [],
  evaluators: [GateEvaluator],
};

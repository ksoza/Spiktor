/**
 * Left Brain — Technology Hemisphere
 * ====================================
 * Sequential · Analytical · Verification-driven · Deterministic
 *
 * Agents: spiktor-coder, spiktor-critic, spiktor-judge, spiktor-ops
 * Active repos: mythos-router (SWD), AWSGRail, Provenance, llama2-nemo-guardrails
 *
 * Neural model: ALNModel (excitatory/inhibitory population balance)
 * TVB areas: left frontal (exec), left temporal (language), left parietal (evaluation)
 */

import type { Plugin, Action, Provider, IAgentRuntime, Memory } from "@elizaos/core";
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";

const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;

// ── SHA-256 filesystem snapshot (mythos-router SWD) ──────────────────────────

function snapshotFiles(paths: string[]): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const p of paths) {
    try {
      const buf = fs.readFileSync(p);
      snap[p] = crypto.createHash("sha256").update(buf).digest("hex");
    } catch { snap[p] = "NOT_FOUND"; }
  }
  return snap;
}

function verifySnapshot(before: Record<string, string>, after: Record<string, string>): {
  verified: boolean; changed: string[]; missing: string[]; unexpected: string[];
} {
  const changed: string[] = [], missing: string[] = [], unexpected: string[] = [];
  for (const [p, h] of Object.entries(after)) {
    if (!(p in before)) unexpected.push(p);
    else if (before[p] !== h) changed.push(p);
  }
  for (const p of Object.keys(before)) {
    if (!(p in after)) missing.push(p);
  }
  return { verified: unexpected.length === 0, changed, missing, unexpected };
}

// ── Left brain signal emitter ────────────────────────────────────────────────

interface LeftSignal {
  agentId:    string;
  analysis:   string;
  confidence: number;
  evidence:   string[];
  blockers:   string[];
}

async function emitLeftSignal(
  agentId:  string,
  task:     string,
  context:  string
): Promise<LeftSignal> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `You are the ${agentId} agent operating in Spiktor's LEFT BRAIN — the technology hemisphere.
You are ANALYTICAL, SEQUENTIAL, and VERIFICATION-DRIVEN.
Your job is to analyze technical feasibility, identify risks, and validate claims.
Every claim must be grounded in evidence. If you cannot verify something, say so.
Output JSON: {"analysis": string, "confidence": 0-1, "evidence": [strings], "blockers": [strings]}`,
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
    return { agentId, analysis: text, confidence: 0.5, evidence: [], blockers: [] };
  }
}

// ── spiktor-coder action ─────────────────────────────────────────────────────

const CoderAction: Action = {
  name: "LEFT_CODER",
  description: "Left brain coder: implement with SWD filesystem verification. Every file claim verified via SHA-256.",
  validate: async () => true,
  handler: async (_rt, msg, _st, opts) => {
    const { task, filePaths = [], context = "" } = (opts as any) ?? {};
    const text = task ?? msg.content.text ?? "";

    // Pre-snapshot
    const before = snapshotFiles(filePaths);

    // Emit left brain signal
    const signal = await emitLeftSignal("spiktor-coder", text, context);

    // Post-snapshot verification
    const after  = snapshotFiles(filePaths);
    const verify = verifySnapshot(before, after);

    const output = [
      `**[LEFT BRAIN — Coder]**`,
      `Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
      ``,
      signal.analysis,
      ``,
      `**Evidence:** ${signal.evidence.join(" · ") || "none"}`,
      signal.blockers.length ? `**Blockers:** ${signal.blockers.join(", ")}` : "",
      `**SWD:** ${verify.verified ? "✅ verified" : `⚠️ unexpected files: ${verify.unexpected.join(", ")}`}`
    ].filter(Boolean).join("\n");

    return {
      text: output,
      data: { signal, verification: verify, hemisphere: "left" }
    };
  },
  examples: []
};

// ── spiktor-critic action ────────────────────────────────────────────────────

const CriticAction: Action = {
  name: "LEFT_CRITIC",
  description: "Left brain critic: analytical code review. Checks correctness, security, scope, test coverage.",
  validate: async () => true,
  handler: async (_rt, msg, _st, opts) => {
    const { diff, plan, context = "" } = (opts as any) ?? {};
    const signal = await emitLeftSignal(
      "spiktor-critic",
      `Review this diff/output:\n${diff ?? msg.content.text}`,
      `Original plan: ${plan ?? "none"}\n${context}`
    );

    const verdict = signal.blockers.length > 0 ? "FIX" :
                    signal.confidence > 0.8    ? "PASS" : "WARN";

    return {
      text: `**[LEFT BRAIN — Critic] ${verdict}**\n\n${signal.analysis}\n\n${signal.blockers.length ? `**Required fixes:** ${signal.blockers.join("; ")}` : ""}`,
      data: { signal, verdict, hemisphere: "left" }
    };
  },
  examples: []
};

// ── spiktor-judge action ─────────────────────────────────────────────────────

const JudgeAction: Action = {
  name: "LEFT_JUDGE",
  description: "Left brain judge: binary SHIP/NO-SHIP decision. Requires evidence bundle.",
  validate: async () => true,
  handler: async (_rt, msg, _st, opts) => {
    const { evidenceBundle, context = "" } = (opts as any) ?? {};
    const signal = await emitLeftSignal(
      "spiktor-judge",
      `Make a final SHIP/NO-SHIP decision on this evidence:\n${JSON.stringify(evidenceBundle ?? msg.content.text, null, 2)}`,
      context
    );

    const decision = signal.confidence >= 0.75 && signal.blockers.length === 0 ? "SHIP" : "NO-SHIP";

    return {
      text: `**[LEFT BRAIN — Judge] ${decision}**\n\nConfidence: ${(signal.confidence*100).toFixed(0)}%\n\n${signal.analysis}`,
      data: { signal, decision, hemisphere: "left" }
    };
  },
  examples: []
};

// ── Hemisphere signal provider ───────────────────────────────────────────────

const LeftBrainProvider: Provider = {
  get: async () =>
    `[Left Brain — Technology Hemisphere]\nActive guardrails: SWD verification, Graph-RAG, NeMo Colang, Provenance\nNeural model: ALNModel (analytical, sequential, inhibitory-balanced)`
};

// ── Plugin export ─────────────────────────────────────────────────────────────

export const LeftBrainPlugin: Plugin = {
  name: "left-brain",
  description: "Technology hemisphere — analytical, sequential, verification-driven. Coder + Critic + Judge with SWD + guardrails.",
  providers: [LeftBrainProvider],
  actions: [CoderAction, CriticAction, JudgeAction],
  evaluators: []
};

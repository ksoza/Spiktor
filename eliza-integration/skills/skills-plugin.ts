/**
 * Agent Skills + PM Skills Integration
 * ======================================
 * ksoza/agent-skills  — Addy Osmani's production engineering skills
 * ksoza/pm-skills     — 68 PM skills + 42 chained workflows
 *
 * agent-skills upgrades: spiktor-coder (left brain)
 *   /spec → /plan → /build → /test → /review → /ship pipeline
 *   Auto-activates based on task context
 *
 * pm-skills upgrades: spiktor-planner (pineal synthesis)
 *   /discover → /strategy → /write-prd → /plan-launch → /north-star
 *   Teresa Torres + Marty Cagan frameworks built in
 *
 * Both skill sets are loaded as CLAUDE.md-style skill files that
 * Spiktor agents read before executing relevant tasks.
 */

import type { Plugin, Action, Provider, IAgentRuntime } from "@elizaos/core";
import fs from "fs";
import path from "path";

const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;

// ── Skill loader ──────────────────────────────────────────────────────────────

function loadSkillFile(skillPath: string): string {
  try {
    return fs.readFileSync(skillPath, "utf8");
  } catch {
    return "";
  }
}

function getSkillsDir(type: "agent" | "pm"): string {
  const base = process.env.SKILLS_BASE_PATH ?? "/app";
  return type === "agent"
    ? path.join(base, "agents/agent-skills")
    : path.join(base, "agents/pm-skills");
}

// ── Engineering skill commands (ksoza/agent-skills) ──────────────────────────

const AGENT_SKILL_COMMANDS: Record<string, string> = {
  "/spec":         "spec",
  "/plan":         "plan",
  "/build":        "build",
  "/test":         "test",
  "/review":       "review",
  "/code-simplify":"code-simplify",
  "/simplify":     "code-simplify",   // alias — ponytail's framing of /code-simplify
  "/ship":         "ship",
};

// PM skill commands (ksoza/pm-skills)
const PM_SKILL_COMMANDS: Record<string, string> = {
  "/discover":    "discovery",
  "/strategy":    "strategy",
  "/write-prd":   "prd",
  "/plan-launch": "launch",
  "/north-star":  "metrics",
  "/prioritize":  "prioritization",
  "/retrospect":  "retro",
};

// Ponytail (ksoza/ponytail, fork of DietrichGebert/ponytail) — "the lazy senior
// dev": before writing code, stop at the first rung that holds. Applied as a
// standing constraint on every engineering skill, not a separate workflow —
// minimalism is a lens on /spec /plan /build /test /review /ship, not a phase
// of its own.
const PONYTAIL_LADDER = `Before adding any code, climb down this ladder and stop at the first rung that holds:
1. Is this needed at all? If not, leave it out.
2. Does the standard library already do it? Use that.
3. Does the platform/runtime already provide it natively? Use that.
4. Is there an already-installed dependency that covers it? Use that.
5. Can it be done in one line? Do that.
6. Only if none of the above hold: write the smallest implementation that works.
Mark any shortcut taken with a brief comment naming what it skips and what the
upgrade path would be. This is about laziness, not negligence: input validation,
data-loss handling, security, and accessibility are never skipped.`;

async function runSkillWorkflow(
  skill:        string,
  task:         string,
  context:      string,
  skillDir:     string,
  applyPonytail: boolean = false
): Promise<string> {
  // Load skill markdown file
  const skillFile = path.join(skillDir, `${skill}.md`);
  const skillDef  = loadSkillFile(skillFile);

  const ladderPrefix = applyPonytail ? `${PONYTAIL_LADDER}\n\n---\n\n` : "";

  const prompt = skillDef
    ? `${ladderPrefix}${skillDef}\n\n---\n\nApply the above skill to this task:\n${task}\n\nContext: ${context}`
    : `${ladderPrefix}Apply the "${skill}" skill to this task:\n${task}\n\nContext: ${context}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "Skill execution failed";
}

// ── Engineering workflow action ───────────────────────────────────────────────

const EngineeringSkillAction: Action = {
  name: "AGENT_SKILL",
  description:
    "Run a production engineering skill from ksoza/agent-skills. " +
    "Commands: /spec /plan /build /test /review /code-simplify (/simplify) /ship. " +
    "Every command applies the ponytail minimalism ladder (ksoza/ponytail) first — " +
    "stop at the first rung that holds: unneeded, stdlib, native, existing dependency, " +
    "one line, then minimum implementation. " +
    "Each activates the right quality gates and workflows for that phase.",
  validate: async (_rt, msg) => {
    const text = msg.content.text ?? "";
    return Object.keys(AGENT_SKILL_COMMANDS).some(cmd => text.startsWith(cmd));
  },
  handler: async (_rt, msg, _st, opts) => {
    const text    = (msg.content.text ?? "").trim();
    const cmdKey  = Object.keys(AGENT_SKILL_COMMANDS).find(c => text.startsWith(c)) ?? "/build";
    const skill   = AGENT_SKILL_COMMANDS[cmdKey];
    const task    = text.replace(cmdKey, "").trim();
    const context = (opts as any)?.context ?? "";

    const result = await runSkillWorkflow(skill, task, context, getSkillsDir("agent"), true);
    return {
      text: `**[Agent Skill: ${cmdKey}]**\n\n${result}`,
      data: { skill, command: cmdKey, task }
    };
  },
  examples: []
};

// ── PM workflow action ────────────────────────────────────────────────────────

const PMSkillAction: Action = {
  name: "PM_SKILL",
  description:
    "Run a PM workflow from ksoza/pm-skills (68 skills, 42 workflows). " +
    "Commands: /discover /strategy /write-prd /plan-launch /north-star /prioritize /retrospect. " +
    "Teresa Torres + Marty Cagan frameworks built in.",
  validate: async (_rt, msg) => {
    const text = msg.content.text ?? "";
    return Object.keys(PM_SKILL_COMMANDS).some(cmd => text.startsWith(cmd));
  },
  handler: async (_rt, msg, _st, opts) => {
    const text    = (msg.content.text ?? "").trim();
    const cmdKey  = Object.keys(PM_SKILL_COMMANDS).find(c => text.startsWith(c)) ?? "/discover";
    const skill   = PM_SKILL_COMMANDS[cmdKey];
    const task    = text.replace(cmdKey, "").trim();
    const context = (opts as any)?.context ?? "";

    const result = await runSkillWorkflow(skill, task, context, getSkillsDir("pm"));
    return {
      text: `**[PM Skill: ${cmdKey}]**\n\n${result}`,
      data: { skill, command: cmdKey, task }
    };
  },
  examples: []
};

// ── Auto-activate skill detection ────────────────────────────────────────────

const SkillAutoActivateProvider: Provider = {
  get: async (_rt, message) => {
    const text = (message.content.text ?? "").toLowerCase();

    const autoActivate: string[] = [];

    // Engineering auto-triggers
    if (/api.*(design|build|create)|rest|graphql|endpoint/i.test(text))
      autoActivate.push("api-and-interface-design");
    if (/component|ui|react|tailwind|frontend|button|form/i.test(text))
      autoActivate.push("frontend-ui-engineering");
    if (/test|spec|coverage|jest|vitest|cypress/i.test(text))
      autoActivate.push("test-driven-development");
    if (/deploy|ship|release|production|ci|cd/i.test(text))
      autoActivate.push("deployment-and-release");
    if (/security|auth|permission|token|jwt|oauth/i.test(text))
      autoActivate.push("security-engineering");

    // PM auto-triggers
    if (/feature|product|roadmap|priorit/i.test(text))
      autoActivate.push("pm:feature-prioritization");
    if (/launch|release.*plan|go.to.market/i.test(text))
      autoActivate.push("pm:launch-planning");
    if (/metric|kpi|north.star|success/i.test(text))
      autoActivate.push("pm:metrics-definition");
    if (/user.*research|discovery|interview/i.test(text))
      autoActivate.push("pm:discovery");

    if (autoActivate.length === 0) return "";
    return `[Skills auto-activated: ${autoActivate.join(", ")}]`;
  }
};

// ── Skill inventory action ────────────────────────────────────────────────────

const SkillListAction: Action = {
  name: "SKILL_LIST",
  description: "List all available engineering and PM skills.",
  validate: async () => true,
  handler: async () => ({
    text: [
      "**Engineering skills (ksoza/agent-skills):**",
      Object.entries(AGENT_SKILL_COMMANDS).map(([cmd, s]) => `  ${cmd} → ${s}`).join("\n"),
      "",
      "**PM skills (ksoza/pm-skills):**",
      Object.entries(PM_SKILL_COMMANDS).map(([cmd, s]) => `  ${cmd} → ${s}`).join("\n"),
      "",
      "**Standing lens (ksoza/ponytail):** minimalism ladder applied to every " +
        "engineering skill above — unneeded → stdlib → native → existing dep → " +
        "one line → minimum implementation.",
      "",
      "Auto-activates based on task context — no explicit invocation needed."
    ].join("\n"),
    data: { agentSkills: AGENT_SKILL_COMMANDS, pmSkills: PM_SKILL_COMMANDS, ponytail: true }
  }),
  examples: []
};

// ── Plugin export ─────────────────────────────────────────────────────────────

export const SkillsPlugin: Plugin = {
  name: "agent-pm-skills",
  description:
    "Engineering + PM skill frameworks. " +
    "ksoza/agent-skills (Addy Osmani) + ksoza/pm-skills (68 PM skills) + " +
    "ksoza/ponytail (minimalism ladder, applied to every engineering skill). " +
    "Auto-activates, upgrades spiktor-coder and spiktor-planner.",
  providers: [SkillAutoActivateProvider],
  actions: [EngineeringSkillAction, PMSkillAction, SkillListAction],
  evaluators: []
};

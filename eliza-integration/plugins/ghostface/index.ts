/**
 * GhOSTface Plugin for Spiktor
 *
 * Extracts the four intelligence layers from ksoza/GhOSTface and registers
 * them as native elizaOS actions + providers:
 *
 *   1. REPO_INTEL    — deep GitHub repo analysis (languages, README, contributors, auto-brief)
 *   2. HF_SEARCH     — search 500K+ HuggingFace models + live inference
 *   3. CODE_BRAIN    — describe what you want → get working code
 *   4. GHOST_MEMORY  — persistent operator memory bank (tech stack, preferences, context)
 *
 * All four feed into any Spiktor agent that needs them.
 * github-mcp-server handles raw GitHub ops; GhOSTface handles intelligence on top of that data.
 */

import type { Plugin, Action, Provider, IAgentRuntime, Memory, State } from "@elizaos/core";

const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY ?? "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

// ── GitHub helpers (used by REPO_INTEL) ──────────────────────────────────────

async function fetchGitHub(path: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

function parseRepoSlug(input: string): { owner: string; repo: string } | null {
  // accept "owner/repo" or full URL
  const match = input.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

// ── 1. REPO_INTEL action ────────────────────────────────────────────────────

const RepoIntelAction: Action = {
  name: "GHOSTFACE_REPO_INTEL",
  description:
    "Deep analysis of any GitHub repository — languages, README, contributors, " +
    "recent commits, open issues, CI status, and an AI-generated intelligence brief.",
  validate: async (_rt, msg) =>
    /github\.com|intel|analyze repo|repo analysis|tell me about.*repo/i.test(
      msg.content.text ?? ""
    ),

  handler: async (_runtime, message, _state, _opts) => {
    const text = message.content.text ?? "";
    const slug = parseRepoSlug(text);
    if (!slug) return { text: "Couldn't parse a repo from that. Try 'owner/repo' format." };

    const { owner, repo } = slug;

    // Parallel fetch: repo meta, languages, contributors, recent commits, open issues
    const [meta, langs, contributors, commits, issues] = await Promise.allSettled([
      fetchGitHub(`/repos/${owner}/${repo}`),
      fetchGitHub(`/repos/${owner}/${repo}/languages`),
      fetchGitHub(`/repos/${owner}/${repo}/contributors?per_page=5`),
      fetchGitHub(`/repos/${owner}/${repo}/commits?per_page=5`),
      fetchGitHub(`/repos/${owner}/${repo}/issues?state=open&per_page=5`),
    ]);

    const repoData = meta.status === "fulfilled" ? meta.value : {};
    const langData = langs.status === "fulfilled" ? langs.value : {};
    const contribData = contributors.status === "fulfilled" ? contributors.value : [];
    const commitData = commits.status === "fulfilled" ? commits.value : [];
    const issueData = issues.status === "fulfilled" ? issues.value : [];

    // AI brief via Claude
    const briefPrompt = `You are an expert code intelligence system. Analyze this GitHub repository and produce a concise technical brief.

Repository: ${owner}/${repo}
Description: ${repoData.description ?? "none"}
Stars: ${repoData.stargazers_count ?? 0} | Forks: ${repoData.forks_count ?? 0} | Open issues: ${repoData.open_issues_count ?? 0}
Primary language: ${repoData.language ?? "unknown"}
Languages: ${Object.keys(langData).join(", ")}
Top contributors: ${Array.isArray(contribData) ? contribData.map((c: any) => c.login).join(", ") : "unknown"}
Recent commits: ${Array.isArray(commitData) ? commitData.map((c: any) => c.commit?.message?.split("\n")[0]).join(" | ") : "unknown"}
Open issues (sample): ${Array.isArray(issueData) ? issueData.map((i: any) => i.title).join(" | ") : "none"}

Write a 4-sentence technical brief covering: what it does, tech stack, health/activity, and one key observation.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: briefPrompt }],
      }),
    });

    const aiData = await aiRes.json();
    const brief = aiData.content?.[0]?.text ?? "Brief unavailable.";

    const output = [
      `**${owner}/${repo}** — ${repoData.description ?? "No description"}`,
      `⭐ ${repoData.stargazers_count ?? 0} stars · 🍴 ${repoData.forks_count ?? 0} forks · ❗ ${repoData.open_issues_count ?? 0} open issues`,
      `Languages: ${Object.keys(langData).slice(0, 5).join(", ")}`,
      ``,
      `**AI Brief:**`,
      brief,
    ].join("\n");

    return { text: output, data: { meta: repoData, languages: langData, brief } };
  },
  examples: [],
};

// ── 2. HF_SEARCH + INFERENCE action ─────────────────────────────────────────

const HFSearchAction: Action = {
  name: "GHOSTFACE_HF_SEARCH",
  description:
    "Search 500K+ HuggingFace models and run live inference. " +
    "Use for finding the right model for a task or running a model directly.",
  validate: async (_rt, msg) =>
    /huggingface|hf model|run model|inference|find.*model|model.*for/i.test(
      msg.content.text ?? ""
    ),

  handler: async (_runtime, message, _state, opts) => {
    const text = message.content.text ?? "";
    const { query, modelId, inputs } = (opts as any) ?? {};

    // If a specific model + inputs given, run inference
    if (modelId && inputs) {
      if (!HF_API_KEY) return { text: "HUGGINGFACE_API_KEY not set." };
      const res = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
      });
      const result = await res.json();
      return {
        text: `**Inference result from \`${modelId}\`:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
        data: result,
      };
    }

    // Otherwise search models
    const searchQuery = query ?? text.replace(/huggingface|hf model|find.*model/gi, "").trim();
    const searchRes = await fetch(
      `https://huggingface.co/api/models?search=${encodeURIComponent(searchQuery)}&limit=5&sort=downloads`,
      { headers: HF_API_KEY ? { Authorization: `Bearer ${HF_API_KEY}` } : {} }
    );
    const models = await searchRes.json();

    if (!Array.isArray(models) || models.length === 0) {
      return { text: `No HuggingFace models found for: ${searchQuery}` };
    }

    const lines = models.map(
      (m: any, i: number) =>
        `${i + 1}. **${m.modelId}** — ${m.pipeline_tag ?? "unknown task"} · ⬇️ ${(m.downloads ?? 0).toLocaleString()} downloads`
    );

    return {
      text: `**HuggingFace models matching "${searchQuery}":**\n${lines.join("\n")}`,
      data: models,
    };
  },
  examples: [],
};

// ── 3. CODE_BRAIN action ─────────────────────────────────────────────────────

const CodeBrainAction: Action = {
  name: "GHOSTFACE_CODE_BRAIN",
  description:
    "Universal Code Brain — describe what you want in plain English and get " +
    "working, production-ready code with explanation. Repo-context aware.",
  validate: async (_rt, msg) =>
    /code brain|write.*code|build.*for me|generate.*code|create.*function|implement/i.test(
      msg.content.text ?? ""
    ),

  handler: async (_runtime, message, state, opts) => {
    const description = message.content.text ?? "";
    const { language, repoContext, style } = (opts as any) ?? {};

    // Pull repo context from GHOST_MEMORY if available
    const memoryContext = (state as any)?.ghostMemory
      ? `\nOperator tech stack: ${JSON.stringify((state as any).ghostMemory.techStack)}`
      : "";

    const prompt = `You are the Code Brain — an expert engineer who writes clean, production-ready code.

Task: ${description}
${language ? `Language/framework: ${language}` : ""}
${repoContext ? `Repo context: ${repoContext}` : ""}
${memoryContext}
${style ? `Style notes: ${style}` : ""}

Write the complete implementation with:
1. The full working code
2. A brief explanation of key decisions
3. Any dependencies needed
4. One usage example

Be direct. No filler. Ship it.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const code = data.content?.[0]?.text ?? "Code generation failed.";

    return { text: code, data: { prompt, response: code } };
  },
  examples: [],
};

// ── 4. GHOST_MEMORY provider + actions ──────────────────────────────────────

// In-process memory store (backed by AIOS long-term memory in production)
const ghostMemoryStore: Record<string, any> = {
  techStack: {},
  preferences: {},
  operatorContext: {},
  repoIndex: {},
};

const GhostMemoryProvider: Provider = {
  get: async (_runtime, _message) => {
    if (Object.keys(ghostMemoryStore.operatorContext).length === 0) return "";
    return `[GhOSTface Memory]\n${JSON.stringify(ghostMemoryStore, null, 2)}`;
  },
};

const GhostMemoryWriteAction: Action = {
  name: "GHOSTFACE_MEMORY_WRITE",
  description: "Store operator context, tech stack preferences, or repo knowledge in GhOSTface memory.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, opts) => {
    const { key, category, value } = (opts as any) ?? {};
    if (!key || !value) return { text: "Provide key and value to store." };

    const cat = category ?? "operatorContext";
    if (!ghostMemoryStore[cat]) ghostMemoryStore[cat] = {};
    ghostMemoryStore[cat][key] = value;

    return { text: `✅ Stored in GhOSTface memory: ${cat}.${key}` };
  },
  examples: [],
};

const GhostMemoryReadAction: Action = {
  name: "GHOSTFACE_MEMORY_READ",
  description: "Read from GhOSTface persistent memory bank.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, opts) => {
    const { category } = (opts as any) ?? {};
    const data = category ? ghostMemoryStore[category] : ghostMemoryStore;
    return {
      text: `**GhOSTface Memory${category ? ` (${category})` : ""}:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      data,
    };
  },
  examples: [],
};

// ── Plugin export ────────────────────────────────────────────────────────────

export const GhOSTfacePlugin: Plugin = {
  name: "ghostface",
  description:
    "GhOSTface intelligence layer — repo analysis, HuggingFace model search/inference, " +
    "Code Brain, and persistent operator memory. Extracted from ksoza/GhOSTface.",
  providers: [GhostMemoryProvider],
  actions: [
    RepoIntelAction,
    HFSearchAction,
    CodeBrainAction,
    GhostMemoryWriteAction,
    GhostMemoryReadAction,
  ],
  evaluators: [],
};

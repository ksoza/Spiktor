/**
 * GitHub MCP Server Plugin for Spiktor
 *
 * Registers ksoza/github-mcp-server as a native elizaOS tool provider.
 * The MCP server runs as a Docker sidecar (see docker-compose.yml).
 * Agents call it via the AIOS tool manager — zero per-call API cost.
 *
 * Toolsets enabled: repos, issues, pull_requests, actions, code_security,
 *                   notifications, git, discussions, secret_protection
 *
 * All write operations (push, merge, deploy) require judge approval via
 * the agentic-os gate middleware before execution.
 */

import type { Plugin, Action, Provider, IAgentRuntime, Memory } from "@elizaos/core";

const GITHUB_MCP_HOST = process.env.GITHUB_MCP_HOST ?? "http://github-mcp:8081";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

// ── MCP call helper ──────────────────────────────────────────────────────────

async function mcpCall(tool: string, params: Record<string, unknown>) {
  const res = await fetch(`${GITHUB_MCP_HOST}/tools/${tool}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub MCP [${tool}] ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Context provider — injects current GitHub user into every agent ──────────

const GitHubContextProvider: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory) => {
    try {
      const me = await mcpCall("get_me", {});
      return `[GitHub context]\nAuthenticated as: ${me.login} (${me.name ?? "no name"})\nToken scopes: ${me.scopes ?? "unknown"}`;
    } catch {
      return "";
    }
  },
};

// ── READ actions ─────────────────────────────────────────────────────────────

const GetFileAction: Action = {
  name: "GITHUB_GET_FILE",
  description: "Read a file from a GitHub repository.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, path, ref } = opts as any;
    const result = await mcpCall("get_file_contents", { owner, repo, path, ref });
    const content = Buffer.from(result.content ?? "", "base64").toString("utf8");
    return { text: `**${path}** (${ref ?? "default branch"}):\n\`\`\`\n${content}\n\`\`\``, data: result };
  },
  examples: [],
};

const ListIssuesAction: Action = {
  name: "GITHUB_LIST_ISSUES",
  description: "List open issues in a GitHub repository.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, state = "open", labels, perPage = 20 } = opts as any;
    const issues = await mcpCall("list_issues", { owner, repo, state, labels, perPage });
    if (!Array.isArray(issues) || issues.length === 0) return { text: "No issues found." };
    const lines = issues.map((i: any) => `#${i.number} [${i.state}] ${i.title}`);
    return { text: `**Issues in ${owner}/${repo}:**\n${lines.join("\n")}`, data: issues };
  },
  examples: [],
};

const ListPRsAction: Action = {
  name: "GITHUB_LIST_PRS",
  description: "List pull requests in a GitHub repository.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, state = "open", perPage = 10 } = opts as any;
    const prs = await mcpCall("list_pull_requests", { owner, repo, state, perPage });
    if (!Array.isArray(prs) || prs.length === 0) return { text: "No PRs found." };
    const lines = prs.map((p: any) => `#${p.number} [${p.state}] ${p.title} ← ${p.head?.ref}`);
    return { text: `**PRs in ${owner}/${repo}:**\n${lines.join("\n")}`, data: prs };
  },
  examples: [],
};

const GetWorkflowRunsAction: Action = {
  name: "GITHUB_GET_WORKFLOW_RUNS",
  description: "Get recent GitHub Actions workflow runs — check CI status.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, workflowId, perPage = 5 } = opts as any;
    const runs = await mcpCall("actions_list", {
      owner,
      repo,
      method: "list_workflow_runs",
      resource_id: workflowId,
      per_page: perPage,
    });
    const items = runs.workflow_runs ?? runs ?? [];
    if (!items.length) return { text: "No workflow runs found." };
    const lines = items.map(
      (r: any) =>
        `#${r.run_number} ${r.name} — ${r.conclusion ?? r.status} (${new Date(r.created_at).toLocaleDateString()})`
    );
    return { text: `**Workflow runs in ${owner}/${repo}:**\n${lines.join("\n")}`, data: items };
  },
  examples: [],
};

const GetJobLogsAction: Action = {
  name: "GITHUB_GET_JOB_LOGS",
  description: "Get logs for a GitHub Actions workflow job — use for CI failure diagnosis.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, jobId, runId, failedOnly = false, tailLines = 50 } = opts as any;
    const logs = await mcpCall("get_job_logs", {
      owner,
      repo,
      job_id: jobId,
      run_id: runId,
      failed_only: failedOnly,
      return_content: true,
      tail_lines: tailLines,
    });
    return { text: `**Job logs:**\n\`\`\`\n${logs.content ?? JSON.stringify(logs)}\n\`\`\``, data: logs };
  },
  examples: [],
};

const SearchCodeAction: Action = {
  name: "GITHUB_SEARCH_CODE",
  description: "Search code across GitHub repositories.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { query, perPage = 5 } = opts as any;
    const results = await mcpCall("search_code", { query, perPage });
    const items = results.items ?? [];
    if (!items.length) return { text: `No code results for: ${query}` };
    const lines = items.map((i: any) => `${i.repository?.full_name}/${i.path}`);
    return { text: `**Code search results for "${query}":**\n${lines.join("\n")}`, data: items };
  },
  examples: [],
};

const ListNotificationsAction: Action = {
  name: "GITHUB_LIST_NOTIFICATIONS",
  description: "List unread GitHub notifications — used by GhOSTface for proactive monitoring.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { filter = "default", perPage = 10 } = opts as any;
    const notifs = await mcpCall("list_notifications", { filter, perPage });
    if (!Array.isArray(notifs) || notifs.length === 0) return { text: "No unread notifications." };
    const lines = notifs.map(
      (n: any) => `[${n.reason}] ${n.subject?.title} — ${n.repository?.full_name}`
    );
    return { text: `**GitHub notifications:**\n${lines.join("\n")}`, data: notifs };
  },
  examples: [],
};

// ── WRITE actions (all require judge gate approval) ──────────────────────────

const CreateBranchAction: Action = {
  name: "GITHUB_CREATE_BRANCH",
  description: "Create a new git branch. Requires judge gate approval.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, branch, fromBranch } = opts as any;
    const result = await mcpCall("create_branch", { owner, repo, branch, from_branch: fromBranch });
    return { text: `✅ Branch \`${branch}\` created in ${owner}/${repo}`, data: result };
  },
  examples: [],
};

const PushFilesAction: Action = {
  name: "GITHUB_PUSH_FILES",
  description: "Push one or more files to a GitHub repository branch. Requires judge gate approval.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, branch, files, message } = opts as any;
    const result = await mcpCall("push_files", { owner, repo, branch, files, message });
    return {
      text: `✅ Pushed ${files.length} file(s) to \`${branch}\` in ${owner}/${repo}\nCommit: ${result.commit?.sha ?? "unknown"}`,
      data: result,
    };
  },
  examples: [],
};

const CreatePRAction: Action = {
  name: "GITHUB_CREATE_PR",
  description: "Open a pull request. Requires judge gate approval.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, title, head, base, body, draft = false } = opts as any;
    const result = await mcpCall("create_pull_request", { owner, repo, title, head, base, body, draft });
    return {
      text: `✅ PR #${result.number} opened: ${result.html_url}\n${title}`,
      data: result,
    };
  },
  examples: [],
};

const CreateIssueAction: Action = {
  name: "GITHUB_CREATE_ISSUE",
  description: "Create a GitHub issue. Requires judge gate approval.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, title, body, labels, assignees } = opts as any;
    const result = await mcpCall("issue_write", {
      method: "create",
      owner,
      repo,
      title,
      body,
      labels,
      assignees,
    });
    return {
      text: `✅ Issue #${result.number} created: ${result.html_url}\n${title}`,
      data: result,
    };
  },
  examples: [],
};

const MergePRAction: Action = {
  name: "GITHUB_MERGE_PR",
  description: "Merge a pull request. Requires judge gate approval + all checks passing.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo, pullNumber, mergeMethod = "squash", commitTitle } = opts as any;
    const result = await mcpCall("merge_pull_request", {
      owner,
      repo,
      pullNumber,
      merge_method: mergeMethod,
      commit_title: commitTitle,
    });
    return {
      text: `✅ PR #${pullNumber} merged in ${owner}/${repo}\nSHA: ${result.sha}`,
      data: result,
    };
  },
  examples: [],
};

// ── Security monitoring (GhOSTface autonomous scan) ─────────────────────────

const SecurityScanAction: Action = {
  name: "GITHUB_SECURITY_SCAN",
  description:
    "Scan a repo for code scanning alerts, Dependabot alerts, and secret scanning alerts. " +
    "Run autonomously by GhOSTface on a schedule.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { owner, repo } = opts as any;

    const [codeScan, dependabot, secrets] = await Promise.allSettled([
      mcpCall("list_code_scanning_alerts", { owner, repo, state: "open" }),
      mcpCall("list_dependabot_alerts", { owner, repo, state: "open" }),
      mcpCall("list_secret_scanning_alerts", { owner, repo, state: "open" }),
    ]);

    const codeAlerts = codeScan.status === "fulfilled" ? codeScan.value : [];
    const depAlerts = dependabot.status === "fulfilled" ? dependabot.value : [];
    const secretAlerts = secrets.status === "fulfilled" ? secrets.value : [];

    const total = (codeAlerts?.length ?? 0) + (depAlerts?.length ?? 0) + (secretAlerts?.length ?? 0);

    if (total === 0) return { text: `✅ ${owner}/${repo} — No open security alerts.` };

    const lines = [
      `⚠️ **Security alerts in ${owner}/${repo}:**`,
      `• Code scanning: ${codeAlerts?.length ?? 0} open`,
      `• Dependabot: ${depAlerts?.length ?? 0} open`,
      `• Secret scanning: ${secretAlerts?.length ?? 0} open`,
    ];

    if (secretAlerts?.length > 0) {
      lines.push(`\n🚨 **Secret scanning alerts require immediate attention!**`);
    }

    return {
      text: lines.join("\n"),
      data: { codeAlerts, depAlerts, secretAlerts },
    };
  },
  examples: [],
};

// ── Plugin export ────────────────────────────────────────────────────────────

export const GitHubMCPPlugin: Plugin = {
  name: "github-mcp",
  description:
    "GitHub native MCP integration via ksoza/github-mcp-server. " +
    "Full repo, issues, PRs, Actions CI, security scanning, and notifications.",
  providers: [GitHubContextProvider],
  actions: [
    // Read (zero-gate)
    GetFileAction,
    ListIssuesAction,
    ListPRsAction,
    GetWorkflowRunsAction,
    GetJobLogsAction,
    SearchCodeAction,
    ListNotificationsAction,
    SecurityScanAction,
    // Write (judge-gated)
    CreateBranchAction,
    PushFilesAction,
    CreatePRAction,
    CreateIssueAction,
    MergePRAction,
  ],
  evaluators: [],
};

"""
GitHub MCP Tool for CrewAI Agents
====================================
Wraps ksoza/github-mcp-server (port 8081).
Used by spiktor-coder and spiktor-ops crews for real repo operations.

Read tools: zero-gate, always available.
Write tools: require judge approval (enforced by SpiktorFlow, not here —
this tool will execute if called, but the Flow only calls it
after judge_crew returns SHIP).
"""

import os
import requests
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

GITHUB_MCP_HOST = os.environ.get("GITHUB_MCP_HOST", "http://github-mcp:8081")
GITHUB_TOKEN    = os.environ.get("GITHUB_TOKEN", "")


def _mcp_call(tool: str, params: dict) -> dict:
    headers = {"Content-Type": "application/json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    r = requests.post(f"{GITHUB_MCP_HOST}/tools/{tool}", json=params, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()


# ── Read tools ──────────────────────────────────────────────────────────────

class GetFileInput(BaseModel):
    owner: str = Field(..., description="Repo owner, e.g. 'ksoza'")
    repo:  str = Field(..., description="Repo name, e.g. 'Spiktor'")
    path:  str = Field(..., description="File path within the repo")
    ref:   str = Field(default="main", description="Branch or ref")


class GitHubGetFileTool(BaseTool):
    name: str = "github_get_file"
    description: str = "Read a file's contents from a GitHub repository."
    args_schema: type[BaseModel] = GetFileInput

    def _run(self, owner: str, repo: str, path: str, ref: str = "main") -> str:
        try:
            import base64
            result  = _mcp_call("get_file_contents", {"owner": owner, "repo": repo, "path": path, "ref": ref})
            content = base64.b64decode(result.get("content", "")).decode("utf-8", errors="replace")
            return f"--- {path} ({ref}) ---\n{content[:4000]}"
        except Exception as e:
            return f"[Error reading {path}: {e}]"


class ListIssuesInput(BaseModel):
    owner: str = Field(...)
    repo:  str = Field(...)
    state: str = Field(default="open")


class GitHubListIssuesTool(BaseTool):
    name: str = "github_list_issues"
    description: str = "List issues in a GitHub repository."
    args_schema: type[BaseModel] = ListIssuesInput

    def _run(self, owner: str, repo: str, state: str = "open") -> str:
        try:
            issues = _mcp_call("list_issues", {"owner": owner, "repo": repo, "state": state})
            if not issues:
                return "No issues found."
            return "\n".join(f"#{i['number']} [{i['state']}] {i['title']}" for i in issues[:15])
        except Exception as e:
            return f"[Error listing issues: {e}]"


class WorkflowRunsInput(BaseModel):
    owner: str = Field(...)
    repo:  str = Field(...)


class GitHubWorkflowRunsTool(BaseTool):
    name: str = "github_workflow_runs"
    description: str = "Get recent GitHub Actions workflow run status — for CI verification before SHIP."
    args_schema: type[BaseModel] = WorkflowRunsInput

    def _run(self, owner: str, repo: str) -> str:
        try:
            result = _mcp_call("actions_list", {
                "owner": owner, "repo": repo,
                "method": "list_workflow_runs", "per_page": 5
            })
            runs = result.get("workflow_runs", result if isinstance(result, list) else [])
            if not runs:
                return "No recent workflow runs."
            return "\n".join(
                f"#{r.get('run_number')} {r.get('name')} — {r.get('conclusion') or r.get('status')}"
                for r in runs
            )
        except Exception as e:
            return f"[Error fetching workflow runs: {e}]"


# ── Write tools (judge-gated by Flow logic, not by this tool) ────────────────

class PushFilesInput(BaseModel):
    owner:   str  = Field(...)
    repo:    str  = Field(...)
    branch:  str  = Field(...)
    message: str  = Field(..., description="Commit message")
    files:   list = Field(..., description="List of {path, content} dicts")


class GitHubPushFilesTool(BaseTool):
    name: str = "github_push_files"
    description: str = (
        "Push file changes to a branch. ONLY call this after judge_crew "
        "has returned a SHIP verdict for this exact change set."
    )
    args_schema: type[BaseModel] = PushFilesInput

    def _run(self, owner: str, repo: str, branch: str, message: str, files: list) -> str:
        try:
            result = _mcp_call("push_files", {
                "owner": owner, "repo": repo, "branch": branch,
                "message": message, "files": files
            })
            sha = result.get("commit", {}).get("sha", "unknown")
            return f"✅ Pushed {len(files)} file(s) to {branch}. Commit: {sha}"
        except Exception as e:
            return f"[Push failed: {e}]"


class CreatePRInput(BaseModel):
    owner: str = Field(...)
    repo:  str = Field(...)
    title: str = Field(...)
    head:  str = Field(...)
    base:  str = Field(default="main")
    body:  str = Field(default="")


class GitHubCreatePRTool(BaseTool):
    name: str = "github_create_pr"
    description: str = "Open a pull request. ONLY call after judge_crew SHIP verdict."
    args_schema: type[BaseModel] = CreatePRInput

    def _run(self, owner: str, repo: str, title: str, head: str, base: str = "main", body: str = "") -> str:
        try:
            result = _mcp_call("create_pull_request", {
                "owner": owner, "repo": repo, "title": title,
                "head": head, "base": base, "body": body
            })
            return f"✅ PR #{result.get('number')} opened: {result.get('html_url')}"
        except Exception as e:
            return f"[PR creation failed: {e}]"


class CreateBranchInput(BaseModel):
    owner:       str = Field(...)
    repo:        str = Field(...)
    branch:      str = Field(...)
    from_branch: str = Field(default="main")


class GitHubCreateBranchTool(BaseTool):
    name: str = "github_create_branch"
    description: str = "Create a new branch for this task's changes."
    args_schema: type[BaseModel] = CreateBranchInput

    def _run(self, owner: str, repo: str, branch: str, from_branch: str = "main") -> str:
        try:
            _mcp_call("create_branch", {"owner": owner, "repo": repo, "branch": branch, "from_branch": from_branch})
            return f"✅ Branch '{branch}' created from '{from_branch}'"
        except Exception as e:
            return f"[Branch creation failed: {e}]"

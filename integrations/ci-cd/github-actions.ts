// GitHub Actions CI/CD Integration for Spiktor
import type { AgentTool } from '@/lib/mcp/types';

export interface WorkflowRun {
  id: number; name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled';
  branch: string; commit: string; url: string; startedAt: string;
}

export class GitHubActionsClient {
  private token: string; private owner: string; private repo: string;
  constructor(token: string, owner: string, repo: string) {
    this.token = token; this.owner = owner; this.repo = repo;
  }

  private async rest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  async listRuns(limit = 10): Promise<WorkflowRun[]> {
    const data = await this.rest('GET', `/repos/${this.owner}/${this.repo}/actions/runs?per_page=${limit}`);
    return (data.workflow_runs || []).map((r: any) => ({
      id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
      branch: r.head_branch, commit: r.head_sha, url: r.html_url, startedAt: r.created_at,
    }));
  }

  async dispatch(workflowPath: string, ref = 'main', inputs?: Record<string, string>): Promise<boolean> {
    const data = await this.rest('POST', `/repos/${this.owner}/${this.repo}/actions/workflows/${workflowPath}/dispatches`, { ref, ...(inputs ? { inputs } : {}) });
    return !data.message;
  }

  async getRun(runId: number): Promise<WorkflowRun | null> {
    const data = await this.rest('GET', `/repos/${this.owner}/${this.repo}/actions/runs/${runId}`);
    if (!data.id) return null;
    return { id: data.id, name: data.name, status: data.status, conclusion: data.conclusion, branch: data.head_branch, commit: data.head_sha, url: data.html_url, startedAt: data.run_started_at };
  }

  async waitForRun(runId: number, timeoutMs = 300000): Promise<WorkflowRun> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const run = await this.getRun(runId);
      if (!run) throw new Error('Run not found');
      if (run.status === 'completed') return run;
      await new Promise(r => setTimeout(r, 10000));
    }
    throw new Error('Timeout waiting for run');
  }

  async runTests(): Promise<{ runId: number }> {
    const workflows = ['test.yml', 'tests.yml', 'ci.yml'];
    for (const wf of workflows) {
      const ok = await this.dispatch(wf).catch(() => false);
      if (ok) { const runs = await this.listRuns(1); return { runId: runs[0]?.id || 0 }; }
    }
    throw new Error('No test workflow found in .github/workflows/');
  }

  async deploy(environment: string, ref = 'main'): Promise<{ runId: number; url: string }> {
    const workflows = ['deploy.yml', 'release.yml'];
    for (const wf of workflows) {
      const ok = await this.dispatch(wf, ref, { environment }).catch(() => false);
      if (ok) { const runs = await this.listRuns(1); return { runId: runs[0]?.id || 0, url: runs[0]?.url || '' }; }
    }
    throw new Error('No deploy workflow found in .github/workflows/');
  }
}

export function createGitHubActionsTools(client: GitHubActionsClient): AgentTool[] {
  return [
    {
      name: 'ci_list_runs', description: 'List recent GitHub Actions workflow runs',
      inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
      handler: async (p: { limit?: number }) => ({ runs: await client.listRuns(p.limit) }),
    },
    {
      name: 'ci_run_tests', description: 'Trigger the test workflow and wait for results',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { runId } = await client.runTests();
        const run = await client.waitForRun(runId);
        return { runId, status: run.conclusion, url: run.url };
      },
    },
    {
      name: 'ci_deploy', description: 'Deploy to a named environment via GitHub Actions',
      inputSchema: { type: 'object', properties: { environment: { type: 'string' }, ref: { type: 'string', default: 'main' } } },
      handler: async (p: { environment: string; ref?: string }) => {
        const { runId, url } = await client.deploy(p.environment, p.ref);
        return { runId, url };
      },
    },
    {
      name: 'ci_get_status', description: 'Get the status of a specific workflow run',
      inputSchema: { type: 'object', properties: { runId: { type: 'number' } } },
      handler: async (p: { runId: number }) => client.getRun(p.runId),
    },
  ];
}

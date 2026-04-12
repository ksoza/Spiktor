// GitHub MCP tools for Verdent AI
import { MCPContext, MCPResponse } from './types';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (args: Record<string, any>, context: MCPContext) => Promise<MCPResponse>;
}

export const githubTools: MCPTool[] = [
  {
    name: 'github_create_issue',
    description: 'Create a GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'repo', 'title'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      if (!token) return { content: [{ type: 'text', text: 'GitHub token not configured' }], isError: true };
      const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: JSON.stringify({ title: args.title, body: args.body || '', labels: args.labels || [] }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !res.ok };
    },
  },
  {
    name: 'github_list_issues',
    description: 'List issues in a GitHub repo',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        per_page: { type: 'number', default: 10 },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      const url = `https://api.github.com/repos/${args.owner}/${args.repo}/issues?state=${args.state || 'open'}&per_page=${args.per_page || 10}&sort=updated`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token || ''}`, 'X-GitHub-Api-Version': '2022-11-28' } });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'github_create_pr',
    description: 'Create a GitHub pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string' },
        base: { type: 'string', default: 'main' },
      },
      required: ['owner', 'repo', 'title', 'head', 'base'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/pulls`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: args.title, body: args.body || '', head: args.head, base: args.base }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !res.ok };
    },
  },
  {
    name: 'github_get_file',
    description: 'Get a file from GitHub',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string' } },
      required: ['owner', 'repo', 'path'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      const url = `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${args.path}${args.ref ? `?ref=${args.ref}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } });
      if (!res.ok) return { content: [{ type: 'text', text: `GitHub API error: ${res.status}` }], isError: true };
      const data = await res.json();
      if (data.content) return { content: [{ type: 'text', text: Buffer.from(data.content, 'base64').toString('utf-8') }] };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'github_commit_file',
    description: 'Create or update a file in GitHub',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' } },
      required: ['owner', 'repo', 'path', 'content', 'message'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      let sha: string | undefined;
      try {
        const getRes = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/contents/${args.path}${args.branch ? `?ref=${args.branch}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
        if (getRes.ok) { const existing = await getRes.json(); sha = existing.sha; }
      } catch {}
      const body: any = { message: args.message, content: Buffer.from(args.content).toString('base64') };
      if (sha) body.sha = sha;
      if (args.branch) body.branch = args.branch;
      const res = await fetch(`https://api.github.com/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !res.ok };
    },
  },
  {
    name: 'github_search_code',
    description: 'Search code on GitHub',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string' }, per_page: { type: 'number', default: 10 } },
      required: ['q'],
    },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(args.q)}&per_page=${args.per_page || 10}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'github_list_repos',
    description: 'List repositories for the authenticated user',
    inputSchema: { type: 'object', properties: { per_page: { type: 'number', default: 20 } } },
    handler: async (args, ctx) => {
      const token = ctx.userApiKeys['GITHUB_TOKEN'];
      const url = `https://api.github.com/user/repos?per_page=${args.per_page || 20}&sort=updated`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
];

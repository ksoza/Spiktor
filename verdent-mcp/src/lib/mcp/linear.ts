// Linear MCP tools for Verdent AI
import { MCPContext, MCPResponse } from './types';

export const linearTools = [
  {
    name: 'linear_create_issue',
    description: 'Create a Linear issue',
    inputSchema: { type: 'object', properties: { teamId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number' } }, required: ['teamId', 'title'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['LINEAR_API_KEY'];
      if (!token) return { content: [{ type: 'text', text: 'Linear API key not configured' }], isError: true };
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST', headers: { Authorization: `${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation CreateIssue($title: String!, $teamId: String!, $description: String, $priority: Int) { issueCreate(input: { title: $title, teamId: $teamId, description: $description, priority: $priority }) { success issue { id identifier title } } }`, variables: { title: args.title, teamId: args.teamId, description: args.description || '', priority: args.priority } }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: data.errors?.length > 0 };
    },
  },
  {
    name: 'linear_list_issues',
    description: 'List Linear issues',
    inputSchema: { type: 'object', properties: { teamId: { type: 'string' }, limit: { type: 'number', default: 20 } } },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['LINEAR_API_KEY'];
      const filter = args.teamId ? `, filter: {team: {id: {eq: "${args.teamId}"}}}` : '';
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST', headers: { Authorization: `${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { issues(first: ${args.limit || 20}${filter}) { nodes { id identifier title state { name } priority createdAt } } }` }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'linear_update_issue',
    description: 'Update a Linear issue status or priority',
    inputSchema: { type: 'object', properties: { issueId: { type: 'string' }, status: { type: 'string' }, priority: { type: 'number' } }, required: ['issueId'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['LINEAR_API_KEY'];
      const updates: string[] = [];
      if (args.status) updates.push(`stateName: "${args.status}"`);
      if (args.priority !== undefined) updates.push(`priority: ${args.priority}`);
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST', headers: { Authorization: `${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { issueUpdate(id: "${args.issueId}", input: { ${updates.join(', ')} }) { success } }` }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: data.errors?.length > 0 };
    },
  },
];

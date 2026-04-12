// Notion MCP tools for Verdent AI
import { MCPContext, MCPResponse } from './types';

export const notionTools = [
  {
    name: 'notion_search',
    description: 'Search Notion pages and databases',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, filter: { type: 'string', enum: ['page', 'database'] } }, required: ['query'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['NOTION_TOKEN'];
      if (!token) return { content: [{ type: 'text', text: 'Notion token not configured' }], isError: true };
      const res = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: args.query, filter: args.filter ? { property: 'object', value: args.filter } : undefined }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'notion_create_page',
    description: 'Create a new Notion page',
    inputSchema: { type: 'object', properties: { parent_id: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } }, required: ['parent_id', 'title'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['NOTION_TOKEN'];
      const blocks = args.content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: args.content } }] } }] : [];
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { page_id: args.parent_id }, properties: { title: { title: [{ text: { content: args.title } }] } }, children: blocks }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !res.ok };
    },
  },
  {
    name: 'notion_get_page',
    description: 'Get a Notion page by ID',
    inputSchema: { type: 'object', properties: { page_id: { type: 'string' } }, required: ['page_id'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['NOTION_TOKEN'];
      const res = await fetch(`https://api.notion.com/v1/pages/${args.page_id}`, { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' } });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'notion_update_page',
    description: 'Update a Notion page properties',
    inputSchema: { type: 'object', properties: { page_id: { type: 'string' }, properties: { type: 'object' } }, required: ['page_id'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['NOTION_TOKEN'];
      const res = await fetch(`https://api.notion.com/v1/pages/${args.page_id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: args.properties }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !res.ok };
    },
  },
  {
    name: 'notion_add_block',
    description: 'Add a content block to a Notion page',
    inputSchema: { type: 'object', properties: { page_id: { type: 'string' }, content: { type: 'string' } }, required: ['page_id', 'content'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['NOTION_TOKEN'];
      const res = await fetch(`https://api.notion.com/v1/blocks/${args.page_id}/children`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: args.content } }] } }] }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
];

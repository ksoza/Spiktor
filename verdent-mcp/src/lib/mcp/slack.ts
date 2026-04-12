// Slack MCP tools for Verdent AI
import { MCPContext, MCPResponse } from './types';

export const slackTools = [
  {
    name: 'slack_post_message',
    description: 'Post a message to a Slack channel',
    inputSchema: { type: 'object', properties: { channel: { type: 'string' }, text: { type: 'string' }, thread_ts: { type: 'string' } }, required: ['channel', 'text'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['SLACK_BOT_TOKEN'];
      if (!token) return { content: [{ type: 'text', text: 'Slack token not configured' }], isError: true };
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: args.channel, text: args.text, thread_ts: args.thread_ts }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.ok };
    },
  },
  {
    name: 'slack_list_channels',
    description: 'List all channels in the Slack workspace',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 50 } } },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['SLACK_BOT_TOKEN'];
      const res = await fetch('https://slack.com/api/conversations.list', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.ok };
    },
  },
  {
    name: 'slack_search_messages',
    description: 'Search messages in Slack',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['query'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['SLACK_BOT_TOKEN'];
      const res = await fetch('https://slack.com/api/search.messages', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.ok };
    },
  },
  {
    name: 'slack_get_thread',
    description: 'Get messages in a thread',
    inputSchema: { type: 'object', properties: { channel: { type: 'string' }, thread_ts: { type: 'string' } }, required: ['channel', 'thread_ts'] },
    handler: async (args: any, ctx: MCPContext) => {
      const token = ctx.userApiKeys['SLACK_BOT_TOKEN'];
      const res = await fetch(`https://slack.com/api/conversations.replies?channel=${args.channel}&ts=${args.thread_ts}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.ok };
    },
  },
];

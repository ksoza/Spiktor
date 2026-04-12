// Gobii MCP Tool Bridge — wires Verdent's MCP tools into the Gobii agent runtime
// https://docs.gobii.ai/advanced-usage/mcp-servers

import { MCPToolRegistry } from '../verdent-mcp/index';

/**
 * These tools become available to the Gobii agent and can be called during
 * autonomous task execution. Gobii passes results back to the human in the
 * configured notification channel.
 */
export const SPIKTOR_GOBII_MCP_TOOLS: Parameters<typeof MCPToolRegistry.callTool>[0][] = [
  // ── GitHub ──────────────────────────────────────────────────────────────
  {
    name: 'github_create_issue',
    description: 'Create a GitHub issue — good for logging bugs, todos, and follow-up items',
    input_schema: {
      type: 'object',
      properties: {
        repo:   { type: 'string',  description: 'e.g. "ksoza/myproject"' },
        title:  { type: 'string' },
        body:   { type: 'string',  description: 'Markdown body' },
        labels: { type: 'string[]', default: [] },
      },
      required: ['repo', 'title'],
    },
  },
  {
    name: 'github_submit_pr',
    description: 'Submit a Pull Request to a GitHub repository',
    input_schema: {
      type: 'object',
      properties: {
        repo:        { type: 'string' },
        title:       { type: 'string' },
        body:        { type: 'string' },
        head_branch: { type: 'string', description: 'Your branch name' },
        base_branch: { type: 'string', default: 'main' },
      },
      required: ['repo', 'title', 'head_branch'],
    },
  },
  {
    name: 'github_review_pr',
    description: 'Get PR diff and review status from GitHub',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        pr:   { type: 'number' },
      },
      required: ['repo', 'pr'],
    },
  },
  {
    name: 'github_list_workflows',
    description: 'List GitHub Actions workflow runs for a repo',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        run_id: { type: 'number' },
      },
      required: ['repo'],
    },
  },

  // ── Notion ─────────────────────────────────────────────────────────────
  {
    name: 'notion_create_page',
    description: 'Create a page in a Notion database — good for task lists, docs, project tracking',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string' },
        title:       { type: 'string' },
        properties:  { type: 'object', default: {} },
        content:     { type: 'string' },
      },
      required: ['database_id', 'title'],
    },
  },
  {
    name: 'notion_update_page',
    description: 'Update properties or content of an existing Notion page',
    input_schema: {
      type: 'object',
      properties: {
        page_id:    { type: 'string' },
        properties: { type: 'object' },
        content:    { type: 'string' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'notion_query_database',
    description: 'Query a Notion database with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string' },
        filter:      { type: 'object', default: {} },
        sorts:       { type: 'array',   default: [] },
        page_size:   { type: 'number',  default: 100 },
      },
      required: ['database_id'],
    },
  },

  // ── Linear ──────────────────────────────────────────────────────────────
  {
    name: 'linear_create_issue',
    description: 'Create a Linear issue — team task tracking',
    input_schema: {
      type: 'object',
      properties: {
        team_id:    { type: 'string' },
        title:      { type: 'string' },
        body:       { type: 'string' },
        label_ids:  { type: 'array', default: [] },
        priority:   { type: 'number', default: 0 },
      },
      required: ['team_id', 'title'],
    },
  },
  {
    name: 'linear_list_issues',
    description: 'List Linear issues with optional team/label filters',
    input_schema: {
      type: 'object',
      properties: {
        team_id:   { type: 'string' },
        status:    { type: 'string' },
        assignee:  { type: 'string' },
        limit:     { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'linear_update_issue',
    description: 'Update Linear issue status, assignee, priority, etc.',
    input_schema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string' },
        status:   { type: 'string' },
        assignee: { type: 'string' },
        priority: { type: 'number' },
      },
      required: ['issue_id'],
    },
  },

  // ── Slack ────────────────────────────────────────────────────────────────
  {
    name: 'slack_post_message',
    description: 'Post a message to a Slack channel — for standup summaries, alerts, task notifications',
    input_schema: {
      type: 'object',
      properties: {
        channel:    { type: 'string' },
        text:       { type: 'string' },
        thread_ts:  { type: 'string', description: 'Reply in thread' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'slack_search_messages',
    description: 'Search messages in Slack — find context from past discussions',
    input_schema: {
      type: 'object',
      properties: {
        query:  { type: 'string' },
        count:  { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },

  // ── Google Drive ────────────────────────────────────────────────────────
  {
    name: 'gdrive_upload_file',
    description: 'Upload a file to Google Drive — store generated code, reports, outputs',
    input_schema: {
      type: 'object',
      properties: {
        name:      { type: 'string' },
        mime_type: { type: 'string' },
        content:   { type: 'string' },
        parent_id: { type: 'string', description: 'Folder ID' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'gdrive_find_file',
    description: 'Find a file by name in Google Drive',
    input_schema: {
      type: 'object',
      properties: {
        name:   { type: 'string' },
        parent: { type: 'string' },
      },
      required: ['name'],
    },
  },

  // ── n8n Bridge — 400+ more integrations ───────────────────────────────
  {
    name: 'n8n_trigger_workflow',
    description: 'Trigger any n8n workflow webhook — gives access to 400+ integrations (Stripe, Postgres, Gmail, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string' },
        webhook_url: { type: 'string' },
        payload:     { type: 'object' },
      },
      required: ['webhook_url', 'payload'],
    },
  },
];

// Gobii Agent Definition for Spiktor
// Connects the Gobii always-on runtime to the Verdent multi-agent coding brain
// https://docs.gobii.ai/developers/developer-agents

export const SPIKTOR_GOBII_AGENT = {
  name: 'Spiktor',
  description: 'Always-on AI coworker with Verdent\'s multi-agent coding brain — plans, implements, reviews and ships code 24/7.',
  model_provider: 'openrouter', // or 'openai', 'anthropic', 'fireworks', 'custom'
  model_id: 'anthropic/claude-sonnet-4-20250514', // routed through Verdent MCP
  memory_enabled: true,
  timezone: 'America/New_York',

  // Gobii channels — give Spiktor an email/SMS identity
  channels: {
    email: { enabled: true, address: 'spiktor@yourdomain.com' },
    sms: { enabled: false },
    slack: { enabled: true, bot_token_env: 'SLACK_BOT_TOKEN', notification_channel: '#ai-coworker' },
  },

  // Event triggers — wake Spiktor from these sources
  triggers: [
    { type: 'schedule', cron: '0 9 * * 1-5' },           // 9am weekday standup
    { type: 'schedule', cron: '0 17 * * 1-5' },         // 5pm wrap-up digest
    { type: 'webhook', url_path: '/api/v1/webhooks/spiktor' }, // n8n + Slack webhooks
    { type: 'email',   watch_imap: 'spiktor@yourdomain.com' }, // inbound email
  ],

  // Tools — the Verdent MCP tools are wired in via gobii_mcp_tools
  tools: [], // see gobii_mcp_tools.ts

  // Human oversight — block destructive actions until approved
  guardrails: {
    block_github_push_to_main: true,
    block_delete_operations: true,
    require_code_review_approval: true,
    max_daily_code_tasks: 20,
  },

  // Persistence — remember context across sessions
  memory: {
    vector_search_enabled: true,
    context_window_tasks: true,
  },
};

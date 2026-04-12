// Gobii Webhook Integration — routes inbound events to Verdent's MCP system
// https://docs.gobii.ai/developers/webhooks

import { MCPToolRegistry } from '../verdent-mcp/index';

/**
 * This Express/FastAPI route receives events from Gobii and dispatches them
 * to the appropriate Verdent MCP tool based on the event type.
 * 
 * Registered as: POST /api/v1/webhooks/spiktor
 */

export interface GobiiWebhookEvent {
  event_type: 'schedule' | 'email' | 'sms' | 'webhook' | 'api' | 'browser_task';
  agent_id: string;
  payload: {
    message?: string;      // email/SMS content
    cron_time?: string;    // scheduled trigger
    task_id?: string;       // browser task result
    intent?: string;        // detected intent from Gobii NLU
    context?: Record<string, unknown>; // Gobii session memory
  };
  timestamp: string;
}

export async function handleSpiktorWebhook(event: GobiiWebhookEvent) {
  console.log(`[Spiktor] Gobii webhook received: ${event.event_type}`);

  switch (event.event_type) {
    case 'schedule': {
      // Daily standup or wrap-up — run Verdent analysis
      if (event.payload.cron_time?.includes('09:00')) {
        await handleMorningStandup(event);
      } else if (event.payload.cron_time?.includes('17:00')) {
        await handleEveningDigest(event);
      }
      break;
    }

    case 'email':
    case 'sms': {
      // Inbound message to Spiktor — route to Verdent Supervisor
      await handleInboundMessage(event);
      break;
    }

    case 'webhook': {
      // n8n or external system called the webhook
      await handleExternalWebhook(event);
      break;
    }

    case 'browser_task': {
      // Gobii completed a browser task — analyze results with Verdent
      await handleBrowserTaskResult(event);
      break;
    }
  }
}

// ── Morning standup: Gobii asks team for updates → Verdent synthesizes → posts to Slack ──
async function handleMorningStandup(event: GobiiWebhookEvent) {
  const standupPrompt = `Good morning! Run the daily standup workflow:
1. Post to Slack #standup asking "What are you working on today?"
2. Wait 10 minutes for responses
3. Summarize key themes and blockers
4. Create a Notion page with the standup summary
5. Post digest to #standup-summary`;

  const result = await MCPToolRegistry.callTool('n8n_trigger_workflow', {
    webhook_url: process.env.N8N_STANDUP_WEBHOOK_URL || '',
    payload: { prompt: standupPrompt, agent: 'spiktor', mode: 'standup' },
  });

  console.log('[Spiktor] Morning standup triggered:', result);
}

// ── Evening digest: Verdent reviews day's work → posts summary to Slack ──
async function handleEveningDigest(event: GobiiWebhookEvent) {
  const digestPrompt = `Generate an evening digest:
1. Query Notion for today's updated pages (standup notes, tasks)
2. Query Linear for completed issues today
3. Query GitHub for PRs merged today
4. Post a summary to Slack #daily-digest`;

  const result = await MCPToolRegistry.callTool('n8n_trigger_workflow', {
    webhook_url: process.env.N8N_DIGEST_WEBHOOK_URL || '',
    payload: { prompt: digestPrompt, agent: 'spiktor', mode: 'digest' },
  });

  console.log('[Spiktor] Evening digest triggered:', result);
}

// ── User sent a message to Spiktor (email/Slack DM) ──
async function handleInboundMessage(event: GobiiWebhookEvent) {
  const message = event.payload.message || '';

  if (message.includes('@spiktor')) {
    // Mentions Spiktor — activate Verdent Planner for the request
    console.log('[Spiktor] Message received:', message.substring(0, 100));

    // The Verdent planner will generate a plan and execute via Coder agent
    const result = await MCPToolRegistry.callTool('n8n_trigger_workflow', {
      webhook_url: process.env.N8N_SPIKTOR_ROUTER_WEBHOOK_URL || '',
      payload: {
        message,
        mode: 'plan_and_execute',
        agent: 'spiktor',
        context: event.payload.context,
      },
    });

    return result;
  }

  return { status: 'ignored', reason: 'no @spiktor mention' };
}

// ── External webhook (n8n, GitHub, etc.) triggered Spiktor ──
async function handleExternalWebhook(event: GobiiWebhookEvent) {
  const { intent, context } = event.payload;

  if (intent === 'code_review_requested') {
    await MCPToolRegistry.callTool('github_review_pr', {
      repo: context?.repo as string,
      pr: context?.pr as number,
    });
  }

  if (intent === 'new_issue_opened') {
    await MCPToolRegistry.callTool('github_create_issue', {
      repo: context?.repo as string,
      title: context?.title as string,
      body: context?.body as string,
      labels: ['spiktor-auto'],
    });
  }
}

// ── Gobii completed a browser task — analyze results ──
async function handleBrowserTaskResult(event: GobiiWebhookEvent) {
  const taskId = event.payload.task_id;
  const context = event.payload.context as Record<string, unknown> || {};

  if (context.results) {
    // Push browser task results to Verdent for analysis
    await MCPToolRegistry.callTool('n8n_trigger_workflow', {
      webhook_url: process.env.N8N_BROWSER_RESULT_WEBHOOK_URL || '',
      payload: {
        task_id: taskId,
        results: context.results,
        agent: 'spiktor',
        mode: 'analyze',
      },
    });
  }
}

// n8n Webhook Bridge — lets Verdent call any n8n workflow
import { MCPContext, MCPResponse } from './types';

export interface N8NWorkflowConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
}

// Trigger an n8n workflow via webhook
export async function triggerN8NWorkflow(
  workflow: N8NWorkflowConfig,
  payload: Record<string, any>,
  context: MCPContext
): Promise<MCPResponse> {
  try {
    const res = await fetch(workflow.url, {
      method: workflow.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...workflow.headers,
      },
      body: JSON.stringify({ ...payload, _verdent_taskId: context.taskId }),
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
      content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
      isError: !res.ok,
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `n8n error: ${e.message}` }], isError: true };
  }
}

// Built-in workflow URLs (user configures these in Settings)
export const n8nWorkflows = {
  send_email: (payload: any) => ({
    url: process.env.N8N_WEBHOOK_SEND_EMAIL || '',
    method: 'POST' as const,
  }),
  create_calendar_event: (payload: any) => ({
    url: process.env.N8N_WEBHOOK_CALENDAR || '',
    method: 'POST' as const,
  }),
  post_slack: (payload: any) => ({
    url: process.env.N8N_WEBHOOK_SLACK || '',
    method: 'POST' as const,
  }),
  generate_report: (payload: any) => ({
    url: process.env.N8N_WEBHOOK_REPORT || '',
    method: 'POST' as const,
  }),
};

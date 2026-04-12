// Zo-Ksoza Connector — Spiktor lives in your Zo cloud computer
// Spiktor becomes an agent inside Zo's runtime via the /zo/ask API

export interface ZoConfig {
  apiKey: string;          // from Settings > Advanced > Access Tokens
  handle: string;          // your Zo handle (ksozas)
  spaceEndpoint: string;   // your Zo Space URL
}

export interface ZoTask {
  input: string;
  modelName?: string;
  conversationId?: string;
  outputFormat?: object;
}

export class ZoConnector {
  private apiKey: string;
  private baseUrl = 'https://api.zo.computer';

  constructor(config: ZoConfig) {
    this.apiKey = config.apiKey;
  }

  async runTask(task: ZoTask): Promise<string> {
    const response = await fetch(`${this.baseUrl}/zo/ask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        input: task.input,
        model_name: task.modelName || 'vercel:minimax/minimax-m2.7',
        ...(task.conversationId && { conversation_id: task.conversationId }),
        ...(task.outputFormat && { output_format: task.outputFormat }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Zo API error: ${response.status}`);
    }

    const result = await response.json();
    return typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
  }

  async delegateToZo(prompt: string, capability: string): Promise<string> {
    const capabilityPrompts: Record<string, string> = {
      'email': `${prompt}\n\nUse Zo's email tools to send results to the user.`,
      'calendar': `${prompt}\n\nUse Zo's Google Calendar to check schedules and create events.`,
      'search': `${prompt}\n\nUse Zo's web search for current information.`,
      'files': `${prompt}\n\nUse Zo's file tools to read/write workspace files.`,
      'code': `${prompt}\n\nUse Zo's terminal to execute and verify code.`,
    };
    return this.runTask({ input: capabilityPrompts[capability] || prompt });
  }

  async zoNativeAction(action: 'send_email' | 'create_calendar_event' | 'post_slack' | 'update_notion', payload: any): Promise<any> {
    const promptMap: Record<string, string> = {
      send_email: `Send email: subject="${payload.subject}", body="${payload.body}", to=${payload.to}`,
      create_calendar_event: `Create event: "${payload.title}" at ${payload.time} for ${payload.duration}`,
      post_slack: `Post to Slack #${payload.channel}: "${payload.message}"`,
      update_notion: `Update Notion page "${payload.page}" with: "${payload.content}"`,
    };
    return this.runTask({ input: promptMap[action] });
  }

  async runSpiktorWorkflow(request: string): Promise<{ plan: string; code: string; review: string; deliverable: string }> {
    const plan = await this.runTask({ input: `${request}\n\nAs Spiktor Planner, generate a technical plan. Respond in JSON.` });
    const code = await this.runTask({ input: `Execute plan:\n${plan}\n\nAs Spiktor Coder, implement all tasks.` });
    const review = await this.delegateToZo(`Review code:\n${code}`, 'code');
    const deliverable = await this.runTask({ input: `Finalize: package completed work and prepare a user summary.` });
    return { plan, code, review, deliverable };
  }
}

export function getZoConfig(): ZoConfig {
  return {
    apiKey: process.env.ZO_API_KEY || '',
    handle: process.env.ZO_HANDLE || 'ksozas',
    spaceEndpoint: `https://${process.env.ZO_HANDLE || 'ksozas'}.zo.space`,
  };
}

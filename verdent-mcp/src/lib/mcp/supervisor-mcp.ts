// Supervisor MCP bridge — injects tool context into the supervisor's reasoning
import { buildAgentSystemPrompt } from './agent-tools';

export class SupervisorMCPBridge {
  private taskId: string;
  private sandboxPath: string;
  private apiKeys: Record<string, string>;

  constructor(taskId: string, sandboxPath: string, apiKeys: Record<string, string> = {}) {
    this.taskId = taskId;
    this.sandboxPath = sandboxPath;
    this.apiKeys = apiKeys;
  }

  // Returns extra context the Supervisor can use to delegate to tools
  getDelegationContext(): string {
    return buildAgentSystemPrompt('Supervisor', this.taskId, this.sandboxPath);
  }

  // Build the MCP context object passed to tool handlers
  getMCPContext() {
    return {
      taskId: this.taskId,
      sandboxPath: this.sandboxPath,
      userApiKeys: this.apiKeys,
    };
  }
}

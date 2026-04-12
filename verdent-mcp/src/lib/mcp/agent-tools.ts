// Agent tool injector — appends available MCP tools to agent system prompts
import { getToolSchemas, getToolManifest } from './index';

export function buildAgentSystemPrompt(role: string, taskId: string, sandboxPath: string): string {
  const toolSchemas = getToolSchemas();
  const manifest = getToolManifest();
  const integrations = Object.keys(manifest).join(', ');

  return `You are acting as the role: ${role}.
Adhere strictly to the AGENTS.md rules.

## INTEGRATIONS AVAILABLE
Verdent has direct access to the following integrations via MCP tools:
${integrations}

## HOW TO USE TOOLS
When you need to interact with external services, use the appropriate tool by calling it via the MCP bridge.
The tools are available in your context — do NOT simulate API calls.

## AVAILABLE TOOLS
${toolSchemas}

## RULES
- Always prefer using real MCP tools over simulating API calls
- When a tool returns an error, inspect the error and either retry with corrected parameters or report back to the user
- For file operations within the sandbox, use the filesystem tools
- For external data (GitHub, Notion, Linear, Slack, Google Drive), use the MCP tools above
- Format tool calls as JSON-RPC 2.0 when calling the MCP bridge
`;
}

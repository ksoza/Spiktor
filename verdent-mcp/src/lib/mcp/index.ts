// MCP Registry — aggregates all tools and exposes a unified call interface
import { MCPContext, MCPResponse } from './types';
import { githubTools } from './github';
import { notionTools } from './notion';
import { linearTools } from './linear';
import { slackTools } from './slack';
import { gdriveTools } from './gdrive';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (args: Record<string, any>, context: MCPContext) => Promise<MCPResponse>;
}

export interface MCPToolGroup {
  name: string;
  tools: MCPTool[];
}

export const toolGroups: MCPToolGroup[] = [
  { name: 'github', tools: githubTools },
  { name: 'notion', tools: notionTools },
  { name: 'linear', tools: linearTools },
  { name: 'slack', tools: slackTools },
  { name: 'gdrive', tools: gdriveTools },
];

// Flat list of all tools
export const allTools: MCPTool[] = toolGroups.flatMap(g => g.tools);

// Tool lookup by name
const toolMap = new Map<string, MCPTool>(allTools.map(t => [t.name, t]));

// Call a tool by name with args and context
export async function callTool(toolName: string, args: Record<string, any>, context: MCPContext): Promise<MCPResponse> {
  const tool = toolMap.get(toolName);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
  try {
    return await tool.handler(args, context);
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Tool error: ${e.message}` }], isError: true };
  }
}

// Get all tool schemas (for system prompt injection)
export function getToolSchemas(): string {
  return allTools.map(t => {
    const props = Object.entries(t.inputSchema.properties || {})
      .map(([k, v]: [string, any]) => `      ${k}: ${v.type}${v.description ? ` — ${v.description}` : ''}`)
      .join('\n');
    return `## ${t.name}\n${t.description}\nProperties:\n${props}`;
  }).join('\n\n');
}

// Get available tool names grouped by integration
export function getToolManifest(): Record<string, string[]> {
  return Object.fromEntries(toolGroups.map(g => [g.name, g.tools.map(t => t.name)]));
}

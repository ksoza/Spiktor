// MCP Tool Call API
import { NextRequest, NextResponse } from 'next/server';
import { callTool, allTools } from '@/lib/mcp';
import { MCPContext } from '@/lib/mcp/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolName, args, taskId = 'global', sandboxPath = '/sandboxes/global', userApiKeys = {} } = body;

    if (!toolName) {
      return NextResponse.json({ error: 'toolName is required' }, { status: 400 });
    }

    const context: MCPContext = { taskId, sandboxPath, userApiKeys };
    const result = await callTool(toolName, args || {}, context);

    return NextResponse.json({ result }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
}

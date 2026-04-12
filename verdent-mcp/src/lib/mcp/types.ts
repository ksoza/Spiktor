// MCP Context Protocol types for Verdent AI integrations

export interface MCPContext {
  taskId: string;
  sandboxPath: string;
  userApiKeys: Record<string, string>;
}

export interface MCPResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface MCPJSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
  id: string | number | null;
}

export interface MCPJSONRPCResponse {
  jsonrpc: '2.0';
  result?: MCPResponse;
  error?: { code: number; message: string };
  id: string | number | null;
}

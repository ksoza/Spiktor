// APIAgent Integration — universal MCP server generator
// Ref: sanand0/apiagent — turns any REST/GraphQL API into MCP with zero code
// Spiktor uses APIAgent to give the Verdict brain instant access to ANY API

export interface APIAgentConfig {
  port?: number;             // default 8000
  llmProvider?: 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  dbPath?: string;           // DuckDB storage path
}

export interface MCPServerConfig {
  name: string;
  type: 'rest' | 'graphql' | 'grpc';
  baseUrl: string;
  schemaPath?: string;       // path to OpenAPI/GraphQL schema
  auth?: { type: 'bearer' | 'api_key'; value: string };
}

export class APIAgentBridge {
  constructor(private config: APIAgentConfig) {}

  // Start the APIAgent MCP gateway
  async start(): Promise<void> {
    console.log('[APIAgent] Starting MCP gateway on port', this.config.port || 8000);
    // Spawn: npx apiagent serve --port 8000
  }

  // Register any API as an MCP server (auto-introspects schema)
  async registerApi(config: MCPServerConfig): Promise<void> {
    console.log(`[APIAgent] Registering ${config.type} API: ${config.name} at ${config.baseUrl}`);
    // POST to APIAgent /servers endpoint with the config
  }

  // Query any registered API using natural language
  async query(apiName: string, naturalLanguageQuery: string): Promise<unknown> {
    console.log(`[APIAgent] Querying ${apiName}: ${naturalLanguageQuery}`);
    // POST to APIAgent /query with { server, query }
    return {};
  }
}

export default APIAgentBridge;

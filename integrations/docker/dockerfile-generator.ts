// Docker Integration — Spiktor agent Dockerfiles
// What it does: Generates Dockerfiles and docker-compose for deploying agents anywhere

export interface DockerfileConfig {
  name: string;
  baseImage: string;
  nodeVersion?: string;
  pythonVersion?: string;
  port?: number;
  envVars?: Record<string, string>;
  startCommand?: string;
  dependencies?: string[];
}

export interface DockerComposeService {
  image?: string;
  build?: { context: string; dockerfile: string };
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  depends_on?: string[];
  restart?: string;
}

export interface DockerComposeConfig {
  version: string;
  services: Record<string, DockerComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

// ─── Dockerfile Generator ─────────────────────────────────

export function generateDockerfile(config: DockerfileConfig): string {
  const { name, baseImage, port = 3000, envVars = {}, startCommand } = config;

  const envLines = Object.entries(envVars)
    .map(([k, v]) => `ENV ${k}=${v}`)
    .join('\n');

  return `# Spiktor Agent: ${name}
FROM ${baseImage}

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy agent code
COPY . .

${envLines ? envLines + '\n' : ''}# Expose port
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget -qO- http://localhost:${port}/health || exit 1

# Start
CMD ${startCommand || `node packages/${name}/dist/index.js`}
`;
}

export function generateAgentDockerfile(agentName: string): string {
  return generateDockerfile({
    name: agentName,
    baseImage: 'node:22-alpine',
    port: 3000,
    startCommand: `node src/index.js`,
    envVars: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
  });
}

// ─── Docker Compose Generator ──────────────────────────────

export function generateDockerCompose(services: Record<string, DockerComposeService>): DockerComposeConfig {
  return {
    version: '3.8',
    services,
    networks: { default: { name: 'spiktor-net' } },
  };
}

export function generateSpiktorCompose(): DockerComposeConfig {
  return generateDockerCompose({
    verdent: {
      build: { context: './verdent-mcp', dockerfile: 'Dockerfile' },
      ports: ['3000:3000'],
      environment: {
        NODE_ENV: 'production',
        GEMINI_API_KEY: '${GEMINI_API_KEY}',
        OLLAMA_BASE_URL: 'http://ollama:11434',
        GITHUB_TOKEN: '${GITHUB_TOKEN}',
        NOTION_API_KEY: '${NOTION_API_KEY}',
        LINEAR_API_KEY: '${LINEAR_API_KEY}',
        SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}',
        OPENMEMORY_URL: 'http://openmemory:8080',
        BROWSERABLE_URL: 'http://browserable:3000',
      },
      depends_on: ['ollama', 'openmemory', 'browserable'],
      restart: 'unless-stopped',
    },
    ollama: {
      image: 'ollama/ollama:latest',
      ports: ['11434:11434'],
      volumes: ['ollama-data:/root/.ollama'],
      restart: 'unless-stopped',
    },
    openmemory: {
      image: 'ghcr.io/caviraoss/openmemory:latest',
      ports: ['8080:8080'],
      environment: { PORT: '8080', DATABASE: 'sqlite' },
      volumes: ['openmemory-data:/data'],
      restart: 'unless-stopped',
    },
    browserable: {
      image: 'ghcr.io/browserable/browserable:latest',
      ports: ['3000:3000'],
      environment: { DATABASE_URL: '${DATABASE_URL}' },
      restart: 'unless-stopped',
    },
    n8n: {
      image: 'n8nio/n8n:latest',
      ports: ['5678:5678'],
      environment: {
        N8N_BASIC_AUTH_ACTIVE: 'true',
        N8N_BASIC_AUTH_USER: '${N8N_USER}',
        N8N_BASIC_AUTH_PASSWORD: '${N8N_PASSWORD}',
        N8N_HOST: '${N8N_HOST}',
        WEBHOOK_URL: '${WEBHOOK_URL}',
      },
      volumes: ['n8n-data:/home/node/.n8n'],
      restart: 'unless-stopped',
    },
  });
}

// ─── Docker MCP Tools ─────────────────────────────────────

import type { AgentTool } from '@/lib/mcp/types';

export function createDockerTools(): AgentTool[] {
  return [
    {
      name: 'docker_generate_agent_dockerfile',
      description: 'Generate a production Dockerfile for a Spiktor agent',
      inputSchema: {
        type: 'object',
        properties: {
          agentName: { type: 'string', description: 'Name of the agent' },
          baseImage: { type: 'string', default: 'node:22-alpine' },
          port: { type: 'number', default: 3000 },
          startCommand: { type: 'string' },
        },
      },
      handler: async (p: { agentName: string; baseImage?: string; port?: number; startCommand?: string }) => {
        return { dockerfile: generateAgentDockerfile(p.agentName) };
      },
    },
    {
      name: 'docker_generate_compose',
      description: 'Generate a docker-compose.yml for the full Spiktor stack',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const config = generateSpiktorCompose();
        return { dockerCompose: JSON.stringify(config, null, 2) };
      },
    },
  ];
}

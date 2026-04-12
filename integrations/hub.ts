// Spiktor Integration Hub — unified tool registry
// This file is the single entry point all Spiktor agents use to access tools.

export interface SpiktorTool {
  id: string;
  name: string;
  category: 'memory' | 'browser' | 'automation' | 'api' | 'ci-cd' | 'llm' | 'os';
  capabilities: string[];
  init(): Promise<void>;
  call(tool: string, args: unknown[]): Promise<unknown>;
}

import OpenMemory from './openmemory/openmemory';
import Browserbase from './browserbase/browserbase';
import NexusMemory from './nexus-agent/nexus';
import APIAgentBridge from './apiagent/apiagent';
import GitHubCI from './ci-cd/github-actions';
import DockerGen from './docker/dockerfile-generator';
import SlackSmart from './slack-bot-upgrade/slack-smart';
import GobiiBridge from '../gobii-integration/gobii-agent';
import VerdentMCP from '../verdent-mcp/src/lib/mcp';

export const TOOLS: Record<string, SpiktorTool> = {
  // ── Memory ──────────────────────────────────────────────
  openmemory: {
    id: 'openmemory',
    name: 'OpenMemory',
    category: 'memory',
    capabilities: ['semantic-search', 'context-window-augmentation', 'cross-session-persistence'],
    init: async () => {},
    call: async (tool, args) => OpenMemory.query(tool, args[0]),
  },

  // ── Browser ────────────────────────────────────────────
  browserbase: {
    id: 'browserbase',
    name: 'Browserbase',
    category: 'browser',
    capabilities: ['cloud-browser', 'screenshot', 'form-fill', 'scraping'],
    init: async () => {},
    call: async (tool, args) => Browserbase.session(tool, args),
  },

  // ── Knowledge Graph ────────────────────────────────────
  nexus: {
    id: 'nexus',
    name: 'Nexus',
    category: 'memory',
    capabilities: ['knowledge-graph', 'vfs', 'context-sharing', 'agent-memory'],
    init: async () => {},
    call: async (tool, args) => NexusMemory.recall(tool, args[0]),
  },

  // ── API Orchestration ──────────────────────────────────
  apiagent: {
    id: 'apiagent',
    name: 'APIAgent',
    category: 'api',
    capabilities: ['mcp-generator', 'natural-language-api-query', 'schema-introspection'],
    init: async () => {},
    call: async (tool, args) => APIAgentBridge.query(tool, args[0]),
  },

  // ── CI/CD ──────────────────────────────────────────────
  githubActions: {
    id: 'githubActions',
    name: 'GitHub Actions',
    category: 'ci-cd',
    capabilities: ['ci-run', 'build', 'test', 'deploy'],
    init: async () => {},
    call: async (tool, args) => GitHubCI.runWorkflow(tool, args),
  },

  // ── Container ──────────────────────────────────────────
  docker: {
    id: 'docker',
    name: 'Docker',
    category: 'ci-cd',
    capabilities: ['dockerfile-gen', 'image-build', 'container-run'],
    init: async () => {},
    call: async (tool, args) => DockerGen.generate(tool, args),
  },

  // ── Messaging ───────────────────────────────────────────
  slack: {
    id: 'slack',
    name: 'Slack',
    category: 'automation',
    capabilities: ['send-message', 'search-messages', 'manage-threads'],
    init: async () => {},
    call: async (tool, args) => SlackSmart.send(tool, args),
  },

  // ── Always-on Runtime ──────────────────────────────────
  gobii: {
    id: 'gobii',
    name: 'Gobii',
    category: 'os',
    capabilities: ['slack-listener', 'web-browser', 'tool-execution', 'always-on'],
    init: async () => {},
    call: async (tool, args) => GobiiBridge.execute(tool, args),
  },

  // ── Coding Brain ───────────────────────────────────────
  verdent: {
    id: 'verdent',
    name: 'Verdent',
    category: 'llm',
    capabilities: ['plan', 'code', 'verify', 'multi-agent-critique'],
    init: async () => {},
    call: async (tool, args) => VerdentMCP.call(tool, args),
  },
};

export function getToolsByCategory(category: SpiktorTool['category']): SpiktorTool[] {
  return Object.values(TOOLS).filter((t) => t.category === category);
}

export function getTool(id: string): SpiktorTool | undefined {
  return TOOLS[id];
}

export default TOOLS;

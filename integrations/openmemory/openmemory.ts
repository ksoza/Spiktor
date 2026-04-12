// OpenMemory Integration — long-term cognitive memory for Spiktor
// https://github.com/CaviraOSS/OpenMemory
// 
// What it does: Persistent memory across sessions using temporal knowledge graph,
// multi-sector embeddings (episodic, semantic, procedural, emotional, reflective),
// with sub-40ms retrieval and adaptive decay.

import { AgentTool, MCPContext, MCPResponse } from '@/lib/mcp/types';

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'reflective';
  tags: string[];
  timestamp: number;
  importance: number; // 0-1, affects decay rate
  recallCount: number;
  lastRecalled?: number;
}

export interface MemoryQuery {
  text: string;
  limit?: number;
  types?: MemoryEntry['type'][];
  tags?: string[];
  since?: number; // timestamp filter
}

export class OpenMemoryClient {
  private baseURL: string;
  private apiKey: string;
  private projectId: string;

  constructor(baseURL: string, apiKey: string, projectId: string = 'spiktor') {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  // ─── Core Memory Operations ───────────────────────────────

  async store(entry: Omit<MemoryEntry, 'id' | 'recallCount'>): Promise<MemoryEntry> {
    const response = await fetch(`${this.baseURL}/api/memory`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Project-ID': this.projectId,
      },
      body: JSON.stringify(entry),
    });
    
    if (!response.ok) throw new Error(`OpenMemory store failed: ${response.statusText}`);
    return response.json();
  }

  async recall(query: MemoryQuery): Promise<MemoryEntry[]> {
    const params = new URLSearchParams({ q: query.text });
    if (query.limit) params.set('limit', String(query.limit));
    if (query.types?.length) params.set('types', query.types.join(','));
    if (query.tags?.length) params.set('tags', query.tags.join(','));
    if (query.since) params.set('since', String(query.since));

    const response = await fetch(`${this.baseURL}/api/memory/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Project-ID': this.projectId,
      },
    });

    if (!response.ok) throw new Error(`OpenMemory recall failed: ${response.statusText}`);
    return response.json();
  }

  async getRecent(limit = 20): Promise<MemoryEntry[]> {
    const response = await fetch(`${this.baseURL}/api/memory/recent?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Project-ID': this.projectId,
      },
    });
    if (!response.ok) throw new Error(`OpenMemory recent failed: ${response.statusText}`);
    return response.json();
  }

  async updateRecall(id: string): Promise<void> {
    await fetch(`${this.baseURL}/api/memory/${id}/recall`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Project-ID': this.projectId,
      },
    });
  }

  async forget(id: string): Promise<void> {
    await fetch(`${this.baseURL}/api/memory/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Project-ID': this.projectId,
      },
    });
  }

  // ─── High-Level Memory Primitives ────────────────────────

  /**
   * Remember a decision made and why — procedural memory
   */
  async rememberDecision(decision: string, reason: string, context: string): Promise<MemoryEntry> {
    return this.store({
      content: `Decision: ${decision}\nReason: ${reason}\nContext: ${context}`,
      type: 'procedural',
      tags: ['decision', 'reasoning'],
      timestamp: Date.now(),
      importance: 0.9,
    });
  }

  /**
   * Remember a user preference — semantic memory
   */
  async rememberPreference(key: string, value: string, note?: string): Promise<MemoryEntry> {
    return this.store({
      content: `Preference [${key}]: ${value}${note ? `\nNote: ${note}` : ''}`,
      type: 'semantic',
      tags: ['preference', key],
      timestamp: Date.now(),
      importance: 0.8,
    });
  }

  /**
   * Remember a project fact — semantic memory
   */
  async rememberFact(fact: string, source?: string): Promise<MemoryEntry> {
    return this.store({
      content: `Fact: ${fact}${source ? `\nSource: ${source}` : ''}`,
      type: 'semantic',
      tags: ['fact'],
      timestamp: Date.now(),
      importance: 0.7,
    });
  }

  /**
   * Remember a conversation outcome — episodic memory
   */
  async rememberSession(summary: string, agents: string[], outcome: 'success' | 'failed'): Promise<MemoryEntry> {
    return this.store({
      content: `Session summary: ${summary}\nAgents: ${agents.join(', ')}\nOutcome: ${outcome}`,
      type: 'episodic',
      tags: ['session', outcome],
      timestamp: Date.now(),
      importance: outcome === 'success' ? 0.6 : 0.9,
    });
  }

  /**
   * Reflect on a pattern — reflective memory
   */
  async rememberPattern(pattern: string, occurrences: string, implication: string): Promise<MemoryEntry> {
    return this.store({
      content: `Pattern: ${pattern}\nOccurrences: ${occurrences}\nImplication: ${implication}`,
      type: 'reflective',
      tags: ['pattern', 'learning'],
      timestamp: Date.now(),
      importance: 0.85,
    });
  }

  /**
   * Inject memory context into a prompt — call before each agent run
   */
  async buildContextPrompt(task: string, maxMemories = 10): Promise<string> {
    const memories = await this.recall({ text: task, limit: maxMemories });
    
    if (memories.length === 0) return '';

    const sections = ['=== Relevant Memory (from past sessions) ==='];
    for (const mem of memories) {
      sections.push(`[${mem.type.toUpperCase()}] ${mem.content}`);
      this.updateRecall(mem.id).catch(console.warn); // fire-and-forget recall tracking
    }
    sections.push('===');
    return sections.join('\n');
  }
}

// ─── MCP Tool Bridge for OpenMemory ──────────────────────────

export function createOpenMemoryTools(client: OpenMemoryClient): AgentTool[] {
  return [
    {
      name: 'memory_recall',
      description: 'Search long-term memory for relevant past context before starting a task',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for memory' },
          limit: { type: 'number', description: 'Max memories to return', default: 10 },
          types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by memory type: episodic, semantic, procedural, emotional, reflective',
          },
        },
      },
      handler: async (params: { query: string; limit?: number; types?: string[] }) => {
        const results = await client.recall({ text: params.query, limit: params.limit, types: params.types as MemoryEntry['type'][] });
        return { memories: results, count: results.length };
      },
    },
    {
      name: 'memory_remember',
      description: 'Store something important for the future — a decision, preference, fact, or lesson',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'emotional', 'reflective'],
            description: 'Type of memory to store',
          },
          content: { type: 'string', description: 'What to remember' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval' },
          importance: { type: 'number', description: 'Importance 0-1 (affects decay)', default: 0.7 },
        },
      },
      handler: async (params: { type: MemoryEntry['type']; content: string; tags?: string[]; importance?: number }) => {
        const entry = await client.store({
          content: params.content,
          type: params.type,
          tags: params.tags || [],
          timestamp: Date.now(),
          importance: params.importance ?? 0.7,
        });
        return { stored: true, id: entry.id };
      },
    },
    {
      name: 'memory_build_context',
      description: 'Build a memory-augmented context prompt for the current task',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Current task description' },
          maxMemories: { type: 'number', description: 'Max memories to include', default: 10 },
        },
      },
      handler: async (params: { task: string; maxMemories?: number }) => {
        const context = await client.buildContextPrompt(params.task, params.maxMemories);
        return { contextPrompt: context };
      },
    },
    {
      name: 'memory_recent',
      description: 'Get recently stored memories',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent memories', default: 20 },
        },
      },
      handler: async (params: { limit?: number }) => {
        const memories = await client.getRecent(params.limit);
        return { memories, count: memories.length };
      },
    },
  ];
}

// Browserable Integration — AI-powered web automation for Spiktor
// https://github.com/browserable/browserable
//
// What it does: Self-hostable browser agent library (90.4% WebVoyager benchmark),
// REST API + SDK, works with any LLM, browser automation via simple HTTP calls.

export interface BrowserableConfig {
  baseURL: string;         // e.g. http://localhost:3000 or your cloud instance
  apiKey?: string;          // if self-hosted with auth
}

export interface PageResult {
  url: string;
  title: string;
  content?: string;
  screenshot?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  url?: string;
  extracted?: Record<string, unknown>;
}

// ─── Browser Session Management ──────────────────────────────

export class BrowserableClient {
  private baseURL: string;
  private apiKey: string;

  constructor(config: BrowserableConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.apiKey = config.apiKey || '';
  }

  private async request(endpoint: string, body?: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`Browserable error ${response.status}: ${error}`);
    }
    return response.json();
  }

  // ─── Core Browser Primitives ────────────────────────────

  /**
   * Navigate to a URL and capture the page
   */
  async navigate(url: string): Promise<PageResult> {
    return this.request('/api/browser/navigate', { url }) as Promise<PageResult>;
  }

  /**
   * Click an element by natural language description or CSS selector
   */
  async click(description: string): Promise<ActionResult> {
    return this.request('/api/browser/click', { description }) as Promise<ActionResult>;
  }

  /**
   * Type into the currently focused input field
   */
  async type(text: string): Promise<ActionResult> {
    return this.request('/api/browser/type', { text }) as Promise<ActionResult>;
  }

  /**
   * Extract structured data using natural language query
   */
  async extract(query: string): Promise<Record<string, unknown>> {
    const result = await this.request('/api/browser/extract', { query }) as { data: Record<string, unknown> };
    return result.data;
  }

  /**
   * Take a screenshot
   */
  async screenshot(): Promise<string> {
    const result = await this.request('/api/browser/screenshot', {}) as { screenshot: string };
    return result.screenshot;
  }

  /**
   * Scroll the page
   */
  async scroll(direction: 'up' | 'down', amount = 3): Promise<ActionResult> {
    return this.request('/api/browser/scroll', { direction, amount }) as Promise<ActionResult>;
  }

  /**
   * Wait for page to settle
   */
  async wait(ms = 1000): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Full browser task — navigate + interact + extract in one go
   */
  async runTask(task: string): Promise<{ success: boolean; data?: Record<string, unknown>; screenshot?: string }> {
    return this.request('/api/browser/task', { task }) as Promise<{ success: boolean; data?: Record<string, unknown>; screenshot?: string }>;
  }

  // ─── High-Level Browser Primitives ────────────────────

  /**
   * Research a topic by browsing the web
   */
  async researchTopic(topic: string, maxSteps = 5): Promise<string> {
    const steps: string[] = [];

    // Step 1: Search Google
    const searchResult = await this.navigate(`https://www.google.com/search?q=${encodeURIComponent(topic)}`);
    steps.push(`Google search results: ${searchResult.title}`);

    // Step 2: Try clicking the first result
    if (maxSteps > 1) {
      try {
        await this.click('First non-ad search result');
        steps.push(`Opened: ${await this.screenshot()}`);
      } catch {
        steps.push('Could not click first result');
      }
    }

    // Step 3: Extract key information
    if (maxSteps > 2) {
      try {
        const data = await this.extract('main topics, key facts, and conclusions');
        steps.push(`Extracted: ${JSON.stringify(data)}`);
      } catch {
        steps.push('Extraction failed');
      }
    }

    return steps.join('\n');
  }

  /**
   * Fill and submit a form
   */
  async fillForm(fields: Record<string, string>, submitButton = 'Submit'): Promise<ActionResult> {
    for (const [field, value] of Object.entries(fields)) {
      // Click to focus the field first
      try {
        await this.click(`input[name="${field}"], input[id="${field}"], textarea[name="${field}"]`);
      } catch {
        // Try clicking by label
        try {
          await this.click(`label:has-text("${field}")`);
        } catch {
          console.warn(`Could not focus field: ${field}`);
        }
      }
      await this.type(value);
    }

    return this.click(submitButton);
  }

  /**
   * Login to a site
   */
  async login(username: string, password: string, usernameField = 'email', passwordField = 'password'): Promise<ActionResult> {
    return this.fillForm({ [usernameField]: username, [passwordField]: password }, 'Sign in');
  }

  /**
   * Scrape a page and extract structured data
   */
  async scrapePage(url: string, extractionQuery: string): Promise<Record<string, unknown>> {
    await this.navigate(url);
    await this.wait(2000);
    return this.extract(extractionQuery);
  }
}

// ─── MCP Tool Bridge for Browserable ─────────────────────

import { AgentTool } from '@/lib/mcp/types';

export function createBrowserableTools(client: BrowserableClient): AgentTool[] {
  return [
    {
      name: 'browser_navigate',
      description: 'Open a URL in the browser',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
      },
      handler: async (params: { url: string }) => {
        return client.navigate(params.url);
      },
    },
    {
      name: 'browser_click',
      description: 'Click an element by description or CSS selector',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What to click (e.g. "Submit button", ".login-form")' },
        },
      },
      handler: async (params: { description: string }) => {
        return client.click(params.description);
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into the currently focused field',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
      },
      handler: async (params: { text: string }) => {
        return client.type(params.text);
      },
    },
    {
      name: 'browser_extract',
      description: 'Extract structured data from the current page using natural language',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What data to extract (e.g. "all prices and product names")' },
        },
      },
      handler: async (params: { query: string }) => {
        return client.extract(params.query);
      },
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page state',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return { screenshot: await client.screenshot() };
      },
    },
    {
      name: 'browser_run_task',
      description: 'Run a full browser task described in natural language',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task description (e.g. "go to GitHub and extract my top 5 repos")' },
        },
      },
      handler: async (params: { task: string }) => {
        return client.runTask(params.task);
      },
    },
    {
      name: 'browser_scroll',
      description: 'Scroll the page up or down',
      inputSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'] },
          amount: { type: 'number', default: 3 },
        },
      },
      handler: async (params: { direction: 'up' | 'down'; amount?: number }) => {
        return client.scroll(params.direction, params.amount);
      },
    },
    {
      name: 'browser_research',
      description: 'Research a topic by browsing the web and extracting key information',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic to research' },
          maxSteps: { type: 'number', default: 5 },
        },
      },
      handler: async (params: { topic: string; maxSteps?: number }) => {
        return { report: await client.researchTopic(params.topic, params.maxSteps) };
      },
    },
    {
      name: 'browser_scrape',
      description: 'Scrape a page and extract structured data',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          query: { type: 'string', description: 'What to extract' },
        },
      },
      handler: async (params: { url: string; query: string }) => {
        return client.scrapePage(params.url, params.query);
      },
    },
  ];
}

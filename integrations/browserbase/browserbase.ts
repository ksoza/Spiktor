// Browserbase Integration — cloud browser infrastructure
// Docs: https://docs.browserbase.com
// Spiktor uses Browserbase as its cloud browser for web tasks

export interface BrowserbaseConfig {
  projectId: string;
  apiKey: string;
  region?: 'us-west-2' | 'eu-central-1';
}

export interface BrowserSession {
  id: string;
  cdpUrl: string;
  snapshotUrl?: string;
}

export class BrowserbaseClient {
  constructor(private config: BrowserbaseConfig) {
    if (!config.projectId || !config.apiKey) {
      throw new Error('Browserbase requires PROJECT_ID and API_KEY');
    }
  }

  // Create a cloud browser session
  async createSession(options?: {
    browser?: 'chrome' | 'firefox';
    viewport?: { width: number; height: number };
    record?: boolean;
  }): Promise<BrowserSession> {
    const response = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'X-Project-ID': this.config.projectId,
      },
      body: JSON.stringify({
        projectId: this.config.projectId,
        browserType: options?.browser || 'chrome',
        viewport: options?.viewport || { width: 1920, height: 1080 },
        record: options?.record ?? true,
      }),
    });
    
    if (!response.ok) throw new Error(`Browserbase error: ${response.statusText}`);
    const data = await response.json();
    return {
      id: data.id,
      cdpUrl: data.cdpUrl,
      snapshotUrl: data.snapshotUrl,
    };
  }

  // Navigate to a URL
  async navigate(sessionId: string, url: string): Promise<void> {
    await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'X-Project-ID': this.config.projectId,
      },
      body: JSON.stringify({ url }),
    });
  }

  // Take a screenshot
  async screenshot(sessionId: string): Promise<string> {
    // Returns base64 PNG
    const response = await fetch(
      `https://api.browserbase.com/v1/sessions/${sessionId}/screenshot`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': this.config.apiKey,
          'X-Project-ID': this.config.projectId,
        },
      }
    );
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  // Destroy session
  async destroySession(sessionId: string): Promise<void> {
    await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': this.config.apiKey,
        'X-Project-ID': this.config.projectId,
      },
    });
  }
}

export default BrowserbaseClient;

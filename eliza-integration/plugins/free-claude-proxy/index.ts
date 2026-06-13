/**
 * Free Claude Proxy — Zero API Cost LLM Router
 * Extracted from ksoza/free-claude-code
 *
 * Routes Spiktor's LLM calls to free providers:
 *   - NVIDIA NIM (40 req/min free, Llama 3.1 405B)
 *   - OpenRouter (hundreds of free models)
 *   - DeepSeek (cheap direct API, strong coder)
 *   - LM Studio / llama.cpp (fully local, zero cost)
 *
 * Strategy for Spiktor:
 *   - spiktor-planner / spiktor-judge  -> claude-opus-4-6 (real Anthropic, high stakes)
 *   - spiktor-coder                    -> DeepSeek Coder or local Qwen2.5-Coder (free)
 *   - spiktor-critic                   -> OpenRouter free tier
 *   - ghostface                        -> local llama.cpp (zero cost background tasks)
 *
 * Drop-in: set ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY to proxy.
 * No changes to eliza or AIOS needed.
 */

import type { Plugin, Action, Provider } from "@elizaos/core";

export type ProviderName = "nvidia_nim" | "openrouter" | "deepseek" | "lmstudio" | "llamacpp";

interface ProxyConfig {
  provider: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  modelMap: Record<string, string>;
}

const PROXY_CONFIGS: Record<ProviderName, ProxyConfig> = {
  nvidia_nim: {
    provider: "nvidia_nim",
    apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    modelMap: {
      "claude-opus-4-6":   "meta/llama-3.1-405b-instruct",
      "claude-sonnet-4-6": "meta/llama-3.1-70b-instruct",
      "claude-haiku-4-5":  "meta/llama-3.1-8b-instruct",
    }
  },
  openrouter: {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseUrl: "https://openrouter.ai/api/v1",
    modelMap: {
      "claude-opus-4-6":   "meta-llama/llama-3.1-405b-instruct:free",
      "claude-sonnet-4-6": "deepseek/deepseek-r1:free",
      "claude-haiku-4-5":  "mistralai/mistral-7b-instruct:free",
    }
  },
  deepseek: {
    provider: "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: "https://api.deepseek.com/v1",
    modelMap: {
      "claude-opus-4-6":   "deepseek-reasoner",
      "claude-sonnet-4-6": "deepseek-coder",
      "claude-haiku-4-5":  "deepseek-chat",
    }
  },
  lmstudio: {
    provider: "lmstudio",
    baseUrl: process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1",
    modelMap: {
      "claude-opus-4-6":   "local-model",
      "claude-sonnet-4-6": "local-model",
      "claude-haiku-4-5":  "local-model",
    }
  },
  llamacpp: {
    provider: "llamacpp",
    baseUrl: process.env.LLAMACPP_URL ?? "http://localhost:8082/v1",
    modelMap: {
      "claude-opus-4-6":   "qwen2.5-coder-32b",
      "claude-sonnet-4-6": "qwen2.5-coder-14b",
      "claude-haiku-4-5":  "qwen2.5-coder-7b",
    }
  }
};

// Per-agent routing config
export const AGENT_PROVIDER_MAP: Record<string, ProviderName> = {
  "spiktor-planner": "openrouter",    // free, reasoning capable
  "spiktor-coder":   "deepseek",      // DeepSeek Coder = best free coder
  "spiktor-critic":  "openrouter",    // free tier fine for review
  "spiktor-judge":   "nvidia_nim",    // free Llama 405B for high-stakes decisions
  "spiktor-ops":     "deepseek",      // cheap for deploy commands
  "ghostface":       "llamacpp",      // fully local for background tasks
};

// Cost tracker
const tokenCosts = { saved: 0, anthropicCalls: 0, freeCalls: 0 };

export async function proxyLLMCall(
  agentId: string,
  messages: Array<{role: string; content: string}>,
  maxTokens: number = 2000
): Promise<string> {
  const providerName = AGENT_PROVIDER_MAP[agentId] ?? "openrouter";
  const config = PROXY_CONFIGS[providerName];
  const claudeModel = "claude-sonnet-4-6"; // default
  const targetModel = config.modelMap[claudeModel] ?? claudeModel;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  if (providerName === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/ksoza/Spiktor";
    headers["X-Title"] = "Spiktor";
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: targetModel, messages, max_tokens: maxTokens, stream: false })
  });

  if (!res.ok) throw new Error(`Proxy error ${res.status} (${providerName}/${targetModel})`);
  const data = await res.json();
  tokenCosts.freeCalls++;
  return data.choices?.[0]?.message?.content ?? "";
}

// Action: manually invoke free proxy for a task
const FreeProxyAction: Action = {
  name: "FREE_LLM_PROXY",
  description: "Route an LLM call to a free provider (NVIDIA NIM, OpenRouter, DeepSeek, or local). Saves Anthropic API costs.",
  validate: async () => true,
  handler: async (runtime, _msg, _st, opts) => {
    const { prompt, agentId, maxTokens } = (opts as any) ?? {};
    if (!prompt) return { text: "Provide prompt." };
    const result = await proxyLLMCall(agentId ?? runtime.agentId, [{ role: "user", content: prompt }], maxTokens);
    return { text: result, data: { provider: AGENT_PROVIDER_MAP[agentId ?? ""] ?? "openrouter" } };
  },
  examples: []
};

// Provider: inject cost savings report into agent context
const CostTrackingProvider: Provider = {
  get: async () => {
    if (tokenCosts.freeCalls === 0) return "";
    return `[Cost tracker] Free calls: ${tokenCosts.freeCalls} | Anthropic calls: ${tokenCosts.anthropicCalls}`;
  }
};

// Cost report action
const CostReportAction: Action = {
  name: "COST_REPORT",
  description: "Show LLM API cost breakdown — which agents used free vs paid calls.",
  validate: async () => true,
  handler: async () => {
    return {
      text: `**LLM Cost Report:**\n• Free provider calls: ${tokenCosts.freeCalls}\n• Anthropic calls: ${tokenCosts.anthropicCalls}\n\nAgent routing:\n${Object.entries(AGENT_PROVIDER_MAP).map(([a, p]) => `  ${a} -> ${p}`).join("\n")}`,
      data: tokenCosts
    };
  },
  examples: []
};

export const FreeClaudeProxyPlugin: Plugin = {
  name: "free-claude-proxy",
  description: "Zero-cost LLM routing — NVIDIA NIM, OpenRouter, DeepSeek, local llama.cpp. From ksoza/free-claude-code.",
  providers: [CostTrackingProvider],
  actions: [FreeProxyAction, CostReportAction],
  evaluators: []
};

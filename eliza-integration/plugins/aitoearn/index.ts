/**
 * AiToEarn Social Distribution Plugin for Spiktor
 * =================================================
 * From ksoza/AiToEarn
 *
 * Connects via AiToEarn's MCP server to auto-publish content across:
 * TikTok · YouTube · Instagram · Twitter/X · Facebook · LinkedIn
 * Pinterest · Bilibili · Douyin · Xiaohongshu · Kuaishou · Weixin
 *
 * Use for LiTboxLabz / KSX / RiP / NIMBUS / PCBL social presence:
 *   - spiktor-writer drafts content
 *   - AiToEarn distributes it to all platforms simultaneously
 *   - Supports video, images, text, threads, shorts
 *   - Draft generation + batch publishing
 *   - Content marketplace integration
 */

import type { Plugin, Action, Provider, IAgentRuntime } from "@elizaos/core";

const AITOEARN_API_KEY  = process.env.AITOEARN_API_KEY  ?? "";
const AITOEARN_BASE_URL = process.env.AITOEARN_BASE_URL ?? "https://api.aitoearn.ai/v1";
const ANTHROPIC_API_KEY = process.env.ELIZA_ANTHROPIC_API_KEY!;

// Supported platforms
const PLATFORMS = [
  "tiktok", "youtube", "instagram", "twitter", "facebook",
  "linkedin", "pinterest", "bilibili", "douyin", "xiaohongshu",
  "kuaishou", "weixin", "threads"
] as const;

type Platform = typeof PLATFORMS[number];

// Brand → platform strategy mapping
const BRAND_PLATFORM_MAP: Record<string, Platform[]> = {
  "ksx":       ["twitter", "youtube", "tiktok", "linkedin", "bilibili"],
  "rip":       ["tiktok", "youtube", "instagram", "twitter", "threads"],
  "nimbus":    ["instagram", "tiktok", "youtube", "twitter", "pinterest"],
  "litboxlabz":["twitter", "linkedin", "youtube", "instagram"],
  "purk":      ["twitter", "tiktok", "youtube"],
  "scarfeild": ["twitter", "tiktok", "instagram"],
  "pcbl":      ["twitter", "linkedin", "youtube"],
  "vcnl":      ["twitter", "linkedin", "youtube"],
};

async function aitoearnCall(endpoint: string, body: object) {
  if (!AITOEARN_API_KEY) throw new Error("AITOEARN_API_KEY not set");
  const res = await fetch(`${AITOEARN_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AITOEARN_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`AiToEarn API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── CONTENT_DRAFT action ──────────────────────────────────────────────────────

const ContentDraftAction: Action = {
  name: "SOCIAL_DRAFT",
  description:
    "Generate platform-optimized social media content for a brand/topic. " +
    "Auto-adapts format, length, hashtags per platform. " +
    "Brands: ksx, rip, nimbus, litboxlabz, purk, scarfeild, pcbl.",
  validate: async (_rt, msg) =>
    /draft.*post|social.*content|tweet|tiktok.*script|instagram.*caption|post.*about/i.test(
      msg.content.text ?? ""
    ),

  handler: async (_rt, msg, _st, opts) => {
    const {
      brand     = "litboxlabz",
      topic,
      platforms,
      mediaType = "text",   // text | video | image | thread
      tone      = "bold",
    } = (opts as any) ?? {};

    const text       = topic ?? msg.content.text ?? "";
    const targetPlat = platforms ?? BRAND_PLATFORM_MAP[brand.toLowerCase()] ?? ["twitter", "instagram"];

    // Generate content via Claude, platform-optimized
    const prompt = `You are a social media strategist for ${brand.toUpperCase()}.
Create social media content for: "${text}"
Media type: ${mediaType} | Tone: ${tone}

Generate platform-optimized content for: ${targetPlat.join(", ")}

For each platform output:
- Platform name
- Post content (within character limits)
- Hashtags (platform-appropriate)
- Suggested posting time

Brand context:
- KSX Kings Coin: CPU-mined, 21M cap, quantum-resistant, no pre-mine, for the people
- RiP (remixip.icu): IP remix platform, AI creative tools, NFT minting
- NIMBUS™: vortex-acoustic rain deflection wearable, 4 modes: SHIELD/COOL/WARM/PURE
- LiTboxLabz: sovereign IP and innovation lab
- $PURK: Purple Wojak meme coin on Solana
- $SCARFEILD: Scarface + Garfield meme coin

Format as JSON array with fields: platform, content, hashtags, post_time`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data  = await res.json();
    const raw   = data.content?.[0]?.text ?? "[]";
    const clean = raw.replace(/```json|```/g, "").trim();

    let drafts: any[] = [];
    try { drafts = JSON.parse(clean); } catch { drafts = [{ platform: "all", content: raw }]; }

    const preview = drafts.slice(0, 3).map((d: any) =>
      `**${d.platform}:** ${(d.content ?? "").slice(0, 100)}...`
    ).join("\n");

    return {
      text: `**Social drafts for ${brand} — ${drafts.length} platforms:**\n\n${preview}\n\nReady to publish with SOCIAL_PUBLISH.`,
      data: { drafts, brand, platforms: targetPlat }
    };
  },
  examples: []
};

// ── SOCIAL_PUBLISH action ─────────────────────────────────────────────────────

const SocialPublishAction: Action = {
  name: "SOCIAL_PUBLISH",
  description:
    "Publish drafted content to social platforms via AiToEarn MCP. " +
    "Can publish immediately, schedule, or batch queue. " +
    "Requires AITOEARN_API_KEY.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const { drafts, scheduleAt, dryRun = false } = (opts as any) ?? {};

    if (!drafts?.length) return { text: "No drafts to publish. Run SOCIAL_DRAFT first." };
    if (!AITOEARN_API_KEY) {
      return { text: "⛔ AITOEARN_API_KEY not set. Get one at aitoearn.ai then add to .env" };
    }

    if (dryRun) {
      return {
        text: `**Dry run — would publish to ${drafts.length} platform(s):**\n${drafts.map((d: any) => `  • ${d.platform}: ${(d.content ?? "").slice(0, 60)}...`).join("\n")}`,
        data: { drafts, dryRun: true }
      };
    }

    const results = await Promise.allSettled(
      drafts.map((draft: any) =>
        aitoearnCall("/publish", {
          platform:    draft.platform,
          content:     draft.content,
          hashtags:    draft.hashtags ?? [],
          media_type:  draft.media_type ?? "text",
          schedule_at: scheduleAt ?? null
        })
      )
    );

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed    = results.filter(r => r.status === "rejected").length;

    return {
      text: `**Published:** ${succeeded}/${drafts.length} platforms ✅ | Failed: ${failed}`,
      data: { results: results.map(r => r.status), succeeded, failed }
    };
  },
  examples: []
};

// ── SOCIAL_CAMPAIGN action ────────────────────────────────────────────────────

const SocialCampaignAction: Action = {
  name: "SOCIAL_CAMPAIGN",
  description:
    "Launch a full social media campaign for a product/event. " +
    "Generates a multi-platform content calendar, drafts all posts, queues them. " +
    "Use for: KSX genesis block, NIMBUS launch, RiP feature drops, patent announcements.",
  validate: async () => true,
  handler: async (_rt, _msg, _st, opts) => {
    const {
      brand,
      event,
      duration     = 7,    // days
      postsPerDay  = 2,
      startDate    = new Date().toISOString().slice(0, 10)
    } = (opts as any) ?? {};

    const totalPosts = duration * postsPerDay;
    const platforms  = BRAND_PLATFORM_MAP[brand?.toLowerCase()] ?? ["twitter", "instagram"];

    const prompt = `Create a ${duration}-day social media campaign for ${brand?.toUpperCase()}.
Event/launch: "${event}"
Platforms: ${platforms.join(", ")}
Posts per day: ${postsPerDay} | Start: ${startDate}
Total: ${totalPosts} posts

Generate a JSON campaign calendar with each post having:
- day (1-${duration}), post_number, platform, content, hashtags, media_suggestion, scheduled_time

Make it build momentum: awareness → interest → desire → action arc.
Keep each post authentic to the brand voice.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data     = await res.json();
    const campaign = data.content?.[0]?.text ?? "";

    return {
      text: `**${duration}-day campaign for ${brand}** — "${event}"\n${totalPosts} posts across ${platforms.length} platforms\n\nCampaign ready. Use SOCIAL_PUBLISH to queue all posts.`,
      data: { campaign, brand, event, platforms, totalPosts }
    };
  },
  examples: []
};

// ── Platform status provider ──────────────────────────────────────────────────

const SocialStatusProvider: Provider = {
  get: async () => {
    if (!AITOEARN_API_KEY) return "[AiToEarn] Not configured — set AITOEARN_API_KEY";
    return `[AiToEarn] Social distribution ready — 13 platforms available\nBrands mapped: KSX · RiP · NIMBUS · LiTboxLabz · $PURK · $SCARFEILD`;
  }
};

// ── Plugin export ─────────────────────────────────────────────────────────────

export const AiToEarnPlugin: Plugin = {
  name: "aitoearn",
  description:
    "Social media distribution — auto-publish to 13 platforms via AiToEarn MCP. " +
    "Draft, campaign planning, batch publish for all LiTboxLabz brands.",
  providers: [SocialStatusProvider],
  actions: [ContentDraftAction, SocialPublishAction, SocialCampaignAction],
  evaluators: []
};

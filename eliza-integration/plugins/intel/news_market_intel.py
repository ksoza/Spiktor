"""
Spiktor News & Market Intelligence
====================================
Targeted live intelligence — no IPTV.

Sources:
  News:      YouTube Live news channels, RSS feeds, NewsAPI
  Crypto:    CoinGecko API, CoinMarketCap, on-chain data
  Stocks:    Alpha Vantage / Yahoo Finance API
  IPOs:      SEC EDGAR filings, IPO Calendar APIs
  Alt news:  Specific YouTube channels, RSS from independent outlets
  Social:    Twitter/X trending (via AiToEarn), Reddit financial

Spiktor watches these so you don't have to.
GhOSTface runs scheduled intelligence sweeps and posts digests to Slack.
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime

import aiohttp

logger = logging.getLogger("spiktor.intel")

ANTHROPIC_API_KEY = os.environ.get("ELIZA_ANTHROPIC_API_KEY", "")
COINGECKO_KEY     = os.environ.get("COINGECKO_API_KEY",    "")   # free tier available
ALPHAVANTAGE_KEY  = os.environ.get("ALPHAVANTAGE_API_KEY", "")   # free tier available
NEWSAPI_KEY       = os.environ.get("NEWSAPI_KEY",          "")   # free tier available
SLACK_BOT_TOKEN   = os.environ.get("ELIZA_SLACK_BOT_TOKEN","")
SLACK_CHANNEL     = os.environ.get("INTEL_SLACK_CHANNEL",  "C0AMM97GSV9")


# ── News sources (YouTube Live + RSS, no IPTV) ───────────────────────────────

NEWS_SOURCES = {
    # Mainstream live streams
    "bloomberg_live":   "https://www.youtube.com/watch?v=dp8PhLsUcFE",
    "cnbc_live":        "https://www.youtube.com/watch?v=9ujeXpi5hMU",
    "reuters_live":     "https://www.youtube.com/watch?v=iNA6DJ_vFvw",

    # Alternative / independent
    "corbett_report":   "https://www.corbettreport.com/feed/",
    "zerohedge_rss":    "https://feeds.feedburner.com/zerohedge/feed",
    "coindesk_rss":     "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "decrypt_rss":      "https://decrypt.co/feed",
    "the_block_rss":    "https://www.theblock.co/rss.xml",
    "tldr_newsletter":  "https://tldr.tech/api/rss/tech",
}

# Crypto tokens to watch
WATCH_TOKENS = [
    "bitcoin", "ethereum", "solana", "monero",
    # KSX ecosystem comparable
    "ravencoin", "ergo", "kaspa",
]

# Stocks to watch (for KSX/RiP/LiTboxLabz relevant sectors)
WATCH_STOCKS = [
    "NVDA", "COIN", "MSTR", "AMD", "INTC",  # GPU / crypto adjacent
    "META", "SPOT", "SNAP",                   # Social / creator economy
    "ABNB",                                   # Gig economy
]


# ── Crypto intelligence ───────────────────────────────────────────────────────

async def get_crypto_prices(tokens: list[str]) -> dict:
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(tokens)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true"
    headers = {}
    if COINGECKO_KEY:
        headers["x-cg-demo-api-key"] = COINGECKO_KEY

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status != 200:
                return {}
            return await resp.json()


async def get_crypto_trending() -> list[dict]:
    async with aiohttp.ClientSession() as session:
        async with session.get("https://api.coingecko.com/api/v3/search/trending") as resp:
            if resp.status != 200:
                return []
            data = await resp.json()
            return data.get("coins", [])[:7]


async def get_crypto_news(query: str = "crypto blockchain defi") -> list[dict]:
    if not NEWSAPI_KEY:
        return []
    url = f"https://newsapi.org/v2/everything?q={query}&sortBy=publishedAt&pageSize=5&apiKey={NEWSAPI_KEY}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                return []
            data = await resp.json()
            return data.get("articles", [])[:5]


# ── Stock intelligence ────────────────────────────────────────────────────────

async def get_stock_quotes(symbols: list[str]) -> dict:
    if not ALPHAVANTAGE_KEY:
        # Fall back to Yahoo Finance (no key needed)
        return await _yahoo_quotes(symbols)

    results = {}
    async with aiohttp.ClientSession() as session:
        for sym in symbols[:5]:  # rate limit
            url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={sym}&apikey={ALPHAVANTAGE_KEY}"
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    q = data.get("Global Quote", {})
                    results[sym] = {
                        "price":  q.get("05. price", "?"),
                        "change": q.get("09. change", "?"),
                        "change_pct": q.get("10. change percent", "?")
                    }
    return results


async def _yahoo_quotes(symbols: list[str]) -> dict:
    """Yahoo Finance fallback — no API key needed."""
    results = {}
    async with aiohttp.ClientSession() as session:
        for sym in symbols[:5]:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=1d"
            try:
                async with session.get(url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
                        price      = meta.get("regularMarketPrice", "?")
                        prev_close = meta.get("previousClose", price)
                        try:
                            chg = float(price) - float(prev_close)
                            chg_pct = (chg / float(prev_close)) * 100
                        except Exception:
                            chg = chg_pct = 0
                        results[sym] = {"price": price, "change": f"{chg:+.2f}", "change_pct": f"{chg_pct:+.2f}%"}
            except Exception:
                pass
    return results


# ── IPO intelligence ──────────────────────────────────────────────────────────

async def get_upcoming_ipos() -> list[dict]:
    """SEC EDGAR + IPO calendar scraping."""
    ipos = []
    async with aiohttp.ClientSession() as session:
        # SEC EDGAR recent S-1 filings
        url = "https://efts.sec.gov/LATEST/search-index?q=%22S-1%22&dateRange=custom&startdt=2026-06-01&forms=S-1"
        try:
            async with session.get(url, headers={"User-Agent": "Spiktor/1.0 contact@litboxlabz.com"}) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    for hit in data.get("hits", {}).get("hits", [])[:5]:
                        src = hit.get("_source", {})
                        ipos.append({
                            "company":  src.get("entity_name", "Unknown"),
                            "filed":    src.get("file_date", ""),
                            "filing":   src.get("form_type", "S-1"),
                            "url":      f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={src.get('entity_id','')}"
                        })
        except Exception:
            pass
    return ipos


# ── RSS feed reader ───────────────────────────────────────────────────────────

async def read_rss(url: str, limit: int = 5) -> list[dict]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                if resp.status != 200:
                    return []
                xml = await resp.text()
                # Simple XML parse without lxml dependency
                import re
                items = []
                for item in re.findall(r"<item>(.*?)</item>", xml, re.DOTALL)[:limit]:
                    title = re.search(r"<title[^>]*>(.*?)</title>", item, re.DOTALL)
                    link  = re.search(r"<link[^>]*>(.*?)</link>",  item, re.DOTALL)
                    items.append({
                        "title": (title.group(1) if title else "").replace("<![CDATA[", "").replace("]]>", "").strip(),
                        "link":  (link.group(1)  if link  else "").strip()
                    })
                return items
        except Exception:
            return []


# ── Intelligence synthesis ────────────────────────────────────────────────────

async def synthesize_intel(data: dict) -> str:
    """Send all gathered data to Claude for synthesis into a digest."""
    prompt = f"""You are Spiktor's intelligence analyst. Synthesize this market and news data into a concise daily brief for @uallsuspect.

CRYPTO PRICES:
{json.dumps(data.get('crypto_prices', {}), indent=2)}

TRENDING CRYPTO:
{json.dumps([c.get('item', {}).get('name', '') for c in data.get('trending', [])], indent=2)}

STOCK QUOTES:
{json.dumps(data.get('stocks', {}), indent=2)}

UPCOMING IPOs:
{json.dumps(data.get('ipos', []), indent=2)}

RECENT NEWS HEADLINES:
{json.dumps([a.get('title', '') for a in data.get('news', [])], indent=2)}

ALTERNATIVE NEWS:
{json.dumps(data.get('alt_news', []), indent=2)}

Write a structured brief covering:
1. Market pulse (crypto + stocks in 3 sentences)
2. Top 3 news items that matter for LiTboxLabz/KSX/RiP
3. IPO/launch watch (anything relevant to blockchain, AI, creator economy)
4. One contrarian take from alternative sources
5. Action items for today (if any)

Be direct. No filler. Flag anything that could affect KSX tokenomics or RiP platform.
Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}"""

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json",
                     "x-api-key": ANTHROPIC_API_KEY,
                     "anthropic-version": "2023-06-01"},
            json={"model": "claude-haiku-4-5", "max_tokens": 800,
                  "messages": [{"role": "user", "content": prompt}]}
        ) as resp:
            d = await resp.json()
            return d.get("content", [{}])[0].get("text", "Intel synthesis unavailable")


# ── Post to Slack ─────────────────────────────────────────────────────────────

async def post_to_slack(message: str, channel: str = SLACK_CHANNEL):
    if not SLACK_BOT_TOKEN:
        logger.info("SLACK_BOT_TOKEN not set — intel digest:\n%s", message)
        return

    async with aiohttp.ClientSession() as session:
        await session.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}",
                     "Content-Type": "application/json"},
            json={"channel": channel, "text": message,
                  "username": "Spiktor Intel", "icon_emoji": ":brain:"}
        )


# ── Main intel sweep ──────────────────────────────────────────────────────────

async def run_intel_sweep() -> dict:
    logger.info("[Intel] Running sweep...")

    crypto_prices, trending, news, stocks, ipos = await asyncio.gather(
        get_crypto_prices(WATCH_TOKENS),
        get_crypto_trending(),
        get_crypto_news("crypto blockchain KSX monero solana defi"),
        get_stock_quotes(WATCH_STOCKS),
        get_upcoming_ipos(),
        return_exceptions=True
    )

    # RSS alternative news
    alt_news = []
    for name, url in [("ZeroHedge", NEWS_SOURCES["zerohedge_rss"]),
                      ("CoinDesk",  NEWS_SOURCES["coindesk_rss"]),
                      ("Decrypt",   NEWS_SOURCES["decrypt_rss"])]:
        articles = await read_rss(url, limit=3)
        for a in articles:
            a["source"] = name
        alt_news.extend(articles)

    data = {
        "crypto_prices": crypto_prices if isinstance(crypto_prices, dict) else {},
        "trending":      trending      if isinstance(trending, list)       else [],
        "news":          news          if isinstance(news, list)           else [],
        "stocks":        stocks        if isinstance(stocks, dict)         else {},
        "ipos":          ipos          if isinstance(ipos, list)           else [],
        "alt_news":      alt_news,
        "timestamp":     datetime.now().isoformat()
    }

    digest = await synthesize_intel(data)
    data["digest"] = digest
    return data


# ── FastAPI service ───────────────────────────────────────────────────────────

from fastapi import FastAPI

app = FastAPI(title="Spiktor Intel Service", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "intel"}

@app.post("/sweep")
async def sweep():
    data = await run_intel_sweep()
    await post_to_slack(f"*Daily Intel Digest*\n{data['digest']}")
    return data

@app.get("/crypto")
async def crypto():
    return {
        "prices":   await get_crypto_prices(WATCH_TOKENS),
        "trending": await get_crypto_trending()
    }

@app.get("/stocks")
async def stocks():
    return await get_stock_quotes(WATCH_STOCKS)

@app.get("/ipos")
async def ipos():
    return await get_upcoming_ipos()

@app.get("/news")
async def news(query: str = "crypto blockchain defi ai"):
    return await get_crypto_news(query)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5003)

// Real Kalshi prediction market data.
// Requires KALSHI_API_KEY env var — falls back to null (caller uses simulation).

const BASE = "https://api.elections.kalshi.com/trade-api/v2";
const CACHE_TTL_MS = 30_000;

interface KalshiRawMarket {
  ticker: string;
  event_ticker?: string;
  series_ticker?: string;
  title: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number;
  volume?: number;
}

export interface KalshiLivePrices {
  home_win: number;
  draw: number;
  away_win: number;
  volume: number;
  tickers: { home_win: string; draw: string; away_win: string };
  source: "live" | "cache";
}

// Module-level cache — persists across requests in the same serverless instance
const _cache = new Map<string, { ts: number; data: KalshiLivePrices }>();

async function fetchKalshi(path: string, apiKey: string): Promise<Response> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 4000);
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: ctrl.signal,
    cache: "no-store",
  });
}

// Kalshi prices can be 0–99 (cents) or 0.00–0.99; normalize to decimal
function norm(p: number | undefined): number {
  if (p === undefined || p === null) return 0;
  return p > 1 ? p / 100 : p;
}

function midpoint(bid?: number, ask?: number, last?: number): number {
  if (bid !== undefined && ask !== undefined) return (norm(bid) + norm(ask)) / 2;
  return norm(last);
}

// Try to classify a market as home_win / draw / away_win by its title
function classify(
  title: string,
  homeCode: string,
  awayCode: string
): "home_win" | "draw" | "away_win" | null {
  const t = title.toLowerCase();
  const homeNames = [homeCode.toLowerCase(), "mexico"];
  const awayNames = [awayCode.toLowerCase(), "south africa", "southafrica"];

  if (t.includes("draw") || t.includes("tie")) return "draw";
  if (awayNames.some((n) => t.includes(n)) && (t.includes("win") || t.includes("beat"))) return "away_win";
  if (homeNames.some((n) => t.includes(n)) && (t.includes("win") || t.includes("beat"))) return "home_win";
  return null;
}

export async function getKalshiMarkets(
  homeCode: string,
  awayCode: string
): Promise<KalshiLivePrices | null> {
  const cacheKey = `${homeCode}:${awayCode}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, source: "cache" };
  }

  const apiKey = process.env.KALSHI_API_KEY;
  if (!apiKey) return null;

  try {
    // Try several series tickers Kalshi might use for WC 2026
    const seriesTickers = ["FIFA-WC26", "FIFAWC26", "FIFA-WC-2026", "WORLDCUP26"];
    let markets: KalshiRawMarket[] = [];

    for (const st of seriesTickers) {
      const res = await fetchKalshi(
        `/markets?limit=200&series_ticker=${st}&status=active`,
        apiKey
      );
      if (res.ok) {
        const json = await res.json();
        const found: KalshiRawMarket[] = json.markets ?? [];
        if (found.length > 0) { markets = found; break; }
      }
    }

    // If series ticker search empty, try keyword search
    if (!markets.length) {
      const res = await fetchKalshi(
        `/markets?limit=200&status=active&keyword=world+cup+${homeCode.toLowerCase()}`,
        apiKey
      );
      if (res.ok) {
        const json = await res.json();
        markets = json.markets ?? [];
      }
    }

    if (!markets.length) return null;

    // Bucket into home_win / draw / away_win by title
    const buckets: Record<string, KalshiRawMarket[]> = { home_win: [], draw: [], away_win: [] };
    for (const m of markets) {
      const cat = classify(m.title, homeCode, awayCode);
      if (cat) buckets[cat].push(m);
    }

    const pick = (arr: KalshiRawMarket[]) => arr[0]; // highest-volume would be better if sorted
    const hw = pick(buckets.home_win);
    const dr = pick(buckets.draw);
    const aw = pick(buckets.away_win);

    if (!hw && !dr && !aw) return null;

    const homeWinPrice = hw ? midpoint(hw.yes_bid, hw.yes_ask, hw.last_price) : 0.51;
    const drawPrice    = dr ? midpoint(dr.yes_bid, dr.yes_ask, dr.last_price) : 0.24;
    const awayRaw      = 1 - homeWinPrice - drawPrice;

    const result: KalshiLivePrices = {
      home_win:  Math.round(homeWinPrice * 100) / 100,
      draw:      Math.round(drawPrice * 100) / 100,
      away_win:  Math.max(0.01, Math.round(awayRaw * 100) / 100),
      volume:    (hw?.volume ?? 0) + (dr?.volume ?? 0) + (aw?.volume ?? 0),
      tickers:   { home_win: hw?.ticker ?? "", draw: dr?.ticker ?? "", away_win: aw?.ticker ?? "" },
      source:    "live",
    };

    _cache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

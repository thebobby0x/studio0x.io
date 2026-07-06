// Real Kalshi prediction market data — fully public, no API key required.

export const KALSHI_REST_BASE = "https://api.elections.kalshi.com/trade-api/v2";
export const KALSHI_WS_BASE = "wss://api.elections.kalshi.com/trade-api/ws/v2";

const CACHE_TTL_MS = 10_000; // 10 seconds — markets update frequently

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

interface KalshiRawMarket {
  ticker: string;
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
}

export interface KalshiOutcomeDetail {
  bid: number | null;   // best yes bid, dollars (0-1)
  ask: number | null;   // best yes ask, dollars (0-1)
  last: number | null;  // last trade price, dollars (0-1)
  volume: number;       // contracts traded on this outcome
}

export interface KalshiLivePrices {
  home_win: number;
  draw: number;
  away_win: number;
  volume: number;
  tickers: { home_win: string; draw: string; away_win: string };
  detail: { home_win: KalshiOutcomeDetail; draw: KalshiOutcomeDetail; away_win: KalshiOutcomeDetail };
  source: "live" | "cache";
}

// Module-level cache — persists across requests in the same serverless instance
const _cache = new Map<string, { ts: number; data: KalshiLivePrices }>();

async function fetchKalshi(path: string): Promise<Response> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 4000);
  return fetch(`${KALSHI_REST_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: ctrl.signal,
    cache: "no-store",
  });
}

// Parse a Kalshi decimal string price to a number (e.g. "0.4500" -> 0.45)
function parseDollars(s: string | undefined): number | undefined {
  if (s === undefined || s === null) return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

function midpoint(bid?: string, ask?: string, last?: string): number {
  const b = parseDollars(bid);
  const a = parseDollars(ask);
  const l = parseDollars(last);
  if (b !== undefined && a !== undefined) return (b + a) / 2;
  return l ?? 0;
}

function parseVolume(fp?: string): number {
  if (!fp) return 0;
  const n = parseFloat(fp);
  return isNaN(n) ? 0 : n;
}

// Build candidate event tickers for a match: try UTC date ±1 day and both team orderings
function buildCandidateEventTickers(homeCode: string, awayCode: string, matchDate: Date): string[] {
  const tickers: string[] = [];

  for (const deltaDays of [-1, 0, 1]) {
    const d = new Date(matchDate);
    d.setUTCDate(d.getUTCDate() + deltaDays);

    const yy = String(d.getUTCFullYear()).slice(2); // "26"
    const mon = MONTHS[d.getUTCMonth()];            // "JUN"
    const dd = String(d.getUTCDate()).padStart(2, "0"); // "12"

    const dateStr = `${yy}${mon}${dd}`; // "26JUN12"

    // Both orderings of team codes
    tickers.push(`KXFIFAGAME-${dateStr}${homeCode}${awayCode}`);
    tickers.push(`KXFIFAGAME-${dateStr}${awayCode}${homeCode}`);
  }

  return tickers;
}

// Try to fetch a single market by ticker, returns null if 404 or error
async function fetchMarket(ticker: string): Promise<KalshiRawMarket | null> {
  try {
    const res = await fetchKalshi(`/markets/${encodeURIComponent(ticker)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.market as KalshiRawMarket) ?? null;
  } catch {
    return null;
  }
}

// Fetch markets for one event ticker (home, away, TIE) in parallel
async function fetchEventMarkets(
  eventTicker: string,
  homeCode: string,
  awayCode: string
): Promise<{ home: KalshiRawMarket | null; draw: KalshiRawMarket | null; away: KalshiRawMarket | null } | null> {
  const [home, draw, away] = await Promise.all([
    fetchMarket(`${eventTicker}-${homeCode}`),
    fetchMarket(`${eventTicker}-TIE`),
    fetchMarket(`${eventTicker}-${awayCode}`),
  ]);

  // Only return if at least one market was found
  if (!home && !draw && !away) return null;
  return { home, draw, away };
}

// Fallback: search open events for the series and find by team codes
async function searchEventsFallback(
  homeCode: string,
  awayCode: string
): Promise<{ home: KalshiRawMarket | null; draw: KalshiRawMarket | null; away: KalshiRawMarket | null; eventTicker: string } | null> {
  try {
    const res = await fetchKalshi(`/events?series_ticker=KXFIFAGAME&status=open&limit=100`);
    if (!res.ok) return null;
    const json = await res.json();
    const events: Array<{ event_ticker: string; title?: string }> = json.events ?? [];

    // Find an event whose ticker contains both team codes
    const upper = (s: string) => s.toUpperCase();
    const h = upper(homeCode);
    const a = upper(awayCode);

    const match = events.find((e) => {
      const t = upper(e.event_ticker);
      return (t.includes(h) && t.includes(a));
    });

    if (!match) return null;

    const eventTicker = match.event_ticker;
    const result = await fetchEventMarkets(eventTicker, homeCode, awayCode);
    if (!result) return null;
    return { ...result, eventTicker };
  } catch {
    return null;
  }
}

export async function getKalshiMarkets(
  homeCode: string,
  awayCode: string,
  matchDate: Date
): Promise<KalshiLivePrices | null> {
  const cacheKey = `${homeCode}:${awayCode}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, source: "cache" };
  }

  try {
    // Build candidate event tickers (UTC ±1 day, both team orderings)
    const candidates = buildCandidateEventTickers(homeCode, awayCode, matchDate);

    let foundEventTicker: string | null = null;
    let homeMarket: KalshiRawMarket | null = null;
    let drawMarket: KalshiRawMarket | null = null;
    let awayMarket: KalshiRawMarket | null = null;

    // Try each candidate event ticker in sequence (stop on first hit)
    for (const eventTicker of candidates) {
      // Determine which ordering of teams this ticker uses
      // The last part after the date is the two team codes concatenated
      // We need to figure out which is home and which is away
      const upperTicker = eventTicker.toUpperCase();
      const upperHome = homeCode.toUpperCase();
      const upperAway = awayCode.toUpperCase();

      // Determine actual home/away in this ticker ordering
      const afterPrefix = upperTicker.replace(/^KXFIFAGAME-\d{2}[A-Z]{3}\d{2}/, "");
      let effectiveHome: string;
      let effectiveAway: string;

      if (afterPrefix.startsWith(upperHome)) {
        effectiveHome = homeCode;
        effectiveAway = awayCode;
      } else {
        effectiveHome = awayCode;
        effectiveAway = homeCode;
      }

      const result = await fetchEventMarkets(eventTicker, effectiveHome, effectiveAway);
      if (result) {
        foundEventTicker = eventTicker;
        // Map back to true home/away
        if (effectiveHome === homeCode) {
          homeMarket = result.home;
          drawMarket = result.draw;
          awayMarket = result.away;
        } else {
          homeMarket = result.away;
          drawMarket = result.draw;
          awayMarket = result.home;
        }
        break;
      }
    }

    // Fallback: search open events by series ticker
    if (!foundEventTicker) {
      const fallback = await searchEventsFallback(homeCode, awayCode);
      if (fallback) {
        foundEventTicker = fallback.eventTicker;
        homeMarket = fallback.home;
        drawMarket = fallback.draw;
        awayMarket = fallback.away;
      }
    }

    if (!foundEventTicker) {
      console.log(`[kalshi] no markets found for ${homeCode} vs ${awayCode}`);
      return null;
    }

    console.log(`[kalshi] found ${homeCode} vs ${awayCode} at ${foundEventTicker}`);

    const homeWinPrice = midpoint(homeMarket?.yes_bid_dollars, homeMarket?.yes_ask_dollars, homeMarket?.last_price_dollars);
    const drawPrice    = midpoint(drawMarket?.yes_bid_dollars, drawMarket?.yes_ask_dollars, drawMarket?.last_price_dollars);
    const awayWinPrice = midpoint(awayMarket?.yes_bid_dollars, awayMarket?.yes_ask_dollars, awayMarket?.last_price_dollars);

    const totalVol = parseVolume(homeMarket?.volume_fp) + parseVolume(drawMarket?.volume_fp) + parseVolume(awayMarket?.volume_fp);

    const toDetail = (m: KalshiRawMarket | null): KalshiOutcomeDetail => ({
      bid:    parseDollars(m?.yes_bid_dollars) ?? null,
      ask:    parseDollars(m?.yes_ask_dollars) ?? null,
      last:   parseDollars(m?.last_price_dollars) ?? null,
      volume: parseVolume(m?.volume_fp),
    });

    const result: KalshiLivePrices = {
      home_win:  Math.round(homeWinPrice * 100) / 100,
      draw:      Math.round(drawPrice * 100) / 100,
      away_win:  Math.round(awayWinPrice * 100) / 100,
      volume:    totalVol,
      tickers: {
        home_win: homeMarket?.ticker ?? "",
        draw:     drawMarket?.ticker ?? "",
        away_win: awayMarket?.ticker ?? "",
      },
      detail: {
        home_win: toDetail(homeMarket),
        draw:     toDetail(drawMarket),
        away_win: toDetail(awayMarket),
      },
      source: "live",
    };

    _cache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch {
    console.log(`[kalshi] no markets found for ${homeCode} vs ${awayCode}`);
    return null;
  }
}

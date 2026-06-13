const GAMMA = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 30_000;

export interface GroupWinnerMarket {
  team: string;
  probability: number;
  volume: number;
  bestBid: number;
  bestAsk: number;
}

export interface GroupWinnerData {
  group: string;
  markets: GroupWinnerMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

const _cache = new Map<string, { ts: number; data: GroupWinnerData }>();

export async function getGroupWinnerMarkets(group: string): Promise<GroupWinnerData | null> {
  const key = group.toUpperCase();
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, source: "cache" };
  }

  try {
    const slug = `world-cup-group-${group.toLowerCase()}-winner`;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${GAMMA}/events?slug=${slug}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { events?: unknown[] } | unknown[];
    const events = (json as { events?: unknown[] }).events
      ?? (Array.isArray(json) ? json : []);
    const event = events[0] as {
      markets?: Array<{
        active?: boolean;
        groupItemTitle?: string;
        question?: string;
        outcomePrices?: string;
        volumeNum?: number;
        bestBid?: number;
        bestAsk?: number;
      }>;
      liquidity?: number;
    } | undefined;
    if (!event) return null;

    const rawMarkets = event.markets ?? [];
    const activeMarkets = rawMarkets.filter((m) => m.active !== false);

    const markets: GroupWinnerMarket[] = activeMarkets
      .map((m) => {
        let probability = 0;
        try {
          const prices = JSON.parse(m.outcomePrices ?? '["0","1"]') as string[];
          probability = parseFloat(prices[0]) || 0;
        } catch {
          probability = 0;
        }
        return {
          team: m.groupItemTitle ?? m.question ?? "",
          probability,
          volume: m.volumeNum ?? 0,
          bestBid: m.bestBid ?? 0,
          bestAsk: m.bestAsk ?? 0,
        };
      })
      .sort((a, b) => b.probability - a.probability);

    const result: GroupWinnerData = {
      group: key,
      markets,
      totalLiquidity: event.liquidity ?? 0,
      source: "live",
    };

    _cache.set(key, { ts: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

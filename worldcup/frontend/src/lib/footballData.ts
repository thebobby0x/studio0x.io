// Real match data from football-data.org (free tier).
// Requires FOOTBALL_DATA_API_KEY env var — falls back to null (caller uses simulation).
// Free tier: 10 req/min. Server-side 30s cache keeps us well under that.

const BASE = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 30_000;

// football-data.org status → our internal status
const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "NS",
  TIMED:     "NS",
  IN_PLAY:   "LIVE",
  PAUSED:    "HT",
  FINISHED:  "FT",
  SUSPENDED: "FT",
  POSTPONED: "NS",
  CANCELLED: "NS",
  AWARDED:   "FT",
};

interface FDScore {
  fullTime: { home: number | null; away: number | null };
  halfTime?: { home: number | null; away: number | null };
}

interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  minute?: number;
  score: FDScore;
  homeTeam: { tla: string; shortName: string; name: string };
  awayTeam: { tla: string; shortName: string; name: string };
}

export interface FDMatchResult {
  status: string;
  elapsed: number;
  homeScore: number;
  awayScore: number;
  source: "live" | "cache";
}

// Module-level cache for all today's WC matches
let _matchCache: { ts: number; matches: FDMatch[] } | null = null;

async function fetchToday(apiKey: string): Promise<FDMatch[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5000);

  // Try WC competition (football-data.org code = "WC")
  const res = await fetch(
    `${BASE}/competitions/WC/matches?dateFrom=${today}&dateTo=${today}&season=2026`,
    {
      headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    }
  );

  if (!res.ok) {
    // 404 might mean competition code differs — try without season filter
    if (res.status === 404) {
      const res2 = await fetch(`${BASE}/competitions/WC/matches?dateFrom=${today}&dateTo=${today}`, {
        headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res2.ok) return [];
      const data2 = await res2.json();
      return data2.matches ?? [];
    }
    return [];
  }

  const data = await res.json();
  return data.matches ?? [];
}

function matchTeam(fdTeam: { tla: string; shortName: string; name: string }, code: string): boolean {
  const c = code.toUpperCase();
  return (
    fdTeam.tla?.toUpperCase() === c ||
    fdTeam.shortName?.toUpperCase() === c ||
    fdTeam.name?.toUpperCase().includes(c)
  );
}

function findInList(matches: FDMatch[], homeCode: string, awayCode: string): FDMatchResult | null {
  const match = matches.find(
    (m) => matchTeam(m.homeTeam, homeCode) && matchTeam(m.awayTeam, awayCode)
  );
  if (!match) return null;

  return {
    status:    STATUS_MAP[match.status] ?? "NS",
    elapsed:   match.minute ?? 0,
    homeScore: match.score.fullTime.home ?? 0,
    awayScore: match.score.fullTime.away ?? 0,
    source:    "live",
  };
}

export async function getFDLiveMatch(
  homeCode: string,
  awayCode: string
): Promise<FDMatchResult | null> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return null;

  // Serve from cache if fresh
  if (_matchCache && Date.now() - _matchCache.ts < CACHE_TTL_MS) {
    const result = findInList(_matchCache.matches, homeCode, awayCode);
    return result ? { ...result, source: "cache" } : null;
  }

  try {
    const matches = await fetchToday(apiKey);
    _matchCache = { ts: Date.now(), matches };
    return findInList(matches, homeCode, awayCode);
  } catch {
    return null;
  }
}

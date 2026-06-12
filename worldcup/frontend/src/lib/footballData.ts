// Real match data from football-data.org (free tier).
// Requires FOOTBALL_DATA_API_KEY env var — falls back to null (caller uses simulation).
// Free tier: 10 req/min. 30s server-side cache keeps us well within limits.

const BASE = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 30_000;

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

let _matchCache: { ts: number; matches: FDMatch[] } | null = null;

// Log remaining quota from response headers (visible in Vercel function logs)
function logQuota(headers: Headers) {
  const remaining = headers.get("X-Requests-Available-Minute");
  const reset     = headers.get("X-RequestCounter-Reset");
  if (remaining !== null) {
    console.log(`[football-data.org] requests remaining this minute: ${remaining}${reset ? ` (resets in ${reset}s)` : ""}`);
  }
}

async function fetchToday(apiKey: string): Promise<FDMatch[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ctrl  = new AbortController();
  setTimeout(() => ctrl.abort(), 5000);

  const headers = { "X-Auth-Token": apiKey, Accept: "application/json" };

  // Try with explicit 2026 season first, then without if 404
  for (const qs of [`dateFrom=${today}&dateTo=${today}&season=2026`, `dateFrom=${today}&dateTo=${today}`]) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/competitions/WC/matches?${qs}`, {
        headers,
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      console.error("[football-data.org] fetch error:", e);
      return [];
    }

    logQuota(res.headers);

    if (res.status === 429) {
      console.warn("[football-data.org] rate limited — using simulation fallback");
      return [];
    }

    if (res.status === 404) continue; // try next query variant

    if (!res.ok) {
      console.warn(`[football-data.org] unexpected ${res.status}: ${await res.text().catch(() => "")}`);
      return [];
    }

    const data = await res.json();
    const matches: FDMatch[] = data.matches ?? [];
    console.log(`[football-data.org] fetched ${matches.length} match(es) for ${today}`);
    return matches;
  }

  return [];
}

function matchTeam(fdTeam: { tla: string; shortName: string; name: string }, code: string): boolean {
  const c = code.toUpperCase();
  return (
    fdTeam.tla?.toUpperCase()       === c ||
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

  // Serve from cache if still fresh (avoids burning quota on every 5s poll)
  if (_matchCache && Date.now() - _matchCache.ts < CACHE_TTL_MS) {
    const result = findInList(_matchCache.matches, homeCode, awayCode);
    return result ? { ...result, source: "cache" } : null;
  }

  const matches = await fetchToday(apiKey);
  _matchCache = { ts: Date.now(), matches };
  return findInList(matches, homeCode, awayCode);
}

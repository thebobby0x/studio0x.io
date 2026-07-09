// Live match data from api-football.com.
// Requires API_FOOTBALL_KEY env var — falls back to null (caller uses simulation).
// Free tier: 100 req/day. Per-date in-memory cache keeps us well within limits.

const BASE    = "https://v3.football.api-sports.io";
const LEAGUE  = 1;    // World Cup
const SEASON  = 2026;
const LIVE_TTL_MS   = 120_000;  // 2 min for today's matches
const PAST_TTL_MS   = 3_600_000; // 1 hr for finished dates

const STATUS_MAP: Record<string, string> = {
  NS:   "NS",
  "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET:   "LIVE", BT: "HT", P:   "LIVE",
  FT:   "FT",  AET: "FT", PEN: "FT",
  PST:  "NS",  CANC: "NS", ABD: "NS",
  AWD:  "FT",  WO: "FT",
  SUSP: "LIVE", INT: "LIVE", LIVE: "LIVE",
};

interface AFFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: {
    home: { id: number; name: string; code: string | null };
    away: { id: number; name: string; code: string | null };
  };
  goals: { home: number | null; away: number | null };
}

export interface FDMatchResult {
  status: string;
  elapsed: number;
  homeScore: number;
  awayScore: number;
  source: "live" | "cache";
}

const _cache = new Map<string, { ts: number; fixtures: AFFixture[] }>();

async function fetchForDate(apiKey: string, date: string): Promise<AFFixture[]> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(
      `${BASE}/fixtures?league=${LEAGUE}&season=${SEASON}&date=${date}`,
      { headers: { "x-apisports-key": apiKey, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" }
    );
    if (res.status === 429) { console.warn("[api-football] rate limited"); return []; }
    if (!res.ok) { console.warn(`[api-football] ${res.status} for ${date}`); return []; }
    const json = await res.json();
    const fixtures: AFFixture[] = json.response ?? [];
    console.log(`[api-football] ${fixtures.length} fixture(s) for ${date}`);
    return fixtures;
  } catch (e) {
    console.error("[api-football] fetch error:", e);
    return [];
  }
}

function findInList(fixtures: AFFixture[], homeCode: string, awayCode: string, src: "live" | "cache"): FDMatchResult | null {
  const h = homeCode.toUpperCase();
  const a = awayCode.toUpperCase();
  const f = fixtures.find(
    x => (x.teams.home.code ?? "").toUpperCase() === h && (x.teams.away.code ?? "").toUpperCase() === a
  );
  if (!f) return null;
  return {
    status:    STATUS_MAP[f.fixture.status.short] ?? "NS",
    elapsed:   f.fixture.status.elapsed ?? 0,
    homeScore: f.goals.home ?? 0,
    awayScore: f.goals.away ?? 0,
    source:    src,
  };
}

export async function getFDLiveMatch(
  homeCode: string,
  awayCode: string,
  matchDate: Date
): Promise<FDMatchResult | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  const dateStr = matchDate.toISOString().slice(0, 10);
  const today   = new Date().toISOString().slice(0, 10);
  const ttl     = dateStr < today ? PAST_TTL_MS : LIVE_TTL_MS;

  const cached = _cache.get(dateStr);
  if (cached && Date.now() - cached.ts < ttl) {
    return findInList(cached.fixtures, homeCode, awayCode, "cache");
  }

  const fixtures = await fetchForDate(apiKey, dateStr);
  _cache.set(dateStr, { ts: Date.now(), fixtures });
  return findInList(fixtures, homeCode, awayCode, "live");
}

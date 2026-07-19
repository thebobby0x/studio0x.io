// Real live team statistics from api-football /fixtures/statistics.
// Possession, shots, passes, corners, cards, xG — updates throughout a live
// match, so metric panels can move even at 0-0. Never simulated: returns null
// when the feed has nothing, and callers must render an honest empty state.

export interface TeamLiveStats {
  possession: number | null;    // percent 0-100
  totalShots: number | null;
  shotsOn: number | null;
  shotsOff: number | null;
  blockedShots: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  passes: number | null;
  passAccuracy: number | null;  // percent 0-100
  xg: number | null;
}

export interface FixtureStats {
  home: TeamLiveStats;
  away: TeamLiveStats;
  fetchedAt: string;
}

interface AFStatEntry { type: string; value: number | string | null }
interface AFTeamStats { team: { id: number; name: string }; statistics: AFStatEntry[] }

// api-football stat "type" strings → our keys
const TYPE_MAP: Record<string, keyof TeamLiveStats> = {
  "ball possession":  "possession",
  "total shots":      "totalShots",
  "shots on goal":    "shotsOn",
  "shots off goal":   "shotsOff",
  "blocked shots":    "blockedShots",
  "corner kicks":     "corners",
  "fouls":            "fouls",
  "offsides":         "offsides",
  "yellow cards":     "yellowCards",
  "red cards":        "redCards",
  "goalkeeper saves": "saves",
  "total passes":     "passes",
  "passes %":         "passAccuracy",
  "expected_goals":   "xg",
};

function emptyStats(): TeamLiveStats {
  return {
    possession: null, totalShots: null, shotsOn: null, shotsOff: null,
    blockedShots: null, corners: null, fouls: null, offsides: null,
    yellowCards: null, redCards: null, saves: null, passes: null,
    passAccuracy: null, xg: null,
  };
}

function parseStatValue(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace("%", ""));
  return isNaN(n) ? null : n;
}

function normalize(entries: AFStatEntry[]): TeamLiveStats {
  const out = emptyStats();
  for (const e of entries) {
    const key = TYPE_MAP[e.type.toLowerCase()];
    if (key) out[key] = parseStatValue(e.value);
  }
  return out;
}

// A response where every field is null (pre-kickoff placeholder) counts as
// "no stats yet" — don't light up empty bars.
function hasAnyData(s: TeamLiveStats): boolean {
  return Object.values(s).some((v) => v !== null);
}

// Module-level cache so LiveMatchCard's 5s poll doesn't hammer the API.
const _cache = new Map<number, { ts: number; ttl: number; data: FixtureStats | null }>();

export async function getFixtureStatistics(
  fixtureId: number,
  homeTeamName: string,
  isLive: boolean,
): Promise<FixtureStats | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;

  const cached = _cache.get(fixtureId);
  if (cached && Date.now() - cached.ts < cached.ttl) return cached.data;

  // Live: refresh every 15s. Finished/pre-match: stats barely change — 10 min.
  const ttl = isLive ? 25_000 : 600_000; // live widened 15→25s pre-final (7/19 budget)

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,
      // Shared data cache under the module cache (traffic-independent budget)
      { headers: { "x-apisports-key": key }, signal: ctrl.signal, next: { revalidate: isLive ? 25 : 600 } },
    );
    if (!res.ok) return cached?.data ?? null;

    const json = await res.json();
    const teams: AFTeamStats[] = json.response ?? [];
    if (teams.length < 2) {
      _cache.set(fixtureId, { ts: Date.now(), ttl, data: null });
      return null;
    }

    const homeEntry = teams.find((t) => t.team.name === homeTeamName) ?? teams[0];
    const awayEntry = teams.find((t) => t !== homeEntry) ?? teams[1];
    const home = normalize(homeEntry.statistics ?? []);
    const away = normalize(awayEntry.statistics ?? []);

    const data: FixtureStats | null = (hasAnyData(home) || hasAnyData(away))
      ? { home, away, fetchedAt: new Date().toISOString() }
      : null;

    _cache.set(fixtureId, { ts: Date.now(), ttl, data });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

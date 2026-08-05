// ─────────────────────────────────────────────────────────────────────────────
// Team statistics + match events ingest (api-football).
//
// Two callers, same primitives:
//   · /api/cron/live-sync   — every minute, ONLY for matches actually in play.
//   · /api/cron/ingest-stats — nightly, re-pulls the final (more complete) set
//     for matches that finished, because the provider fills blanks after FT.
//
// TRUTH CONTRACT: a statistic the provider does not report is stored as NULL,
// never 0. "Zero shots on target" and "the feed didn't report shots on target"
// are different claims, and the second one must not be rendered as the first
// (CLAUDE.md CONTENT TRUTH). Every column in MatchStats is nullable for that
// reason and the UI renders null as "—".
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { AF_LEAGUE, isConfigured } from "@/lib/sportConfig";

const AF_BASE = "https://v3.football.api-sports.io";

/** Statuses this codebase stores for a match that is actually being played. */
export const IN_PLAY_STATUSES = ["LIVE", "HT"] as const;

interface AFStatEntry { type: string; value: string | number | null }
interface AFTeamStats { team: { id: number; name: string }; statistics: AFStatEntry[] }

interface AFEvent {
  time: { elapsed: number | null; extra?: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;   // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | ...
  comments?: string | null;
}

async function afFetch(path: string, timeoutMs = 9000): Promise<unknown | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${AF_BASE}${path}`, {
      headers: { "x-apisports-key": apiKey },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** "52%" → 52; 7 → 7; null/"" → null. Never coerces a missing value to 0. */
function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = v.trim().replace("%", "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** api-football stat labels → our column suffixes. Labels are stable but we
 *  match case-insensitively and tolerate the provider's known variants. */
const STAT_KEYS: Record<string, string> = {
  "ball possession": "possession",
  "total shots": "shotsTotal",
  "shots on goal": "shotsOn",
  "shots off goal": "shotsOff",
  "blocked shots": "shotsBlocked",
  "fouls": "fouls",
  "corner kicks": "corners",
  "offsides": "offsides",
  "yellow cards": "yellow",
  "red cards": "red",
  "goalkeeper saves": "saves",
  "passes %": "passAccuracy",
  "passes accurate %": "passAccuracy",
};

function extract(stats: AFStatEntry[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of stats ?? []) {
    const key = STAT_KEYS[(s.type ?? "").trim().toLowerCase()];
    if (!key) continue;
    out[key] = num(s.value);
  }
  return out;
}

export interface StatsIngestResult {
  fixture: number;
  ok: boolean;
  reason?: string;
}

/**
 * Pull /fixtures/statistics for one fixture and upsert MatchStats.
 * `phase` records whether this is a mid-match snapshot or the final set.
 */
export async function ingestFixtureStatistics(
  fixture: number,
  homeAfId: number | null,
  awayAfId: number | null,
  matchId: string,
  phase: "live" | "final",
): Promise<StatsIngestResult> {
  const json = (await afFetch(`/fixtures/statistics?fixture=${fixture}`)) as { response?: AFTeamStats[] } | null;
  const rows = json?.response ?? [];
  if (rows.length === 0) return { fixture, ok: false, reason: "no statistics reported" };

  // Assign sides by api-football team id. Falling back to array order would
  // silently swap home/away whenever the provider reorders the array.
  let homeRow = rows.find((r) => r.team.id === homeAfId);
  let awayRow = rows.find((r) => r.team.id === awayAfId);
  if (!homeRow && !awayRow && rows.length === 2 && homeAfId == null && awayAfId == null) {
    [homeRow, awayRow] = rows; // only when we have no ids at all to match on
  }
  if (!homeRow || !awayRow) return { fixture, ok: false, reason: "could not map statistics to home/away" };

  const h = extract(homeRow.statistics);
  const a = extract(awayRow.statistics);

  const data = {
    matchId,
    possessionHome: h.possession ?? null,       possessionAway: a.possession ?? null,
    shotsTotalHome: h.shotsTotal ?? null,       shotsTotalAway: a.shotsTotal ?? null,
    shotsOnHome: h.shotsOn ?? null,             shotsOnAway: a.shotsOn ?? null,
    shotsOffHome: h.shotsOff ?? null,           shotsOffAway: a.shotsOff ?? null,
    shotsBlockedHome: h.shotsBlocked ?? null,   shotsBlockedAway: a.shotsBlocked ?? null,
    foulsHome: h.fouls ?? null,                 foulsAway: a.fouls ?? null,
    cornersHome: h.corners ?? null,             cornersAway: a.corners ?? null,
    offsidesHome: h.offsides ?? null,           offsidesAway: a.offsides ?? null,
    yellowHome: h.yellow ?? null,               yellowAway: a.yellow ?? null,
    redHome: h.red ?? null,                     redAway: a.red ?? null,
    savesHome: h.saves ?? null,                 savesAway: a.saves ?? null,
    passAccuracyHome: h.passAccuracy ?? null,   passAccuracyAway: a.passAccuracy ?? null,
    phase,
  };

  await prisma.matchStats.upsert({
    where: { fixture },
    create: { fixture, ...data },
    update: data,
  });
  return { fixture, ok: true };
}

/**
 * Pull /fixtures/events and upsert into MatchEventLog.
 *
 * MatchEventLog already models exactly what was asked for (fixture, type,
 * minute, team, player, detail) and carries a stable `eventKey` dedup contract
 * plus `firstSeenAt`, which is load-bearing for the VAR Freeze™ measurement —
 * so events go here rather than into a third, near-duplicate table. `assist` was
 * added for goal providers.
 */
export async function ingestFixtureEvents(fixture: number): Promise<{ fixture: number; written: number; ok: boolean; reason?: string }> {
  const json = (await afFetch(`/fixtures/events?fixture=${fixture}`)) as { response?: AFEvent[] } | null;
  const events = json?.response;
  if (!events) return { fixture, written: 0, ok: false, reason: "events unavailable" };

  let written = 0;
  for (const e of events) {
    const minute = (e.time?.elapsed ?? 0) + (e.time?.extra ?? 0);
    const type = (e.type ?? "").trim();
    const detail = (e.detail ?? "").trim();
    const player = e.player?.name ?? null;
    const assist = e.assist?.name ?? null;
    // Stable dedup key — identical to the existing contract so re-polling a live
    // match upserts in place instead of duplicating every event each minute.
    const eventKey = `${type}|${detail}|${minute}|${player ?? ""}`;
    try {
      await prisma.matchEventLog.upsert({
        where: { fixture_eventKey: { fixture, eventKey } },
        // firstSeenAt is NEVER updated: it records when we first observed the
        // event, which is the whole point of the row.
        create: { fixture, eventKey, minute, type, detail, team: e.team?.name ?? "", player, assist },
        update: { minute, detail, ...(assist ? { assist } : {}) },
      });
      written++;
    } catch {
      /* one bad event must not abort the fixture */
    }
  }
  return { fixture, written, ok: true };
}

export interface LiveSyncResult {
  ok: boolean;
  skipped?: string;
  inWindow: boolean;
  liveMatches: number;
  statsOk: number;
  eventsOk: number;
  apiCalls: number;
  details: Array<{ fixture: number; stats: string; events: string }>;
}

/**
 * Poll every in-play match for statistics + events.
 *
 * Two guards keep the api-football spend proportional to what's actually
 * happening, both of them requested explicitly:
 *   1. Match window — skip entirely unless now is within ±`windowMinutes` of a
 *      scheduled kickoff. Overnight and off-peak polls cost zero calls.
 *   2. In-play only — NS and FT fixtures are never polled here; FT is handled
 *      once by the nightly final pull.
 *
 * Cost per poll = (matches in play) × 2 calls.
 */
export async function syncLiveMatches(windowMinutes = 120): Promise<LiveSyncResult> {
  const result: LiveSyncResult = {
    ok: false, inWindow: false, liveMatches: 0, statsOk: 0, eventsOk: 0, apiCalls: 0, details: [],
  };

  if (!isConfigured()) { result.skipped = "deployment has no league id"; return result; }
  if (!process.env.API_FOOTBALL_KEY) { result.skipped = "API_FOOTBALL_KEY not set"; return result; }

  const now = new Date();
  const windowMs = windowMinutes * 60_000;

  // Guard 1: is any fixture plausibly underway right now?
  const nearby = await prisma.match.count({
    where: {
      leagueId: { in: [AF_LEAGUE, 0] },
      date: { gte: new Date(now.getTime() - windowMs), lte: new Date(now.getTime() + windowMs) },
    },
  });
  result.inWindow = nearby > 0;
  if (!result.inWindow) {
    result.ok = true;
    result.skipped = `no kickoff within ±${windowMinutes}m — skipped to save api-football calls`;
    return result;
  }

  // Guard 2: in-play only.
  const live = await prisma.match.findMany({
    where: { leagueId: { in: [AF_LEAGUE, 0] }, status: { in: [...IN_PLAY_STATUSES] } },
    select: {
      id: true, fixture: true,
      homeTeam: { select: { afTeamId: true } },
      awayTeam: { select: { afTeamId: true } },
    },
  });
  result.liveMatches = live.length;
  if (live.length === 0) { result.ok = true; result.skipped = "no matches in play"; return result; }

  for (const m of live) {
    const [stats, events] = await Promise.all([
      ingestFixtureStatistics(m.fixture, m.homeTeam.afTeamId, m.awayTeam.afTeamId, m.id, "live"),
      ingestFixtureEvents(m.fixture),
    ]);
    result.apiCalls += 2;
    if (stats.ok) result.statsOk++;
    if (events.ok) result.eventsOk++;
    result.details.push({
      fixture: m.fixture,
      stats: stats.ok ? "ok" : (stats.reason ?? "failed"),
      events: events.ok ? `${events.written} event(s)` : (events.reason ?? "failed"),
    });
  }

  result.ok = true;
  return result;
}

/**
 * Post-match: re-pull statistics + events for recently finished fixtures.
 * The provider's final set is more complete than any mid-match snapshot, so
 * these overwrite the live rows and flip `phase` to "final".
 */
export async function ingestFinalStats(sinceHours = 30, limit = 12): Promise<{
  considered: number; statsOk: number; eventsOk: number; apiCalls: number;
  details: Array<{ fixture: number; stats: string; events: string }>;
}> {
  const out = { considered: 0, statsOk: 0, eventsOk: 0, apiCalls: 0, details: [] as Array<{ fixture: number; stats: string; events: string }> };
  if (!isConfigured() || !process.env.API_FOOTBALL_KEY) return out;

  const since = new Date(Date.now() - sinceHours * 3600_000);
  const finished = await prisma.match.findMany({
    where: { leagueId: { in: [AF_LEAGUE, 0] }, status: "FT", date: { gte: since } },
    select: {
      id: true, fixture: true,
      homeTeam: { select: { afTeamId: true } },
      awayTeam: { select: { afTeamId: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  // Skip fixtures already finalised, so a re-run doesn't re-spend calls.
  const done = new Set(
    (await prisma.matchStats.findMany({
      where: { fixture: { in: finished.map((m) => m.fixture) }, phase: "final" },
      select: { fixture: true },
    })).map((r) => r.fixture),
  );

  for (const m of finished) {
    if (done.has(m.fixture)) continue;
    out.considered++;
    const [stats, events] = await Promise.all([
      ingestFixtureStatistics(m.fixture, m.homeTeam.afTeamId, m.awayTeam.afTeamId, m.id, "final"),
      ingestFixtureEvents(m.fixture),
    ]);
    out.apiCalls += 2;
    if (stats.ok) out.statsOk++;
    if (events.ok) out.eventsOk++;
    out.details.push({
      fixture: m.fixture,
      stats: stats.ok ? "ok" : (stats.reason ?? "failed"),
      events: events.ok ? `${events.written} event(s)` : (events.reason ?? "failed"),
    });
  }
  return out;
}

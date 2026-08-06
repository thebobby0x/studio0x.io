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
import {
  publishLifecycle,
  publishMatchEvents,
  type PublishMatchContext,
  type PublishableEvent,
} from "@/lib/eventBus/publishFootball";
import { isBreakingType } from "@/lib/roundtable360/breaking";

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

// ── api-football quota, straight from the provider ──────────────────────────
// Every response carries the account's own accounting:
//   x-ratelimit-requests-limit / -remaining  → DAILY budget
//   X-RateLimit-Limit / -Remaining           → per-MINUTE budget
// We read it rather than counting locally, because a local counter can't see
// calls made by the schedule route, the per-match live route, or another
// serverless instance — and undercounting is how the quota gets exhausted.
//
// This matters more now that live-sync loops within an invocation: at a 3s
// interval a single minute costs ~18 polls instead of 1. CLAUDE.md gotcha #25
// records the 7/18 outage where the daily quota ran out mid-match and the
// platform froze at 51' — this snapshot is what lets the loop stop before that
// happens again.
export interface QuotaSnapshot {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
  observedAt: string | null;
}

let _quota: QuotaSnapshot = {
  dailyLimit: null, dailyRemaining: null, minuteLimit: null, minuteRemaining: null, observedAt: null,
};

export function getQuotaSnapshot(): QuotaSnapshot {
  return { ..._quota };
}

function numHeader(h: Headers, name: string): number | null {
  const v = h.get(name);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

    // Record quota even on a non-OK response — a 429 is exactly when we most
    // need to know, and it still carries the headers.
    const dailyLimit = numHeader(res.headers, "x-ratelimit-requests-limit");
    const dailyRemaining = numHeader(res.headers, "x-ratelimit-requests-remaining");
    const minuteLimit = numHeader(res.headers, "X-RateLimit-Limit");
    const minuteRemaining = numHeader(res.headers, "X-RateLimit-Remaining");
    if (dailyLimit != null || dailyRemaining != null || minuteRemaining != null) {
      _quota = {
        dailyLimit: dailyLimit ?? _quota.dailyLimit,
        dailyRemaining: dailyRemaining ?? _quota.dailyRemaining,
        minuteLimit: minuteLimit ?? _quota.minuteLimit,
        minuteRemaining: minuteRemaining ?? _quota.minuteRemaining,
        observedAt: new Date().toISOString(),
      };
    }

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
export async function ingestFixtureEvents(
  fixture: number,
): Promise<{ fixture: number; written: number; fresh: PublishableEvent[]; ok: boolean; reason?: string }> {
  const json = (await afFetch(`/fixtures/events?fixture=${fixture}`)) as { response?: AFEvent[] } | null;
  const events = json?.response;
  if (!events) return { fixture, written: 0, fresh: [], ok: false, reason: "events unavailable" };

  // Which of these have we seen before? An upsert cannot tell you whether it
  // created or updated, and "is this event NEW" is the entire trigger for
  // automatic commentary — so the known keys are read up front. One indexed
  // query per fixture per poll, against a table we are about to write anyway.
  const known = new Set(
    (
      await prisma.matchEventLog.findMany({
        where: { fixture },
        select: { eventKey: true },
      })
    ).map((r) => r.eventKey),
  );

  let written = 0;
  const fresh: PublishableEvent[] = [];
  for (const e of events) {
    const minute = (e.time?.elapsed ?? 0) + (e.time?.extra ?? 0);
    const type = (e.type ?? "").trim();
    const detail = (e.detail ?? "").trim();
    const player = e.player?.name ?? null;
    const assist = e.assist?.name ?? null;
    // Stable dedup key — identical to the existing contract so re-polling a live
    // match upserts in place instead of duplicating every event each minute.
    const eventKey = `${type}|${detail}|${minute}|${player ?? ""}`;
    const isNew = !known.has(eventKey);
    try {
      await prisma.matchEventLog.upsert({
        where: { fixture_eventKey: { fixture, eventKey } },
        // firstSeenAt is NEVER updated: it records when we first observed the
        // event, which is the whole point of the row.
        create: { fixture, eventKey, minute, type, detail, team: e.team?.name ?? "", player, assist },
        update: { minute, detail, ...(assist ? { assist } : {}) },
      });
      written++;
      // Only report it as fresh once the write actually succeeded — otherwise a
      // failed insert would trigger commentary about an event we did not store,
      // and the next poll would report it as fresh all over again.
      if (isNew) {
        fresh.push({ eventKey, type, detail, minute, team: e.team?.name ?? "", player, assist });
      }
    } catch {
      /* one bad event must not abort the fixture */
    }
  }
  return { fixture, written, fresh, ok: true };
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
  /** Moments published to the event bus this poll (new events + lifecycle). */
  momentsPublished: number;
  /**
   * True when at least one of those moments is worth interrupting the broadcast
   * for (a goal, a red card, kick-off, half-time, full-time). The cron reads
   * this and spends its remaining budget writing the segment immediately —
   * that is what turns the Roundtable from clock-driven into event-driven.
   */
  breaking: boolean;
  /** Human summary of what broke, for the response body and the logs. */
  breakingDetail: string[];
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
    momentsPublished: 0, breaking: false, breakingDetail: [],
  };

  if (!isConfigured()) { result.skipped = "deployment has no league id"; return result; }
  if (!process.env.API_FOOTBALL_KEY) { result.skipped = "API_FOOTBALL_KEY not set"; return result; }

  const now = new Date();
  const windowMs = windowMinutes * 60_000;

  // Everything in the kickoff window, whatever its status. Two jobs at once:
  // the cheap "is anything underway?" guard, and the rows the LIFECYCLE pass
  // needs — kick-off, half-time and full-time are Match.status flips with no
  // feed event behind them, so they can only be seen here.
  const nearby = await prisma.match.findMany({
    where: {
      leagueId: { in: [AF_LEAGUE, 0] },
      date: { gte: new Date(now.getTime() - windowMs), lte: new Date(now.getTime() + windowMs) },
    },
    select: {
      id: true, fixture: true, status: true, elapsed: true,
      homeScore: true, awayScore: true, round: true,
      homeTeam: { select: { afTeamId: true, country: true } },
      awayTeam: { select: { afTeamId: true, country: true } },
    },
  });
  result.inWindow = nearby.length > 0;
  if (!result.inWindow) {
    result.ok = true;
    result.skipped = `no kickoff within ±${windowMinutes}m — skipped to save api-football calls`;
    return result;
  }

  const contextFor = (m: (typeof nearby)[number]): PublishMatchContext => ({
    fixture: m.fixture,
    matchId: m.id,
    status: m.status,
    elapsed: m.elapsed,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homeCountry: m.homeTeam.country ?? "",
    awayCountry: m.awayTeam.country ?? "",
    round: m.round ?? "",
  });

  // ── LIFECYCLE pass ────────────────────────────────────────────────────────
  // DB-only, zero api-football calls. Idempotent by momentKey, so each boundary
  // publishes exactly once per fixture no matter how many times we poll.
  for (const m of nearby) {
    const published = await publishLifecycle(contextFor(m));
    if (!published) continue;
    const { moment, created } = published;
    result.momentsPublished++;

    // Plausibility guard for the one case where a genuinely first observation is
    // still stale news: shipping this code (or a cold deployment) mid-match
    // records kick-off for the first time at, say, 70'. Announcing "we are under
    // way!" an hour into the game would be a visible falsehood, so START only
    // breaks in while the match really has just started. Half-time and full-time
    // need no equivalent guard — those statuses only hold at the boundary.
    const plausible = moment.type !== "START" || m.elapsed <= 10;

    if (created && isBreakingType(moment.type) && plausible) {
      result.breaking = true;
      result.breakingDetail.push(`${moment.type} · fixture ${m.fixture}`);
    }
  }

  // Guard 2: in-play only — the api-football calls are spent here and nowhere else.
  const live = nearby.filter((m) => (IN_PLAY_STATUSES as readonly string[]).includes(m.status));
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

    // Publish ONLY the newly-observed events. Re-publishing a match's whole
    // history every poll would be idempotent but wasteful, and it would make
    // "what just happened" unanswerable.
    if (events.fresh.length > 0) {
      const published = await publishMatchEvents(contextFor(m), events.fresh);
      result.momentsPublished += published.length;
      for (const moment of published) {
        if (!isBreakingType(moment.type)) continue;
        result.breaking = true;
        result.breakingDetail.push(
          `${moment.type} · fixture ${m.fixture} · ${moment.minute}'${moment.entity ? ` · ${moment.entity}` : ""}`,
        );
      }
    }

    result.details.push({
      fixture: m.fixture,
      stats: stats.ok ? "ok" : (stats.reason ?? "failed"),
      events: events.ok
        ? `${events.written} event(s), ${events.fresh.length} new`
        : (events.reason ?? "failed"),
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

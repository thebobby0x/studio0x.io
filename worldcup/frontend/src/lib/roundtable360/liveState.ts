// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the grounding layer.
//
// ONE query over the DB produces everything the show needs: the state of every
// match in play, plus the recent events across ALL of them ranked by the SAME
// significance scorer the event bus uses (`lib/eventBus/significance.ts`), so
// "what should the booth lead with?" is answered by the platform's existing
// cross-game ranking rather than a second, divergent heuristic.
//
// DB-ONLY on purpose. `/api/cron/live-sync` already pays for the api-football
// calls and writes MatchEventLog + Match scores; the roundtable reads what that
// wrote. A show polling every 30s must never add feed calls — that is exactly
// the spend curve that caused the 7/18 quota outage (CLAUDE.md gotcha #25).
//
// CONTENT TRUTH: every string here is a fact already in the database. Nothing is
// derived speculatively, and the prompt built from it carries the invent-bans.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import { scoreMoment } from "@/lib/eventBus/significance";
import type { MomentType } from "@/lib/eventBus/types";

/** How far back an event still counts as "just happened" for the booth. */
export const RECENT_WINDOW_MS = 6 * 60 * 1000;

/** Matches that kicked off more than this long ago cannot still be in play —
 *  the same stale-LIVE guard `/api/live` applies. */
const STALE_LIVE_MS = 4 * 60 * 60 * 1000;

export interface LiveMatchState {
  fixture: number;
  matchId: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeCountry: string;
  awayCountry: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  venue: string;
  city: string;
  round: string;
}

export interface RankedMoment {
  fixture: number;
  /** Stable key — mirrors MatchEventLog.eventKey so a moment is never re-led twice. */
  momentKey: string;
  type: MomentType;
  minute: number;
  team: string;
  player: string | null;
  assist: string | null;
  detail: string;
  significance: number;
  significanceReason: string;
  /** When our polling FIRST observed it — the only wall-clock we can honestly cite. */
  firstSeenAt: string;
}

export interface Live360Context {
  matches: LiveMatchState[];
  moments: RankedMoment[];
  /** Highest-significance moment across every live match, if any. */
  lead: RankedMoment | null;
  /** Kickoff of the next scheduled match when nothing is live. */
  nextKickoff: { fixture: number; matchup: string; utcDate: string } | null;
}

// ── MatchEventLog → moment vocabulary ────────────────────────────────────────
// Faithful to `lib/feed/apiFootball.ts#eventsToMoments`, which decodes the same
// vendor shape: a missed penalty is NOT a goal, cards split by detail, VAR its
// own moment. Anything else (substitutions) is not a moment and is dropped.
function toMomentType(type: string, detail: string): MomentType | null {
  if (type === "Goal") {
    if (detail === "Missed Penalty") return "PENALTY_MISSED";
    if (detail === "Own Goal") return "OWN_GOAL";
    if (detail === "Penalty") return "PENALTY_SCORED";
    return "GOAL";
  }
  if (type === "Card") return detail === "Red Card" ? "RED_CARD" : "YELLOW_CARD";
  if (type === "Var") return "VAR_DECISION";
  return null;
}

/** Every match currently in play, newest kickoff last. */
export async function getLiveMatches(): Promise<LiveMatchState[]> {
  const rows = await prisma.match.findMany({
    where: {
      status: { in: ["LIVE", "HT"] },
      date: { gte: new Date(Date.now() - STALE_LIVE_MS) },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });

  return rows.map((m) => ({
    fixture: m.fixture,
    matchId: m.id,
    home: m.homeTeam.name,
    away: m.awayTeam.name,
    homeCode: m.homeTeam.code,
    awayCode: m.awayTeam.code,
    homeCountry: m.homeTeam.country,
    awayCountry: m.awayTeam.country,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    minute: m.elapsed,
    status: m.status,
    venue: m.venue,
    city: m.city,
    round: m.round,
  }));
}

/**
 * Recent events across ALL supplied fixtures, significance-ranked into one
 * cross-game feed. This is the 0x360 ranking applied to audio: the booth leads
 * with the biggest thing happening ANYWHERE, not the biggest thing in one match.
 */
export async function getRankedMoments(
  matches: LiveMatchState[],
  windowMs = RECENT_WINDOW_MS,
): Promise<RankedMoment[]> {
  if (matches.length === 0) return [];

  const byFixture = new Map(matches.map((m) => [m.fixture, m]));
  const rows = await prisma.matchEventLog.findMany({
    where: {
      fixture: { in: matches.map((m) => m.fixture) },
      firstSeenAt: { gte: new Date(Date.now() - windowMs) },
    },
    orderBy: { firstSeenAt: "desc" },
    take: 60,
  });

  const ranked: RankedMoment[] = [];
  for (const r of rows) {
    const type = toMomentType(r.type, r.detail);
    if (!type) continue;
    const m = byFixture.get(r.fixture);
    if (!m) continue;

    // Grounded significance amplifiers only. Every Leagues Cup fixture is an
    // MLS-vs-Liga-MX meeting by format, so `isRivalry` is true whenever the two
    // clubs come from different countries — a fact, read off the Team rows.
    const { score, reason } = scoreMoment(
      { type, minute: r.minute, source: "real" },
      {
        minute: r.minute,
        fullLength: 90,
        isRivalry:
          Boolean(m.homeCountry) &&
          Boolean(m.awayCountry) &&
          m.homeCountry !== m.awayCountry,
        marginAfter: Math.abs(m.homeScore - m.awayScore),
      },
    );

    ranked.push({
      fixture: r.fixture,
      momentKey: r.eventKey,
      type,
      minute: r.minute,
      team: r.team,
      player: r.player,
      assist: r.assist,
      detail: r.detail,
      significance: score,
      significanceReason: reason,
      firstSeenAt: r.firstSeenAt.toISOString(),
    });
  }

  ranked.sort((a, b) => b.significance - a.significance || b.minute - a.minute);
  return ranked;
}

/** The next scheduled kickoff — powers the "NEXT BROADCAST" off-air state. */
export async function getNextKickoff(): Promise<Live360Context["nextKickoff"]> {
  const m = await prisma.match.findFirst({
    where: { status: "NS", date: { gte: new Date() } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });
  if (!m) return null;
  return {
    fixture: m.fixture,
    matchup: `${m.homeTeam.name} v ${m.awayTeam.name}`,
    utcDate: m.date.toISOString(),
  };
}

/** The full grounded snapshot the generator and the client both read. */
export async function buildLive360Context(fixtureIds?: number[]): Promise<Live360Context> {
  let matches = await getLiveMatches();
  if (fixtureIds?.length) {
    const wanted = new Set(fixtureIds);
    matches = matches.filter((m) => wanted.has(m.fixture));
  }
  const moments = await getRankedMoments(matches);
  const nextKickoff = matches.length === 0 ? await getNextKickoff() : null;
  return { matches, moments, lead: moments[0] ?? null, nextKickoff };
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

function clock(m: LiveMatchState): string {
  return m.status === "HT" ? "half-time" : `${m.minute}'`;
}

/** One line per match — the scoreboard the panel is looking at. */
export function renderMatchBoard(matches: LiveMatchState[]): string {
  if (matches.length === 0) return "No matches are in play right now.";
  return matches
    .map(
      (m) =>
        `· ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} — ${clock(m)}, ${m.round}` +
        `${m.venue ? ` at ${m.venue}` : ""}${m.city ? `, ${m.city}` : ""}` +
        `${m.homeCountry && m.awayCountry ? ` (${m.homeCountry} club v ${m.awayCountry} club)` : ""}`,
    )
    .join("\n");
}

/** The ranked cross-game moment feed, most important first. */
export function renderMomentFeed(moments: RankedMoment[], matches: LiveMatchState[]): string {
  if (moments.length === 0) {
    return "No events have been recorded in the last few minutes across any live match.";
  }
  const label = new Map(matches.map((m) => [m.fixture, `${m.home} v ${m.away}`]));
  return moments
    .slice(0, 12)
    .map((mo) => {
      const who = mo.player ? ` — ${mo.player}` : "";
      const assist = mo.assist ? ` (assist ${mo.assist})` : "";
      return `· [importance ${mo.significance}] ${label.get(mo.fixture) ?? mo.fixture}: ${mo.detail} for ${mo.team} at ${mo.minute}'${who}${assist}`;
    })
    .join("\n");
}

/**
 * The World-Cup callback block.
 *
 * `promptContext.tournamentBrief()` bans naming any other competition, because
 * that ban is what stopped LC26 fixtures being written up as World Cup ties.
 * The owner brief for this show explicitly wants World Cup banter, so the ban is
 * lifted HERE and ONLY HERE, and only as far as a fixed, verified fact list
 * carried in the deployment config. Everything outside that list stays banned.
 */
export function renderCallbackBlock(): string {
  const cb = SPORT.roundtable?.callbackEvent;
  if (!cb) return "";
  return [
    `CALLBACK EVENT — ${cb.name}. This is the ONE other competition you may mention, and only as nostalgia/banter about a past event. These are the ONLY facts about it you may state:`,
    ...cb.facts.map((f) => `· ${f}`),
    `You may NOT state any other ${cb.name} fact — no other scoreline, scorer, minute, appearance, statistic or storyline, and you may never imply the matches being played now are part of it.`,
  ].join("\n");
}

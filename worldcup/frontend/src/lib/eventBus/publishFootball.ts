// ─────────────────────────────────────────────────────────────────────────────
// Football → event bus publisher.
//
// The bus (lib/eventBus/*) was designed as the ONE stream every live consumer
// queries, and until now it had no publishers: `MatchMoment` was created by the
// schema and written by nothing. This is the publisher, and the caller is
// `/api/cron/live-sync` — the route that already pays for the api-football calls
// and writes MatchEventLog. Publishing here costs DB writes only; not one extra
// feed call (CLAUDE.md gotcha #25 — the spend curve is the thing that must not
// grow).
//
// Two kinds of moment are published:
//
//   1. MATCH EVENTS — goals, cards, VAR. Decoded from MatchEventLog rows with
//      the same vendor mapping `roundtable360/liveState.ts` uses, so the two
//      surfaces can never disagree about what a "Missed Penalty" is.
//   2. LIFECYCLE — kickoff, half-time, full-time. These have no MatchEventLog
//      row at all (they are Match.status, not feed events), which is why the
//      Roundtable could never react to them. They matter for commentary: a show
//      that says nothing at kickoff or full-time is obviously not live.
//
// EVERYTHING IS IDEMPOTENT. `momentKey` carries MatchEventLog's stable-dedup
// contract, so re-observing the same event on the next poll upserts in place.
// That is what makes "is this new?" answerable — and "is this new?" is the whole
// trigger for automatic commentary.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import { PrismaMomentStore, momentKey } from "./store";
import type { MatchMoment, MomentType } from "./types";

/** The store, typed to the concrete class so `publish()`'s significance-context
 *  second argument is visible (the MomentStore interface omits it). */
const store = new PrismaMomentStore();

/**
 * api-football event → moment vocabulary.
 *
 * Byte-identical in behaviour to `roundtable360/liveState.ts#toMomentType` and
 * `lib/feed/apiFootball.ts#eventsToMoments`: a missed penalty is NOT a goal,
 * cards split by detail, VAR is its own moment. Substitutions are not moments
 * and are dropped — which is also the brief's "skip yellow cards and subs"
 * instinct, except yellows ARE published (they are real events worth ranking)
 * and simply score too low to break into the show.
 */
export function eventToMomentType(type: string, detail: string): MomentType | null {
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

/** What the publisher needs to know about the match an event belongs to. All of
 *  it is read straight off the Match/Team rows — nothing derived or guessed. */
export interface PublishMatchContext {
  fixture: number;
  matchId: string;
  status: string;
  elapsed: number;
  homeScore: number;
  awayScore: number;
  /** Country of each club. Different countries ⇒ an MLS-v-LigaMX meeting, which
   *  is every Leagues Cup fixture by format — a fact, not an assumption. */
  homeCountry: string;
  awayCountry: string;
  /** Round label, used only to detect knockout stakes. */
  round: string;
}

/** One MatchEventLog row, in the shape this module needs. */
export interface PublishableEvent {
  eventKey: string;
  type: string;
  detail: string;
  minute: number;
  team: string;
  player: string | null;
  assist: string | null;
}

/** Grounded significance amplifiers, read off the match row.
 *
 *  `marginAfter` is the margin AS OBSERVED, which for the goal that just went in
 *  may still be the pre-goal margin (the Match row has another writer). It only
 *  feeds blowout damping in the ranking, so being one goal behind occasionally
 *  shifts a score slightly — it is never shown or spoken as a scoreline. */
function significanceContext(m: PublishMatchContext) {
  return {
    fullLength: 90,
    isKnockout: /final|semi|quarter|round of|knockout|playoff/i.test(m.round),
    isRivalry:
      Boolean(m.homeCountry) && Boolean(m.awayCountry) && m.homeCountry !== m.awayCountry,
    marginAfter: Math.abs(m.homeScore - m.awayScore),
  };
}

/**
 * Which half a minute falls in. Part of the dedup key for lifecycle moments, and
 * honest for events: it is derived from the minute, not invented.
 */
function periodFor(minute: number): string {
  if (minute <= 45) return "1H";
  if (minute <= 90) return "2H";
  return "ET";
}

/**
 * Publish match events (goals/cards/VAR) to the bus.
 *
 * Pass ONLY the events you want considered — `live-sync` passes the ones it just
 * observed for the first time, so a 90-minute match does not re-publish its
 * whole history on every poll. Publishing an already-known event is harmless
 * (the upsert is idempotent), just wasteful.
 */
export async function publishMatchEvents(
  m: PublishMatchContext,
  events: PublishableEvent[],
): Promise<MatchMoment[]> {
  const ctx = significanceContext(m);
  const published: MatchMoment[] = [];

  for (const e of events) {
    const type = eventToMomentType(e.type, e.detail);
    if (!type) continue; // substitutions and anything else the vocabulary omits

    try {
      published.push(
        await store.publish(
          {
            tournamentId: SPORT.id,
            matchId: m.matchId,
            fixture: m.fixture,
            type,
            period: periodFor(e.minute),
            minute: e.minute,
            clockLabel: `${e.minute}'`,
            team: e.team,
            entity: e.player ?? undefined,
            // `detail` is what the store hashes into momentKey. Including the
            // player is what keeps two different scorers in the same minute from
            // collapsing into one moment — the same granularity MatchEventLog's
            // own eventKey has.
            payload: {
              detail: e.player ? `${e.detail} ${e.player}` : e.detail,
              description: e.detail,
              player: e.player,
              assist: e.assist,
              eventKey: e.eventKey,
              // NOT "score after this goal". The Match row is written by a
              // different path (the schedule/live routes), so at the instant we
              // first observe a goal the stored score may not have caught up
              // with it yet. Naming it for what it provably is keeps a
              // half-second race from becoming a false scoreline on a surface
              // (CLAUDE.md CONTENT TRUTH).
              scoreWhenObserved: `${m.homeScore}-${m.awayScore}`,
            },
            source: "real",
          },
          { minute: e.minute, ...ctx },
        ),
      );
    } catch (err) {
      // One bad moment must never abort a fixture's ingest — the same contract
      // ingestFixtureEvents applies to MatchEventLog writes.
      console.warn(`[eventBus/publishFootball] event publish failed (${m.fixture})`, err);
    }
  }
  return published;
}

/**
 * Publish the lifecycle moment implied by a match's CURRENT status.
 *
 * There is no feed event for "the match kicked off" — it is a status flip — so
 * without this the booth has nothing to react to at the three moments a viewer
 * most expects a reaction. Idempotent by momentKey, so calling it on every poll
 * publishes each boundary exactly once per fixture.
 *
 * ── Why the minute is canonical, not the live clock ──────────────────────────
 * momentKey hashes the minute. If full-time published at the real elapsed, a
 * match observed at 90' and again at 94' would create TWO full-time moments and
 * the booth would call the same final whistle twice. So the key carries the
 * canonical boundary (0 / 45 / 90) and the REAL clock rides in `clockLabel` and
 * `payload.elapsed`. Nothing is fabricated: the payload is the truth, and the
 * moment genuinely is that period boundary.
 */
export async function publishLifecycle(
  m: PublishMatchContext,
): Promise<{ moment: MatchMoment; created: boolean } | null> {
  let type: MomentType;
  let minute: number;
  let detail: string;

  switch (m.status) {
    case "LIVE":
      // Only the START boundary is published from LIVE; there is no "still
      // playing" moment. Idempotency means this fires once, at first sighting.
      type = "START";
      minute = 0;
      detail = "kick-off";
      break;
    case "HT":
      type = "PERIOD_END";
      minute = 45;
      detail = "half-time";
      break;
    case "FT":
    case "AET":
    case "PEN":
      type = "END";
      minute = 90;
      detail = "full-time";
      break;
    default:
      return null; // NS, PST, CANC — nothing to announce
  }

  const input = {
    tournamentId: SPORT.id,
    matchId: m.matchId,
    fixture: m.fixture,
    type,
    period: type === "START" ? "1H" : type === "PERIOD_END" ? "1H" : ("2H" as string),
    minute,
    clockLabel: m.elapsed > 0 ? `${m.elapsed}'` : detail,
    payload: {
      detail,
      description: detail,
      elapsed: m.elapsed,
      status: m.status,
      scoreAtBoundary: `${m.homeScore}-${m.awayScore}`,
    },
    source: "real" as const,
  };

  try {
    // Did this boundary already exist? The caller uses the answer to decide
    // whether to INTERRUPT THE BROADCAST, so it has to be exact rather than
    // inferred from a timestamp. `publishedAt` cannot answer it: it is written
    // by the database clock, which is not the clock this process compares
    // against, and a "is it less than N seconds old?" heuristic re-fires every
    // cron invocation inside that window — announcing the same kick-off twice.
    //
    // The key comes from the store's own function rather than being rebuilt
    // here, so this check can never drift from the row it is checking for.
    const key = momentKey(input);
    const existing = await prisma.matchMoment.findUnique({
      where: {
        tournamentId_fixture_momentKey: {
          tournamentId: input.tournamentId,
          fixture: input.fixture,
          momentKey: key,
        },
      },
      select: { id: true },
    });

    const moment = await store.publish(input, { minute, ...significanceContext(m) });
    return { moment, created: existing == null };
  } catch (err) {
    console.warn(`[eventBus/publishFootball] lifecycle publish failed (${m.fixture})`, err);
    return null;
  }
}

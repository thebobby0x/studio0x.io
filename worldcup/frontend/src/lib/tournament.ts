// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for tournament dates + countdown helpers. Every
// component that shows a date, a "days until" headline, or a kickoff countdown
// MUST import from here so the numbers agree everywhere.
//
// Before this module existed, bracket/schedule/banner/pulse each hardcoded their
// own dates and rolled their own date math (some Math.ceil, some Math.floor),
// which produced different countdowns for the same event in different areas.
//
// The DATES themselves moved to the deployment config on 8/4 (SPORT.calendar).
// They were hardcoded to WC26's June–July windows, so the Leagues Cup
// deployment classified its August club fixtures against World Cup knockout
// windows — every LC26 fixture fell outside every window and the bracket/stage
// surfaces had nothing to say. The exported names and semantics are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { SPORT } from "@/lib/sportConfig";

/** Round labels are per-deployment now (WC26 has R32→Final; LC26's knockout
 *  rounds are not published by the feed yet), so this is a plain string. */
export type KnockoutRound = string;

const CAL = SPORT.calendar;

export const TOURNAMENT_START = new Date(CAL.start); // opening event
export const GROUP_STAGE_END = new Date(CAL.groupStageEnd);
export const KNOCKOUT_START = new Date(CAL.knockoutStart);
export const FINAL_DATE = new Date(CAL.end);

export const ROUND_DATES: { round: KnockoutRound; from: Date; to: Date }[] =
  CAL.rounds.map((r) => ({ round: r.round, from: new Date(r.from), to: new Date(r.to) }));

export const ALL_ROUNDS: KnockoutRound[] = ROUND_DATES.map((r) => r.round);

/** Expected event counts per round (bracket padding). Empty when the deployment
 *  has no published knockout structure — callers must handle a missing key. */
export const ROUND_SIZES: Record<KnockoutRound, number> = Object.fromEntries(
  CAL.rounds.filter((r) => r.size != null).map((r) => [r.round, r.size!]),
);

/** Total scheduled events for this deployment (WC26: 104, LC26 league phase: 54). */
export const TOTAL_EVENTS = CAL.totalEvents;

export function classifyRound(date: Date): KnockoutRound | null {
  for (const entry of ROUND_DATES) {
    if (date >= entry.from && date <= entry.to) return entry.round;
  }
  return null;
}

// A match counts as "in progress" for hero/featured selection when the feed says
// LIVE/HT, OR its kickoff time has passed and it isn't finished yet. The second
// case covers the api-football lag right after kickoff, when a game that's really
// underway still reads NS — so a live game always wins the hero slot immediately.
// Bounded to a match-length window (150 min) so a stale/postponed NS fixture
// doesn't masquerade as live indefinitely.
const MATCH_WINDOW_MS = 150 * 60_000;

export function isMatchInProgress(status: string, kickoffMs: number, nowMs: number = Date.now()): boolean {
  if (status === "LIVE" || status === "HT") return true;
  if (status === "NS") {
    const since = nowMs - kickoffMs;
    return since >= 0 && since < MATCH_WINDOW_MS;
  }
  return false;
}

// ── Countdown helpers (the ONE rounding rule everyone shares) ─────────────────

/**
 * Whole days from `now` until `target`, rounded UP. "N days until" semantics:
 * any fraction of a day remaining counts as a day. Returns 0 once the target
 * has passed. Use this for every "in N days" / "locks in N days" headline.
 */
export function daysUntil(target: Date, now: Date = new Date()): number {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/**
 * Shared kickoff-countdown formatter for "next match" tickers (schedule, nav
 * banner, pulse). One implementation → all surfaces show the same breakdown.
 * Beyond `dateCliffDays` it returns a calendar date instead of a long count.
 */
export function formatKickoffCountdown(
  utcDate: string | Date,
  now: number = Date.now(),
  opts: { withPrefix?: boolean; dateCliffDays?: number } = {}
): { label: string; urgent: boolean } {
  const { withPrefix = false, dateCliffDays = 7 } = opts;
  const target = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  const diff = target.getTime() - now;
  if (diff <= 0) return { label: "Kick off", urgent: false };

  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = withPrefix ? "in " : "";

  if (d >= dateCliffDays) {
    return {
      label: target.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      urgent: false,
    };
  }
  if (d > 0) return { label: `${p}${d}d ${h}h`, urgent: false };
  if (h > 0) return { label: `${p}${h}h ${m}m`, urgent: false };
  return { label: `${p}${m}m`, urgent: d === 0 && h === 0 };
}

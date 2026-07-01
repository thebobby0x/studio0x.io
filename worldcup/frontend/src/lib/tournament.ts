// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for FIFA World Cup 2026 tournament dates + countdown
// helpers. Every component that shows a date, a "days until" headline, or a
// kickoff countdown MUST import from here so the numbers agree everywhere.
//
// Before this module existed, bracket/schedule/banner/pulse each hardcoded their
// own dates and rolled their own date math (some Math.ceil, some Math.floor),
// which produced different countdowns for the same event in different areas.
// ─────────────────────────────────────────────────────────────────────────────

export type KnockoutRound =
  | "Round of 32"
  | "Round of 16"
  | "Quarter-finals"
  | "Semi-finals"
  | "3rd Place Final"
  | "Final";

// All dates are UTC. These mirror the seeded fixture dates in the DB — do not
// change them without re-seeding, since bracket round classification keys off
// these exact windows.
export const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z"); // opening match
export const GROUP_STAGE_END = new Date("2026-07-02T23:59:59Z");  // last group day
export const KNOCKOUT_START = new Date("2026-07-03T00:00:00Z");   // R32 kick-off
export const FINAL_DATE = new Date("2026-07-19T00:00:00Z");

export const ROUND_DATES: { round: KnockoutRound; from: Date; to: Date }[] = [
  { round: "Round of 32",     from: new Date("2026-07-03T00:00:00Z"), to: new Date("2026-07-05T23:59:59Z") },
  { round: "Round of 16",     from: new Date("2026-07-06T00:00:00Z"), to: new Date("2026-07-09T23:59:59Z") },
  { round: "Quarter-finals",  from: new Date("2026-07-10T00:00:00Z"), to: new Date("2026-07-11T23:59:59Z") },
  { round: "Semi-finals",     from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-14T23:59:59Z") },
  { round: "3rd Place Final", from: new Date("2026-07-17T00:00:00Z"), to: new Date("2026-07-17T23:59:59Z") },
  { round: "Final",           from: new Date("2026-07-19T00:00:00Z"), to: new Date("2026-07-19T23:59:59Z") },
];

export const ALL_ROUNDS: KnockoutRound[] = ROUND_DATES.map((r) => r.round);

// Expected match counts per round (WC 2026 48-team format)
export const ROUND_SIZES: Record<KnockoutRound, number> = {
  "Round of 32": 16,
  "Round of 16": 8,
  "Quarter-finals": 4,
  "Semi-finals": 2,
  "3rd Place Final": 1,
  "Final": 1,
};

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

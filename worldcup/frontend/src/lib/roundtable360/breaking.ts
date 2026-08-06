// ─────────────────────────────────────────────────────────────────────────────
// Breaking-news detection — the trigger that makes the Roundtable EVENT-driven
// instead of clock-driven.
//
// THE PROBLEM THIS SOLVES. Until now a segment was written whenever the client
// polled and the 25s cooldown had lapsed. That is a metronome, not a broadcast:
// a 3rd-minute goal waited for the current segment to finish (~60-90s of
// dialogue), then a poll, then generation. The booth found out about the goal
// roughly a minute and a half after the crowd did.
//
// Now: `/api/cron/live-sync` publishes every observed event to the event bus,
// and anything in BREAKING_TYPES that the current segment has not covered is a
// cue. A cue (a) lets live-sync spend its remaining budget writing the segment
// immediately, (b) collapses the generator's cooldown to a short floor, and
// (c) tells the player to cut in rather than finish the episode it is on.
//
// ── WHY A TYPE ALLOWLIST AND NOT A SIGNIFICANCE THRESHOLD ────────────────────
// Significance is the right tool for RANKING moments and the wrong one for
// GATING them. Scored with the LC26 rivalry amplifier, half-time lands at 24 and
// a yellow card at 26 — so any single threshold that lets half-time interrupt
// the show also lets every yellow card interrupt it, which is precisely the
// behaviour the brief rules out. The allowlist decides WHETHER a moment breaks
// in; significance decides WHICH one leads when several land together.
// ─────────────────────────────────────────────────────────────────────────────

import type { MomentType } from "@/lib/eventBus/types";

/**
 * The moments worth interrupting a segment for.
 *
 * Goals, red cards and the three lifecycle boundaries, per the build brief.
 * Deliberately ABSENT:
 *   · YELLOW_CARD — too frequent; the show would never talk about anything else.
 *   · substitutions — never published as moments at all.
 *   · VAR_DECISION — the brief did not list it, and VAR rows arrive in bursts
 *     (one per review stage). It still reaches the prompt through the ranked
 *     moment feed, so the panel discusses it; it just does not seize the mic.
 *     Worth revisiting once there is live data on how often the feed emits it.
 */
export const BREAKING_TYPES: MomentType[] = [
  "GOAL",
  "OWN_GOAL",
  "EQUALISER",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "LEAD_CHANGE",
  "RED_CARD",
  "START",
  "PERIOD_END",
  "END",
];

const BREAKING_SET = new Set<string>(BREAKING_TYPES);

export function isBreakingType(type: string | null | undefined): boolean {
  return type != null && BREAKING_SET.has(type);
}

/** How far back a moment can be and still count as "just happened". Matches the
 *  booth's own recency window so the cue and the script agree on what is news. */
export const BREAKING_WINDOW_MS = 6 * 60 * 1000;

export interface BreakingCue {
  fixture: number;
  /** `${fixture}|${momentKey}` — the same shape Live360Episode.leadMomentKey
   *  stores, so "has this already been covered?" is a string comparison. */
  key: string;
  type: MomentType;
  minute: number;
  clockLabel: string | null;
  team: string | null;
  entity: string | null;
  detail: string;
  significance: number;
  /** When our polling first observed it — the only wall-clock we can honestly
   *  cite, and what the player compares against to decide "is this new to me?" */
  firstSeenAt: string;
}

/**
 * Has the segment currently on air already broken this cue?
 *
 * Two independent guards, because they fail differently:
 *   · leadMomentKey match — that segment LED with this exact moment.
 *   · generatedAt is newer than the moment — the segment was written after the
 *     moment landed, so its DATA block already contained it even if the panel
 *     chose to lead with something else.
 * Without the second guard a goal the booth mentioned in passing would re-cue
 * forever, because it would never become the lead.
 *
 * WHICH episode you pass matters, and the two callers pass different ones:
 *   · the generator passes the LATEST episode — "has this been written about?"
 *   · the player passes the episode it is AIRING — "has the listener heard it?"
 * Those diverge for the ~20s between a segment being written and being played,
 * which is exactly the window in which a cut-in decision gets made.
 */
export function cueIsCovered(
  cue: Pick<BreakingCue, "key" | "firstSeenAt">,
  episode: { leadMomentKey: string | null; generatedAt: string } | null,
): boolean {
  if (!episode) return false;
  if (episode.leadMomentKey === cue.key) return true;
  return new Date(episode.generatedAt).getTime() > new Date(cue.firstSeenAt).getTime();
}

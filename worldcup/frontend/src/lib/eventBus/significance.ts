// ─────────────────────────────────────────────────────────────────────────────
// Significance scoring — turns a raw moment into a 0–100 cross-game importance
// score. This is what lets 0x360 auto-rank moments from N concurrent matches into
// ONE feed ("show me the biggest thing happening anywhere right now") and lets the
// Roundtable trigger on the biggest moment across all matches.
//
// PURE + transparent: base weight per moment type × context multipliers, each a
// named const so tuning is one edit. Returns the score AND a human reason string
// (shown in the feed so ranking is never a black box). No data invented — every
// input is a fact the publisher already holds.
// ─────────────────────────────────────────────────────────────────────────────

import type { MomentType, MatchMomentInput } from "./types";

/** Base importance of a moment type before context. 0–100 pre-multiplier. */
const BASE_WEIGHT: Partial<Record<MomentType, number>> = {
  GOAL: 60,
  OWN_GOAL: 62,
  EQUALISER: 66,
  LEAD_CHANGE: 74,
  PENALTY_AWARDED: 58,
  PENALTY_SCORED: 64,
  PENALTY_MISSED: 70,
  SHOOTOUT_KICK: 72,
  RED_CARD: 68,
  VAR_DECISION: 55,
  YELLOW_CARD: 22,
  METRIC_SPIKE: 40,
  START: 30,
  PERIOD_END: 20,
  END: 45,
  PENALTY: 40,
  // motorsport (weights provisional — F1 stage will tune)
  OVERTAKE: 50,
  PIT_STOP: 38,
  FASTEST_LAP: 44,
  CRASH: 78,
  DNF: 66,
  SAFETY_CAR: 58,
  CHEQUERED_FLAG: 45,
};

/** Context that amplifies a moment beyond its base type. All optional + grounded. */
export interface SignificanceContext {
  /** Match minute (or lap) — late drama scores higher. */
  minute?: number;
  /** Typical full length (90 for football, race laps for F1) — for the late curve. */
  fullLength?: number;
  /** Knockout / elimination stakes. */
  isKnockout?: boolean;
  /** Cross-border/rivalry meeting (MLS↔LigaMX) — the LC26 amplifier. */
  isRivalry?: boolean;
  /** Goal/result went against pre-match favorite (upset flavor). */
  isUpset?: boolean;
  /** Absolute goal margin after the moment — blowouts matter less. */
  marginAfter?: number;
}

const LATE_GAME_MULT = 1.35; // last ~15% of regulation
const STOPPAGE_MULT = 1.5; // beyond full length (90'+, ET, final laps)
const KNOCKOUT_MULT = 1.25;
const RIVALRY_MULT = 1.2;
const UPSET_MULT = 1.15;
const BLOWOUT_DAMP = 0.8; // margin ≥ 3 dampens

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function scoreMoment(
  m: Pick<MatchMomentInput, "type" | "minute" | "source">,
  ctx: SignificanceContext = {},
): { score: number; reason: string } {
  // Reconstructed/simulated moments never rank — they must not lead a live feed.
  if (m.source === "reconstructed") {
    return { score: 0, reason: "reconstructed (not feed-ranked)" };
  }

  let score = BASE_WEIGHT[m.type] ?? 30;
  const reasons: string[] = [];

  const minute = ctx.minute ?? m.minute;
  const full = ctx.fullLength ?? 90;
  if (minute != null) {
    if (minute > full) {
      score *= STOPPAGE_MULT;
      reasons.push("stoppage/extra time");
    } else if (minute >= full * 0.85) {
      score *= LATE_GAME_MULT;
      reasons.push("late");
    }
  }
  if (ctx.isKnockout) {
    score *= KNOCKOUT_MULT;
    reasons.push("knockout");
  }
  if (ctx.isRivalry) {
    score *= RIVALRY_MULT;
    reasons.push("rivalry");
  }
  if (ctx.isUpset) {
    score *= UPSET_MULT;
    reasons.push("upset");
  }
  if (ctx.marginAfter != null && ctx.marginAfter >= 3) {
    score *= BLOWOUT_DAMP;
    reasons.push("blowout");
  }

  const label = m.type.toLowerCase().replace(/_/g, " ");
  const reason = reasons.length ? `${label} — ${reasons.join(", ")}` : label;
  return { score: Math.round(clamp(score)), reason };
}

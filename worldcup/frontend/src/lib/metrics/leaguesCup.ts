// ─────────────────────────────────────────────────────────────────────────────
// Leagues Cup 2026 — proprietary ™ metric formulas (v1 DRAFTS for owner approval)
//
// These are the new metrics from BK's LC26 note #6. They are PURE functions over
// explicit, minimal input shapes so the math is reviewable in isolation and unit-
// testable without any live data. When wired, a thin adapter maps app data
// (goal events, WC26 baseline rows, roster) → these inputs.
//
// CONTENT TRUTH: every metric computes ONLY from real provided inputs. A metric
// returns `null` when it lacks the data to be honest (never a fabricated 0).
// Design language is unchanged — gold-badge proprietary metric, studio0x mono
// subtitle; only the math is LC26-specific.
//
// Formulas are v1 and explicitly labeled draft — BK approves/edits before these
// surface. Weights live in named consts so tuning is one edit.
// ─────────────────────────────────────────────────────────────────────────────

/** Which cross-border league a club belongs to. */
export type League = "MLS" | "LigaMX";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ── Border Clash Index™ ─────────────────────────────────────────────────────
// MLS-vs-Liga-MX dominance in a single cross-border match. Same-league matchups
// return null (the metric only means something across the border).
export interface BorderClashInput {
  homeLeague: League;
  awayLeague: League;
  homeGoals: number;
  awayGoals: number;
  /** true once the match is final (a lead mid-match isn't "dominance" yet). */
  isFinal: boolean;
}
const BORDER_GOAL_W = 12; // points per goal of margin
const BORDER_RESULT_W = 28; // win bonus on top of margin
export function borderClashIndex(m: BorderClashInput): { value: number; favors: League } | null {
  if (m.homeLeague === m.awayLeague) return null; // not a cross-border clash
  if (!m.isFinal) return null;
  const margin = m.homeGoals - m.awayGoals; // + → home league ahead
  if (margin === 0) return { value: 50, favors: m.homeLeague }; // dead heat, neutral
  const favors = margin > 0 ? m.homeLeague : m.awayLeague;
  const raw = 50 + Math.sign(margin) * (BORDER_RESULT_W + Math.abs(margin) * BORDER_GOAL_W);
  // Express as 50→100 strength for the favored league.
  return { value: clamp(50 + Math.abs(raw - 50)), favors };
}

// ── Cross-Border Pedigree™ ──────────────────────────────────────────────────
// A club's roster strength weighted by its players' WORLD-CUP pedigree.
// Higher = more WC-proven talent on the teamsheet.
export interface PlayerPedigree {
  wcMinutes: number; // minutes played at WC26
  wcGoals: number;
  caps: number; // senior national-team caps
}
const PED_MIN_W = 0.02; // per WC minute
const PED_GOAL_W = 4; // per WC goal
const PED_CAP_W = 0.15; // per cap
export function crossBorderPedigree(roster: PlayerPedigree[]): number | null {
  if (!roster.length) return null;
  const raw = roster.reduce(
    (s, p) => s + p.wcMinutes * PED_MIN_W + p.wcGoals * PED_GOAL_W + p.caps * PED_CAP_W,
    0,
  );
  return Math.round(raw); // un-clamped index; compare across clubs
}

// ── WC Carryover™ ───────────────────────────────────────────────────────────
// A player's LC26 scoring form indexed to their WC26 form (per-90). >1 = arriving
// hotter than the World Cup; <1 = cooler. null if either sample is too small.
export interface CarryoverInput {
  lc26Goals: number;
  lc26Minutes: number;
  wc26Goals: number;
  wc26Minutes: number;
}
const MIN_SAMPLE_MINUTES = 90; // need at least a full match each side to be honest
export function wcCarryover(p: CarryoverInput): { ratio: number; lc26Per90: number; wc26Per90: number } | null {
  if (p.lc26Minutes < MIN_SAMPLE_MINUTES || p.wc26Minutes < MIN_SAMPLE_MINUTES) return null;
  const lc26Per90 = (p.lc26Goals / p.lc26Minutes) * 90;
  const wc26Per90 = (p.wc26Goals / p.wc26Minutes) * 90;
  if (wc26Per90 === 0) return null; // can't index against a zero baseline honestly
  return { ratio: +(lc26Per90 / wc26Per90).toFixed(2), lc26Per90: +lc26Per90.toFixed(2), wc26Per90: +wc26Per90.toFixed(2) };
}

// ── National Mirror™ ────────────────────────────────────────────────────────
// The LC26 note #3 inversion: a NATION's output from its players across LC26
// CLUBS, mirrored against that nation's WC26 output. Returns the deltas.
export interface NationTotals {
  goals: number;
  assists: number;
  minutes: number;
}
export function nationalMirror(lc26: NationTotals, wc26: NationTotals): {
  goalsDelta: number;
  assistsDelta: number;
  lc26GoalsPer90: number | null;
  wc26GoalsPer90: number | null;
} {
  const per90 = (g: number, min: number) => (min >= MIN_SAMPLE_MINUTES ? +((g / min) * 90).toFixed(2) : null);
  return {
    goalsDelta: lc26.goals - wc26.goals,
    assistsDelta: lc26.assists - wc26.assists,
    lc26GoalsPer90: per90(lc26.goals, lc26.minutes),
    wc26GoalsPer90: per90(wc26.goals, wc26.minutes),
  };
}

// ── Rivalry Heat™ ───────────────────────────────────────────────────────────
// Intensity of a matchup: fouls + cards + lead changes, amplified for
// cross-border (MLS↔LigaMX) meetings. Normalized 0–100.
export interface RivalryHeatInput {
  fouls: number;
  yellows: number;
  reds: number;
  leadChanges: number;
  crossBorder: boolean;
}
const HEAT_FOUL_W = 1.2;
const HEAT_YELLOW_W = 6;
const HEAT_RED_W = 15;
const HEAT_LEADCHANGE_W = 8;
const HEAT_CROSSBORDER_MULT = 1.25;
export function rivalryHeat(m: RivalryHeatInput): number {
  const base =
    m.fouls * HEAT_FOUL_W +
    m.yellows * HEAT_YELLOW_W +
    m.reds * HEAT_RED_W +
    m.leadChanges * HEAT_LEADCHANGE_W;
  return Math.round(clamp(base * (m.crossBorder ? HEAT_CROSSBORDER_MULT : 1)));
}

// ── Summit Path™ ────────────────────────────────────────────────────────────
// Knockout survival difficulty: remaining-opponent strength × how deep the run is.
// strengthOfField is a 0–1 normalized opponent-quality figure supplied by caller.
export interface SummitPathInput {
  roundsRemaining: number; // rounds left to win the trophy
  strengthOfField: number; // 0–1, avg quality of possible remaining opponents
}
export function summitPath(p: SummitPathInput): number | null {
  if (p.roundsRemaining <= 0) return null; // already champions / eliminated
  if (p.strengthOfField < 0 || p.strengthOfField > 1) return null;
  // Each round compounds; deeper + stronger field = higher difficulty.
  const raw = (1 - Math.pow(1 - p.strengthOfField, p.roundsRemaining)) * 100;
  return Math.round(clamp(raw));
}

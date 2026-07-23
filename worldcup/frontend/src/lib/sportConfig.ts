// ─────────────────────────────────────────────────────────────────────────────
// sportConfig — the ONE place a deployment's sport/tournament identity lives.
//
// podiumMetrics is the sport-agnostic PLATFORM; each deployment (World Cup 26,
// Leagues Cup 2026, WWC27, …) is the SAME code with a different config object.
// This file is Phase 1 of the extraction plan (docs/extraction-plan.md §Phase 1):
// pull the copy-pasted `league=1 / season=2026` constants (defined 2×, plus raw
// literals in 3 more routes — the postmortem's "diverged constant") into a single
// exported config, selected by the TOURNAMENT env var.
//
// SAFETY: the default is WORLDCUP with the exact values the app used before, so
// wiring existing call sites through this is behavior-preserving for the live
// WC26 deployment. Leagues-Cup values are placeholders until the api-football
// league id + coverage are confirmed (see docs/leaguescup-build-plan.md).
// ─────────────────────────────────────────────────────────────────────────────

/** What a "team" is in this competition — drives nation-vs-club feature paths. */
export type EntityKind = "nation" | "club";

/** Anthem module mode — national anthems (WC), club songs (Leagues Cup), or off. */
export type AnthemMode = "national" | "club" | "off";

/** Travel/pulse feature framing. */
export type TravelMode = "fan-origin" | "team-staff" | "off";

export interface SportConfig {
  /** Stable internal id for this deployment. Never user-facing. */
  id: "worldcup" | "leaguescup";
  /** Feed provider — soccer deployments use api-football. */
  feedProvider: "api-football";
  /** api-football league id. */
  leagueId: number;
  /** api-football season. */
  season: number;
  /** Human tournament name for AI-prompt/editorial context (nominative use). */
  eventName: string;
  /** In-app brand subtitle, e.g. "podiumMetrics – Leagues Cup 2026". Brand stays "podiumMetrics". */
  brandSubtitle: string;
  /** Are the competing entities nations or clubs? */
  entityKind: EntityKind;
  /** Feature toggles — flip nation-specific surfaces off for a club tournament. */
  features: {
    anthems: AnthemMode;
    travel: TravelMode;
    /** Cross-tournament comparison (e.g. LC26 national-mirror vs WC26 baseline). */
    crossTournamentCompare: boolean;
  };
}

// ── World Cup 2026 — the reference deployment (current live values) ──────────────
export const WORLDCUP: SportConfig = {
  id: "worldcup",
  feedProvider: "api-football",
  leagueId: 1, // FIFA World Cup
  season: 2026,
  eventName: "World Cup 2026",
  brandSubtitle: "podiumMetrics – World Cup 26",
  entityKind: "nation",
  features: {
    anthems: "national",
    travel: "fan-origin",
    crossTournamentCompare: false,
  },
};

// ── Leagues Cup 2026 — MLS × Liga MX (club tournament) ───────────────────────────
// leagueId is a PLACEHOLDER (0) until BK confirms the api-football id + coverage.
// Guardrail: isConfigured() returns false while leagueId <= 0, so no feed call ever
// fires against a bogus league. Set LEAGUES_CUP_LEAGUE_ID env (or edit here) once known.
export const LEAGUES_CUP: SportConfig = {
  id: "leaguescup",
  feedProvider: "api-football",
  leagueId: Number(process.env.LEAGUES_CUP_LEAGUE_ID ?? 0),
  season: Number(process.env.LEAGUES_CUP_SEASON ?? 2026),
  eventName: "Leagues Cup 2026",
  brandSubtitle: "podiumMetrics – Leagues Cup 2026",
  entityKind: "club",
  features: {
    anthems: "club", // club songs (owner has an Inter Miami track; more via Suno)
    travel: "team-staff", // team + support-staff travel, not fan origin
    crossTournamentCompare: true, // national-mirror vs WC26 baseline
  },
};

const REGISTRY = { worldcup: WORLDCUP, leaguescup: LEAGUES_CUP } as const;

/**
 * The active deployment config. Selected by the TOURNAMENT env var
 * (default "worldcup" so the live WC26 deployment is unchanged).
 */
export const SPORT: SportConfig =
  REGISTRY[(process.env.TOURNAMENT as keyof typeof REGISTRY) ?? "worldcup"] ?? WORLDCUP;

/** True once the deployment has a real league id (guards feed calls). */
export function isConfigured(cfg: SportConfig = SPORT): boolean {
  return Number.isInteger(cfg.leagueId) && cfg.leagueId > 0;
}

// Back-compat drop-ins for the existing `AF_LEAGUE` / `AF_SEASON` constants so
// call sites can switch to the shared config with a one-line change.
export const AF_LEAGUE = SPORT.leagueId;
export const AF_SEASON = SPORT.season;

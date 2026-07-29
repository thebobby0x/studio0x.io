// ─────────────────────────────────────────────────────────────────────────────
// Deployment config — the ONE toggle that drives a podiumMetrics instance.
//
// podiumMetrics is the sport-agnostic ENGINE; each deployment (World Cup 26,
// Leagues Cup 2026, F1 2026, WWC27, …) is the SAME code with a different config.
// NOTHING here is hardcoded to football: sport/eventUnit/scoringEvent/periods/
// capabilities/moment vocabulary all live in this object, so F1 is a CONFIG SWAP
// (see F1_2026 at the bottom), not a fork.
//
// Selected by the TOURNAMENT env var; defaults to WORLDCUP so the live WC26
// deployment is unchanged. isConfigured() guards feed calls until a real league
// id is set. Back-compat exports (SPORT, AF_LEAGUE, AF_SEASON) preserved.
// ─────────────────────────────────────────────────────────────────────────────

import type { MomentType } from "./eventBus/types";

export type Sport = "football" | "motorsport";
export type FeedProvider = "api-football" | "jolpica" | "openf1";
/** What one competitive unit is: a match (football) or a race weekend (F1). */
export type EventUnit = "match" | "race";
/** The atomic scoring act of the sport. */
export type ScoringEvent = "goal" | "overtake";
/** What a "team" is — drives nation-vs-club feature paths. */
export type EntityKind = "nation" | "club" | "constructor";
export type AnthemMode = "national" | "club" | "off";
export type TravelMode = "fan-origin" | "team-staff" | "off";
export type AudioBed = "stadium" | "trackside" | "off";

/** Brand palette for a deployment. `styleGuideConfirmed:false` means the colors
 *  are provisional placeholders (studio0x base tokens) — NOT the licensed brand's
 *  official values. Never present unconfirmed colors as official. */
export interface Branding {
  primary: string;
  secondary: string;
  accent: string;
  styleGuideConfirmed: boolean;
}

export interface DeploymentConfig {
  /** Stable internal id. Never user-facing. */
  id: "worldcup" | "leaguescup" | "f1-2026";
  sport: Sport;
  eventUnit: EventUnit;
  scoringEvent: ScoringEvent;
  /** Ordered period vocabulary — football ["1H","2H","ET"]; F1 ["lap","sector","pitstop"]. */
  periods: string[];
  /** Capability flags — drive which surfaces/moment types are active. Sport-neutral. */
  hasGoals: boolean;
  hasPitstops: boolean;
  /** Proprietary metric ids active for this deployment (definitions live in lib/metrics/*). */
  metrics: string[];
  /** Moment vocabulary this deployment publishes to the event bus. */
  momentTypes: MomentType[];
  /** Ambient audio bed for the live experience. */
  audioBed: AudioBed;
  branding: Branding;
  /** Optional deployment display/mono fonts (defaults to Inter when omitted). */
  fonts?: { display: string; mono: string };

  // ── feed ──
  feedProvider: FeedProvider;
  /** api-football league id (football). For F1 this is the series id on the F1 feed. */
  leagueId: number;
  season: number;

  // ── editorial / branding copy ──
  eventName: string; // nominative-use tournament name for AI prompts
  brandSubtitle: string; // e.g. "podiumMetrics – Leagues Cup 2026"

  entityKind: EntityKind;
  features: {
    anthems: AnthemMode;
    travel: TravelMode;
    crossTournamentCompare: boolean;
  };
}

/** Back-compat alias — earlier code imports `SportConfig`. */
export type SportConfig = DeploymentConfig;

// studio0x base tokens (tailwind design system) — the safe placeholder palette.
const STUDIO0X_BASE: Branding = {
  primary: "#10b981", // brand-green
  secondary: "#0d1828", // brand-card
  accent: "#f59e0b", // brand-gold
  styleGuideConfirmed: true, // WC26 shipped on these
};

// Football moment vocabulary (shared by WC26 + LC26).
const FOOTBALL_MOMENTS: MomentType[] = [
  "START", "END", "PERIOD_END", "LEAD_CHANGE", "PENALTY", "METRIC_SPIKE",
  "GOAL", "OWN_GOAL", "EQUALISER", "PENALTY_AWARDED", "PENALTY_SCORED",
  "PENALTY_MISSED", "SHOOTOUT_KICK", "RED_CARD", "YELLOW_CARD", "VAR_DECISION",
];

// ── World Cup 2026 — the reference deployment (current live values) ──────────────
export const WORLDCUP: DeploymentConfig = {
  id: "worldcup",
  sport: "football",
  eventUnit: "match",
  scoringEvent: "goal",
  periods: ["1H", "2H", "ET"],
  hasGoals: true,
  hasPitstops: false,
  metrics: ["matchDNA", "goalGravity", "upsetFactor", "clutchIndex", "crampIndex"],
  momentTypes: FOOTBALL_MOMENTS,
  audioBed: "stadium",
  branding: STUDIO0X_BASE,
  feedProvider: "api-football",
  leagueId: 1, // FIFA World Cup
  season: 2026,
  eventName: "World Cup 2026",
  brandSubtitle: "podiumMetrics – World Cup 26",
  entityKind: "nation",
  features: { anthems: "national", travel: "fan-origin", crossTournamentCompare: false },
};

// ── Leagues Cup 2026 — MLS × Liga MX (club tournament) ───────────────────────────
// leagueId PLACEHOLDER (0) until BK confirms the api-football id + coverage;
// isConfigured() guards all feed calls while ≤ 0. Branding colors are PLACEHOLDER
// studio0x tokens — styleGuideConfirmed:false until BK provides the LC26 style guide.
export const LEAGUES_CUP: DeploymentConfig = {
  id: "leaguescup",
  sport: "football",
  eventUnit: "match",
  scoringEvent: "goal",
  periods: ["1H", "2H", "ET"], // LC26 goes straight to pens if drawn — ET may be unused; kept for shape
  hasGoals: true,
  hasPitstops: false,
  metrics: ["matchDNA", "crampIndex", "rivalryIndex"], // rivalryIndex = Border Clash Index™ (MLS vs LigaMX)
  momentTypes: FOOTBALL_MOMENTS,
  audioBed: "stadium",
  branding: {
    // studio0x brand tokens for LC26 (owner 7/29): Miami-pink accent, electric-blue
    // accent2, near-black base, Syne/DM Mono. NOT the licensed Leagues Cup marks —
    // styleGuideConfirmed stays false (SUM owns the marks; editorial-only, no logos).
    primary: "#ff2d78", // Miami pink — accent
    secondary: "#0a0a0f", // near-black base
    accent: "#2d9bff", // electric blue — accent2
    styleGuideConfirmed: false,
  },
  fonts: { display: "Syne", mono: "DM Mono" },
  feedProvider: "api-football",
  leagueId: Number(process.env.LEAGUES_CUP_LEAGUE_ID ?? 0),
  season: Number(process.env.LEAGUES_CUP_SEASON ?? 2026),
  eventName: "Leagues Cup 2026",
  brandSubtitle: "podiumMetrics – Leagues Cup 2026",
  entityKind: "club",
  features: { anthems: "club", travel: "team-staff", crossTournamentCompare: true },
};

// ── F1 2026 — the PROOF that the engine is a config swap, not a football app ─────
// Not active yet (registered so the shape is validated by the compiler). When the
// F1 build lands: swap the feed to jolpica/openf1, the entity to constructor, and
// the moment vocabulary to the motorsport set. Zero football assumptions leak.
export const F1_2026: DeploymentConfig = {
  id: "f1-2026",
  sport: "motorsport",
  eventUnit: "race",
  scoringEvent: "overtake",
  periods: ["lap", "sector", "pitstop"],
  hasGoals: false,
  hasPitstops: true,
  metrics: ["overtakeDNA", "tyreGamble", "qualiGap", "pointsMomentum"],
  momentTypes: [
    "START", "END", "LEAD_CHANGE", "METRIC_SPIKE", "PENALTY",
    "OVERTAKE", "PIT_STOP", "FASTEST_LAP", "CRASH", "DNF", "SAFETY_CAR", "CHEQUERED_FLAG",
  ],
  audioBed: "trackside",
  branding: { primary: "#10b981", secondary: "#0d1828", accent: "#f59e0b", styleGuideConfirmed: false },
  feedProvider: "jolpica",
  leagueId: 0, // F1 series id — set during the F1 build
  season: 2026,
  eventName: "Formula 1 2026",
  brandSubtitle: "podiumMetrics – F1 2026",
  entityKind: "constructor",
  features: { anthems: "off", travel: "team-staff", crossTournamentCompare: true },
};

const REGISTRY = { worldcup: WORLDCUP, leaguescup: LEAGUES_CUP, "f1-2026": F1_2026 } as const;

/** The active deployment config. TOURNAMENT env selects; default worldcup. */
export const SPORT: DeploymentConfig =
  REGISTRY[(process.env.TOURNAMENT as keyof typeof REGISTRY) ?? "worldcup"] ?? WORLDCUP;

/** True once the deployment has a real feed id (guards feed calls). */
export function isConfigured(cfg: DeploymentConfig = SPORT): boolean {
  return Number.isInteger(cfg.leagueId) && cfg.leagueId > 0;
}

// Back-compat drop-ins for the existing AF_LEAGUE / AF_SEASON constants.
export const AF_LEAGUE = SPORT.leagueId;
export const AF_SEASON = SPORT.season;

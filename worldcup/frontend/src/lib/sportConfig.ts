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

/** One knockout/stage window. `round` is the user-facing label. */
export interface RoundWindow {
  round: string;
  from: string; // ISO UTC
  to: string;   // ISO UTC
  /** Expected number of events in this round (bracket padding). */
  size?: number;
}

/** Every date this deployment's countdowns, stage labels and "is it over yet"
 *  checks key off. Previously hardcoded to WC26 in lib/tournament.ts, which
 *  made every LC26 surface classify August 2026 club fixtures against June/July
 *  World Cup windows. */
export interface TournamentCalendar {
  start: string;          // ISO UTC — opening event
  groupStageEnd: string;  // ISO UTC
  knockoutStart: string;  // ISO UTC
  end: string;            // ISO UTC — final
  rounds: RoundWindow[];
  /** Total scheduled events. Drives progress-aware totals. */
  totalEvents: number;
}

/** Where pre-event market probabilities come from for this deployment.
 *  `tournamentSlug: null` means NO market exists for this competition — the
 *  surface must render an honest empty state, never another event's odds. */
export interface OddsConfig {
  provider: "polymarket";
  tournamentSlug: string | null;
  /** Builds the per-group market slug, or null when the format has no groups. */
  groupSlugFor: ((group: string) => string) | null;
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
  /**
   * The PRIMARY user-facing name for this deployment — nav wordmark, page
   * headings, footers, share titles, metadata.
   *
   * Historically every surface hardcoded the string "podiumMetrics", so the LC26
   * deployment shipped the platform's name as its headline with the tournament
   * demoted to an 8px subtitle. `brandName` is what a visitor should read first;
   * the platform lineage still appears in the sportOS family footer
   * ("… — powered by podiumMetrics"), so nothing about the platform story is
   * lost by leading with the tournament.
   *
   * WC26 keeps "podiumMetrics": per CLAUDE.md BRANDING, putting FIFA's "World
   * Cup" mark into a user-facing product title needs explicit owner sign-off.
   */
  brandName: string;
  /**
   * Two-part wordmark. `lead` renders in the primary text color, `accent` in the
   * deployment accent — the "podium" + "Metrics" split, generalised so a
   * deployment name can be split wherever reads best. Concatenated they must
   * equal `brandName`.
   */
  wordmark: { lead: string; accent: string };

  entityKind: EntityKind;
  features: {
    anthems: AnthemMode;
    travel: TravelMode;
    crossTournamentCompare: boolean;
  };

  // ── tournament identity (Stage 4) ──
  /** Dates every countdown/stage classifier keys off. */
  calendar: TournamentCalendar;
  /**
   * Static group assignments, keyed by team code. EMPTY for formats that have
   * no groups. Applying WC26's nation-TLA map to a club competition is how
   * Columbus Crew ("COL") ended up in the World Cup's Group K.
   */
  teamGroups: Record<string, string>;
  /** Pre-event market source. */
  odds: OddsConfig;
  /**
   * True when the feed's `team.code` is a globally meaningful identifier (FIFA
   * nation TLAs). False for club competitions, where codes are frequently absent
   * and, when present, collide with nation TLAs — so codes are derived locally
   * and flags come from the team's COUNTRY, never its code.
   */
  feedCodesAreNationTlas: boolean;
}

// ── WC26 calendar (unchanged values, lifted out of lib/tournament.ts) ─────────
// CORRECTED 7/9 + 7/15 to the REAL fixture windows observed in the feed; see the
// history in lib/tournament.ts. Do not change without re-seeding — bracket round
// classification keys off these exact windows.
const WORLDCUP_CALENDAR: TournamentCalendar = {
  start: "2026-06-11T00:00:00Z",
  groupStageEnd: "2026-06-28T06:00:00Z",
  knockoutStart: "2026-06-28T12:00:00Z",
  end: "2026-07-19T12:00:00Z",
  rounds: [
    { round: "Round of 32",     from: "2026-06-28T12:00:00Z", to: "2026-07-04T12:00:00Z", size: 16 },
    { round: "Round of 16",     from: "2026-07-04T12:00:01Z", to: "2026-07-08T23:59:59Z", size: 8 },
    { round: "Quarter-finals",  from: "2026-07-09T00:00:00Z", to: "2026-07-12T23:59:59Z", size: 4 },
    { round: "Semi-finals",     from: "2026-07-13T00:00:00Z", to: "2026-07-15T23:59:59Z", size: 2 },
    { round: "3rd Place Final", from: "2026-07-16T00:00:00Z", to: "2026-07-19T12:00:00Z", size: 1 },
    { round: "Final",           from: "2026-07-19T12:00:01Z", to: "2026-07-20T23:59:59Z", size: 1 },
  ],
  totalEvents: 104, // 72 group + 32 knockout
};

const WORLDCUP_TEAM_GROUPS: Record<string, string> = {
  MEX: "A", RSA: "A", KOR: "A", CZE: "A",
  CAN: "B", BIH: "B", QAT: "B", SUI: "B",
  BRA: "C", MAR: "C", HAI: "C", SCO: "C",
  USA: "D", PAR: "D", AUS: "D", TUR: "D",
  // Group E lists both CUW and CUR — the SAME team (Curaçao); CUR is a
  // defensive alias for feeds that emit the non-FIFA code.
  GER: "E", CUW: "E", CUR: "E", CIV: "E", ECU: "E",
  NED: "F", JPN: "F", SWE: "F", TUN: "F",
  BEL: "G", EGY: "G", IRN: "G", NZL: "G",
  ESP: "H", CPV: "H", KSA: "H", URU: "H",
  FRA: "I", SEN: "I", IRQ: "I", NOR: "I",
  ARG: "J", ALG: "J", AUT: "J", JOR: "J",
  POR: "K", COD: "K", UZB: "K", COL: "K",
  ENG: "L", CRO: "L", GHA: "L", PAN: "L",
};

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
  // Unchanged, deliberately: "World Cup" is a FIFA mark and may not become the
  // product title without owner sign-off (CLAUDE.md BRANDING).
  brandName: "podiumMetrics",
  wordmark: { lead: "podium", accent: "Metrics" },
  entityKind: "nation",
  features: { anthems: "national", travel: "fan-origin", crossTournamentCompare: false },
  calendar: WORLDCUP_CALENDAR,
  teamGroups: WORLDCUP_TEAM_GROUPS,
  odds: {
    provider: "polymarket",
    tournamentSlug: "world-cup-winner",
    groupSlugFor: (g: string) => `world-cup-group-${g.toLowerCase()}-winner`,
  },
  feedCodesAreNationTlas: true,
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
    // OFFICIAL studio0x brand palette (owner 8/4) — supersedes the 7/29 Miami-pink
    // / electric-blue placeholders. Gaming-UI / dark-HUD skin; see globals.css for
    // the full token set. These are studio0x's OWN confirmed brand values, NOT the
    // licensed Leagues Cup marks — SUM owns those, so `styleGuideConfirmed` stays
    // false: nothing here may be presented as official LC26 branding.
    primary: "#CA358B", // Rosa 700 — primary accent / CTA / neon glow source
    secondary: "#0F0C0E", // Noir 900 — page background
    accent: "#5DCBD1", // Riptide — secondary accent, data/stats highlights
    styleGuideConfirmed: false,
  },
  fonts: { display: "Archivo", mono: "IBM Plex Mono" },
  feedProvider: "api-football",
  // api-football V3 league id, verified from the dashboard (owner 7/29): 772
  // (season 2026, Current=True). NOTE: 8157 is the V2 legacy per-season id — do
  // NOT use it; this codebase targets v3.football.api-sports.io. env can override.
  leagueId: Number(process.env.LEAGUES_CUP_LEAGUE_ID ?? 772),
  season: Number(process.env.LEAGUES_CUP_SEASON ?? 2026),
  eventName: "Leagues Cup 2026",
  brandSubtitle: "podiumMetrics – Leagues Cup 2026",
  // Owner directive 8/4: the tournament leads on this deployment, not the
  // platform. Descriptive/nominative use of the competition name — never
  // presented as official, and SUM's marks are not used (see `branding`).
  brandName: "Leagues Cup 2026",
  wordmark: { lead: "Leagues ", accent: "Cup 2026" },
  entityKind: "club",
  features: { anthems: "club", travel: "team-staff", crossTournamentCompare: true },
  // Verified against the live api-football feed (league 772 / season 2026) on
  // 2026-08-04: 54 fixtures, first kickoff Columbus Crew v Atlas Aug 4 23:45Z,
  // last published kickoff Aug 14 02:30Z, every one labeled round "Group Stage".
  // api-football has NOT published the knockout rounds yet, so `rounds` is empty
  // on purpose — classifyRound() returns null and surfaces fall back to the
  // feed's own round label rather than inventing a bracket window.
  calendar: {
    start: "2026-08-04T00:00:00Z",
    groupStageEnd: "2026-08-15T06:00:00Z",
    knockoutStart: "2026-08-15T06:00:00Z",
    end: "2026-08-15T06:00:00Z", // provisional: extends once knockouts publish
    rounds: [],
    totalEvents: 54,
  },
  // LC26 runs a single league phase — no groups. Deliberately empty: the WC26
  // nation map put Columbus Crew ("COL" = Colombia) into World Cup Group K.
  teamGroups: {},
  // Polymarket lists no Leagues Cup winner market. null → the odds surface
  // renders an honest "no market" state instead of World Cup winner odds.
  odds: { provider: "polymarket", tournamentSlug: null, groupSlugFor: null },
  // Club feed: 14 of the 36 clubs have NO `team.code` at all, and the codes that
  // do exist collide with nation TLAs (COL/POR/CHI/GUA/SAL…). Codes are derived
  // locally and badges come from Team.country.
  feedCodesAreNationTlas: false,
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
  // "Formula 1" / "F1" are Formula One Licensing marks — same rule as WC26:
  // the platform name leads until there is sign-off to do otherwise.
  brandName: "podiumMetrics",
  wordmark: { lead: "podium", accent: "Metrics" },
  entityKind: "constructor",
  features: { anthems: "off", travel: "team-staff", crossTournamentCompare: true },
  calendar: {
    start: "2026-03-06T00:00:00Z",
    groupStageEnd: "2026-03-06T00:00:00Z",
    knockoutStart: "2026-03-06T00:00:00Z",
    end: "2026-12-06T00:00:00Z",
    rounds: [],
    totalEvents: 0, // set during the F1 build from the real calendar
  },
  teamGroups: {},
  odds: { provider: "polymarket", tournamentSlug: null, groupSlugFor: null },
  feedCodesAreNationTlas: false,
};

const REGISTRY = { worldcup: WORLDCUP, leaguescup: LEAGUES_CUP, "f1-2026": F1_2026 } as const;

// Deployment selector.
//
// `TOURNAMENT` is a server-only env var: Next.js inlines only NEXT_PUBLIC_*
// into client bundles, so in any "use client" module `process.env.TOURNAMENT`
// is undefined and this fell back to WORLDCUP. The server rendered Leagues Cup
// while the browser ran World Cup config — the client-side predict filter and
// odds panel compared August 2026 club fixtures against WC26's 28 June knockout
// date, so every LC26 fixture read as a knockout game and every club read as
// "Out — group stage".
//
// NEXT_PUBLIC_TOURNAMENT is therefore the value that must be set for a
// non-default deployment; TOURNAMENT is still honoured (server-side, and for
// existing deployments) and takes precedence when both are present.
const SELECTED =
  (process.env.TOURNAMENT as keyof typeof REGISTRY | undefined) ??
  (process.env.NEXT_PUBLIC_TOURNAMENT as keyof typeof REGISTRY | undefined) ??
  "worldcup";

/** The active deployment config. TOURNAMENT / NEXT_PUBLIC_TOURNAMENT select; default worldcup. */
export const SPORT: DeploymentConfig = REGISTRY[SELECTED] ?? WORLDCUP;

/** True once the deployment has a real feed id (guards feed calls). */
export function isConfigured(cfg: DeploymentConfig = SPORT): boolean {
  return Number.isInteger(cfg.leagueId) && cfg.leagueId > 0;
}

// Back-compat drop-ins for the existing AF_LEAGUE / AF_SEASON constants.
export const AF_LEAGUE = SPORT.leagueId;
export const AF_SEASON = SPORT.season;

/**
 * The deployment's primary user-facing name. Import this instead of writing
 * "podiumMetrics" into a heading, footer, share string or page title — that
 * literal is what made every LC26 surface announce the platform rather than the
 * tournament.
 */
export const BRAND_NAME = SPORT.brandName;

/** Two-part wordmark for the nav / footer lockups. */
export const WORDMARK = SPORT.wordmark;

/**
 * True when this deployment leads with the platform name, so the sportOS family
 * footer can add "— powered by podiumMetrics" only where it isn't redundant.
 */
export const BRAND_IS_PLATFORM = SPORT.brandName === "podiumMetrics";

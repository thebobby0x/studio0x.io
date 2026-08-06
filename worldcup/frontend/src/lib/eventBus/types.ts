// ─────────────────────────────────────────────────────────────────────────────
// Event Bus — the single source of "moments" for every live event, across N
// concurrent matches/races, sport-agnostic.
//
// WHY: today, moment-shaped facts are scattered — goal events on Match.goalEvents,
// card/penalty rows in MatchEventLog, metric samples in LiveMetric, status flips
// in the live route. Each surface (a match page, the Roundtable, /api/live)
// re-derives what "just happened" on its own. The bus makes every match PUBLISH
// its moments to ONE typed, significance-scored stream, so any consumer — a match
// view, the Roundtable, or the future **0x360** multiview (all live matches on one
// screen + an auto-ranked cross-game feed) — is just a QUERY over that stream, not
// a re-plumb.
//
// This is a GENERALIZATION of tables that already exist:
//   · MatchEventLog (fixture, eventKey dedup, type, detail, minute, team, player)
//   · LiveMetric    (matchId, metricType, value, recordedAt)  → METRIC_SPIKE moments
//   · Match.goalEvents / penHome / penAway / status           → goal/pen/lifecycle
// Stage 2 adds a durable `MatchMoment` table (MatchEventLog + significance +
// tournamentId); Stage 1 defines the contract + an in-memory reference store.
//
// SPORT-AGNOSTIC: the bus never mentions football. The valid moment vocabulary
// for a deployment comes from its config (`DeploymentConfig.momentTypes`). F1 is
// a config swap: same bus, different moment types (OVERTAKE/PIT_STOP/…).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical moment vocabulary. Open on purpose: a sport declares WHICH of these
 * it emits via config. Football uses the GOAL/CARD/PENALTY/period set; motorsport
 * uses OVERTAKE/PIT_STOP/etc. LEAD_CHANGE, METRIC_SPIKE, START, END, PERIOD_END,
 * and PENALTY are cross-sport.
 */
export type MomentType =
  // ── cross-sport ──
  | "START" // kickoff / lights-out
  | "END" // full-time / chequered flag
  | "PERIOD_END" // HT, end of a lap/sector — boundary in config.periods
  | "LEAD_CHANGE" // the leader changed
  | "PENALTY" // a sanction (card in football, time penalty in F1)
  | "METRIC_SPIKE" // a proprietary metric crossed a threshold
  // ── football ──
  | "GOAL"
  | "OWN_GOAL"
  | "EQUALISER"
  | "PENALTY_AWARDED"
  | "PENALTY_SCORED"
  | "PENALTY_MISSED"
  | "SHOOTOUT_KICK"
  | "RED_CARD"
  | "YELLOW_CARD"
  | "VAR_DECISION"
  // ── motorsport (F1 — Stage-later; here to prove the vocab is a config swap) ──
  | "OVERTAKE"
  | "PIT_STOP"
  | "FASTEST_LAP"
  | "CRASH"
  | "DNF"
  | "SAFETY_CAR"
  | "CHEQUERED_FLAG";

/** Was this moment observed from real feed data, or reconstructed/simulated?
 *  Reconstructed moments are EXCLUDED from significance-ranked surfaces (0x360
 *  feed, Roundtable triggers) — carries the sim-truth gate (gotcha #20/#21). */
export type MomentSource = "real" | "reconstructed";

/** A single published moment. Deterministic `id` makes publish() idempotent, so
 *  the same moment re-observed by polling is upserted, never duplicated (same
 *  contract as MatchEventLog.eventKey + the news-archive upsert ids). */
export interface MatchMoment {
  /** Deterministic: hash(`${fixture}|${type}|${period}|${minute}|${detail}`). */
  id: string;
  /** Which deployment/tournament produced it (DeploymentConfig.id). Lets the bus
   *  be shared even if multiple tournaments ever run in one store. */
  tournamentId: string;
  /** Internal Match id (or race id). Optional — publishers often hold only the
   *  fixture id; the store backfills matchId when known. */
  matchId?: string;
  /** Upstream fixture id (api-football) — natural key most publishers already hold. */
  fixture: number;
  type: MomentType;
  /** Which period from config.periods this fell in (e.g. "2H", "ET", "lap"). */
  period?: string;
  /** Match minute or lap number. */
  minute: number;
  /** Display clock, e.g. "78'" or "L34". */
  clockLabel?: string;
  /** Team/constructor code involved, if any. */
  team?: string;
  /** Player/driver involved, if any. */
  entity?: string;
  /** Type-specific, GROUNDED-ONLY detail (scorer, score-after, metric name+delta).
   *  Never fabricated; reconstructed goals carry scorer:"Scorer TBC" (goals route). */
  payload?: Record<string, unknown>;
  /** 0–100 cross-game importance. Drives the 0x360 auto-ranked feed + Roundtable triggers. */
  significance: number;
  /** One-line why, for transparency in the feed ("late equaliser in a knockout"). */
  significanceReason: string;
  source: MomentSource;
  /** When it happened in the match (ISO). Optional — publishers that only know
   *  the match minute omit it; the store falls back to firstSeenAt. */
  occurredAt?: string;
  /** When the bus recorded it (ISO). */
  publishedAt: string;
}

/** Input to publish() — the bus computes id, significance, publishedAt. */
export type MatchMomentInput = Omit<
  MatchMoment,
  "id" | "significance" | "significanceReason" | "publishedAt"
> & { significance?: number; significanceReason?: string };

/** Query shape shared by every consumer. Omit matchIds → the GLOBAL cross-game
 *  stream (that's the 0x360 feed). Filter matchIds → a single match view. */
export interface MomentQuery {
  tournamentId?: string;
  /** Restrict to these matches by internal Match.id. Omit for ALL matches (0x360). */
  matchIds?: string[];
  /** Restrict to these upstream fixture ids — the natural key most publishers hold. */
  fixtures?: number[];
  /** Restrict to currently-live matches only (0x360 default). */
  liveOnly?: boolean;
  types?: MomentType[];
  /** Only moments at/above this significance (0x360 feed uses e.g. 40). */
  minSignificance?: number;
  /** Cursor = the publishedAt of the last seen moment (poll for new ones). */
  sinceCursor?: string;
  /** Order: "significance" (0x360 ranked feed) or "recency" (a match timeline). */
  order?: "significance" | "recency";
  limit?: number;
}

/** The store contract. Stage 1 ships an in-memory ref impl; Stage 2 a Prisma-backed
 *  one over a `MatchMoment` table (MatchEventLog + significance + tournamentId).
 *  N concurrent matches are inherent: the stream is match-TAGGED and GLOBAL, so
 *  N publishers append to one stream and getMoments() with no matchIds filter
 *  returns the ranked union across all of them. */
export interface MomentStore {
  publish(input: MatchMomentInput): Promise<MatchMoment>;
  getMoments(query: MomentQuery): Promise<MatchMoment[]>;
}

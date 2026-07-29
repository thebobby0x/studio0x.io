// ─────────────────────────────────────────────────────────────────────────────
// api-football vendor adapter (Vendor Adapter Pattern) — the SINGLE place the
// api-football wire shape is decoded, shared by WC26 and Leagues Cup via config.
// It does two jobs:
//   (a) eventsToMoments — decode the vendor /fixtures/events array into the
//       sport-agnostic MatchMomentInput[] the event bus publishes. The decode
//       matches the existing goals route byte-for-byte (missed-pens are NOT goals,
//       own goals / penalties are goals with flags) so nothing regresses.
//   (b) momentsToGoalEvents — the INVERSE: reproduce the exact GoalEvent[] that
//       Match DNA's four primitives consume, now sourced FROM the bus. This is the
//       GoalEvent→MomentEvent migration: DNA reads MatchMoment via this adapter and
//       gets identical output to the old direct-events path.
//
// No new adapter is invented — this extracts the worldcup decode into one module
// the config points every deployment at. Guards on isConfigured() so no vendor
// call fires until a real league id is set (Leagues Cup starts at leagueId:0).
// ─────────────────────────────────────────────────────────────────────────────

import { SPORT, isConfigured, type DeploymentConfig } from "@/lib/sportConfig";
import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";
import type { MatchMomentInput, MomentSource } from "@/lib/eventBus/types";

const AF_BASE = "https://v3.football.api-sports.io";

/** The api-football /fixtures/events wire shape (vendor-owned, lives here only). */
export interface ApiFootballEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string | null };
  assist: { name: string | null };
  type: string; // "Goal" | "Card" | "Var" | "subst" | ...
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Missed Penalty" | "Yellow Card" | "Red Card" | ...
}

function period(minute: number): string {
  if (minute > 90) return "ET";
  if (minute > 45) return "2H";
  return "1H";
}

/**
 * Decode a vendor events array into publishable moments. `source` marks whether
 * these are real feed events or reconstructed (reconstructed → significance 0).
 * Faithful to the goals route: missed penalties are PENALTY_MISSED (not goals),
 * own goals / penalties are GOALs carrying flags, cards + VAR become their moments.
 */
export function eventsToMoments(
  events: ApiFootballEvent[],
  meta: { tournamentId: string; fixture: number; matchId?: string; source?: MomentSource },
): MatchMomentInput[] {
  const src: MomentSource = meta.source ?? "real";
  const base = { tournamentId: meta.tournamentId, fixture: meta.fixture, matchId: meta.matchId, source: src };
  const out: MatchMomentInput[] = [];

  for (const e of events) {
    const minute = e.time.elapsed;
    const team = e.team.name;
    const p = period(minute);
    if (e.type === "Goal" && e.detail !== "Missed Penalty") {
      out.push({
        ...base, type: "GOAL", minute, team, period: p, entity: e.player.name ?? undefined,
        payload: { scorer: e.player.name, assist: e.assist.name ?? null, isOwnGoal: e.detail === "Own Goal", isPenalty: e.detail === "Penalty", detail: e.detail },
      });
    } else if (e.type === "Goal" && e.detail === "Missed Penalty") {
      out.push({ ...base, type: "PENALTY_MISSED", minute, team, period: p, entity: e.player.name ?? undefined, payload: { player: e.player.name, detail: e.detail } });
    } else if (e.type === "Card") {
      out.push({ ...base, type: e.detail === "Red Card" ? "RED_CARD" : "YELLOW_CARD", minute, team, period: p, entity: e.player.name ?? undefined, payload: { player: e.player.name, detail: e.detail } });
    } else if (e.type === "Var") {
      out.push({ ...base, type: "VAR_DECISION", minute, team, period: p, payload: { detail: e.detail } });
    }
  }
  return out;
}

/**
 * The inverse: reproduce the exact GoalEvent[] Match DNA consumes, from the bus.
 * Filters GOAL moments, restores {minute,team,scorer,assist,isOwnGoal,isPenalty},
 * marks reconstructed goals `pending` (never presented as a confirmed scorer),
 * sorted by minute — identical shape/order to the goals route's `goals[]`.
 */
export function momentsToGoalEvents(moments: Pick<MatchMomentInput, "type" | "minute" | "team" | "payload" | "source">[]): GoalEvent[] {
  return moments
    .filter((m) => m.type === "GOAL")
    .map((m) => ({
      minute: m.minute,
      team: m.team ?? "",
      scorer: (m.payload?.scorer as string | null) ?? "",
      assist: (m.payload?.assist as string | null) ?? null,
      isOwnGoal: Boolean(m.payload?.isOwnGoal),
      isPenalty: Boolean(m.payload?.isPenalty),
      ...(m.source === "reconstructed" ? { pending: true } : {}),
    }))
    .sort((a, b) => a.minute - b.minute);
}

/** Fetch the vendor events for a fixture (runtime only; guarded by isConfigured). */
export async function fetchEvents(fixture: number, cfg: DeploymentConfig = SPORT): Promise<ApiFootballEvent[]> {
  if (!isConfigured(cfg)) return []; // no real league id yet → no call
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return [];
  const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixture}`, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 8 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.response ?? []) as ApiFootballEvent[];
}

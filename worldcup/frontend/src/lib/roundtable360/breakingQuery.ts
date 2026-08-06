// ─────────────────────────────────────────────────────────────────────────────
// Breaking-news detection — the DB half.
//
// Split from `breaking.ts` for one hard reason: the player component imports
// `cueIsCovered` and `BreakingCue` to decide whether to cut in, and a client
// component that transitively imports `@/lib/prisma` drags the Prisma client
// into the browser bundle. The pure predicates live next door; anything that
// touches the database lives here.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import type { MomentType } from "@/lib/eventBus/types";
import { BREAKING_TYPES, BREAKING_WINDOW_MS, type BreakingCue } from "./breaking";

/**
 * The highest-significance breaking moment across every live match right now,
 * or null.
 *
 * DB-ONLY and deliberately cheap: this is polled every ~10s by every listening
 * browser, so it is one indexed query over MatchMoment and nothing else. No
 * Claude, no ElevenLabs, no api-football. The expensive path (generation) is
 * only ever entered once this returns something new.
 */
export async function getBreakingCue(fixtures?: number[]): Promise<BreakingCue | null> {
  try {
    const rows = await prisma.matchMoment.findMany({
      where: {
        tournamentId: SPORT.id,
        type: { in: BREAKING_TYPES },
        firstSeenAt: { gte: new Date(Date.now() - BREAKING_WINDOW_MS) },
        ...(fixtures?.length ? { fixture: { in: fixtures } } : {}),
      },
      orderBy: [{ significance: "desc" }, { firstSeenAt: "desc" }],
      take: 1,
    });

    const r = rows[0];
    if (!r) return null;

    const payload = (r.payload as Record<string, unknown> | null) ?? {};
    return {
      fixture: r.fixture,
      key: `${r.fixture}|${r.momentKey}`,
      type: r.type as MomentType,
      minute: r.minute,
      clockLabel: r.clockLabel,
      team: r.team,
      entity: r.entity,
      detail: (payload.description as string | undefined) ?? r.type.toLowerCase().replace(/_/g, " "),
      significance: r.significance,
      firstSeenAt: r.firstSeenAt.toISOString(),
    };
  } catch {
    // The MatchMoment table predates this code but a fresh deployment may not
    // have pushed it yet. No cue is the correct degraded answer: the show falls
    // straight back to its clock-driven cadence rather than erroring.
    return null;
  }
}

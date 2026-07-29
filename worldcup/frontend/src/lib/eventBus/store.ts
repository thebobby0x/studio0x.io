// ─────────────────────────────────────────────────────────────────────────────
// Prisma-backed MomentStore — the durable implementation of the Stage 1 bus
// contract, over the MatchMoment table. This is the single writer/reader every
// consumer goes through: a match view (getMoments by fixture), the Roundtable
// (high-significance across all matches), and the future 0x360 multiview
// (getMoments with NO fixtures filter → the global ranked cross-game feed).
//
// N concurrent matches are inherent: rows are tagged by fixture, the stream is
// global, so N publishers upsert into one table and an unfiltered getMoments()
// returns the ranked union across all live matches.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import { scoreMoment, type SignificanceContext } from "./significance";
import type { MatchMoment, MatchMomentInput, MomentQuery, MomentStore } from "./types";

/** Stable dedup key — matches MatchEventLog's contract so re-observation upserts. */
function momentKey(i: Pick<MatchMomentInput, "type" | "period" | "minute" | "payload">): string {
  const detail = (i.payload?.detail as string | undefined) ?? "";
  return `${i.type}|${i.period ?? ""}|${i.minute}|${detail}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMoment(row: any): MatchMoment {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    matchId: row.matchId ?? "",
    fixture: row.fixture,
    type: row.type,
    period: row.period ?? undefined,
    minute: row.minute,
    clockLabel: row.clockLabel ?? undefined,
    team: row.team ?? undefined,
    entity: row.entity ?? undefined,
    payload: (row.payload as Record<string, unknown> | null) ?? undefined,
    significance: row.significance,
    significanceReason: row.significanceReason ?? "",
    source: row.source === "reconstructed" ? "reconstructed" : "real",
    occurredAt: (row.occurredAt ?? row.firstSeenAt).toISOString(),
    publishedAt: row.publishedAt.toISOString(),
  };
}

export class PrismaMomentStore implements MomentStore {
  /** Publish (upsert) a moment. Significance is computed server-side unless the
   *  caller supplied it; a `ctx` lets the caller pass grounded amplifiers
   *  (knockout/rivalry/late) without threading them through the input type. */
  async publish(input: MatchMomentInput, ctx: SignificanceContext = {}): Promise<MatchMoment> {
    const key = momentKey(input);
    const scored =
      input.significance != null
        ? { score: input.significance, reason: input.significanceReason ?? "" }
        : scoreMoment(input, { minute: input.minute, ...ctx });

    const data = {
      tournamentId: input.tournamentId,
      fixture: input.fixture,
      matchId: input.matchId || null,
      momentKey: key,
      type: input.type,
      period: input.period ?? null,
      minute: input.minute,
      clockLabel: input.clockLabel ?? null,
      team: input.team ?? null,
      entity: input.entity ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: (input.payload as any) ?? undefined,
      significance: scored.score,
      significanceReason: scored.reason,
      source: input.source,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
    };

    const row = await prisma.matchMoment.upsert({
      where: { tournamentId_fixture_momentKey: { tournamentId: input.tournamentId, fixture: input.fixture, momentKey: key } },
      // Re-observation refreshes significance/score but keeps firstSeenAt/publishedAt.
      update: { significance: data.significance, significanceReason: data.significanceReason, team: data.team, entity: data.entity, payload: data.payload },
      create: data,
    });
    return toMoment(row);
  }

  async getMoments(query: MomentQuery): Promise<MatchMoment[]> {
    const tournamentId = query.tournamentId ?? SPORT.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tournamentId };
    if (query.fixtures?.length) where.fixture = { in: query.fixtures };
    if (query.matchIds?.length) where.matchId = { in: query.matchIds };
    if (query.types?.length) where.type = { in: query.types };
    if (query.minSignificance != null) where.significance = { gte: query.minSignificance };
    if (query.sinceCursor) where.publishedAt = { gt: new Date(query.sinceCursor) };

    // liveOnly → restrict to fixtures whose Match is LIVE/HT (the 0x360 default).
    if (query.liveOnly) {
      const live = await prisma.match.findMany({ where: { status: { in: ["LIVE", "HT"] } }, select: { fixture: true } });
      const liveFixtures = live.map((m) => m.fixture);
      where.fixture = where.fixture ? { in: (where.fixture.in as number[]).filter((f) => liveFixtures.includes(f)) } : { in: liveFixtures };
    }

    const order = query.order ?? "recency";
    const rows = await prisma.matchMoment.findMany({
      where,
      orderBy: order === "significance" ? [{ significance: "desc" }, { publishedAt: "desc" }] : { publishedAt: "desc" },
      take: Math.min(query.limit ?? 100, 500),
    });
    return rows.map(toMoment);
  }
}

/** The process-wide store instance. */
export const moments: MomentStore = new PrismaMomentStore();

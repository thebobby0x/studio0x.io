import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { SPORT } from "@/lib/sportConfig";
import { clearOddsCache, getTournamentWinnerMarkets } from "@/lib/polymarket";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Drop cached/stored odds and re-pull for THIS deployment's market.
//
// Two separate sources were serving World Cup odds on the Leagues Cup site:
//   1. Polymarket tournament odds — an in-memory cache keyed to the hardcoded
//      "world-cup-winner" slug. Cleared here; the slug now comes from
//      SPORT.odds (null for LC26, so the surface renders "no market").
//   2. KalshiMarket rows carrying `KXFIFAGAME-…` contract slugs at placeholder
//      prices, minted by /api/seed. Those are a FIFA World Cup ticker family and
//      are removed on any deployment that isn't the World Cup.
//
// This endpoint never invents a market. If the competition has no listed market,
// it reports exactly that.
// ─────────────────────────────────────────────────────────────────────────────

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Purge foreign-ticker market rows.
  const staleMarkets =
    SPORT.id === "worldcup"
      ? 0
      : (await prisma.kalshiMarket.deleteMany({ where: { contractSlug: { startsWith: "KXFIFAGAME" } } })).count;

  // 2. Drop the in-process Polymarket cache so the next read re-fetches.
  clearOddsCache();

  // 3. Re-pull.
  const slug = SPORT.odds.tournamentSlug;
  const data = slug ? await getTournamentWinnerMarkets() : null;

  return NextResponse.json({
    ok: true,
    tournament: SPORT.id,
    eventName: SPORT.eventName,
    marketSlug: slug,
    staleFifaMarketsDeleted: staleMarkets,
    marketsPulled: data?.markets.length ?? 0,
    note: slug
      ? null
      : `No ${SPORT.eventName} winner market is listed on ${SPORT.odds.provider}. Tournament odds render an empty state rather than another competition's prices.`,
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

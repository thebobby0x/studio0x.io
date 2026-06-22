import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface GoalEvent {
  minute: number;
  team: string;
  scorer: string;
  assist: string | null;
  isOwnGoal: boolean;
  isPenalty: boolean;
}

// GET: list FT matches with goal data status
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matches = await prisma.match.findMany({
    where: { status: "FT" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "desc" },
    take: 50,
  });

  return NextResponse.json(matches.map((m) => ({
    id: m.id,
    fixture: m.fixture,
    date: m.date.toISOString(),
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    hasOverride: m.goalEvents !== null,
    goalEvents: m.goalEvents ?? null,
  })));
}

// POST: set or clear goal override for a match
export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { matchId: string; goals: GoalEvent[] | null };
  const { matchId, goals } = body;

  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { goalEvents: goals !== null ? (goals as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
  });

  return NextResponse.json({ ok: true, matchId: updated.id, goalsSet: goals?.length ?? 0 });
}

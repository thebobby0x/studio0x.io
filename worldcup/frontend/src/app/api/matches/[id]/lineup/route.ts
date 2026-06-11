import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: { include: { homePlayers: true } },
      awayTeam: { include: { homePlayers: true } },
    },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    home: { team: match.homeTeam.name, players: match.homeTeam.homePlayers },
    away: { team: match.awayTeam.name, players: match.awayTeam.homePlayers },
  });
}

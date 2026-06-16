import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export interface PredictMatch {
  id: string;
  fixture: number;
  date: string;
  status: string;
  homeScore: number;
  awayScore: number;
  venue: string;
  city: string;
  group: string;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
}

export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });

    const data: PredictMatch[] = matches.map(m => ({
      id: m.id,
      fixture: m.fixture,
      date: m.date.toISOString(),
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      venue: m.venue,
      city: m.city,
      group: m.homeTeam.groupStage,
      homeTeam: { tla: m.homeTeam.code, name: m.homeTeam.name },
      awayTeam: { tla: m.awayTeam.code, name: m.awayTeam.name },
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AF_LEAGUE } from "@/lib/sportConfig";

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
  // afId/logoUrl are the club-crest source — a club has no national flag.
  homeTeam: { tla: string; name: string; afId: number | null; logoUrl: string };
  awayTeam: { tla: string; name: string; afId: number | null; logoUrl: string };
}

export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      where: { leagueId: { in: [AF_LEAGUE, 0] } },
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
      homeTeam: { tla: m.homeTeam.code, name: m.homeTeam.name, afId: m.homeTeam.afTeamId, logoUrl: m.homeTeam.logoUrl },
      awayTeam: { tla: m.awayTeam.code, name: m.awayTeam.name, afId: m.awayTeam.afTeamId, logoUrl: m.awayTeam.logoUrl },
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

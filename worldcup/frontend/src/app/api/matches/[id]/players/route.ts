import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AF_BASE = "https://v3.football.api-sports.io";

export interface PlayerMatchStats {
  id: number;
  name: string;
  team: string;
  number: number;
  position: string;
  minutesPlayed: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passAccuracy: number | null;
  tackles: number;
  dribbles: number;
  fouls: number;
  yellowCard: boolean;
  redCard: boolean;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const dbMatch = await prisma.match.findUnique({
    where: { id },
    select: { fixture: true },
  });
  if (!dbMatch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ players: [] });

  try {
    const res = await fetch(
      `${AF_BASE}/fixtures/players?fixture=${dbMatch.fixture}`,
      {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return NextResponse.json({ players: [] });

    const json = await res.json();
    const sides = json.response ?? [];

    const players: PlayerMatchStats[] = [];

    for (const side of sides) {
      const teamName: string = side.team?.name ?? "";
      for (const entry of side.players ?? []) {
        const p = entry.player;
        const s = entry.statistics?.[0] ?? {};
        players.push({
          id: p.id,
          name: p.name,
          team: teamName,
          number: s.games?.number ?? 0,
          position: s.games?.position ?? "",
          minutesPlayed: s.games?.minutes ?? 0,
          rating: s.games?.rating ? parseFloat(s.games.rating) : null,
          goals: s.goals?.total ?? 0,
          assists: s.goals?.assists ?? 0,
          shots: s.shots?.total ?? 0,
          shotsOnTarget: s.shots?.on ?? 0,
          passes: s.passes?.total ?? 0,
          passAccuracy: s.passes?.accuracy ? parseFloat(s.passes.accuracy) : null,
          tackles: s.tackles?.total ?? 0,
          dribbles: s.dribbles?.attempts ?? 0,
          fouls: s.fouls?.committed ?? 0,
          yellowCard: s.cards?.yellow > 0,
          redCard: s.cards?.red > 0,
        });
      }
    }

    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ players: [] });
  }
}

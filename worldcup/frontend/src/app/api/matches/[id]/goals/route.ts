import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface GoalEvent {
  minute: number;
  team: string;
  scorer: string;
  assist: string | null;
  isOwnGoal: boolean;
  isPenalty: boolean;
}

interface ApiFootballEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    select: { fixture: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ goals: [] });
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/events?fixture=${match.fixture}`,
      {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ goals: [] });
    }

    const json = await res.json();
    const events: ApiFootballEvent[] = json.response ?? [];

    const goals: GoalEvent[] = events
      .filter((e) => e.type === "Goal")
      .map((e) => ({
        minute: e.time.elapsed,
        team: e.team.name,
        scorer: e.player.name,
        assist: e.assist.name ?? null,
        isOwnGoal: e.detail === "Own Goal",
        isPenalty: e.detail === "Penalty",
      }));

    return NextResponse.json({ goals });
  } catch {
    return NextResponse.json({ goals: [] });
  }
}

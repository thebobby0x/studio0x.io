import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AF_BASE = "https://v3.football.api-sports.io";

export interface PlayerEntry {
  id: number;
  name: string;
  number: number;
  position: string;
  grid: string | null;
}

export interface SubstitutionEvent {
  minute: number;
  playerIn: string;
  playerOut: string;
  team: string;
}

export interface LineupSide {
  team: string;
  formation: string;
  starters: PlayerEntry[];
  subs: PlayerEntry[];
}

export interface LineupsResponse {
  home: LineupSide;
  away: LineupSide;
  substitutions: SubstitutionEvent[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const dbMatch = await prisma.match.findUnique({
    where: { id },
    select: { fixture: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  if (!dbMatch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 503 });

  try {
    const [lineupRes, eventsRes] = await Promise.all([
      fetch(`${AF_BASE}/fixtures/lineups?fixture=${dbMatch.fixture}`, {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 300 },
      }),
      fetch(`${AF_BASE}/fixtures/events?fixture=${dbMatch.fixture}`, {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 60 },
      }),
    ]);

    const [lineupJson, eventsJson] = await Promise.all([
      lineupRes.ok ? lineupRes.json() : { response: [] },
      eventsRes.ok ? eventsRes.json() : { response: [] },
    ]);

    const sides = lineupJson.response ?? [];
    const events = eventsJson.response ?? [];

    function mapSide(raw: {
      team: { name: string };
      formation: string;
      startXI: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
      substitutes: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>;
    }): LineupSide {
      return {
        team: raw.team.name,
        formation: raw.formation,
        starters: (raw.startXI ?? []).map(e => ({
          id: e.player.id,
          name: e.player.name,
          number: e.player.number,
          position: e.player.pos,
          grid: e.player.grid,
        })),
        subs: (raw.substitutes ?? []).map(e => ({
          id: e.player.id,
          name: e.player.name,
          number: e.player.number,
          position: e.player.pos,
          grid: e.player.grid,
        })),
      };
    }

    const home = sides[0] ? mapSide(sides[0]) : { team: dbMatch.homeTeam.name, formation: "", starters: [], subs: [] };
    const away = sides[1] ? mapSide(sides[1]) : { team: dbMatch.awayTeam.name, formation: "", starters: [], subs: [] };

    // Extract substitution events
    const substitutions: SubstitutionEvent[] = events
      .filter((e: { type: string }) => e.type === "subst")
      .map((e: { time: { elapsed: number }; team: { name: string }; player: { name: string }; assist: { name: string } }) => ({
        minute: e.time.elapsed,
        playerIn: e.player.name,
        playerOut: e.assist.name,
        team: e.team.name,
      }));

    return NextResponse.json({ home, away, substitutions });
  } catch {
    return NextResponse.json({ error: "Failed to fetch lineup data" }, { status: 502 });
  }
}

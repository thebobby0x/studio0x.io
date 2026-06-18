import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE   = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;

export interface TopScorerEntry {
  name: string;
  team: string;
  tla: string;
  goals: number;
  assists: number;
}

export interface TopAssisterEntry {
  name: string;
  team: string;
  tla: string;
  assists: number;
  goals: number;
}

export interface TournamentRecords {
  topScorers: TopScorerEntry[];
  topAssisters: TopAssisterEntry[];
  totalGoals: number;
  totalMatches: number;
  avgGoalsPerMatch: string;
}

interface AFPlayer {
  player: {
    name: string;
  };
  statistics: Array<{
    team: { name: string; code: string | null };
    goals: { total: number | null; assists: number | null };
  }>;
}

async function fetchApiFootball(path: string): Promise<AFPlayer[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];

  const url = `${BASE}${path}?league=${LEAGUE}&season=${SEASON}`;
  try {
    const res = await fetch(url, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.response as AFPlayer[]) ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // DB stats — always available
    const finished = await prisma.match.findMany({
      where: { status: "FT" },
      select: { homeScore: true, awayScore: true },
    });

    const totalMatches = finished.length;
    const totalGoals = finished.reduce(
      (sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0),
      0,
    );
    const avgGoalsPerMatch =
      totalMatches > 0 ? (totalGoals / totalMatches).toFixed(2) : "0.00";

    const key = process.env.API_FOOTBALL_KEY;
    if (!key) {
      const result: TournamentRecords = {
        topScorers: [],
        topAssisters: [],
        totalGoals,
        totalMatches,
        avgGoalsPerMatch,
      };
      return NextResponse.json(result);
    }

    // Fetch top scorers + top assisters in parallel
    const [scorersRaw, assistsRaw] = await Promise.all([
      fetchApiFootball("/players/topscorers"),
      fetchApiFootball("/players/topassists"),
    ]);

    const topScorers: TopScorerEntry[] = scorersRaw.slice(0, 10).map((p) => {
      const stats = p.statistics[0];
      return {
        name: p.player.name,
        team: stats?.team?.name ?? "",
        tla: (stats?.team?.code ?? "").toUpperCase(),
        goals: stats?.goals?.total ?? 0,
        assists: stats?.goals?.assists ?? 0,
      };
    });

    const topAssisters: TopAssisterEntry[] = assistsRaw.slice(0, 10).map((p) => {
      const stats = p.statistics[0];
      return {
        name: p.player.name,
        team: stats?.team?.name ?? "",
        tla: (stats?.team?.code ?? "").toUpperCase(),
        assists: stats?.goals?.assists ?? 0,
        goals: stats?.goals?.total ?? 0,
      };
    });

    const result: TournamentRecords = {
      topScorers,
      topAssisters,
      totalGoals,
      totalMatches,
      avgGoalsPerMatch,
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error("[tournament/records] error:", e);
    const fallback: TournamentRecords = {
      topScorers: [],
      topAssisters: [],
      totalGoals: 0,
      totalMatches: 0,
      avgGoalsPerMatch: "0.00",
    };
    return NextResponse.json(fallback, { status: 503 });
  }
}

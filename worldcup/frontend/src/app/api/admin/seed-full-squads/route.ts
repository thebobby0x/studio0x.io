import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const API_BASE = "https://v3.football.api-sports.io";

const POS_MAP: Record<string, string> = { G: "GK", D: "DEF", M: "MID", A: "FWD" };

async function runSeed() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY not configured" }, { status: 500 });
  }

  const headers = { "x-apisports-key": apiKey };

  // 1. Get all WC 2026 teams from api-football
  const teamsRes = await fetch(`${API_BASE}/teams?league=1&season=2026`, { headers });
  const teamsData = await teamsRes.json() as {
    response: Array<{ team: { id: number; name: string; code: string } }>;
  };

  if (!teamsData.response?.length) {
    return NextResponse.json({ error: "No teams returned from api-football" }, { status: 400 });
  }

  // 2. Get all teams from our DB keyed by TLA code + fallback by name
  const dbTeams = await prisma.team.findMany();
  const dbTeamByCode = new Map(dbTeams.map((t) => [t.code.toUpperCase(), t]));
  const dbTeamByName = new Map(dbTeams.map((t) => [t.name.toLowerCase(), t]));

  let created = 0;
  let updated = 0;
  let teamsProcessed = 0;
  const errors: string[] = [];

  // 3. For each api-football team, fetch squad and upsert players
  for (const { team: apiTeam } of teamsData.response) {
    const dbTeam =
      dbTeamByCode.get(apiTeam.code?.toUpperCase() ?? "") ??
      dbTeamByName.get(apiTeam.name.toLowerCase());

    if (!dbTeam) {
      errors.push(`No DB match for "${apiTeam.name}" (${apiTeam.code})`);
      continue;
    }

    try {
      const squadRes = await fetch(
        `${API_BASE}/players/squads?team=${apiTeam.id}`,
        { headers }
      );
      const squadData = await squadRes.json() as {
        response: Array<{
          players: Array<{ id: number; name: string; number: number; pos: string; photo: string }>;
        }>;
      };

      const players = squadData.response?.[0]?.players ?? [];

      for (const p of players) {
        const position = POS_MAP[p.pos] ?? "MID";

        const existing = await prisma.player.findFirst({
          where: {
            teamId: dbTeam.id,
            name: { equals: p.name, mode: "insensitive" },
          },
        });

        if (existing) {
          await prisma.player.update({
            where: { id: existing.id },
            data: {
              photoUrl: p.photo || existing.photoUrl || undefined,
              number: p.number || existing.number,
              position: position || existing.position,
            },
          });
          updated++;
        } else {
          await prisma.player.create({
            data: {
              name: p.name,
              number: p.number || 0,
              position,
              teamId: dbTeam.id,
              photoUrl: p.photo || undefined,
            },
          });
          created++;
        }
      }
      teamsProcessed++;
    } catch (e) {
      errors.push(`Error for ${apiTeam.name}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    teamsProcessed,
    created,
    updated,
    total: created + updated,
    errors: errors.slice(0, 20),
  });
}

async function checkAuth() {
  const session = await auth();
  return session?.user?.role === "SUPER_ADMIN";
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runSeed();
}

export async function POST() {
  if (!(await checkAuth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runSeed();
}

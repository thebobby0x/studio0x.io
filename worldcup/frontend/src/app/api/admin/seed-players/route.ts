import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const API_BASE = "https://v3.football.api-sports.io";

interface MockPlayer {
  name: string;
  club: string;
  league: string;
  caps: number;
  goals: number;
}

const MOCK_PLAYERS: MockPlayer[] = [
  // England
  { name: "Jude Bellingham", club: "Real Madrid", league: "La Liga", caps: 52, goals: 14 },
  { name: "Harry Kane", club: "Bayern Munich", league: "Bundesliga", caps: 91, goals: 67 },
  { name: "Phil Foden", club: "Manchester City", league: "Premier League", caps: 43, goals: 11 },
  { name: "Bukayo Saka", club: "Arsenal", league: "Premier League", caps: 45, goals: 17 },
  { name: "Declan Rice", club: "Arsenal", league: "Premier League", caps: 50, goals: 5 },
  { name: "Marcus Rashford", club: "Manchester United", league: "Premier League", caps: 60, goals: 17 },
  // France
  { name: "Kylian Mbappé", club: "Real Madrid", league: "La Liga", caps: 99, goals: 46 },
  { name: "Antoine Griezmann", club: "Atlético Madrid", league: "La Liga", caps: 132, goals: 44 },
  { name: "Ousmane Dembélé", club: "PSG", league: "Ligue 1", caps: 60, goals: 15 },
  { name: "N'Golo Kanté", club: "Al-Ittihad", league: "Saudi Pro League", caps: 70, goals: 2 },
  // Spain
  { name: "Lamine Yamal", club: "Barcelona", league: "La Liga", caps: 22, goals: 7 },
  { name: "Pedri", club: "Barcelona", league: "La Liga", caps: 50, goals: 6 },
  { name: "Rodri", club: "Manchester City", league: "Premier League", caps: 60, goals: 11 },
  { name: "Álvaro Morata", club: "AC Milan", league: "Serie A", caps: 85, goals: 37 },
  { name: "Nico Williams", club: "Athletic Club", league: "La Liga", caps: 20, goals: 5 },
  // Brazil
  { name: "Vinicius Jr.", club: "Real Madrid", league: "La Liga", caps: 55, goals: 23 },
  { name: "Rodrygo", club: "Real Madrid", league: "La Liga", caps: 40, goals: 16 },
  { name: "Raphinha", club: "Barcelona", league: "La Liga", caps: 50, goals: 20 },
  // Argentina
  { name: "Lionel Messi", club: "Inter Miami", league: "MLS", caps: 191, goals: 112 },
  { name: "Julián Álvarez", club: "Atlético Madrid", league: "La Liga", caps: 42, goals: 24 },
  { name: "Rodrigo De Paul", club: "Atlético Madrid", league: "La Liga", caps: 72, goals: 13 },
  // Portugal
  { name: "Cristiano Ronaldo", club: "Al-Nassr", league: "Saudi Pro League", caps: 218, goals: 137 },
  { name: "Bruno Fernandes", club: "Manchester United", league: "Premier League", caps: 80, goals: 25 },
  { name: "Rafael Leão", club: "AC Milan", league: "Serie A", caps: 40, goals: 12 },
  // Germany
  { name: "Florian Wirtz", club: "Bayer Leverkusen", league: "Bundesliga", caps: 35, goals: 12 },
  { name: "Jamal Musiala", club: "Bayern Munich", league: "Bundesliga", caps: 45, goals: 16 },
  // Netherlands
  { name: "Virgil van Dijk", club: "Liverpool", league: "Premier League", caps: 74, goals: 8 },
  { name: "Cody Gakpo", club: "Liverpool", league: "Premier League", caps: 42, goals: 16 },
  // Morocco
  { name: "Achraf Hakimi", club: "PSG", league: "Ligue 1", caps: 82, goals: 16 },
  // Japan
  { name: "Takefusa Kubo", club: "Real Sociedad", league: "La Liga", caps: 50, goals: 12 },
];

async function seedMock() {
  const dbPlayers = await prisma.player.findMany();
  let updated = 0;
  const notFound: string[] = [];

  for (const mock of MOCK_PLAYERS) {
    const nameLower = mock.name.toLowerCase();
    const match = dbPlayers.find((p) =>
      p.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(p.name.toLowerCase())
    );

    if (match) {
      await prisma.player.update({
        where: { id: match.id },
        data: {
          club: mock.club,
          league: mock.league,
          caps: mock.caps,
          goals: mock.goals,
        },
      });
      updated++;
    } else {
      notFound.push(mock.name);
    }
  }

  return { updated, notFound };
}

async function seedFromApi() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY not configured" }, { status: 500 });
  }

  const headers = { "x-apisports-key": apiKey };

  // Step 1: Get all fixtures from DB to find api-football fixture IDs
  const matches = await prisma.match.findMany({ select: { fixture: true } });
  if (matches.length === 0) {
    return NextResponse.json({ error: "No matches in DB" }, { status: 400 });
  }

  // Step 2: For each fixture, call api-football to get team IDs
  const apiTeamIds = new Set<number>();
  // Sample at most 10 fixtures to reduce quota usage
  const sampleFixtures = matches.slice(0, 10);

  for (const m of sampleFixtures) {
    try {
      const res = await fetch(`${API_BASE}/fixtures?id=${m.fixture}`, { headers });
      const data = await res.json() as { response: Array<{ teams: { home: { id: number }; away: { id: number } } }> };
      if (data.response?.[0]) {
        apiTeamIds.add(data.response[0].teams.home.id);
        apiTeamIds.add(data.response[0].teams.away.id);
      }
    } catch {
      // skip on error
    }
  }

  if (apiTeamIds.size === 0) {
    return NextResponse.json({ error: "Could not extract team IDs from fixtures" }, { status: 500 });
  }

  // Step 3: For each team, fetch players with stats (includes club info)
  interface ApiPlayer {
    player: { id: number; name: string; age: number; photo: string; birth: { date: string } };
    statistics: Array<{ team: { name: string }; league: { name: string }; games: { appearences: number }; goals: { total: number } }>;
  }

  const playerMap = new Map<string, { club: string; league: string; caps: number; goals: number; photoUrl: string; dateOfBirth: string }>();

  for (const teamId of apiTeamIds) {
    try {
      const res = await fetch(`${API_BASE}/players?team=${teamId}&league=1&season=2026`, { headers });
      const data = await res.json() as { response: ApiPlayer[] };
      for (const entry of data.response ?? []) {
        const stat = entry.statistics?.[0];
        if (!stat) continue;
        playerMap.set(entry.player.name.toLowerCase(), {
          club: stat.team.name,
          league: stat.league.name,
          caps: stat.games.appearences ?? 0,
          goals: stat.goals.total ?? 0,
          photoUrl: entry.player.photo ?? "",
          dateOfBirth: entry.player.birth?.date ?? "",
        });
      }
    } catch {
      // skip on error
    }
  }

  // Step 4: Match to DB players and update
  const dbPlayers = await prisma.player.findMany();
  let updated = 0;
  const notFound: string[] = [];

  for (const dbPlayer of dbPlayers) {
    const nameLower = dbPlayer.name.toLowerCase();
    const found = playerMap.get(nameLower);
    if (found) {
      await prisma.player.update({
        where: { id: dbPlayer.id },
        data: {
          club: found.club,
          league: found.league,
          caps: found.caps,
          goals: found.goals,
          photoUrl: found.photoUrl || undefined,
          dateOfBirth: found.dateOfBirth,
        },
      });
      updated++;
    } else {
      notFound.push(dbPlayer.name);
    }
  }

  return NextResponse.json({ updated, notFound, teamsScanned: apiTeamIds.size });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mock = searchParams.get("mock") === "true";

  if (mock) {
    const result = await seedMock();
    return NextResponse.json(result);
  }

  return seedFromApi();
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as authed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AF_BASE = "https://v3.football.api-sports.io";


interface AfPlayerStat {
  player: { id: number; name: string; photo?: string };
  statistics: Array<{
    games: { minutes: number | null; number: number | null; position: string | null; rating: string | null; captain: boolean; substitute: boolean };
    shots: { total: number | null; on: number | null } | null;
    goals: { total: number | null; conceded: number | null; assists: number | null } | null;
    passes: { total: number | null; key: number | null; accuracy: string | null } | null;
    tackles: { total: number | null; blocks: number | null; interceptions: number | null } | null;
    duels: { total: number | null; won: number | null } | null;
    dribbles: { attempts: number | null; success: number | null } | null;
    fouls: { drawn: number | null; committed: number | null } | null;
    cards: { yellow: number | null; red: number | null } | null;
    penalty: { scored: number | null; missed: number | null } | null;
  }>;
}

interface AfResponse {
  team: { id: number; name: string };
  players: AfPlayerStat[];
}

function n(v: number | null | undefined): number {
  return v ?? 0;
}

async function ingestFixture(fixtureId: number): Promise<{ playersIngested: number; notMatched: string[] }> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY not configured");

  const res = await fetch(`${AF_BASE}/fixtures/players?fixture=${fixtureId}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`api-football returned ${res.status}`);

  const json = await res.json() as { response: AfResponse[] };
  const teamBlocks: AfResponse[] = json.response ?? [];

  if (teamBlocks.length === 0) return { playersIngested: 0, notMatched: [] };

  // Find our DB match by fixture id
  const dbMatch = await prisma.match.findUnique({ where: { fixture: fixtureId } });
  if (!dbMatch) throw new Error(`Match with fixture ${fixtureId} not in DB`);

  // Load all players so we can fuzzy-match names
  const dbPlayers = await prisma.player.findMany({ select: { id: true, name: true } });

  const notMatched: string[] = [];
  let playersIngested = 0;

  for (const block of teamBlocks) {
    for (const entry of block.players) {
      const stat = entry.statistics?.[0];
      if (!stat) continue;

      const minutes = n(stat.games.minutes);
      if (minutes === 0 && !stat.games.substitute) continue; // truly didn't play

      // Name matching: api-football uses "L. Messi", DB may have "Lionel Messi"
      const afName = entry.player.name.toLowerCase();
      const dbPlayer = dbPlayers.find((p) => {
        const dbName = p.name.toLowerCase();
        if (dbName === afName) return true;
        // "L. Messi" vs "Lionel Messi" — check if last name matches and first initial matches
        const afParts = afName.split(" ");
        const dbParts = dbName.split(" ");
        if (afParts.length >= 2 && dbParts.length >= 2) {
          const afFirst = afParts[0];
          const afLast = afParts.slice(1).join(" ");
          const dbFirst = dbParts[0];
          const dbLast = dbParts.slice(1).join(" ");
          if (afLast === dbLast && (afFirst === dbFirst || dbFirst.startsWith(afFirst.replace(".", "")) || afFirst.startsWith(dbFirst[0] + "."))) return true;
        }
        return dbName.includes(afName) || afName.includes(dbName);
      });

      if (!dbPlayer) {
        notMatched.push(entry.player.name);
        continue;
      }

      const goals     = n(stat.goals?.total);
      const assists   = n(stat.goals?.assists);
      const rating    = parseFloat(stat.games.rating ?? "0") || 0;
      const matchData = {
        minutesPlayed:    minutes,
        rating,
        goals,
        assists,
        captain:          stat.games.captain,
        substitute:       stat.games.substitute,
        shotsTotal:       n(stat.shots?.total),
        shotsOnTarget:    n(stat.shots?.on),
        passesTotal:      n(stat.passes?.total),
        passesKey:        n(stat.passes?.key),
        passAccuracy:     parseInt(stat.passes?.accuracy ?? "0") || 0,
        tacklesTotal:     n(stat.tackles?.total),
        tackleBlocks:     n(stat.tackles?.blocks),
        interceptions:    n(stat.tackles?.interceptions),
        duelsTotal:       n(stat.duels?.total),
        duelsWon:         n(stat.duels?.won),
        dribblesAttempts: n(stat.dribbles?.attempts),
        dribblesSuccess:  n(stat.dribbles?.success),
        foulsDrawn:       n(stat.fouls?.drawn),
        foulsCommitted:   n(stat.fouls?.committed),
        yellowCards:      n(stat.cards?.yellow),
        redCards:         n(stat.cards?.red),
        penaltiesScored:  n(stat.penalty?.scored),
        penaltiesMissed:  n(stat.penalty?.missed),
      };

      // Upsert per-match stat
      await prisma.playerMatchStat.upsert({
        where: { playerId_matchId: { playerId: dbPlayer.id, matchId: dbMatch.id } },
        create: { playerId: dbPlayer.id, matchId: dbMatch.id, ...matchData },
        update: matchData,
      });

      // Aggregate into tournament totals: recompute from all match stats for this player
      const allMatchStats = await prisma.playerMatchStat.findMany({
        where: { playerId: dbPlayer.id },
      });

      const matchCount = allMatchStats.length;
      const totals = allMatchStats.reduce((acc, s) => ({
        goals:            acc.goals + s.goals,
        assists:          acc.assists + s.assists,
        minutesPlayed:    acc.minutesPlayed + s.minutesPlayed,
        yellowCards:      acc.yellowCards + s.yellowCards,
        redCards:         acc.redCards + s.redCards,
        shotsTotal:       acc.shotsTotal + s.shotsTotal,
        shotsOnTarget:    acc.shotsOnTarget + s.shotsOnTarget,
        passesTotal:      acc.passesTotal + s.passesTotal,
        passesKey:        acc.passesKey + s.passesKey,
        tacklesTotal:     acc.tacklesTotal + s.tacklesTotal,
        tackleBlocks:     acc.tackleBlocks + s.tackleBlocks,
        interceptions:    acc.interceptions + s.interceptions,
        duelsTotal:       acc.duelsTotal + s.duelsTotal,
        duelsWon:         acc.duelsWon + s.duelsWon,
        dribblesAttempts: acc.dribblesAttempts + s.dribblesAttempts,
        dribblesSuccess:  acc.dribblesSuccess + s.dribblesSuccess,
        foulsDrawn:       acc.foulsDrawn + s.foulsDrawn,
        foulsCommitted:   acc.foulsCommitted + s.foulsCommitted,
        penaltiesScored:  acc.penaltiesScored + s.penaltiesScored,
        penaltiesMissed:  acc.penaltiesMissed + s.penaltiesMissed,
        ratingSum:        acc.ratingSum + s.rating,
      }), {
        goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0, redCards: 0,
        shotsTotal: 0, shotsOnTarget: 0, passesTotal: 0, passesKey: 0,
        tacklesTotal: 0, tackleBlocks: 0, interceptions: 0, duelsTotal: 0, duelsWon: 0,
        dribblesAttempts: 0, dribblesSuccess: 0, foulsDrawn: 0, foulsCommitted: 0,
        penaltiesScored: 0, penaltiesMissed: 0, ratingSum: 0,
      });

      await prisma.playerTournamentStat.upsert({
        where:  { playerId: dbPlayer.id },
        create: {
          playerId: dbPlayer.id,
          matches: matchCount,
          rating: matchCount > 0 ? totals.ratingSum / matchCount : 0,
          ...totals,
        },
        update: {
          matches: matchCount,
          rating: matchCount > 0 ? totals.ratingSum / matchCount : 0,
          ...totals,
        },
      });

      playersIngested++;
    }
  }

  return { playersIngested, notMatched };
}

async function handler(req: Request) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fixtureParam = searchParams.get("fixture");

  // Single fixture mode
  if (fixtureParam) {
    const fixtureId = parseInt(fixtureParam);
    if (isNaN(fixtureId)) return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
    try {
      const result = await ingestFixture(fixtureId);
      return NextResponse.json({ ok: true, fixture: fixtureId, ...result });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // Batch mode: ingest all FT matches not yet ingested (or re-ingest all)
  const force = searchParams.get("force") === "true";

  const ftMatches = await prisma.match.findMany({
    where: { status: "FT" },
    select: { id: true, fixture: true },
    orderBy: { date: "asc" },
  });

  // Find which fixtures already have at least one PlayerMatchStat entry (skip unless force)
  const alreadyIngested = force ? new Set<string>() : new Set(
    (await prisma.playerMatchStat.findMany({ select: { matchId: true }, distinct: ["matchId"] }))
      .map((s) => s.matchId)
  );

  const toIngest = ftMatches.filter((m) => !alreadyIngested.has(m.id));

  let totalPlayers = 0;
  const errors: string[] = [];

  for (const m of toIngest) {
    try {
      const result = await ingestFixture(m.fixture);
      totalPlayers += result.playersIngested;
    } catch (e) {
      errors.push(`fixture ${m.fixture}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    matchesIngested: toIngest.length,
    totalPlayersIngested: totalPlayers,
    skipped: ftMatches.length - toIngest.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

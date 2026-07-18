export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeamTournamentProb } from "@/lib/polymarket";

// ─────────────────────────────────────────────────────────────────────────────
// Matchday Tale of the Tape (owner 7/18) — side-by-side FULL-tournament
// aggregates for a fixture's two teams, plus Polymarket tournament-winner
// probabilities when available. FACTS ONLY: everything here is arithmetic over
// real FT results in our DB or a quoted market number — the emotional/IT-factor
// layer lives in the Roundtable episode (clearly-labeled opinion).
// ─────────────────────────────────────────────────────────────────────────────

export interface TapeSide {
  name: string;
  tla: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  biggestWin: string | null; // e.g. "4-0 v Norway"
  form: string;              // last-5 letters, most recent first, e.g. "WWLWD"
  titleProb: number | null;  // Polymarket tournament-winner probability (0-1)
}

let _cache = new Map<number, { ts: number; data: { home: TapeSide; away: TapeSide } }>();
const TTL = 10 * 60 * 1000;

async function sideFor(teamId: string): Promise<Omit<TapeSide, "titleProb" | "name" | "tla"> | null> {
  const played = await prisma.match.findMany({
    where: { status: "FT", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "desc" },
  });
  if (played.length === 0) return null;

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, cleanSheets = 0;
  let biggestWin: { margin: number; text: string } | null = null;
  const formLetters: string[] = [];

  for (const m of played) {
    const isHome = m.homeTeamId === teamId;
    const f = (isHome ? m.homeScore : m.awayScore) ?? 0;
    const a = (isHome ? m.awayScore : m.homeScore) ?? 0;
    const opponent = isHome ? m.awayTeam.name : m.homeTeam.name;
    goalsFor += f;
    goalsAgainst += a;
    if (a === 0) cleanSheets++;
    if (f > a) {
      wins++;
      if (!biggestWin || f - a > biggestWin.margin) biggestWin = { margin: f - a, text: `${f}-${a} v ${opponent}` };
    } else if (f === a) draws++;
    else losses++;
    if (formLetters.length < 5) formLetters.push(f > a ? "W" : f === a ? "D" : "L");
  }

  return {
    played: played.length,
    wins, draws, losses, goalsFor, goalsAgainst, cleanSheets,
    biggestWin: biggestWin?.text ?? null,
    form: formLetters.join(""),
  };
}

export async function GET(req: Request) {
  const fixture = parseInt(new URL(req.url).searchParams.get("fixture") ?? "", 10);
  if (!fixture) return NextResponse.json({ error: "fixture required" }, { status: 400 });

  const cached = _cache.get(fixture);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ tape: cached.data, cached: true });
  }

  try {
    const match = await prisma.match.findFirst({
      where: { fixture },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match || match.homeTeam.code === "TBD" || match.awayTeam.code === "TBD") {
      return NextResponse.json({ tape: null });
    }

    const [homeAgg, awayAgg] = await Promise.all([sideFor(match.homeTeamId), sideFor(match.awayTeamId)]);
    if (!homeAgg || !awayAgg) return NextResponse.json({ tape: null });

    let pHome: number | null = null, pAway: number | null = null;
    try {
      [pHome, pAway] = await Promise.all([
        getTeamTournamentProb(match.homeTeam.code),
        getTeamTournamentProb(match.awayTeam.code),
      ]);
    } catch { /* market data optional */ }

    const data = {
      home: { name: match.homeTeam.name, tla: match.homeTeam.code, ...homeAgg, titleProb: pHome },
      away: { name: match.awayTeam.name, tla: match.awayTeam.code, ...awayAgg, titleProb: pAway },
    };
    _cache.set(fixture, { ts: Date.now(), data });
    return NextResponse.json({ tape: data, cached: false });
  } catch (e) {
    console.error("[matchday/tape]", e);
    if (cached) return NextResponse.json({ tape: cached.data, cached: true, stale: true });
    return NextResponse.json({ tape: null }, { status: 503 });
  }
}

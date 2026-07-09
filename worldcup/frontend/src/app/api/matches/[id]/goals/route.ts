import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface MissedPen {
  minute: number;
  team: string;
  player: string;
}

export interface GoalEvent {
  minute: number;
  team: string;
  scorer: string;
  assist: string | null;
  isOwnGoal: boolean;
  isPenalty: boolean;
  // True when this goal was reconstructed from the scoreline (events feed
  // lagging) — minute is approximate and scorer is not yet known. UIs must
  // never present pending goals as confirmed scorer facts.
  pending?: boolean;
}

interface ApiFootballEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

// Deterministic RNG seeded from the fixture so simulated goals are stable
// across requests (no flicker between polls).
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Reconstruct placeholder goal events when the live events feed lags the
// scoreline, so the Match DNA timeline still reflects the on-screen score.
// NEVER invents scorer names — a real, named player must never be shown as
// having scored when we don't actually know who did. Minutes are approximate
// slots and every event is flagged `pending` so UIs render it honestly.
function reconstructGoals(
  fixture: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  maxMinute: number,
): GoalEvent[] {
  const total = homeScore + awayScore;
  if (total === 0) return [];

  const rand = seededRand(fixture * 7 + 13);
  const cap = Math.max(5, Math.min(maxMinute, 90));

  // Unique minutes spread across the played window
  const minutes: number[] = [];
  let guard = 0;
  while (minutes.length < total && guard < total * 50) {
    guard++;
    const m = 1 + Math.floor(rand() * cap);
    if (!minutes.includes(m)) minutes.push(m);
  }
  while (minutes.length < total) minutes.push(Math.min(cap, minutes.length + 1));
  minutes.sort((a, b) => a - b);

  // Assign goals to teams: home goals fill first slots by shuffled order
  const sides: ("home" | "away")[] = [
    ...Array(homeScore).fill("home"),
    ...Array(awayScore).fill("away"),
  ];
  // Deterministic shuffle so home/away goals interleave naturally
  for (let i = sides.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [sides[i], sides[j]] = [sides[j], sides[i]];
  }

  return minutes.map((minute, i) => {
    const isHome = sides[i] === "home";
    return {
      minute,
      team: isHome ? homeTeam : awayTeam,
      scorer: "Scorer TBC",
      assist: null,
      isOwnGoal: false,
      isPenalty: false,
      pending: true,
    };
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Admin override takes priority over any external source
  if (match.goalEvents) {
    const overrideGoals = match.goalEvents as unknown as GoalEvent[];
    return NextResponse.json({ goals: overrideGoals, source: "override" });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  // Try the real live events feed first
  if (apiKey) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures/events?fixture=${match.fixture}`,
        {
          headers: { "x-apisports-key": apiKey },
          next: { revalidate: 8 },
        }
      );

      if (res.ok) {
        const json = await res.json();
        const events: ApiFootballEvent[] = json.response ?? [];
        // api-football emits MISSED penalties as type "Goal" with detail
        // "Missed Penalty" — counting those as goals showed Mbappé "scoring"
        // a PK he missed (owner report, live FRA-MAR). They are key moments,
        // not goals: surfaced separately as missedPens.
        const goals: GoalEvent[] = events
          .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
          .map((e) => ({
            minute: e.time.elapsed,
            team: e.team.name,
            scorer: e.player.name,
            assist: e.assist.name ?? null,
            isOwnGoal: e.detail === "Own Goal",
            isPenalty: e.detail === "Penalty",
          }));
        const missedPens = events
          .filter((e) => e.type === "Goal" && e.detail === "Missed Penalty")
          .map((e) => ({ minute: e.time.elapsed, team: e.team.name, player: e.player.name }));

        // Sanity-check: own-goal attribution is reversed (credit goes to other team),
        // so compute effective home/away goal counts and compare against the known score.
        // If they don't match, the events feed has bad data — discard it rather than
        // displaying wrong scorers to users.
        if (goals.length > 0 && match.status === "FT") {
          const homeEffective = goals.filter(
            (g) => g.isOwnGoal ? g.team !== match.homeTeam.name : g.team === match.homeTeam.name
          ).length;
          const awayEffective = goals.filter(
            (g) => g.isOwnGoal ? g.team !== match.awayTeam.name : g.team === match.awayTeam.name
          ).length;
          if (homeEffective !== match.homeScore || awayEffective !== match.awayScore) {
            // Event totals don't match the confirmed scoreline — data is corrupt.
            return NextResponse.json({ goals: [], dataWarning: "event_score_mismatch" });
          }
        }

        if (goals.length > 0 || missedPens.length > 0) return NextResponse.json({ goals, missedPens });
        // No real events yet — fall through to simulation below (LIVE/HT only)
      }
    } catch {
      // fall through to simulation
    }
  }

  // For finished matches, never simulate — return empty so the UI shows
  // "no event data" rather than fabricated scorer names.
  if (match.status === "FT") {
    return NextResponse.json({ goals: [] });
  }

  // Fallback: reconstruct placeholder events from the current score so the
  // Match DNA timeline stays in sync with the scoreboard during live play.
  const isLive = ["LIVE", "HT"].includes(match.status);
  if (!isLive || match.homeScore + match.awayScore === 0) {
    return NextResponse.json({ goals: [] });
  }

  const maxMinute = match.status === "HT" ? 45 : match.elapsed || 90;
  const goals = reconstructGoals(
    match.fixture,
    match.homeTeam.name,
    match.awayTeam.name,
    match.homeScore,
    match.awayScore,
    maxMinute,
  );

  return NextResponse.json({ goals, source: "reconstructed" });
}

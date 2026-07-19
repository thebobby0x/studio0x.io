export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";

// ─────────────────────────────────────────────────────────────────────────────
// Tournament Player Boards (owner 7/19) — the debate engine, built ONLY from
// real api-football goal events (the data source verified available on our
// plan; the per-player match-stats endpoint returns empty, so ratings-based
// PPI™ stays parked until a plan upgrade).
//
// Events for finished matches are fetched once, persisted to Match.goalEvents
// (same shape Match DNA™ reads), and aggregated into: Golden Boot, Playmakers
// (assists), Clutch Scorers (80'+ goals). Own goals are EXCLUDED from scorer
// tallies; `pending` reconstructed goals are excluded everywhere (no
// unconfirmed scorer facts — CONTENT TRUTH rule). Coverage is reported
// honestly so the UI can say exactly what the boards are built from.
// ─────────────────────────────────────────────────────────────────────────────

const AF_BASE = "https://v3.football.api-sports.io";

export interface BoardRow {
  player: string;
  team: string;    // team name
  tla: string;     // team code for flags
  value: number;
  penalties?: number; // golden boot: how many of the goals were pens
}

interface Boards {
  goldenBoot: BoardRow[];
  playmakers: BoardRow[];
  clutch: BoardRow[];
  coverage: { matches: number; withEvents: number };
  generatedAt: string;
}

let _cache: { ts: number; data: Boards } | null = null;
const TTL = 15 * 60 * 1000;

interface AfEvent {
  time: { elapsed: number };
  team: { name: string };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

async function fetchAndStoreEvents(fixture: number, matchId: string): Promise<GoalEvent[] | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixture}`, {
      headers: { "x-apisports-key": key },
      // Finished matches never change — cache the upstream response a full day.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const events: AfEvent[] = json.response ?? [];
    if (events.length === 0) return null;

    const goals: GoalEvent[] = events
      .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
      .map((e) => ({
        minute: e.time.elapsed,
        team: e.team.name,
        scorer: e.player.name,
        assist: e.assist?.name ?? null,
        isOwnGoal: e.detail === "Own Goal",
        isPenalty: e.detail === "Penalty",
      }));
    if (goals.length === 0) return null;

    // Write-back: subsequent board builds (and Match DNA™) read from the DB —
    // zero further API spend for this fixture, ever.
    await prisma.match
      .update({ where: { id: matchId }, data: { goalEvents: goals as unknown as Prisma.InputJsonValue } })
      .catch(() => {});
    return goals;
  } catch {
    return null;
  }
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < TTL) {
    return NextResponse.json({ boards: _cache.data, cached: true });
  }

  try {
    const matches = await prisma.match.findMany({
      where: { status: "FT" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });

    const goalsByScorer = new Map<string, { team: string; tla: string; goals: number; pens: number }>();
    const assists = new Map<string, { team: string; tla: string; count: number }>();
    const clutch = new Map<string, { team: string; tla: string; count: number }>();
    let withEvents = 0;

    for (const m of matches) {
      let events = (m.goalEvents as unknown as GoalEvent[] | null) ?? null;
      if (!events || events.length === 0) {
        events = await fetchAndStoreEvents(m.fixture, m.id);
      }
      if (!events || events.length === 0) continue;
      withEvents++;

      const tlaFor = (teamName: string): string =>
        teamName === m.homeTeam.name ? m.homeTeam.code : teamName === m.awayTeam.name ? m.awayTeam.code : "";

      for (const g of events) {
        if (g.pending) continue; // unconfirmed scorer — never counted
        const tla = tlaFor(g.team);
        if (!g.isOwnGoal && g.scorer && g.scorer !== "Scorer TBC") {
          const k = `${g.scorer}|${tla}`;
          const row = goalsByScorer.get(k) ?? { team: g.team, tla, goals: 0, pens: 0 };
          row.goals++;
          if (g.isPenalty) row.pens++;
          goalsByScorer.set(k, row);
          if (g.minute >= 80) {
            const c = clutch.get(k) ?? { team: g.team, tla, count: 0 };
            c.count++;
            clutch.set(k, c);
          }
        }
        if (g.assist) {
          const k = `${g.assist}|${tla}`;
          const a = assists.get(k) ?? { team: g.team, tla, count: 0 };
          a.count++;
          assists.set(k, a);
        }
      }
    }

    const toRows = <T extends { team: string; tla: string }>(
      map: Map<string, T>,
      value: (v: T) => number,
      extra?: (v: T) => Partial<BoardRow>,
      limit = 10
    ): BoardRow[] =>
      [...map.entries()]
        .map(([k, v]) => ({ player: k.split("|")[0], team: v.team, tla: v.tla, value: value(v), ...(extra?.(v) ?? {}) }))
        .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player))
        .slice(0, limit);

    const data: Boards = {
      goldenBoot: toRows(goalsByScorer, (v) => v.goals, (v) => ({ penalties: v.pens }), 10),
      playmakers: toRows(assists, (v) => v.count, undefined, 8),
      clutch: toRows(clutch, (v) => v.count, undefined, 8),
      coverage: { matches: matches.length, withEvents },
      generatedAt: new Date().toISOString(),
    };
    _cache = { ts: Date.now(), data };
    return NextResponse.json({ boards: data, cached: false });
  } catch (e) {
    console.error("[stats/boards]", e);
    if (_cache) return NextResponse.json({ boards: _cache.data, cached: true, stale: true });
    return NextResponse.json({ boards: null }, { status: 503 });
  }
}

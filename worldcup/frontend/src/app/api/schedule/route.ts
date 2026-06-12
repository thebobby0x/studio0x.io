import { NextResponse } from "next/server";

const BASE = "https://api.football-data.org/v4";
const CACHE_TTL = 120_000;

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "NS", TIMED: "NS",
  IN_PLAY: "LIVE", PAUSED: "HT",
  FINISHED: "FT", SUSPENDED: "FT",
  POSTPONED: "NS", CANCELLED: "NS", AWARDED: "FT",
};

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_32: "Round of 32", ROUND_OF_32: "Round of 32",
  LAST_16: "Round of 16", ROUND_OF_16: "Round of 16",
  QUARTER_FINALS: "Quarter Final",
  SEMI_FINALS: "Semi Final",
  THIRD_PLACE: "3rd Place",
  FINAL: "Final",
};

interface FDTeam { name: string; shortName?: string; tla: string }
interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  minute?: number;
  stage: string;
  group?: string | null;
  matchday?: number;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

export interface ScheduleMatch {
  id: number;
  utcDate: string;
  status: "NS" | "LIVE" | "HT" | "FT";
  minute: number;
  stage: string;
  stageLabel: string;
  group: string;
  matchday: number;
  homeTeam: { name: string; tla: string };
  awayTeam: { name: string; tla: string };
  homeScore: number | null;
  awayScore: number | null;
}

let _cache: { ts: number; data: ScheduleMatch[] } | null = null;

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data);
  }

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return NextResponse.json([], { status: 503 });

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${BASE}/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[schedule] ${res.status}`);
      return NextResponse.json(_cache?.data ?? [], { status: 502 });
    }

    const json = await res.json();
    const raw: FDMatch[] = json.matches ?? [];

    const data: ScheduleMatch[] = raw.map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: (STATUS_MAP[m.status] ?? "NS") as ScheduleMatch["status"],
      minute: m.minute ?? 0,
      stage: m.stage,
      stageLabel: STAGE_LABELS[m.stage] ?? m.stage,
      group: m.group ? m.group.replace("GROUP_", "") : "",
      matchday: m.matchday ?? 0,
      homeTeam: { name: m.homeTeam.shortName ?? m.homeTeam.name, tla: m.homeTeam.tla },
      awayTeam: { name: m.awayTeam.shortName ?? m.awayTeam.name, tla: m.awayTeam.tla },
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
    }));

    _cache = { ts: Date.now(), data };
    console.log(`[schedule] fetched ${data.length} matches`);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[schedule] error:", e);
    return NextResponse.json(_cache?.data ?? [], { status: 503 });
  }
}

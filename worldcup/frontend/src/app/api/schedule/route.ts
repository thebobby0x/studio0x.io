import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE   = "https://v3.football.api-sports.io";
const LEAGUE = 1;    // FIFA World Cup
const SEASON = 2026;
const CACHE_TTL = 300_000; // 5 min

const STATUS_MAP: Record<string, string> = {
  NS: "NS", "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET: "LIVE", BT: "HT", P: "LIVE",
  FT: "FT", AET: "FT", PEN: "FT",
  PST: "NS", CANC: "NS", ABD: "NS",
  AWD: "FT", WO: "FT", SUSP: "LIVE", INT: "LIVE", LIVE: "LIVE",
};

const ROUND_TO_STAGE: Record<string, string> = {
  "Round of 32":    "LAST_32",
  "Round of 16":    "LAST_16",
  "Quarter-finals": "QUARTER_FINALS",
  "Semi-finals":    "SEMI_FINALS",
  "3rd Place Final":"THIRD_PLACE",
  "Final":          "FINAL",
};

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE:     "Group Stage",
  LAST_32:         "Round of 32",
  LAST_16:         "Round of 16",
  QUARTER_FINALS:  "Quarter Final",
  SEMI_FINALS:     "Semi Final",
  THIRD_PLACE:     "3rd Place",
  FINAL:           "Final",
};

// Static group assignments for WC 2026
const TEAM_GROUPS: Record<string, string> = {
  MEX: "A", RSA: "A", KOR: "A", CZE: "A",
  CAN: "B", BIH: "B", QAT: "B", SUI: "B",
  BRA: "C", MAR: "C", HAI: "C", SCO: "C",
  USA: "D", PAR: "D", AUS: "D", TUR: "D",
  GER: "E", CUW: "E", CIV: "E", ECU: "E",
  NED: "F", JPN: "F", SWE: "F", TUN: "F",
  BEL: "G", EGY: "G", IRN: "G", NZL: "G",
  ESP: "H", CPV: "H", KSA: "H", URU: "H",
  FRA: "I", SEN: "I", IRQ: "I", NOR: "I",
  ARG: "J", ALG: "J", AUT: "J", JOR: "J",
  POR: "K", COD: "K", UZB: "K", COL: "K",
  ENG: "L", CRO: "L", GHA: "L", PAN: "L",
};

interface AFFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league:  { round: string };
  teams: {
    home: { id: number; name: string; code: string | null };
    away: { id: number; name: string; code: string | null };
  };
  goals: { home: number | null; away: number | null };
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
// name→code lookup loaded once from DB (teams rarely change)
let _nameToCode: Map<string, string> | null = null;

async function getNameToCode(): Promise<Map<string, string>> {
  if (_nameToCode && _nameToCode.size > 0) return _nameToCode;
  try {
    const teams = await prisma.team.findMany({ select: { name: true, code: true } });
    _nameToCode = new Map(teams.map(t => [t.name.toLowerCase(), t.code]));
  } catch {
    _nameToCode = new Map();
  }
  return _nameToCode;
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data);
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json([], { status: 503 });

  const nameToCode = await getNameToCode();

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(
      `${BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`,
      { headers: { "x-apisports-key": apiKey, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" }
    );

    if (!res.ok) {
      console.warn(`[schedule] api-football ${res.status}`);
      return NextResponse.json(_cache?.data ?? [], { status: 502 });
    }

    const json  = await res.json();
    const raw: AFFixture[] = json.response ?? [];

    const data: ScheduleMatch[] = raw.map((f) => {
      const round    = f.league.round;
      const gsMatch  = round.match(/^Group Stage - (\d+)$/i);
      const stage    = gsMatch ? "GROUP_STAGE" : (ROUND_TO_STAGE[round] ?? round);
      const matchday = gsMatch ? parseInt(gsMatch[1], 10) : 0;
      // api-football fixtures endpoint returns code:null; fall back to DB name→code lookup
      const homeTla  = (f.teams.home.code ?? nameToCode.get(f.teams.home.name.toLowerCase()) ?? "").toUpperCase();
      const awayTla  = (f.teams.away.code ?? nameToCode.get(f.teams.away.name.toLowerCase()) ?? "").toUpperCase();
      const group    = TEAM_GROUPS[homeTla] ?? TEAM_GROUPS[awayTla] ?? "";
      const status   = (STATUS_MAP[f.fixture.status.short] ?? "NS") as ScheduleMatch["status"];

      return {
        id:         f.fixture.id,
        utcDate:    f.fixture.date,
        status,
        minute:     f.fixture.status.elapsed ?? 0,
        stage,
        stageLabel: STAGE_LABELS[stage] ?? stage,
        group,
        matchday,
        homeTeam:   { name: f.teams.home.name, tla: homeTla },
        awayTeam:   { name: f.teams.away.name, tla: awayTla },
        homeScore:  f.goals.home,
        awayScore:  f.goals.away,
      };
    });

    _cache = { ts: Date.now(), data };
    console.log(`[schedule] fetched ${data.length} fixtures from api-football.com`);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[schedule] error:", e);
    return NextResponse.json(_cache?.data ?? [], { status: 503 });
  }
}

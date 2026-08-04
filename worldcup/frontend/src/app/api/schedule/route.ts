import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyRound } from "@/lib/tournament";
import { AF_LEAGUE, AF_SEASON, SPORT } from "@/lib/sportConfig";
import { slugCode } from "@/lib/teamIdentity";

const BASE   = "https://v3.football.api-sports.io";
const LEAGUE = AF_LEAGUE; // deployment config (worldcup 1 / leaguescup 772)
const SEASON = AF_SEASON;
const CACHE_TTL = 20_000; // 20s bulk schedule (reduced from 60s)
const LIVE_TTL  = 15_000; // 10s live overlay — widened pre-final (7/19): 2,915 used at 17:30Z, worst-case ET+pens must fit in the 4,585 remaining

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

// Static group assignments come from the deployment config. WC26 keeps its
// nation map; LC26's is empty (single league phase, no groups) — applying the WC
// map to club codes is what labeled six Leagues Cup fixtures "Group K", because
// Columbus Crew's feed code "COL" is Colombia's FIFA TLA.
const TEAM_GROUPS: Record<string, string> = SPORT.teamGroups;

/**
 * Feed team → display code. Nation deployments trust the feed's FIFA TLA;
 * club deployments derive a code, because the feed omits `team.code` for 14 of
 * the 36 Leagues Cup clubs (every one of them rendered with a blank badge) and
 * the codes it does emit collide with nation TLAs.
 */
function resolveTla(t: { name: string; code?: string | null }, nameToCode: Map<string, string>): string {
  const fromDb = nameToCode.get(t.name.toLowerCase());
  if (fromDb) return fromDb.toUpperCase();
  if (SPORT.feedCodesAreNationTlas) return (t.code ?? "").toUpperCase();
  return slugCode(t.name);
}

interface AFFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league:  { round: string };
  teams: {
    home: { id: number; name: string; code: string | null };
    away: { id: number; name: string; code: string | null };
  };
  goals: { home: number | null; away: number | null };
  score?: { penalty?: { home: number | null; away: number | null } };
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
  // `afId` is the api-football team id. Club deployments need it because a
  // club has no meaningful national flag — its badge is the crest at
  // media.api-sports.io/football/teams/<afId>.png. Null when unknown.
  homeTeam: { name: string; tla: string; afId: number | null };
  awayTeam: { name: string; tla: string; afId: number | null };
  homeScore: number | null;
  awayScore: number | null;
  // Shootout scores — null unless the game was decided on penalties. Needed so
  // a drawn-after-ET final can still name a champion (goals stay level in the feed).
  penHome: number | null;
  penAway: number | null;
}

interface LiveEntry {
  status: ScheduleMatch["status"];
  minute: number;
  homeScore: number | null;
  awayScore: number | null;
  penHome: number | null;
  penAway: number | null;
}

interface DbEntry {
  status: ScheduleMatch["status"];
  homeScore: number;
  awayScore: number;
  elapsed: number;
}

let _cache: { ts: number; data: ScheduleMatch[] } | null = null;
let _liveCache: { ts: number; data: Map<number, LiveEntry> } | null = null;
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

// DB overlay: corrects stale "NS" statuses for completed/live matches.
// api-football sometimes lags on status updates; DB (seeded and updated via seed route)
// is the authoritative source for FT matches.
async function getDbOverlay(): Promise<Map<number, DbEntry>> {
  try {
    const dbMatches = await prisma.match.findMany({
      where: { status: { in: ["FT", "LIVE", "HT"] } },
      select: { fixture: true, status: true, homeScore: true, awayScore: true, elapsed: true },
    });
    return new Map(dbMatches.map(m => [
      m.fixture,
      { status: m.status as ScheduleMatch["status"], homeScore: m.homeScore, awayScore: m.awayScore, elapsed: m.elapsed },
    ]));
  } catch {
    return new Map();
  }
}

// Synthesize schedule from DB when api-football returns empty results.
// Uses DB match records + Team relations to build ScheduleMatch objects.
async function synthesizeFromDb(): Promise<ScheduleMatch[]> {
  try {
    const dbMatches = await prisma.match.findMany({
      include: {
        homeTeam: { select: { name: true, code: true, groupStage: true, afTeamId: true } },
        awayTeam: { select: { name: true, code: true, groupStage: true, afTeamId: true } },
      },
      orderBy: { date: "asc" },
    });

    if (dbMatches.length === 0) return [];

    // Attempt to figure out matchday from position within group
    const groupMatchdayCounter = new Map<string, Map<string, number>>();

    return dbMatches.map(m => {
      const homeTla = m.homeTeam.code;
      const awayTla = m.awayTeam.code;
      const group = m.homeTeam.groupStage || m.awayTeam.groupStage || "";
      // Stage by DATE, not by group membership: knockout teams still carry their
      // group, so group-based classification labeled the 7/14 FRA-ESP semi-final
      // "Group Stage · Matchday 6" (France's 6th appearance). classifyRound maps
      // the fixture date to its real knockout round.
      const round = classifyRound(m.date);
      const stage = round ? (ROUND_TO_STAGE[round] ?? "KNOCKOUT") : "GROUP_STAGE";
      const isGroupStage = !round;

      // Compute matchday per group by counting matches per team
      let matchday = 0;
      if (isGroupStage) {
        if (!groupMatchdayCounter.has(group)) groupMatchdayCounter.set(group, new Map());
        const counter = groupMatchdayCounter.get(group)!;
        const homeCount = (counter.get(homeTla) ?? 0) + 1;
        counter.set(homeTla, homeCount);
        counter.set(awayTla, (counter.get(awayTla) ?? 0) + 1);
        matchday = homeCount; // 1, 2, or 3
      }

      return {
        id: m.fixture,
        utcDate: m.date.toISOString(),
        status: m.status as ScheduleMatch["status"],
        minute: m.elapsed,
        stage,
        stageLabel: STAGE_LABELS[stage] ?? stage,
        group,
        matchday,
        homeTeam: { name: m.homeTeam.name, tla: homeTla, afId: m.homeTeam.afTeamId },
        awayTeam: { name: m.awayTeam.name, tla: awayTla, afId: m.awayTeam.afTeamId },
        // LIVE/HT scores are real (maintained by the per-match live route) —
        // nulling them rendered a live 0-2 as 0-0 on the hero (7/14 FRA-ESP).
        homeScore: m.status !== "NS" ? m.homeScore : null,
        awayScore: m.status !== "NS" ? m.awayScore : null,
        // H-6: carry the shootout result through the degraded path so a
        // pens-decided final can still name a champion when the feed is down.
        penHome: m.penHome ?? null,
        penAway: m.penAway ?? null,
      };
    });
  } catch {
    return [];
  }
}

async function getLiveOverlay(apiKey: string): Promise<Map<number, LiveEntry>> {
  if (_liveCache && Date.now() - _liveCache.ts < LIVE_TTL) {
    return _liveCache.data;
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(
      `${BASE}/fixtures?league=${LEAGUE}&season=${SEASON}&live=all`,
      { headers: { "x-apisports-key": apiKey, Accept: "application/json" }, signal: ctrl.signal, next: { revalidate: 15 } }
    );

    if (!res.ok) {
      console.warn(`[schedule/live] api-football ${res.status}`);
      return _liveCache?.data ?? new Map();
    }

    const json = await res.json();
    const liveFixtures: AFFixture[] = json.response ?? [];

    const data = new Map<number, LiveEntry>();
    for (const f of liveFixtures) {
      data.set(f.fixture.id, {
        status: (STATUS_MAP[f.fixture.status.short] ?? "LIVE") as ScheduleMatch["status"],
        minute: f.fixture.status.elapsed ?? (f.fixture.status.short === "P" ? 120 : 0),
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        penHome: f.score?.penalty?.home ?? null,
        penAway: f.score?.penalty?.away ?? null,
      });
    }

    _liveCache = { ts: Date.now(), data };
    if (liveFixtures.length > 0) {
      console.log(`[schedule/live] ${liveFixtures.length} live fixture(s) overlaid`);
    }
    return data;
  } catch {
    return _liveCache?.data ?? new Map();
  }
}

function applyDbOverlay(data: ScheduleMatch[], overlay: Map<number, DbEntry>): ScheduleMatch[] {
  if (overlay.size === 0) return data;
  return data.map(m => {
    const db = overlay.get(m.id);
    if (!db) return m;
    // api-football reached a terminal status — never let a stale DB entry regress it back to LIVE/HT
    if (m.status === "FT") return m;
    // DB is useful when api-football still shows NS but match has actually started/finished
    if (m.status === "NS") return { ...m, status: db.status, homeScore: db.homeScore, awayScore: db.awayScore, minute: db.elapsed, penHome: null, penAway: null };
    // For LIVE/HT: the DB is actively maintained by the per-match live route (the
    // same rows the LiveMatchBanner shows), while our bulk feed can be a stale
    // cache or DB-synthesised snapshot when api-football flakes — the owner
    // watched a hero card stuck at 0-0/73' under a banner reading 0-2/73'
    // (7/14 FRA-ESP). Scores and minutes only move UP within a match, so
    // max-merge picks whichever side is fresher without needing timestamps.
    // The live overlay still runs after this and overwrites with real-time
    // feed data whenever it's available.
    return {
      ...m,
      minute:    Math.max(m.minute, db.elapsed),
      homeScore: Math.max(m.homeScore ?? 0, db.homeScore),
      awayScore: Math.max(m.awayScore ?? 0, db.awayScore),
    };
  });
}

function applyLiveOverlay(data: ScheduleMatch[], overlay: Map<number, LiveEntry>): ScheduleMatch[] {
  if (overlay.size === 0) return data;
  return data.map(m => {
    const live = overlay.get(m.id);
    if (!live) return m;
    return { ...m, ...live };
  });
}

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json([], { status: 503 });

  // ── Bulk schedule (60s TTL) ──────────────────────────────────────────────
  let baseData: ScheduleMatch[];

  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    baseData = _cache.data;
  } else {
    const nameToCode = await getNameToCode();

    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(
        `${BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`,
        // Shared Vercel data cache (revalidate) UNDER the per-instance module
        // cache: N warm instances collapse to ~1 upstream call per TTL window,
        // making the api-football budget traffic-independent (final-day math:
        // per-instance no-store at 3 instances ≈ 10.7k calls > 7.5k/day quota).
        { headers: { "x-apisports-key": apiKey, Accept: "application/json" }, signal: ctrl.signal, next: { revalidate: 20 } }
      );

      if (!res.ok) {
        console.warn(`[schedule] api-football ${res.status}`);
        baseData = _cache?.data ?? [];
      } else {
        const json  = await res.json();
        const raw: AFFixture[] = json.response ?? [];

        if (raw.length > 0) {
          baseData = raw.map((f) => {
            const round    = f.league.round;
            const gsMatch  = round.match(/^Group Stage - (\d+)$/i);
            const stage    = gsMatch ? "GROUP_STAGE" : (ROUND_TO_STAGE[round] ?? round);
            const matchday = gsMatch ? parseInt(gsMatch[1], 10) : 0;
            const homeTla  = resolveTla(f.teams.home, nameToCode);
            const awayTla  = resolveTla(f.teams.away, nameToCode);
            const group    = TEAM_GROUPS[homeTla] ?? TEAM_GROUPS[awayTla] ?? "";
            const status   = (STATUS_MAP[f.fixture.status.short] ?? "NS") as ScheduleMatch["status"];

            return {
              id:         f.fixture.id,
              utcDate:    f.fixture.date,
              status,
              // elapsed is null during penalty shootouts — 120, not 0
              minute:     f.fixture.status.elapsed ?? (f.fixture.status.short === "P" ? 120 : 0),
              stage,
              stageLabel: STAGE_LABELS[stage] ?? stage,
              group,
              matchday,
              homeTeam:   { name: f.teams.home.name, tla: homeTla, afId: f.teams.home.id },
              awayTeam:   { name: f.teams.away.name, tla: awayTla, afId: f.teams.away.id },
              homeScore:  f.goals.home,
              awayScore:  f.goals.away,
              penHome:    f.score?.penalty?.home ?? null,
              penAway:    f.score?.penalty?.away ?? null,
            };
          });

          _cache = { ts: Date.now(), data: baseData };
          console.log(`[schedule] fetched ${baseData.length} fixtures from api-football.com`);
        } else {
          // api-football returned 0 results — fall back to DB-synthesised schedule
          console.warn("[schedule] api-football returned 0 fixtures, synthesising from DB");
          baseData = await synthesizeFromDb();
          if (baseData.length > 0) {
            _cache = { ts: Date.now(), data: baseData };
          }
        }
      }
    } catch (e) {
      console.error("[schedule] error:", e);
      baseData = _cache?.data ?? [];
      if (!baseData.length) {
        baseData = await synthesizeFromDb();
      }
      if (!baseData.length) return NextResponse.json([], { status: 503 });
    }
  }

  // ── DB overlay (always fresh): fix stale NS statuses for FT/LIVE/HT matches
  const dbOverlay = await getDbOverlay();
  baseData = applyDbOverlay(baseData, dbOverlay);

  // ── Background self-heal: if api-football says FT but DB still says LIVE/HT, fix the DB ──
  const staleInDb = baseData.filter(m =>
    m.status === "FT" &&
    (dbOverlay.get(m.id)?.status === "LIVE" || dbOverlay.get(m.id)?.status === "HT")
  );
  if (staleInDb.length > 0) {
    console.log(`[schedule] healing ${staleInDb.length} stale LIVE→FT record(s) in DB`);
    Promise.all(staleInDb.map(m =>
      prisma.match.updateMany({
        where: { fixture: m.id },
        // H-5: heal to the feed's real minute (120 for ET/pens), never assume
        // 90 — a knockout decided in extra time was being stamped 90'.
        data: { status: "FT", homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0, elapsed: m.minute || 90 },
      }).catch(() => {})
    ));
  }

  // ── Quota guard: the kickoff window (7/18 outage) ──────────────────────────
  // api-football flagged the 3rd-place game LIVE at ~17:00Z — FOUR HOURS before
  // its scheduled 21:00Z kickoff. That kept every surface in live-rate polling
  // all afternoon and exhausted the 7,500/day request budget at 22:13Z, mid
  // second half. Upstream LIVE is only trusted inside a window around the
  // fixture's own scheduled kickoff; outside it, statuses demote to NS and the
  // live=all poll is skipped entirely (zero extra API spend).
  const inKickoffWindow = (utcDate: string): boolean => {
    const k = new Date(utcDate).getTime();
    const now = Date.now();
    return now >= k - 20 * 60_000 && now <= k + 4.5 * 60 * 60_000; // pre-show → ET + pens
  };
  baseData = baseData.map(m =>
    (m.status === "LIVE" || m.status === "HT") && !inKickoffWindow(m.utcDate)
      ? { ...m, status: "NS" as const, minute: 0, homeScore: null, awayScore: null, penHome: null, penAway: null }
      : m
  );
  const anyWindowOpen = baseData.some(m => m.status !== "FT" && inKickoffWindow(m.utcDate));

  // ── Live overlay (15s TTL): real-time status for currently-playing matches ──
  const liveOverlay = anyWindowOpen ? await getLiveOverlay(apiKey) : new Map<number, LiveEntry>();
  const data = applyLiveOverlay(baseData, liveOverlay);

  // Prevent CDN/edge from caching live match data
  const hasLive = data.some(m => m.status === "LIVE" || m.status === "HT");
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": hasLive
        ? "no-store, no-cache, must-revalidate"
        : "public, max-age=20, s-maxage=20, stale-while-revalidate=10",
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { AF_LEAGUE, AF_SEASON, SPORT, isConfigured } from "@/lib/sportConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Delete rows that belong to a DIFFERENT tournament than this deployment's.
//
// The Match table had no league column until 8/4, so "belongs to us" could not be
// asked of the DB. This endpoint therefore does not trust a column alone — it
// asks api-football for the CURRENT league's fixture id set and deletes any match
// that is not in it. Feed-verified, so it is correct regardless of whether a row
// predates the leagueId column.
//
// Refuses to run when the feed returns nothing (same guard as fixtureSync): an
// empty fixture set would classify EVERY row as foreign and wipe the database.
// ─────────────────────────────────────────────────────────────────────────────

const AF_BASE = "https://v3.football.api-sports.io";

interface ClearReport {
  ok: boolean;
  dryRun: boolean;
  tournament: string;
  leagueId: number;
  season: number;
  feedFixtures: number;
  foreignMatches: number;
  deleted: Record<string, number>;
  skipped?: string;
}

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const report: ClearReport = {
    ok: false,
    dryRun,
    tournament: SPORT.id,
    leagueId: AF_LEAGUE,
    season: AF_SEASON,
    feedFixtures: 0,
    foreignMatches: 0,
    deleted: {},
  };

  if (!isConfigured()) {
    report.skipped = `deployment ${SPORT.id} has no real league id (${AF_LEAGUE}) — refusing to delete anything`;
    return NextResponse.json(report, { status: 400 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    report.skipped = "API_FOOTBALL_KEY not set — cannot verify which fixtures are ours";
    return NextResponse.json(report, { status: 503 });
  }

  // ── 1. The authoritative fixture set for THIS tournament ───────────────────
  const res = await fetch(`${AF_BASE}/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    report.skipped = `api-football returned ${res.status} — refusing to delete on an unverified fixture set`;
    return NextResponse.json(report, { status: 502 });
  }
  const json = (await res.json()) as { response?: Array<{ fixture: { id: number } }> };
  const ours = new Set((json.response ?? []).map((f) => f.fixture.id));
  report.feedFixtures = ours.size;

  if (ours.size === 0) {
    report.skipped = "api-football returned 0 fixtures — refusing to delete (would classify every row as foreign)";
    return NextResponse.json(report, { status: 502 });
  }

  // ── 2. Matches that are not in this tournament ─────────────────────────────
  const allMatches = await prisma.match.findMany({ select: { id: true, fixture: true, leagueId: true } });
  const foreign = allMatches.filter(
    (m) => !ours.has(m.fixture) || (m.leagueId !== 0 && m.leagueId !== AF_LEAGUE),
  );
  report.foreignMatches = foreign.length;
  const foreignIds = foreign.map((m) => m.id);
  const foreignFixtures = foreign.map((m) => m.fixture);

  if (dryRun) {
    report.ok = true;
    return NextResponse.json(report);
  }

  if (foreignIds.length > 0) {
    // FK order matters — children first, or the match delete hits a RESTRICT
    // violation (CLAUDE.md gotcha #11).
    report.deleted.kalshiMarket = (await prisma.kalshiMarket.deleteMany({ where: { matchId: { in: foreignIds } } })).count;
    report.deleted.liveMetric = (await prisma.liveMetric.deleteMany({ where: { matchId: { in: foreignIds } } })).count;
    report.deleted.playerMatchStat = (await prisma.playerMatchStat.deleteMany({ where: { matchId: { in: foreignIds } } })).count;
    report.deleted.match = (await prisma.match.deleteMany({ where: { id: { in: foreignIds } } })).count;

    // Fixture-keyed satellites (no FK, so they orphan silently otherwise).
    report.deleted.matchEventLog = (await prisma.matchEventLog.deleteMany({ where: { fixture: { in: foreignFixtures } } })).count;
    report.deleted.matchWeather = (await prisma.matchWeather.deleteMany({ where: { fixture: { in: foreignFixtures } } })).count;
    report.deleted.roundtableEpisode = (await prisma.roundtableEpisode.deleteMany({ where: { fixture: { in: foreignFixtures } } })).count;
    report.deleted.prediction = (await prisma.prediction.deleteMany({ where: { fixtureId: { in: foreignFixtures } } })).count;
  } else {
    report.deleted.match = 0;
  }

  // ── 3. Moments scoped to another deployment ────────────────────────────────
  report.deleted.matchMoment = (await prisma.matchMoment.deleteMany({
    where: { NOT: { tournamentId: SPORT.id } },
  })).count;

  // ── 4. News written for another tournament ─────────────────────────────────
  // Stories carrying THIS deployment's id are kept. Everything else goes: rows
  // tagged for another deployment, and untagged rows ("" = written before the
  // provenance field existed, which on this deployment means written by the
  // World Cup prompt).
  report.deleted.newsStory = (await prisma.newsStory.deleteMany({
    where: { NOT: { tournamentId: SPORT.id } },
  })).count;

  // ── 5. Teams left with no fixtures ─────────────────────────────────────────
  // Anthem rows hang off teams (SetNull on delete), so only prune teams that
  // have no matches AND no players AND no anthem — never a live team.
  const orphanTeams = await prisma.team.findMany({
    where: {
      homeMatches: { none: {} },
      awayMatches: { none: {} },
      homePlayers: { none: {} },
      anthem: { is: null },
      code: { not: "TBD" },
    },
    select: { id: true },
  });
  report.deleted.team = orphanTeams.length > 0
    ? (await prisma.team.deleteMany({ where: { id: { in: orphanTeams.map((t) => t.id) } } })).count
    : 0;

  report.ok = true;
  return NextResponse.json(report);
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

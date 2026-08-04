import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { AF_LEAGUE, AF_SEASON, SPORT, isConfigured } from "@/lib/sportConfig";
import { syncFixtures } from "@/lib/fixtureSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Seed this deployment's fixtures — the admin "Seed Fixtures" button.
//
// JSON-returning wrapper around syncFixtures() (the existing /api/seed answers in
// HTML, which the admin panel can't summarise). syncFixtures is non-destructive
// and now resolves teams by api-football team id, so it creates the fixtures the
// old code-keyed path silently skipped — on LC26 that was 32 of 54.
//
// Import-then-prune, never wipe-first (CLAUDE.md gotcha #17): a mid-run failure
// after a wipe leaves the site empty AND 500ing. Clearing foreign rows is a
// separate, explicitly-ordered step (/api/admin/clear-foreign-data), which the
// Full Reset runs FIRST and this endpoint deliberately does not do implicitly.
// ─────────────────────────────────────────────────────────────────────────────

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, skipped: `deployment ${SPORT.id} has no real league id (${AF_LEAGUE})` },
      { status: 400 },
    );
  }

  const result = await syncFixtures();

  const [matchCount, teamCount] = await Promise.all([
    prisma.match.count({ where: { leagueId: AF_LEAGUE } }),
    prisma.team.count(),
  ]);

  return NextResponse.json({
    ...result,
    tournament: SPORT.id,
    eventName: SPORT.eventName,
    leagueId: AF_LEAGUE,
    season: AF_SEASON,
    matchesInDb: matchCount,
    teamsInDb: teamCount,
    // Surface the real error list rather than a bare "ok" — a sync that skipped
    // half the fixtures used to report success (CLAUDE.md gotcha #26).
    errorCount: result.errors.length,
    errors: result.errors.slice(0, 10),
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

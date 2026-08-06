import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { AF_LEAGUE, AF_SEASON, SPORT, isConfigured } from "@/lib/sportConfig";
import { resolveTeams, type FeedTeam } from "@/lib/teamIdentity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Seed team IDENTITY for this deployment: crest, country, code.
//
// Replaces the WC26-only "Seed Clubs" button, which called /api/admin/seed-players
// to enrich NATIONAL-team players with their club side — meaningless on a club
// competition, where the club IS the team.
//
// The thing LC26 actually needed is the crest: a club has no national flag, so
// `Team.logoUrl` (api-football /teams `team.logo`) is its badge. Without it every
// club rendered the neutral 🏳️ placeholder.
//
// Identity-only and non-destructive: it never touches fixtures, players or
// anthems, so it is safe to re-run at any time.
// ─────────────────────────────────────────────────────────────────────────────

const AF_BASE = "https://v3.football.api-sports.io";

interface AFTeam {
  team: { id: number; name: string; code: string | null; country: string | null; logo: string | null };
}

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, skipped: `deployment ${SPORT.id} has no real league id` }, { status: 400 });
  }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, skipped: "API_FOOTBALL_KEY not set" }, { status: 503 });
  }

  const res = await fetch(`${AF_BASE}/teams?league=${AF_LEAGUE}&season=${AF_SEASON}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, skipped: `api-football returned ${res.status}` }, { status: 502 });
  }
  const json = (await res.json()) as { response?: AFTeam[] };
  const feed = json.response ?? [];
  if (feed.length === 0) {
    // Same guard as fixtureSync: never rewrite identities off an empty feed.
    return NextResponse.json(
      { ok: false, skipped: "api-football /teams returned 0 teams — leaving team rows untouched" },
      { status: 502 },
    );
  }

  const feedTeams: FeedTeam[] = feed.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    code: t.team.code,
    country: t.team.country,
    logo: t.team.logo,
  }));
  const resolved = resolveTeams(feedTeams);

  let updated = 0;
  let created = 0;
  let logosWritten = 0;
  const errors: string[] = [];

  for (const [afId, t] of resolved) {
    try {
      const existing =
        (await prisma.team.findFirst({ where: { afTeamId: afId } })) ??
        (await prisma.team.findUnique({ where: { name: t.name } }));
      if (existing) {
        await prisma.team.update({
          where: { id: existing.id },
          data: {
            country: t.country,
            afTeamId: afId,
            // Never blank a known crest with an empty feed value.
            ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
            ...(t.flagEmoji ? { flagEmoji: t.flagEmoji } : {}),
          },
        });
        updated++;
      } else {
        // Identity seed does not invent fixtures — a team the schedule has never
        // seen is still worth having, but it carries no group.
        await prisma.team.create({
          data: {
            code: t.code, name: t.name, flagEmoji: t.flagEmoji,
            country: t.country, logoUrl: t.logoUrl, afTeamId: afId, groupStage: "",
          },
        });
        created++;
      }
      if (t.logoUrl) logosWritten++;
    } catch (e) {
      errors.push(`${t.name}: ${String(e)}`);
    }
  }

  const withLogo = await prisma.team.count({ where: { NOT: { logoUrl: "" } } });
  const total = await prisma.team.count();

  return NextResponse.json({
    ok: true,
    tournament: SPORT.id,
    eventName: SPORT.eventName,
    leagueId: AF_LEAGUE,
    season: AF_SEASON,
    feedTeams: feed.length,
    updated,
    created,
    logosWritten,
    teamsWithCrest: `${withLogo}/${total}`,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { LEAGUES_CUP, isConfigured } from "@/lib/sportConfig";
import { eventsToMoments, type ApiFootballEvent } from "@/lib/feed/apiFootball";

export const dynamic = "force-dynamic";

// Stage 3 STEP 1 LIVE COVERAGE CHECK — admin-gated. Runs the api-football adapter
// against the Leagues Cup league (772 / 2026) using the server-only key and reports
// what REALLY came back: fixture count, the nearest fixture, and a sample of real
// events mapped through the bus. NEVER fabricates or sim-fills — if the feed is
// empty, it says so (count 0) so we can STOP rather than paper over a gap.
//   GET /api/admin/lc-probe   (SUPER_ADMIN or ?secret=)
export async function GET(req: Request) {
  if (!(await isAdminAuthed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_FOOTBALL_KEY not set" }, { status: 500 });
  if (!isConfigured(LEAGUES_CUP)) return NextResponse.json({ error: "LEAGUES_CUP not configured (leagueId<=0)" }, { status: 400 });

  const { leagueId, season } = LEAGUES_CUP;
  const base = "https://v3.football.api-sports.io";
  const headers = { "x-apisports-key": apiKey };

  // 1) Fixtures for the league/season (real feed, no sim).
  const fxRes = await fetch(`${base}/fixtures?league=${leagueId}&season=${season}`, { headers, cache: "no-store" });
  if (!fxRes.ok) return NextResponse.json({ error: `fixtures ${fxRes.status}`, body: await fxRes.text() }, { status: 502 });
  const fxJson = await fxRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixtures: any[] = fxJson.response ?? [];

  if (fixtures.length === 0) {
    return NextResponse.json({
      leagueId, season, fixtureCount: 0,
      verdict: "EMPTY — the 2026 schedule is not loaded on our plan yet. STOP: do not deploy, do not sim-fill.",
    });
  }

  // 2) Nearest fixture by kickoff, + a real events sample mapped through the bus.
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nearest = fixtures.slice().sort((a: any, b: any) =>
    Math.abs(new Date(a.fixture.date).getTime() - now) - Math.abs(new Date(b.fixture.date).getTime() - now))[0];
  const nf = nearest.fixture.id;
  const evRes = await fetch(`${base}/fixtures/events?fixture=${nf}`, { headers, cache: "no-store" });
  const evJson = evRes.ok ? await evRes.json() : { response: [] };
  const events: ApiFootballEvent[] = evJson.response ?? [];
  const moments = eventsToMoments(events, { tournamentId: LEAGUES_CUP.id, fixture: nf, source: "real" });

  return NextResponse.json({
    leagueId, season,
    fixtureCount: fixtures.length,
    verdict: "REAL DATA present",
    nearestFixture: {
      id: nf,
      date: nearest.fixture.date,
      status: nearest.fixture.status?.short,
      home: nearest.teams?.home?.name,
      away: nearest.teams?.away?.name,
      score: `${nearest.goals?.home ?? "-"}-${nearest.goals?.away ?? "-"}`,
    },
    eventCount: events.length,
    sampleMoments: moments.slice(0, 5).map((m) => ({ type: m.type, minute: m.minute, team: m.team, entity: m.entity })),
  });
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { LEAGUES_CUP, isConfigured } from "@/lib/sportConfig";
import { eventsToMoments, type ApiFootballEvent } from "@/lib/feed/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // crypto.timingSafeEqual

// ─────────────────────────────────────────────────────────────────────────────
// TEMP DIAGNOSTIC — Stage 3 STEP 1 live coverage check. DELETE after reading
// coverage (tracked). Deliberately OFF the /api/admin/* path and NOT using the
// shared admin/session auth: a super-admin session cookie doesn't carry to the
// *.vercel.app preview domain, so this route is guarded SOLELY by a dedicated
// ?secret matched (constant-time) against LC_PROBE_SECRET — a FRESH secret set in
// Vercel env, NOT the now-burned legacy. Returns only fixture counts + a sample
// (no secrets, no key, ever). noindex + no-store.
// ─────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const NO_INDEX = { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const expected = process.env.LC_PROBE_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "LC_PROBE_SECRET not set in this env — set a fresh value in Vercel (Preview scope) and retry." },
      { status: 500, headers: NO_INDEX },
    );
  }
  const provided = new URL(req.url).searchParams.get("secret") ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_INDEX });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_FOOTBALL_KEY not set in this env" }, { status: 500, headers: NO_INDEX });
  if (!isConfigured(LEAGUES_CUP)) return NextResponse.json({ error: "LEAGUES_CUP not configured (leagueId<=0)" }, { status: 400, headers: NO_INDEX });

  const { leagueId, season } = LEAGUES_CUP;
  const base = "https://v3.football.api-sports.io";
  const headers = { "x-apisports-key": apiKey };

  const fxRes = await fetch(`${base}/fixtures?league=${leagueId}&season=${season}`, { headers, cache: "no-store" });
  if (!fxRes.ok) return NextResponse.json({ error: `fixtures ${fxRes.status}`, body: await fxRes.text() }, { status: 502, headers: NO_INDEX });
  const fxJson = await fxRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixtures: any[] = fxJson.response ?? [];

  if (fixtures.length === 0) {
    return NextResponse.json(
      { leagueId, season, fixtureCount: 0, verdict: "EMPTY — 2026 schedule not loaded on our plan yet. STOP: do not deploy, do not sim-fill." },
      { headers: NO_INDEX },
    );
  }

  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nearest = fixtures.slice().sort((a: any, b: any) =>
    Math.abs(new Date(a.fixture.date).getTime() - now) - Math.abs(new Date(b.fixture.date).getTime() - now))[0];
  const nf = nearest.fixture.id;
  const evRes = await fetch(`${base}/fixtures/events?fixture=${nf}`, { headers, cache: "no-store" });
  const evJson = evRes.ok ? await evRes.json() : { response: [] };
  const events: ApiFootballEvent[] = evJson.response ?? [];
  const moments = eventsToMoments(events, { tournamentId: LEAGUES_CUP.id, fixture: nf, source: "real" });

  return NextResponse.json(
    {
      leagueId, season,
      fixtureCount: fixtures.length,
      verdict: "REAL DATA present",
      nearestFixture: {
        id: nf, date: nearest.fixture.date, status: nearest.fixture.status?.short,
        home: nearest.teams?.home?.name, away: nearest.teams?.away?.name,
        score: `${nearest.goals?.home ?? "-"}-${nearest.goals?.away ?? "-"}`,
      },
      eventCount: events.length,
      sampleMoments: moments.slice(0, 5).map((m) => ({ type: m.type, minute: m.minute, team: m.team, entity: m.entity })),
    },
    { headers: NO_INDEX },
  );
}

// redeploy: pick up LC_PROBE_SECRET / API_FOOTBALL_KEY env (Aug 3)

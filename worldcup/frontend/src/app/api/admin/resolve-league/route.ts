import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Admin-gated league-id resolver. The api-football key is server-only, so the
// Leagues Cup league id + coverage block can't be fetched from a dev shell — hit
// this route (SUPER_ADMIN or ?secret=) to get { id, name, country, season,
// coverage } for any competition by name. Purpose-built for the LC26 lookup:
//   GET /api/admin/resolve-league?search=Leagues Cup
// Print the id + coverage, then set LEAGUES_CUP_LEAGUE_ID for the deployment.
export async function GET(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_FOOTBALL_KEY not set" }, { status: 500 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "Leagues Cup";
  const res = await fetch(`https://v3.football.api-sports.io/leagues?search=${encodeURIComponent(search)}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: `api-football ${res.status}`, body: await res.text() }, { status: 502 });
  }
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagues = (json.response ?? []).map((r: any) => ({
    id: r.league?.id,
    name: r.league?.name,
    type: r.league?.type,
    country: r.country?.name,
    // Seasons carry the coverage block — surface 2026 (and the latest) so BK can
    // verify fixtures/events/lineups coverage before we wire the id.
    seasons: (r.seasons ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => s.year >= 2025)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => ({ year: s.year, current: s.current, coverage: s.coverage })),
  }));
  return NextResponse.json({ search, count: leagues.length, leagues });
}

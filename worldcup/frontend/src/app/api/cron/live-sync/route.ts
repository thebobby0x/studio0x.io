import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { syncLiveMatches } from "@/lib/matchStatsIngest";

export const dynamic = "force-dynamic";
// Well inside the per-poll budget: 8 simultaneous matches × 2 api-football calls,
// issued 2-per-match in parallel, lands far under this even on a slow upstream.
export const maxDuration = 60;

// ── Live stats cron (every minute, see vercel.json) ──────────────────────────
//
// The nightly 2:30 AM ingest is the wrong instrument for in-play data. This runs
// every minute and pulls /fixtures/statistics + /fixtures/events for matches
// that are ACTUALLY being played.
//
// api-football spend is bounded by two guards inside syncLiveMatches():
//   1. Match window — nothing is fetched unless a kickoff falls within ±120
//      minutes of now, so overnight and off-peak polls cost ZERO calls.
//   2. In-play only — NS and FT fixtures are skipped; FT is picked up once by
//      the nightly final pull, which gets the more complete post-match set.
//
// Cost is therefore (matches in play) × 2 calls per minute, and zero outside a
// match window. Budget check against the Pro plan's 7,500/day: four
// simultaneous matches across a 90-minute window is 4 × 2 × 90 = 720 calls; a
// heavy multi-slot day lands around 2,800–3,200, leaving comfortable headroom
// alongside the schedule/live routes.
//
// Vercel's minimum cron granularity is one minute, which is what this uses.
// Changing the cadence means editing BOTH vercel.json and this comment.
export async function GET(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const result = await syncLiveMatches(120).catch((e) => ({
    ok: false as const,
    skipped: String(e),
    inWindow: false,
    liveMatches: 0,
    statsOk: 0,
    eventsOk: 0,
    apiCalls: 0,
    details: [] as Array<{ fixture: number; stats: string; events: string }>,
  }));

  return NextResponse.json({ ...result, elapsedMs: Date.now() - started });
}

export async function POST(req: Request) { return GET(req); }

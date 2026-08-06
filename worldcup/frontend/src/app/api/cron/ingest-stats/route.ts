import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { syncFixtures } from "@/lib/fixtureSync";
import { evictCachesIfNearQuota } from "@/lib/blobMaintenance";
import { backfillMatchWeather } from "@/lib/heatOutcomes";
import { ingestFinalStats } from "@/lib/matchStatsIngest";
import { backfillMatchCities } from "@/lib/venueGeo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Nightly maintenance cron (2:30 AM UTC, see vercel.json) ──────────────────
// Three jobs, most-important first so a timeout can't starve the critical one:
//   1. Fixture sync   — non-destructive upsert from api-football. New fixtures
//      (knockout rounds!), scores, statuses, TBD→real team upgrades. This is
//      the permanent fix for the DB going stale as the tournament advances.
//   2. Stats ingest   — per-player match stats for finished games (PPI™ etc).
//      Invoked in-process; no internal HTTP hop.
//   3. Venue backfill — resolves city + coordinates for venues the fixture feed
//      left blank. Runs BEFORE weather, which cannot geolocate a match without
//      it (this is what made weather skip every non-World-Cup fixture).
//   4. Final stats    — re-pulls /fixtures/statistics + /fixtures/events for
//      matches that finished since the last run. The provider's post-match set
//      is more complete than any mid-match snapshot the live cron captured.
//   5. Blob eviction  — purges regenerable audio caches if the store nears the
//      1 GB quota, so writes can never silently start failing again.
export async function GET(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fixture sync
  const sync = await syncFixtures().catch((e) => ({
    ok: false as const, skipped: String(e), teamsUpserted: 0, matchesCreated: 0, matchesUpdated: 0, unchanged: 0, errors: [] as string[],
  }));

  // 2. Stats ingest — call the admin route handler in-process with a request
  // that passes its auth (no network, no base-URL fragility).
  let ingest: unknown = { skipped: "ingest failed to run" };
  try {
    const { GET: ingestGET } = await import("@/app/api/admin/ingest-match-stats/route");
    const secret = process.env.SEED_SECRET ?? "wc2026studio0x";
    const res = await ingestGET(new Request(`http://internal/api/admin/ingest-match-stats?secret=${encodeURIComponent(secret)}`));
    ingest = await res.json();
  } catch (e) {
    ingest = { skipped: String(e) };
  }

  // 3. Venue backfill FIRST — weather needs coordinates, and resolving them
  // also fills the empty Match.city values the fixture feed never supplied.
  const venues = await backfillMatchCities(40).catch((e) => ({
    venuesResolved: 0, matchesUpdated: 0, unresolved: [String(e)],
  }));

  // 4. Final team stats + events for matches that finished since the last run.
  const finalStats = await ingestFinalStats(30, 12).catch((e) => ({
    considered: 0, statsOk: 0, eventsOk: 0, apiCalls: 0, details: [{ fixture: 0, stats: String(e), events: "" }],
  }));

  // 5. Blob cache eviction (quota guard)
  const blob = await evictCachesIfNearQuota();

  // 6. Heat vs. Outcomes stamp — kickoff-hour weather + outcome facts for
  // matches played since the last run (≤4/day at this stage; 6 covers slack).
  const weather = await backfillMatchWeather(6).catch((e) => ({ ok: false, skipped: String(e) }));

  return NextResponse.json({ ok: true, sync, venues, finalStats, ingest, blob, weather });
}

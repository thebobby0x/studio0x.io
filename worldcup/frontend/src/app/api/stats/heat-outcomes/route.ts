import { NextResponse } from "next/server";
import { heatOutcomesAggregate, type HeatOutcomesAggregate } from "@/lib/heatOutcomes";

export const dynamic = "force-dynamic";

// Tournament-wide Heat vs. Outcomes aggregate (backlog §16). Cheap DB scan of
// MatchWeather rows; cached 1h per instance — the numbers only move when a
// match finishes and the nightly cron (or admin backfill) ingests it.
let _cache: { ts: number; data: HeatOutcomesAggregate } | null = null;
const TTL = 60 * 60 * 1000;

export async function GET() {
  if (_cache && Date.now() - _cache.ts < TTL) {
    return NextResponse.json(_cache.data);
  }
  try {
    const data = await heatOutcomesAggregate();
    _cache = { ts: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    if (_cache) return NextResponse.json(_cache.data);
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

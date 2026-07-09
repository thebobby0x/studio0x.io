import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { backfillMatchWeather } from "@/lib/heatOutcomes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Heat vs. Outcomes backfill (backlog §16) — chunked: each call stamps up to
// `count` played fixtures with kickoff-hour weather (Open-Meteo hourly, real
// archived readings) + FT outcome facts (events feed). The admin button loops
// until `remaining` hits 0, same pattern as the anthem reimport.
async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const count = Math.min(Math.max(parseInt(searchParams.get("count") ?? "8", 10) || 8, 1), 20);
  const result = await backfillMatchWeather(count);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

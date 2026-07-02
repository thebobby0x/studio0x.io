import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { syncFixtures } from "@/lib/fixtureSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// On-demand, NON-DESTRUCTIVE fixture sync — the safe replacement for the
// full re-seed. Upserts teams/fixtures from api-football without deleting
// anything, so anthem links, players and stats are never disturbed.
async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncFixtures();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

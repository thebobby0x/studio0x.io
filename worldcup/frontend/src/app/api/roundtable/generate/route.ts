export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { SPORT } from "@/lib/sportConfig";
import { generateEpisode } from "@/lib/roundtable360/generate";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/roundtable/generate
//   body: { fixtureIds?: number[] }   — omit for every match currently in play
//   → { episode, reused, reason? }
//
// Public on purpose: the client triggers the next segment as it polls, which is
// what keeps the broadcast rolling without a sub-minute cron. The spend guard is
// server-side (MIN_REGEN_MS + the in-flight lock in lib/roundtable360/generate),
// so a hundred listeners — or a scripted loop — still cost one Claude call per
// cooldown window, and none at all when nothing is live.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!SPORT.roundtable) {
    return NextResponse.json({ error: "roundtable not enabled for this deployment" }, { status: 404 });
  }

  let fixtureIds: number[] | undefined;
  try {
    const body = (await req.json()) as { fixtureIds?: unknown };
    if (Array.isArray(body?.fixtureIds)) {
      fixtureIds = body.fixtureIds.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    }
  } catch {
    /* no body is the normal case — cover everything live */
  }

  try {
    const { episode, reused, reason } = await generateEpisode(fixtureIds);
    if (!episode) {
      return NextResponse.json({ episode: null, reused, reason: reason ?? "no episode available" }, { status: 503 });
    }
    return NextResponse.json(
      { episode, reused, ...(reason ? { reason } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[roundtable/generate]", e);
    return NextResponse.json({ episode: null, error: "generation failed" }, { status: 503 });
  }
}

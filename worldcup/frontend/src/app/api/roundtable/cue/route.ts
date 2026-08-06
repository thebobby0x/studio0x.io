export const dynamic = "force-dynamic";
// Deliberately NOT 300 like the generate routes. Nothing here can call Claude or
// ElevenLabs, and a cue check that takes longer than a few seconds is a bug, not
// a slow render.
export const maxDuration = 15;

import { NextResponse } from "next/server";
import { SPORT } from "@/lib/sportConfig";
import { getBreakingCue } from "@/lib/roundtable360/breakingQuery";
import { latestEpisode } from "@/lib/roundtable360/generate";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/roundtable/cue[?fixtures=123,456]
//   → { cue, episodeId, generatedAt, leadMomentKey }
//
// The high-frequency poll. While the show is on air the player hits this every
// ~10s to ask one question: "has something happened that the segment I am
// currently playing does not know about?"
//
// It is a SEPARATE, deliberately tiny route rather than another mode on
// /api/roundtable/current because of what it must never do. `current` builds the
// whole live context and can be asked to generate; this touches two indexed
// tables, spends nothing, and cannot trigger a Claude call however it is called.
// That is what makes it safe to poll three times as often — and polling often is
// the entire point, because the gap between a goal and the booth reacting to it
// is the thing this feature exists to close.
//
// The CLIENT decides whether the cue is news, not this route: it compares the
// cue against the episode it is actually PLAYING, which is not necessarily the
// newest one. Returning the latest episode's identity alongside the cue is what
// lets it make that call in one round trip.
// ─────────────────────────────────────────────────────────────────────────────

function parseFixtures(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

export async function GET(req: Request) {
  if (!SPORT.roundtable) {
    return NextResponse.json({ error: "roundtable not enabled for this deployment" }, { status: 404 });
  }

  const fixtures = parseFixtures(new URL(req.url).searchParams.get("fixtures"));

  try {
    const [cue, episode] = await Promise.all([getBreakingCue(fixtures), latestEpisode()]);
    return NextResponse.json(
      {
        cue,
        episodeId: episode?.id ?? null,
        generatedAt: episode?.generatedAt ?? null,
        leadMomentKey: episode?.leadMomentKey ?? null,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (e) {
    console.error("[roundtable/cue]", e);
    // A failed cue check must never take the broadcast down — the player just
    // keeps running on its normal cadence.
    return NextResponse.json({ cue: null, episodeId: null, generatedAt: null, leadMomentKey: null });
  }
}

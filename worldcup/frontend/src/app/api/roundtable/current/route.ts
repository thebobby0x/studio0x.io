export const dynamic = "force-dynamic";
// ?generate=1 runs the full generate + render path — same budget as
// /api/roundtable/generate.
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { SPORT } from "@/lib/sportConfig";
import { buildLive360Context } from "@/lib/roundtable360/liveState";
import { generateEpisode, latestEpisode, standingWarnings, PAUSE_BETWEEN_GROUPS_MS } from "@/lib/roundtable360/generate";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/roundtable/current[?generate=1]
//   → { onAir, episode, matchSummaries, moments, nextKickoff, showTitle }
//
// The client's single poll. `?generate=1` lets the player top the broadcast up
// in the same round trip it uses to refresh the ticker, instead of firing a
// second request — the cooldown in lib/roundtable360/generate still decides
// whether that actually costs a Claude call.
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchSummary {
  fixture: number;
  matchId: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  city: string;
}

export async function GET(req: Request) {
  if (!SPORT.roundtable) {
    return NextResponse.json({ error: "roundtable not enabled for this deployment" }, { status: 404 });
  }
  const wantsGenerate = new URL(req.url).searchParams.get("generate") === "1";

  try {
    const ctx = await buildLive360Context();

    // No "only if something is live" guard here any more: generateEpisode makes
    // that call itself, and it is the only place that can tell the difference
    // between an empty board and an empty board with an uncalled final whistle.
    // Duplicating the check here is what would silence the full-time segment.
    const episode = wantsGenerate ? (await generateEpisode()).episode : await latestEpisode();

    const matchSummaries: MatchSummary[] = ctx.matches.map((m) => ({
      fixture: m.fixture,
      matchId: m.matchId,
      home: m.home,
      away: m.away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      minute: m.minute,
      status: m.status,
      city: m.city,
    }));

    return NextResponse.json(
      {
        showTitle: SPORT.roundtable.showTitle,
        onAir: ctx.matches.length > 0,
        episode,
        pauseMs: PAUSE_BETWEEN_GROUPS_MS,
        warnings: episode?.warnings ?? standingWarnings(),
        matchSummaries,
        // Top few ranked moments — the client shows them as the "key plays"
        // strip so the panel's talking points are visible, not just audible.
        moments: ctx.moments.slice(0, 5),
        nextKickoff: ctx.nextKickoff,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (e) {
    console.error("[roundtable/current]", e);
    return NextResponse.json({
      showTitle: SPORT.roundtable.showTitle,
      onAir: false,
      episode: null,
      pauseMs: PAUSE_BETWEEN_GROUPS_MS,
      warnings: standingWarnings(),
      matchSummaries: [],
      moments: [],
      nextKickoff: null,
    });
  }
}

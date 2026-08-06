export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import { isSpeaker360 } from "@/lib/roundtable360/personas";
import { renderLine, type RenderedGroup } from "@/lib/roundtable360/render";

// ─────────────────────────────────────────────────────────────────────────────
// Roundtable audio delivery. Two modes, one route.
//
// PRIMARY — render once, serve unlimited (owner directive 8/5):
//   GET ?episodeId=<id>&group=<n>  → 302 to the group's Vercel Blob URL
// The audio was synthesised at generation time and stored. Every listener after
// the first is served the same object from the CDN and costs nothing. The
// redirect exists rather than handing the client a raw Blob URL so delivery has
// one indirection point — the storage layer can move without a client change.
//
// FALLBACK — per-line streaming:
//   GET ?speaker=<persona>&text=<line>  → audio/mpeg stream
// Used only when a group has no stored object. The expected cause is the Blob
// store being at capacity from WC26 audio, which may not be deleted to make room
// (CLAUDE.md hard rule). Degraded — it re-bills per listener — but the show
// stays on air, and the episode's `warnings` say why.
//
// SECURITY: the client sends a PERSONA KEY, never a voice id; voices resolve
// server-side (audit 7/20, CR-3). Text is capped inside renderLine().
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!SPORT.roundtable) {
    return NextResponse.json({ error: "roundtable not enabled for this deployment" }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);

  // ── primary: stored group ────────────────────────────────────────────────
  const episodeId = searchParams.get("episodeId");
  const groupParam = searchParams.get("group");
  if (episodeId && groupParam !== null) {
    const groupIndex = Number(groupParam);
    if (!Number.isInteger(groupIndex) || groupIndex < 0) {
      return NextResponse.json({ error: "bad group index" }, { status: 400 });
    }
    try {
      const row = await prisma.live360Episode.findFirst({
        where: { id: episodeId, tournamentId: SPORT.id },
        select: { groups: true },
      });
      const groups = (row?.groups as unknown as RenderedGroup[] | null) ?? [];
      const url = groups.find((g) => g.index === groupIndex)?.url;
      if (!url) {
        // Not an error: the client is expected to fall back to streaming the
        // group's lines, which it can do because it holds the transcript.
        return NextResponse.json({ error: "group audio not stored", fallback: "stream" }, { status: 404 });
      }
      return NextResponse.redirect(url, {
        status: 302,
        // The object is immutable — its key contains the episode id — so the
        // redirect itself is safe to cache hard.
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=604800, immutable" },
      });
    } catch (e) {
      console.error("[roundtable/tts] group lookup", e);
      return NextResponse.json({ error: "group lookup failed" }, { status: 500 });
    }
  }

  // ── fallback: stream one line ────────────────────────────────────────────
  const speaker = searchParams.get("speaker") ?? "";
  const text = searchParams.get("text") ?? "";
  if (!isSpeaker360(speaker)) return NextResponse.json({ error: "unknown speaker" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const result = await renderLine({ speaker, text });
  if (!Buffer.isBuffer(result)) {
    // Includes the "no voice id configured" case — a missing voice fails here
    // rather than being quietly rendered by somebody else's voice.
    console.error(`[roundtable/tts] ${speaker}: ${result.reason}`);
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  return new Response(new Uint8Array(result), {
    headers: {
      "Content-Type": "audio/mpeg",
      // Deterministic in (speaker, text), so the edge can still absorb repeat
      // listeners even on the degraded path.
      "Cache-Control": "public, max-age=3600, s-maxage=604800, immutable",
    },
  });
}

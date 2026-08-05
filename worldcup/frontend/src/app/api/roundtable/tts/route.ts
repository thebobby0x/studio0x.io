export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { ROUNDTABLE_VOICES, isSpeaker360, respellForAudio } from "@/lib/roundtable360/personas";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/roundtable/tts?speaker=marcus&text=…  → audio/mpeg stream
//
// NO BLOB WRITES. The pregame Roundtable synthesises to a file and caches it in
// Vercel Blob; the ElevenLabs/Blob storage quota is full and, more importantly,
// a rolling live show would write a new object every few seconds forever. This
// route is a pure PROXY: ElevenLabs' streaming endpoint → the client's Web Audio
// graph, nothing touching disk at either end.
//
// Losing the Blob cache loses the cross-user audio cache with it, so the CDN
// takes its place: this is a GET whose (speaker, text) pair fully determines the
// bytes, returned with a long s-maxage. Vercel's edge then serves the second and
// every subsequent listener of a given line without re-billing ElevenLabs. That
// is the only reason this is a GET and not a POST.
//
// SECURITY: the client sends a PERSONA KEY. Voice ids are resolved server-side
// and a client-supplied voiceId is ignored — a public endpoint must never be
// pointable at an arbitrary voice on the account (same contract as /api/ai/tts,
// security audit 7/20 CR-3). `text` is capped for the same billing reason.
// ─────────────────────────────────────────────────────────────────────────────

const ELEVENLABS_STREAM = "https://api.elevenlabs.io/v1/text-to-speech";

/** One line of dialogue is 1-3 sentences; 900 covers it with room to spare and
 *  bounds what a scripted loop can bill per call. */
const MAX_TTS_CHARS = 900;

// eleven_turbo_v2_5 is the LATENCY choice, deliberately. This is live radio: the
// gap between "Marcus finishes" and "Carlos starts" is the product. The known
// trade-off (CLAUDE.md gotcha #24) is that turbo flattens designed accents,
// which matters most for Carlos — swap the env var to eleven_multilingual_v2 if
// BK prefers accent fidelity over responsiveness.
const MODEL = process.env.ELEVENLABS_ROUNDTABLE_MODEL ?? "eleven_turbo_v2_5";

export async function GET(req: Request) {
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const speaker = searchParams.get("speaker") ?? "";
  const rawText = searchParams.get("text") ?? "";

  if (!isSpeaker360(speaker)) {
    return NextResponse.json({ error: "unknown speaker" }, { status: 400 });
  }
  if (!rawText.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (rawText.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: `text must be ≤ ${MAX_TTS_CHARS} chars` }, { status: 400 });
  }

  // Audio-only respell — the displayed transcript is never touched.
  const text = respellForAudio(rawText);
  const voiceId = ROUNDTABLE_VOICES[speaker];

  let elRes: Response;
  try {
    elRes = await fetch(`${ELEVENLABS_STREAM}/${voiceId}/stream?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": elKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: MODEL }),
    });
  } catch (e) {
    console.error("[roundtable/tts] fetch failed", e);
    return NextResponse.json({ error: "tts upstream unreachable" }, { status: 502 });
  }

  if (!elRes.ok || !elRes.body) {
    const err = await elRes.text().catch(() => "");
    console.error(`[roundtable/tts] ElevenLabs ${elRes.status}: ${err}`);
    return NextResponse.json({ error: `ElevenLabs ${elRes.status}` }, { status: 502 });
  }

  return new Response(elRes.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      // Immutable by construction: the same (speaker, text) always synthesises
      // the same line. s-maxage is what makes the edge the shared cache that
      // Blob used to be.
      "Cache-Control": "public, max-age=3600, s-maxage=604800, immutable",
    },
  });
}

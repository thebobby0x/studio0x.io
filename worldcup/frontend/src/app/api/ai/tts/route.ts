import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

function storyKey(text: string): string {
  // Stable slug for caching — first 60 chars slugified
  return text.slice(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Roundtable persona voices — ElevenLabs premade voice IDs (public, stable).
// Personas are mapped SERVER-side; clients send a persona key, never a voice id.
// "lorraine" (the host) keeps the configured default voice.
// Env overrides let the owner swap in custom/cloned ElevenLabs voices without
// a code change (ELEVENLABS_VOICE_GAFFER / _SOFIA / _DEANO).
// Voices re-picked 7/17 for ENERGY (owner: the panel sounded flat next to
// Lorraine): Arnold = strong and gruff, Domi = assertive and punchy,
// Sam = raspy hype. Paired with expressive per-persona voice settings below.
const PERSONA_VOICES: Record<string, string> = {
  gaffer: process.env.ELEVENLABS_VOICE_GAFFER ?? "VR6AewLTigWG4xSOukaG", // Arnold — strong, gruff ex-pro
  sofia:  process.env.ELEVENLABS_VOICE_SOFIA  ?? "AZnzlk1XvdvUeBnXmlld", // Domi — assertive, sharp analyst
  deano:  process.env.ELEVENLABS_VOICE_DEANO  ?? "yoZ06aMxZJJ28mfd3POQ", // Sam — raspy hype (footy influencer)
};

// Expressiveness dials: lower stability = more emotional swing; higher style =
// more performance. The host keeps the proven defaults; the panel gets heat.
const PERSONA_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }> = {
  gaffer: { stability: 0.35, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true },
  sofia:  { stability: 0.42, similarity_boost: 0.75, style: 0.5,  use_speaker_boost: true },
  deano:  { stability: 0.25, similarity_boost: 0.7,  style: 0.85, use_speaker_boost: true },
};

export async function POST(req: Request) {
  const elKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // "Daniel" — deep news anchor
  if (!elKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const { text, storyId, persona } = (await req.json()) as { text: string; storyId?: string; persona?: string };
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const voiceId = (persona && PERSONA_VOICES[persona]) || defaultVoice;

  // Check Vercel Blob cache — persona in the key so voices never collide
  const blobKey = `tts/${persona && PERSONA_VOICES[persona] ? `${persona}-` : ""}${storyId ?? storyKey(text)}.mp3`;
  try {
    const existing = await head(blobKey);
    if (existing?.url) return NextResponse.json({ url: existing.url, cached: true });
  } catch {
    // Not cached yet — generate
  }

  // Generate via ElevenLabs
  const elRes = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": elKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: (persona && PERSONA_SETTINGS[persona]) ?? { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });

  if (!elRes.ok) {
    const err = await elRes.text();
    console.error(`[TTS] ElevenLabs ${elRes.status}: ${err}`);
    return NextResponse.json({ error: `ElevenLabs ${elRes.status}: ${err}` }, { status: 502 });
  }

  // Buffer audio so we can store it and return a URL — streaming directly to put()
  // risks a silent crash if Blob storage fails mid-stream.
  const audioBuffer = Buffer.from(await elRes.arrayBuffer());

  try {
    const blob = await put(blobKey, audioBuffer, {
      access: "public",
      contentType: "audio/mpeg",
      // Two concurrent first-time requests for the same line both miss the head()
      // cache; without this the second put() 502s (default is no-overwrite).
      allowOverwrite: true,
    });
    return NextResponse.json({ url: blob.url, cached: false });
  } catch (blobErr) {
    const msg = blobErr instanceof Error ? blobErr.message : String(blobErr);
    console.error("[TTS] Blob put failed:", msg);
    return NextResponse.json({ error: `Audio cache failed: ${msg}` }, { status: 502 });
  }
}

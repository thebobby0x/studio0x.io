import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

function storyKey(text: string): string {
  // Stable slug for caching — first 60 chars slugified
  return text.slice(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Roundtable persona voices — the owner's CUSTOM ElevenLabs voices (built
// 7/18 in their VoiceLab; env overrides remain for future swaps). Personas are
// mapped SERVER-side; clients send a persona key, never a voice id.
// "lorraine" (the BRITISH host) keeps the configured default voice.
const PERSONA_VOICES: Record<string, string> = {
  henry:   process.env.ELEVENLABS_VOICE_HENRY   ?? "3DF5pISMxWFbDQoLOBrj", // Henry Futois — French, ex-PSG
  roberto: process.env.ELEVENLABS_VOICE_ROBERTO ?? "99M1da0B26r8CknfhKDi", // Roberto Madrid — Spanish, ex-Real Madrid GK
  ricky:   process.env.ELEVENLABS_VOICE_RICKY   ?? "3ySUSzjLQQdZWd24NIc5", // Ricky Riquelme — Argentinian, old Boca legend
};

// Accent preservation (owner 7/18: "all 3 lost their accents"):
// - The panel personas render on eleven_multilingual_v2, not turbo — turbo is
//   speed-tuned and flattens designed accents, reading Spanish/Catalan/French
//   sprinkle-words with English phonetics. Multilingual keeps the designed
//   accent AND pronounces embedded native phrases natively.
// - similarity_boost is high (0.9): it pulls output toward the designed voice,
//   which is where the accent lives. Low values let the model genericize.
// - stability sits mid-range: too low + style exaggeration drifts the voice
//   off its design; style stays moderate so the accent survives the heat.
const PERSONA_MODEL = "eleven_multilingual_v2";
const DEFAULT_MODEL = "eleven_turbo_v2_5";

// The full Roundtable cast — the three custom panel voices plus the host.
const ROUNDTABLE_PERSONAS = new Set(["lorraine", "henry", "roberto", "ricky"]);
// Bump to invalidate previously cached persona audio when the voice model,
// settings, or the respell lexicon change — blob keys are text-derived, so old
// renders serve forever otherwise.
const PERSONA_AUDIO_REV = "v3";

// ── Audio-only pronunciation lexicon (owner 7/18, round 2) ───────────────────
// Even eleven_multilingual_v2 reads SHORT foreign words with English phonetics
// when the surrounding sentence is English — "dale" IS an English word (a
// valley) and "Henry" an English name, so Ricky said [day-ul] and Roberto
// [hen-ree]. The fix: respell the panel's sprinkle vocabulary into unambiguous
// phonetics in the SPOKEN text only. Display text is never touched. Applied
// whenever a persona key is present (all Roundtable lines, any speaker — the
// host says the panelists' names too).
const AUDIO_RESPELL: Array<[RegExp, string]> = [
  [/\bHenry Futois\b/g, "Onree Footwah"],
  [/\bFutois\b/g, "Footwah"],
  [/\bHenry\b/g, "Onree"],              // the panelist — [awn-ree]
  [/\bRiquelme\b/g, "Reekelmeh"],       // [ree-kel-meh], never [ri-kwelm]
  [/\bdale\b/gi, "dahleh"],             // [dah-leh]
  [/\bvale\b/gi, "bahleh"],             // [bah-leh] — Spanish v
  [/\bche\b/gi, "cheh"],
  [/\bvamos\b/gi, "bahmohs"],
  [/\bescolta\b/gi, "escoltah"],
  [/\bmadre mía\b/gi, "mahdreh meeah"],
  [/\bqué barbaridad\b/gi, "keh bahrbahreedahd"],
  [/\ben mis tiempos\b/gi, "en mees tyempohs"],
  [/\bécoutez\b/gi, "aycootay"],
  [/\bvoilà\b/gi, "vwahlah"],
  [/\bmagnifique\b/gi, "mahnyeefeek"],
];

const PERSONA_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }> = {
  henry:   { stability: 0.42, similarity_boost: 0.9, style: 0.5,  use_speaker_boost: true }, // maniacal bursts, French intact
  roberto: { stability: 0.4,  similarity_boost: 0.9, style: 0.55, use_speaker_boost: true }, // erratic energy, Catalan intact
  ricky:   { stability: 0.45, similarity_boost: 0.9, style: 0.5,  use_speaker_boost: true }, // theatrical, porteño intact
};

export async function POST(req: Request) {
  const elKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // "Daniel" — deep news anchor
  if (!elKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const { text: rawText, storyId, persona } = (await req.json()) as { text: string; storyId?: string; persona?: string };
  if (!rawText) return NextResponse.json({ error: "text required" }, { status: 400 });
  // Respell applies to ALL Roundtable speakers (the host says the panelists'
  // names too) but NOT to commentary/story TTS, where "Henry" or "dale" could
  // be a real player or ordinary English.
  const isRoundtable = Boolean(persona && ROUNDTABLE_PERSONAS.has(persona));
  const text = isRoundtable
    ? AUDIO_RESPELL.reduce((t, [re, sub]) => t.replace(re, sub), rawText)
    : rawText;
  const isPanelPersona = Boolean(persona && PERSONA_VOICES[persona]);
  const voiceId = (persona && PERSONA_VOICES[persona]) || defaultVoice;

  // Check Vercel Blob cache — persona + audio rev in the key (all Roundtable
  // voices, host included) so voices never collide and model/settings/respell
  // changes regenerate instead of serving stale takes.
  const blobKey = `tts/${isRoundtable ? `${PERSONA_AUDIO_REV}-${persona}-` : ""}${storyId ?? storyKey(text)}.mp3`;
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
      model_id: isPanelPersona ? PERSONA_MODEL : DEFAULT_MODEL,
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

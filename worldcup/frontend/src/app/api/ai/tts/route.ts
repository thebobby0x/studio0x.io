import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { SPORT } from "@/lib/sportConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Hard cap on synthesizable text (security audit 7/20, CR-3): the endpoint is
// public and ElevenLabs bills per character, so cap per-call size to bound
// abuse cost. 600 was too tight (7/20 night regression: story/analysis bodies
// run 700–1,200+ chars → "audio not available"). The real defense against a
// scripted-loop attack is the content-hash cache + per-call ceiling, not a
// small limit — 4,000 chars covers every legitimate surface (commentary lines,
// story bodies, Go-Deeper deep dives) while still blocking huge payloads.
const MAX_TTS_CHARS = 4000;

// Full-text hash for the blob cache key. SECURITY (CR-3): the key is derived
// SERVER-SIDE from the trusted spoken text, NOT a client-supplied storyId.
// The old key trusted the client's storyId with allowOverwrite:true, so an
// attacker could overwrite the audio other users hear for a known line
// (cache poisoning). Hashing the actual text makes the key uncontrollable and
// collision-free: identical audio → identical key, different text → different
// key, and an attacker can only ever write the bytes that match their own text.
function textKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}${text.length.toString(36)}`;
}

// Roundtable persona voices — the owner's CUSTOM ElevenLabs voices (built
// 7/18 in their VoiceLab; env overrides remain for future swaps). Personas are
// mapped SERVER-side; clients send a persona key, never a voice id.
//
// LORRAINE FIX (owner 8/5). She used to be absent from this map, so she fell
// through to `defaultVoice` — ELEVENLABS_VOICE_ID, whose fallback is "Daniel",
// a deep MALE news anchor. Lorraine Footy is FEMALE. Her real custom voice was
// never committed in PR #160 (that PR wired only Ricky/Roberto/Henry); the owner
// supplied the id on 8/5 and it is now mapped here like the rest of the cast.
//
// Two knock-on effects, both intended:
//   · she is now a "panel persona", so she renders on eleven_v3 with an accent
//     tag instead of turbo — the same treatment the other three already get;
//   · her cached audio must be invalidated, or the old male renders serve
//     forever (blob keys are text-derived). See PERSONA_AUDIO_REV_BY_PERSONA —
//     scoped to HER alone so the rest of the WC26 archive is not re-billed.
const PERSONA_VOICES: Record<string, string> = {
  lorraine: process.env.ELEVENLABS_VOICE_LORRAINE ?? "cLJPCFydIdotiLUDM5NV", // Lorraine Footy — British host, FEMALE
  henry:   process.env.ELEVENLABS_VOICE_HENRY   ?? "3DF5pISMxWFbDQoLOBrj", // Henry Futois — French, ex-PSG
  roberto: process.env.ELEVENLABS_VOICE_ROBERTO ?? "99M1da0B26r8CknfhKDi", // Roberto Madrid — Spanish, ex-Real Madrid GK
  ricky:   process.env.ELEVENLABS_VOICE_RICKY   ?? "3ySUSzjLQQdZWd24NIc5", // Ricky Riquelme — Argentinian, old Boca legend
};

// Accent preservation (owner 7/18, three rounds):
// - eleven_turbo flattened the designed accents entirely; multilingual_v2
//   helped pronunciation but still genericized the accents ("don't come
//   through well" — owner, incognito-verified). The panel now renders on
//   eleven_v3, the expressive model, which honors performance tags — each
//   persona line is prefixed with an ACCENT_TAGS directive (audio-only,
//   never displayed) telling the model to lean INTO the designed accent.
// - If v3 errors (plan/availability), the route falls back to
//   multilingual_v2 WITHOUT the tag (older models would read it aloud).
// - The panel sends NO voice_settings override (owner decision 7/18): each
//   custom voice carries the stability/similarity/style the owner dialed in
//   when designing it in VoiceLab, and ElevenLabs applies those stored
//   defaults when the request omits voice_settings.
const PERSONA_MODEL = "eleven_v3";
const PERSONA_MODEL_FALLBACK = "eleven_multilingual_v2";
const DEFAULT_MODEL = "eleven_turbo_v2_5";

// v3 performance tags — spoken-text-only accent direction per panelist.
const ACCENT_TAGS: Record<string, string> = {
  lorraine: "[strong British accent] ",
  henry:   "[strong French accent] ",
  roberto: "[strong Spanish accent] ",
  ricky:   "[strong Argentinian accent] ",
};

// The full Roundtable cast — now four custom panel voices.
const ROUNDTABLE_PERSONAS = new Set(["lorraine", "henry", "roberto", "ricky"]);
// Bump to invalidate previously cached persona audio when the voice model,
// settings, or the respell lexicon change — blob keys are text-derived, so old
// renders serve forever otherwise.
const PERSONA_AUDIO_REV = "v5";

// Per-persona cache rev, overriding the global one.
//
// Lorraine's voice changed on 8/5 (male default → her real female voice), so
// HER cached audio is now wrong and must regenerate. Bumping the global
// PERSONA_AUDIO_REV would have done that — and also invalidated every Ricky,
// Roberto and Henry line in the WC26 archive, re-billing synthesis and putting
// a first-play delay on a site that is shown to buyers (CLAUDE.md: "it's a
// regenerable cache" is not self-approving). Scoping the bump to the one
// persona whose voice actually changed is the narrowest correct fix.
const PERSONA_AUDIO_REV_BY_PERSONA: Record<string, string> = {
  lorraine: "v6", // female voice, 8/5 — invalidates only her old male renders
};
function personaRev(persona: string): string {
  return PERSONA_AUDIO_REV_BY_PERSONA[persona] ?? PERSONA_AUDIO_REV;
}

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

export async function POST(req: Request) {
  const elKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // "Daniel" — deep news anchor
  if (!elKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const { text: rawText, persona } = (await req.json()) as { text: string; storyId?: string; persona?: string };
  if (!rawText) return NextResponse.json({ error: "text required" }, { status: 400 });
  // storyId is intentionally ignored now (see textKey) — the cache key is
  // derived server-side from the trusted text to prevent cache poisoning.
  if (typeof rawText !== "string" || rawText.length > MAX_TTS_CHARS) {
    return NextResponse.json({ error: `text must be a string ≤ ${MAX_TTS_CHARS} chars` }, { status: 400 });
  }
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
  //
  // DEPLOYMENT-NAMESPACED (8/5). Keys used to be a flat `tts/<hash>.mp3` across
  // every deployment. If two Vercel projects point at the SAME Blob store, their
  // caches commingle indistinguishably — and the cleanup tool, which deletes
  // everything under tts/, then cannot tell one deployment's audio from
  // another's. Namespacing makes future purges scopable. Existing flat keys are
  // left alone: they are a regenerable cache, so the worst case of the changed
  // key is one re-synthesis per line, and blob-cleanup treats un-namespaced
  // blobs as shared legacy that only an explicit opt-in may delete.
  const blobKey = `tts/${SPORT.id}/${isRoundtable ? `${personaRev(persona!)}-${persona}-` : ""}${textKey(text)}.mp3`;
  try {
    const existing = await head(blobKey);
    if (existing?.url) return NextResponse.json({ url: existing.url, cached: true });
  } catch {
    // Not cached yet — generate
  }

  // Generate via ElevenLabs
  const synth = (payload: object) =>
    fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": elKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

  let elRes: Response;
  if (isPanelPersona) {
    // Panel personas: v3 with the accent tag, no voice_settings (the voice's
    // stored VoiceLab settings apply). Fall back to multilingual_v2 WITHOUT
    // the tag if v3 is unavailable — older models read tags aloud.
    elRes = await synth({ text: (ACCENT_TAGS[persona!] ?? "") + text, model_id: PERSONA_MODEL });
    if (!elRes.ok) {
      console.error(`[TTS] ${PERSONA_MODEL} failed (${elRes.status}) for ${persona} — falling back to ${PERSONA_MODEL_FALLBACK}`);
      elRes = await synth({ text, model_id: PERSONA_MODEL_FALLBACK });
    }
  } else {
    elRes = await synth({
      text,
      model_id: DEFAULT_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    });
  }

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

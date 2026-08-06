// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the cast.
//
// THE SAME FOUR PUNDITS AS EVERY OTHER SURFACE (owner directive: one familiar
// broadcast team across all tournaments). These are the owner's cast, designed
// in VoiceLab 7/18 and shipped on WC26 in the pregame Roundtable (PR #160) and
// the live commentary booth (PR #171). A returning viewer must hear the same
// people. Do not add, rename or re-cast a panelist for a new deployment — give
// them a new BEAT instead (see `beat` below).
//
// ── CANONICAL SOURCE / KNOWN DUPLICATION ─────────────────────────────────────
// This module is the canonical cast + voice map for NEW surfaces. The same
// values also live inline in `/api/ai/tts` (PERSONA_VOICES + AUDIO_RESPELL) and
// the briefs in `/api/ai/roundtable` + `/api/matches/[id]/commentary`.
//
// Those were deliberately NOT refactored to import from here. `/api/ai/tts`
// keys its ElevenLabs MODEL choice off whether a persona appears in its own
// PERSONA_VOICES map — which excludes `lorraine` on purpose, so she renders on
// eleven_turbo while the other three render on eleven_v3 with accent tags.
// Folding in a map that includes lorraine would silently move her onto a
// different model, and blob cache keys are text-derived (gotcha #24), so the
// WC26 archive would serve stale audio that no longer matches new renders. That
// path is the FROZEN proof-of-concept site; it is not worth the risk tonight.
//
// If the voice ids ever change, they must be changed in BOTH places. Unifying
// them behind this module is a clean daylight task — see the handoff notes.
// ─────────────────────────────────────────────────────────────────────────────

export type Speaker360 = "lorraine" | "henry" | "roberto" | "ricky";

export const SPEAKER_KEYS: Speaker360[] = ["lorraine", "henry", "roberto", "ricky"];

export function isSpeaker360(v: unknown): v is Speaker360 {
  return typeof v === "string" && (SPEAKER_KEYS as string[]).includes(v);
}

export interface Persona360 {
  key: Speaker360;
  /** On-air name — as it appears on every other surface. */
  name: string;
  /** One-line role, shown under the name in the player. */
  role: string;
  /**
   * Character brief handed to Claude. Kept WORD-FOR-WORD consistent with the
   * live-commentary booth brief (`/api/matches/[id]/commentary`, PR #171) so
   * the same person shows up in both places.
   */
  brief: string;
  /** What this panelist covers on a MULTI-MATCH whip-around. New per format —
   *  the beat changes with the show, the character never does. */
  beat: string;
}

export const PERSONAS_360: Record<Speaker360, Persona360> = {
  lorraine: {
    key: "lorraine",
    name: "Lorraine Footy",
    role: "Host · Britain",
    brief:
      "lorraine — Lorraine Footy, middle-aged BRITISH anchor, classic-commentary energy, EXCITED by everything, volleys the panel's chaos back with glee (\"right then\", \"oh that's marvelous\").",
    beat:
      "ANCHOR. She runs the whip-around: hard-cuts between matches (\"right, we go to Chicago\"), keeps the clock, throws to the others BY NAME, and never lets a silence sit. She keeps order she secretly loves losing.",
  },
  henry: {
    key: "henry",
    name: "Henry Futois",
    role: "French ex-pro · flair & tactics",
    brief:
      "henry — Henry Futois, FRENCH ex-PSG. Deep, gravelly, menacing one second and absurdly silly the next. Flair-worshipper. Sprinkles: \"écoutez\", \"voilà\", \"magnifique\", \"non non non\".",
    beat:
      "TACTICS AND FLAIR across the board. He reads what the shape and the scorelines are telling him and argues football is art or it is nothing.",
  },
  roberto: {
    key: "roberto",
    name: "Roberto Madrid",
    role: "Spanish ex-goalkeeper",
    brief:
      "roberto — Roberto Madrid, SPANISH ex-Real Madrid goalkeeper, massive and maniacally silly. THE authority on goalkeeping and defending. Catalan sprinkles: \"vale\", \"escolta\", \"madre mía\", \"qué barbaridad\".",
    beat:
      "GOALKEEPING AND DEFENDING in every game on the board — who is holding, who is leaking, and whose back line is about to go.",
  },
  ricky: {
    key: "ricky",
    name: "Ricky Riquelme",
    role: "Argentinian legend · old school",
    brief:
      "ricky — Ricky Riquelme, ARGENTINIAN old Boca legend. Booming, theatrical, HEAVY dry sarcasm, storytelling grandpa. Sprinkles: \"che\", \"dale\", \"vamos\", \"en mis tiempos\".",
    beat:
      "THE ROMANTIC. He carries the Latin-football side of every argument, needles anyone who reduces a game to a number, and deadpans over the top of the whole panel before erupting.",
  },
};

// ── Voice mapping ────────────────────────────────────────────────────────────
// The three custom panel voices are EXACTLY the ids the WC26 panel already uses
// (see /api/ai/tts PERSONA_VOICES), with the same env override names, so setting
// a var re-voices a panelist on both shows and the cast cannot drift.
//
// LORRAINE (owner-supplied 8/5): she is FEMALE, and the code used to render her
// on `ELEVENLABS_VOICE_ID` — whose fallback is "Daniel", a deep MALE news
// anchor. Her real custom voice id was never committed (PR #160 wired only
// Ricky/Roberto/Henry); the owner supplied it directly. Never map her to the
// generic default again: that var is the news/story anchor voice, and chaining
// to it is exactly how she ended up sounding like a man.
export const ROUNDTABLE_VOICES: Record<Speaker360, string> = {
  lorraine: process.env.ELEVENLABS_VOICE_LORRAINE ?? "cLJPCFydIdotiLUDM5NV", // Lorraine Footy — British host, FEMALE
  henry: process.env.ELEVENLABS_VOICE_HENRY ?? "3DF5pISMxWFbDQoLOBrj", // Henry Futois — French, ex-PSG
  roberto: process.env.ELEVENLABS_VOICE_ROBERTO ?? "99M1da0B26r8CknfhKDi", // Roberto Madrid — Spanish GK
  ricky: process.env.ELEVENLABS_VOICE_RICKY ?? "3ySUSzjLQQdZWd24NIc5", // Ricky Riquelme — Argentinian
};

/** Panelists with no configured voice. Surfaced to the client as a warning. */
export function missingVoices(): Speaker360[] {
  return SPEAKER_KEYS.filter((k) => !ROUNDTABLE_VOICES[k]);
}

// ── Accent hardening ─────────────────────────────────────────────────────────
// Owner directive (8/5): "I do not want to lose or diminish any voice accent —
// ever." Accents dropping was the defining WC26 audio problem and three rounds
// of work fixed it (gotcha #24); turbo is what flattened them, so turbo is gone
// from this show entirely.
//
// These tags are audio-only performance direction, prepended to the SPOKEN text
// and never displayed. They are deliberately STRONGER than the WC26 originals
// ("[strong French accent]"), using the exact descriptors the 7/17 EOD named as
// the next lever if accents were still weak — "thick Buenos Aires accent",
// "heavy Catalan accent, rolls every R".
//
// Tags go ONLY on the eleven_v3 path. Older models read them aloud literally
// (gotcha #24), so the multilingual_v2 fallback sends untagged text.
export const ACCENT_TAGS_360: Record<Speaker360, string> = {
  lorraine: "[strong British accent, bright and excitable] ",
  henry: "[thick French accent, deep and theatrical] ",
  roberto: "[heavy Catalan Spanish accent, rolls every R] ",
  ricky: "[thick Buenos Aires Argentinian accent, booming and dry] ",
};

// ── Delivery settings ────────────────────────────────────────────────────────
// Owner directive (8/5): passionate, alive and reactive — not measured. Low
// stability for expressive variance, high style for emotion.
//
// This REVERSES the 7/18 decision recorded in /api/ai/tts ("the panel sends NO
// voice_settings — each custom voice uses the owner's stored VoiceLab
// settings"). That reversal is the owner's, made explicitly, and applies to
// this show only; the WC26 pregame panel is untouched.
export const VOICE_SETTINGS_360 = {
  stability: 0.3,
  similarity_boost: 0.75,
  style: 0.78,
  use_speaker_boost: true,
} as const;

/**
 * eleven_v3 constrains `stability` to three discrete values (0.0 Creative /
 * 0.5 Natural / 1.0 Robust) rather than the continuous scale multilingual_v2
 * accepts. 0.3 is not sendable there, so it maps to the nearest LOWER rung —
 * Creative — which is the expressive end the directive asks for. Override with
 * ROUNDTABLE_V3_STABILITY=0.5 if Creative proves too loose in production.
 */
export const V3_STABILITY = Number(process.env.ROUNDTABLE_V3_STABILITY ?? 0);

// ── Audio-only pronunciation lexicon ─────────────────────────────────────────
// Copied verbatim from /api/ai/tts (CLAUDE.md gotcha #24). TTS models read short
// foreign words with English phonetics inside an English sentence — "dale" comes
// out [day-ul], "Henry" [hen-ree]. Applied to ALL four speakers, because the
// host says the panelists' names too. SPOKEN text only; the displayed transcript
// is never respelled.
export const AUDIO_RESPELL_360: Array<[RegExp, string]> = [
  [/\bHenry Futois\b/g, "Onree Footwah"],
  [/\bFutois\b/g, "Footwah"],
  [/\bHenry\b/g, "Onree"], // the panelist — [awn-ree]
  [/\bRiquelme\b/g, "Reekelmeh"], // [ree-kel-meh], never [ri-kwelm]
  [/\bdale\b/gi, "dahleh"], // [dah-leh]
  [/\bvale\b/gi, "bahleh"], // [bah-leh] — Spanish v
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

export function respellForAudio(text: string): string {
  return AUDIO_RESPELL_360.reduce((t, [re, sub]) => t.replace(re, sub), text);
}

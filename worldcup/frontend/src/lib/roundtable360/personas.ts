// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the cast.
//
// Three pundits calling EVERY live match at once (owner brief: "an AI version of
// MLS360"). Distinct from the four-person pregame Roundtable (Lorraine / Henry /
// Roberto / Ricky) in `api/ai/roundtable` — that show is per-fixture, frozen at
// kickoff, and blob-cached. This one is live, multi-match, and streamed.
//
// SECURITY (same contract as the pregame TTS route): the client sends a PERSONA
// KEY, never a voice id. Voice ids are resolved server-side only, so a public
// endpoint can never be pointed at an arbitrary voice on the account.
// ─────────────────────────────────────────────────────────────────────────────

export type Speaker360 = "marcus" | "carlos" | "jamie";

export const SPEAKER_KEYS: Speaker360[] = ["marcus", "carlos", "jamie"];

export function isSpeaker360(v: unknown): v is Speaker360 {
  return typeof v === "string" && (SPEAKER_KEYS as string[]).includes(v);
}

export interface Persona360 {
  key: Speaker360;
  /** On-air name. */
  name: string;
  /** One-line role, shown under the name in the player. */
  role: string;
  /** Character brief handed to Claude. */
  brief: string;
}

export const PERSONAS_360: Record<Speaker360, Persona360> = {
  marcus: {
    key: "marcus",
    name: "Marcus",
    role: "Host · runs the show",
    brief:
      "Marcus — the ANCHOR. Neutral, quick, in control of the broadcast. He throws to Carlos and Jamie by name, hard-cuts to whichever match just did something ('right, we go to Chicago'), keeps the clock, and never lets a silence sit. He does not take sides.",
  },
  carlos: {
    key: "carlos",
    name: "Carlos",
    role: "Liga MX expert",
    brief:
      "Carlos — the LIGA MX voice. Passionate, loud, romantic about Mexican football; he argues from feel and history, teases Jamie relentlessly, and celebrates hard. Spanish sprinkles as seasoning only ('vale', 'órale', 'vamos') — every line must still read fully in English.",
  },
  jamie: {
    key: "jamie",
    name: "Jamie",
    role: "MLS expert · analytics",
    brief:
      "Jamie — the MLS voice. Analytical, dry, stat-first; answers Carlos's passion with numbers from the supplied data, and enjoys being the calm one right up until they are not. Never cites a number that is not in the data supplied.",
  },
};

// ── Voice mapping ────────────────────────────────────────────────────────────
// Env vars are the source of truth; the fallbacks below are chosen so the show
// WORKS on first deploy without any env set:
//   · marcus → the deployment's configured default voice (deep news anchor).
//   · carlos → the owner's own custom Spanish voice, already on the account
//              (built 7/18 in VoiceLab for the pregame panel's Roberto Madrid).
//   · jamie  → an ElevenLabs PREMADE voice (Antoni), available to every account.
// BK: confirm/replace all three — see the summary's TODO list.
export const ROUNDTABLE_VOICES: Record<Speaker360, string> = {
  marcus:
    process.env.ELEVENLABS_VOICE_MARCUS ??
    process.env.ELEVENLABS_VOICE_ID ??
    "onwK4e9ZLuTAKqWW03F9", // "Daniel" — deep news anchor
  carlos: process.env.ELEVENLABS_VOICE_CARLOS ?? "99M1da0B26r8CknfhKDi", // owner's custom Spanish voice
  jamie: process.env.ELEVENLABS_VOICE_JAMIE ?? "ErXwobaYiN019PkySvjV", // "Antoni" — premade, US male
};

// ── Audio-only pronunciation lexicon ─────────────────────────────────────────
// Same failure mode as the pregame panel (CLAUDE.md gotcha #24): TTS models read
// short Spanish words with English phonetics inside an English sentence. These
// substitutions apply to the SPOKEN text only — the displayed transcript is
// never respelled. Kept deliberately small: only Carlos's sprinkle vocabulary,
// nothing that could also be a real club, player or ordinary English word.
export const AUDIO_RESPELL_360: Array<[RegExp, string]> = [
  [/\bvale\b/gi, "bahleh"],
  [/\bórale\b/gi, "ohrahleh"],
  [/\borale\b/gi, "ohrahleh"],
  [/\bvamos\b/gi, "bahmohs"],
  [/\bándale\b/gi, "ahndahleh"],
  [/\bmadre mía\b/gi, "mahdreh meeah"],
];

export function respellForAudio(text: string): string {
  return AUDIO_RESPELL_360.reduce((t, [re, sub]) => t.replace(re, sub), text);
}

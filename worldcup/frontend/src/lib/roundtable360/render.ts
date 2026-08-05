// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — audio rendering.
//
// RENDER ONCE, SERVE UNLIMITED (owner directive 8/5, the confirmed WC26
// pattern). An episode's audio is synthesised ONCE at generation time and
// written to Vercel Blob; every listener afterwards is served the same object
// from the CDN. The earlier stream-per-listener design billed ElevenLabs per
// listener per line, which is exactly what the WC26 build moved away from.
//
// GROUPS, NOT LINES. The show is a conversation in bursts: 2-4 lines fired off
// in quick succession, then a real pause where only the crowd is heard. So the
// unit of storage is the GROUP — its lines are rendered in parallel, joined with
// ~260ms of true silence, and stored as ONE object. The client plays a group,
// waits 5s over the stadium bed, plays the next.
//
// MODEL: eleven_v3 with hardened accent tags, falling back to
// eleven_multilingual_v2 (untagged — older models read tags aloud). Turbo is
// deliberately absent: it is what flattened the accents in WC26 dev, and the
// owner's directive is that accent quality outranks latency, always.
// ─────────────────────────────────────────────────────────────────────────────

import { put } from "@vercel/blob";
import { SPORT } from "@/lib/sportConfig";
import {
  ROUNDTABLE_VOICES,
  ACCENT_TAGS_360,
  VOICE_SETTINGS_360,
  V3_STABILITY,
  respellForAudio,
  type Speaker360,
} from "./personas";

const ELEVENLABS = "https://api.elevenlabs.io/v1/text-to-speech";

/** Primary model. Accent fidelity is the whole point — do not put turbo here. */
const MODEL_PRIMARY = process.env.ELEVENLABS_ROUNDTABLE_MODEL ?? "eleven_v3";
/** Fallback when v3 is unavailable on the account. Still an accent-capable model. */
const MODEL_FALLBACK = "eleven_multilingual_v2";

/** Gap between speakers INSIDE a group — quick conversational overlap-adjacent
 *  pace, not a beat. Rounded up to whole MP3 frames when built. */
const INTRA_GROUP_GAP_MS = 260;

/** Cap per line, as a billing bound on a public generation trigger. */
const MAX_LINE_CHARS = 900;

export interface RenderableLine {
  speaker: Speaker360;
  text: string;
}

// ── MP3 assembly ─────────────────────────────────────────────────────────────
//
// Joining the group's lines needs (a) clean segment boundaries and (b) real
// silence between them. Both are done on the raw MP3 bytes; there is no decoder
// or encoder in a serverless route, and re-encoding via PCM/WAV would multiply
// the size of every object on a Blob store that is already full.

/** Strip a leading ID3v2 tag, if present. Header: "ID3" + 2 version bytes +
 *  flags + a 4-byte synchsafe size (7 bits per byte). */
function stripId3v2(buf: Buffer): Buffer {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return buf;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const footer = (buf[5] & 0x10) !== 0 ? 10 : 0;
  const end = 10 + size + footer;
  return end < buf.length ? buf.subarray(end) : buf;
}

/** Strip a trailing 128-byte ID3v1 tag, if present. */
function stripId3v1(buf: Buffer): Buffer {
  if (buf.length < 128) return buf;
  const tagStart = buf.length - 128;
  return buf.toString("latin1", tagStart, tagStart + 3) === "TAG" ? buf.subarray(0, tagStart) : buf;
}

function cleanSegment(buf: Buffer): Buffer {
  return stripId3v1(stripId3v2(buf));
}

const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_RATES = [44100, 48000, 32000, 0];

/**
 * Build silent MP3 frames that match a real segment's OWN header.
 *
 * Hand-writing a silent frame from assumed parameters is how you get clicks: the
 * gap must agree with the surrounding audio on version, bitrate, sample rate and
 * channel mode, and nothing here knows for certain what ElevenLabs returns. So
 * the header is COPIED from the first frame of the actual rendered line, and
 * only two things are changed — the protection bit is forced to "no CRC" (so a
 * zeroed CRC field can't be rejected) and padding is cleared (so frame length is
 * a constant). Everything after the header is zeroed, which sets every granule's
 * part2_3_length to 0: the decoder's definition of silence.
 *
 * Returns an empty buffer if the header can't be parsed, so a gap that cannot be
 * built safely becomes no gap at all rather than a corrupt stream.
 */
function silenceLike(segment: Buffer, ms: number): Buffer {
  // Find the first frame sync (0xFF Ex/Fx) in the first few KB.
  let i = 0;
  const limit = Math.min(segment.length - 4, 8192);
  while (i < limit && !(segment[i] === 0xff && (segment[i + 1] & 0xe0) === 0xe0)) i++;
  if (i >= limit) return Buffer.alloc(0);

  const b1 = segment[i + 1];
  const b2 = segment[i + 2];
  const b3 = segment[i + 3];

  const versionBits = (b1 >> 3) & 0x03; // 3 = MPEG1
  const layerBits = (b1 >> 1) & 0x03; // 1 = Layer III
  if (versionBits !== 3 || layerBits !== 1) return Buffer.alloc(0); // only MPEG1 L3 is handled

  const bitrate = MPEG1_L3_BITRATES[(b2 >> 4) & 0x0f];
  const sampleRate = MPEG1_RATES[(b2 >> 2) & 0x03];
  if (!bitrate || !sampleRate) return Buffer.alloc(0); // free-format or reserved — bail

  const frameBytes = Math.floor((144 * bitrate * 1000) / sampleRate); // padding cleared
  const frameMs = (1152 / sampleRate) * 1000; // MPEG1 Layer III = 1152 samples/frame
  const frames = Math.max(1, Math.round(ms / frameMs));

  const out = Buffer.alloc(frameBytes * frames); // zeroed → silent side info + data
  for (let f = 0; f < frames; f++) {
    const o = f * frameBytes;
    out[o] = 0xff;
    out[o + 1] = b1 | 0x01; // protection bit high = no CRC field
    out[o + 2] = b2 & 0xfd; // clear the padding bit
    out[o + 3] = b3;
  }
  return out;
}

/** Concatenate a group's rendered lines with real silence between speakers. */
export function stitchGroup(segments: Buffer[], gapMs = INTRA_GROUP_GAP_MS): Buffer {
  const clean = segments.map(cleanSegment).filter((b) => b.length > 0);
  if (clean.length === 0) return Buffer.alloc(0);
  const gap = silenceLike(clean[0], gapMs);

  const parts: Buffer[] = [];
  clean.forEach((seg, i) => {
    if (i > 0 && gap.length) parts.push(gap);
    parts.push(seg);
  });
  return Buffer.concat(parts);
}

// ── Synthesis ────────────────────────────────────────────────────────────────

export interface RenderFailure {
  speaker: Speaker360;
  reason: string;
}

/**
 * Synthesise ONE line.
 *
 * Escalating fallback, because the exact voice_settings shape eleven_v3 accepts
 * is the least certain thing here and a rejected payload must not cost us the
 * accent:
 *   1. v3 + accent tag + v3-legal settings (discrete stability)
 *   2. v3 + accent tag, no settings at all (the voice's stored VoiceLab values)
 *   3. multilingual_v2 + full continuous settings, NO tag (v2 reads tags aloud)
 * Only step 3 loses the explicit tag, and it is still an accent-capable model.
 */
export async function renderLine(line: RenderableLine): Promise<Buffer | RenderFailure> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { speaker: line.speaker, reason: "ELEVENLABS_API_KEY not set" };

  const voiceId = ROUNDTABLE_VOICES[line.speaker];
  if (!voiceId) {
    // Lorraine with no configured id lands here. Refusing is the point: a
    // missing voice must never silently become somebody else's voice.
    return { speaker: line.speaker, reason: `no voice id configured for ${line.speaker}` };
  }

  const spoken = respellForAudio(line.text).slice(0, MAX_LINE_CHARS);
  const tagged = ACCENT_TAGS_360[line.speaker] + spoken;

  const attempts: Array<{ label: string; body: Record<string, unknown> }> = [
    {
      label: `${MODEL_PRIMARY} + tag + settings`,
      body: {
        text: tagged,
        model_id: MODEL_PRIMARY,
        voice_settings: {
          stability: V3_STABILITY,
          similarity_boost: VOICE_SETTINGS_360.similarity_boost,
          use_speaker_boost: VOICE_SETTINGS_360.use_speaker_boost,
        },
      },
    },
    { label: `${MODEL_PRIMARY} + tag`, body: { text: tagged, model_id: MODEL_PRIMARY } },
    {
      label: `${MODEL_FALLBACK} + settings`,
      body: { text: spoken, model_id: MODEL_FALLBACK, voice_settings: { ...VOICE_SETTINGS_360 } },
    },
  ];

  let lastReason = "unknown";
  for (const attempt of attempts) {
    try {
      const res = await fetch(`${ELEVENLABS}/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(attempt.body),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) return buf;
        lastReason = `${attempt.label}: empty body`;
      } else {
        lastReason = `${attempt.label}: HTTP ${res.status}`;
        console.warn(`[roundtable360/render] ${lastReason} for ${line.speaker}`);
      }
    } catch (e) {
      lastReason = `${attempt.label}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { speaker: line.speaker, reason: lastReason };
}

function isFailure(v: Buffer | RenderFailure): v is RenderFailure {
  return !Buffer.isBuffer(v);
}

export interface RenderedGroup {
  index: number;
  /** Indexes into the episode's `lines` array that this group speaks. */
  lineIndexes: number[];
  /** Blob URL, or null when the group could not be stored (client streams it). */
  url: string | null;
  bytes: number;
}

export interface GroupRenderResult {
  groups: RenderedGroup[];
  /** "blob" when every group was stored; "stream" when any fell back. */
  audioMode: "blob" | "stream";
  warnings: string[];
}

/**
 * Render and store every group of an episode.
 *
 * Lines within a group render in PARALLEL (the group is one conversational
 * burst — there is no reason to serialise it), and the groups themselves render
 * in parallel too, so a 15-line episode costs about as much wall-clock as its
 * slowest single line.
 *
 * Blob failure is expected, not exceptional: the store is at capacity from WC26
 * audio, and CLAUDE.md's hard rule forbids deleting any of it to make room. A
 * failed write degrades that group to `url: null`, the episode to
 * `audioMode: "stream"`, and the client to per-line streaming — the show stays
 * on air and the reason lands in `warnings`.
 */
export async function renderEpisodeGroups(
  episodeId: string,
  lines: RenderableLine[],
  groups: number[][],
): Promise<GroupRenderResult> {
  const warnings: string[] = [];
  let anyFallback = false;

  const rendered = await Promise.all(
    groups.map(async (lineIndexes, index): Promise<RenderedGroup> => {
      const segments = await Promise.all(lineIndexes.map((i) => renderLine(lines[i])));

      const ok: Buffer[] = [];
      for (const seg of segments) {
        if (isFailure(seg)) {
          warnings.push(`group ${index}: ${seg.speaker} did not render — ${seg.reason}`);
        } else {
          ok.push(seg);
        }
      }
      if (ok.length === 0) {
        anyFallback = true;
        return { index, lineIndexes, url: null, bytes: 0 };
      }

      const audio = stitchGroup(ok);

      // Deterministic, deployment-namespaced key (CLAUDE.md 8/5: flat keys are
      // unattributable when two projects share a Blob store).
      const key = `roundtable360/${SPORT.id}/${episodeId}/g${index}.mp3`;
      try {
        const blob = await put(key, audio, {
          access: "public",
          contentType: "audio/mpeg",
          allowOverwrite: true,
        });
        return { index, lineIndexes, url: blob.url, bytes: audio.length };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        anyFallback = true;
        // The quota wall is the expected cause and it is silent in every other
        // symptom (gotcha #15) — name it explicitly so nobody debugs API keys.
        console.warn(`[roundtable360/render] Blob write failed for ${key}: ${msg}`);
        warnings.push(
          /quota|exceeded|limit/i.test(msg)
            ? `Blob storage is full — group ${index} will stream per line instead of being served from CDN`
            : `Blob write failed for group ${index}: ${msg}`,
        );
        return { index, lineIndexes, url: null, bytes: audio.length };
      }
    }),
  );

  return { groups: rendered, audioMode: anyFallback ? "stream" : "blob", warnings };
}

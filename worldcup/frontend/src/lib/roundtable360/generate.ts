// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — script generation.
//
// One Claude call per broadcast segment (~45-90s of dialogue), grounded in the
// DB snapshot from `liveState.ts`. Lives in lib/ rather than the route because
// BOTH `/api/roundtable/generate` (explicit) and `/api/roundtable/current`
// (client poll, auto-top-up) need it.
//
// THE COST GUARD IS LOAD-BEARING. Every listening browser polls; without a
// server-side floor on regeneration, N listeners = N Claude calls every 30s.
// `MIN_REGEN_MS` + the in-flight promise lock mean the Nth caller in a window
// gets the SAME episode the first caller generated, for one call's cost.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SPORT } from "@/lib/sportConfig";
import { tournamentBrief, EVENT_NAME } from "@/lib/promptContext";
import {
  buildLive360Context,
  renderMatchBoard,
  renderMomentFeed,
  renderCallbackBlock,
  type Live360Context,
  type RankedMoment,
} from "./liveState";
import { PERSONAS_360, SPEAKER_KEYS, ROUNDTABLE_VOICES, isSpeaker360, type Speaker360 } from "./personas";

/** Bump when the brief changes — episodes are a log, so this only labels rows. */
export const PROMPT_REV_360 = "v1";

/** Floor between generations, per deployment. Below this, callers get the last
 *  episode. 25s ≈ the client's 30s poll minus jitter, so a single listener still
 *  gets a fresh segment every poll while ten listeners still cost one call. */
export const MIN_REGEN_MS = 25_000;

const MODEL = process.env.ROUNDTABLE_360_MODEL ?? "claude-haiku-4-5-20251001";

export interface Line360 {
  speaker: Speaker360;
  text: string;
  /** Informational only. The TTS route resolves the voice from `speaker`
   *  server-side and ignores anything the client sends (cache-poisoning /
   *  arbitrary-voice defense, same contract as the pregame TTS route). */
  voiceId: string;
}

export interface Episode360 {
  id: string;
  lines: Line360[];
  fixtures: number[];
  matchContext: Live360Context["matches"];
  /** `${fixture}|${eventKey}` of the moment this segment leads with. */
  leadMomentKey: string | null;
  /** Moment type behind the lead — the stinger the client should fire. */
  leadMomentType: string | null;
  generatedAt: string;
}

function leadKey(m: RankedMoment): string {
  return `${m.fixture}|${m.momentKey}`;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function systemPrompt(): string {
  const cast = SPEAKER_KEYS.map((k) => `- ${k} — ${PERSONAS_360[k].brief}`).join("\n");
  const callback = renderCallbackBlock();

  return `You write the script for a LIVE multi-match football radio show — a rolling whip-around covering every match in play at once, in the style of a broadcast "360" show. Three fixed fictional pundits:
${cast}

${tournamentBrief()}

${
  callback
    ? `NARROW EXCEPTION to the "do not name another tournament" rule above — it applies to this show and nothing else:\n${callback}`
    : ""
}

HARD GROUNDING RULES (a violation is a publication error):
- Every match state, score, minute, scorer, card and event you mention MUST appear in the DATA block. Nothing else exists.
- Never invent a player, a scoreline, a statistic, a transfer, an injury, a quote, a crowd figure or a piece of history.
- You may not name a player who is not in the DATA block. If an event has no player attached, describe it without naming anyone.
- Opinion is allowed and encouraged, but it must be FRAMED as opinion ("I think", "my read", "watch for") and must rest on facts in the DATA block.
- Do not claim the broadcast, the platform or the pundits are official or affiliated with anyone.
- Refer to the competition as "${EVENT_NAME}" or simply "the tournament".

WHAT THIS SEGMENT MUST DO:
1. Reference at least one SPECIFIC event from the MOMENT FEED, by match, minute and what happened. Lead with the highest-importance one if the feed is not empty.
2. Cover the wider board — do not spend the whole segment on one match when several are live. Marcus hard-cuts between games.
3. NO DEAD AIR. If nothing dramatic has just happened, that is not an excuse to be short: analyse the scorelines on the board, argue about what the pattern means, set up what is coming, or run rivalry banter. The segment is always full length.
${callback ? `4. Work in at least one callback to the callback event above — as banter, a needle, or a comparison. Keep it light and keep it inside the permitted facts.` : ""}

WRITE FOR PERFORMANCE — every line is spoken aloud by a TTS voice:
- Short sentences that land. Exclamation marks where the emotion is real. Rhetorical questions.
- They talk to each other BY NAME, interrupt, disagree, and laugh in words ("ha!", "oh come on, Carlos").
- At most one ALL-CAPS word per big moment for emphasis.
- NEVER use stage directions, brackets, asterisks, emoji, speaker labels inside the text, or sound-effect notes — the voices read them aloud literally.

FORMAT: return ONLY valid JSON, no prose before or after:
{"lines": [{"speaker": "marcus"|"carlos"|"jamie", "text": string}]}
10-16 lines. Marcus opens. Every voice appears at least three times. Each line 1-3 sentences — this is roughly 45-90 seconds of speech.`;
}

function userPrompt(ctx: Live360Context, recentlyCovered: string[]): string {
  const parts = [
    `DATA — the live board right now:`,
    renderMatchBoard(ctx.matches),
    ``,
    `DATA — MOMENT FEED (every event recorded across all live matches in the last few minutes, ranked by cross-game importance 0-100):`,
    renderMomentFeed(ctx.moments, ctx.matches),
  ];
  if (recentlyCovered.length) {
    parts.push(
      ``,
      `ALREADY COVERED in the previous segment — do not re-break these as news; you may refer back to them:`,
      ...recentlyCovered.map((l) => `· ${l}`),
    );
  }
  parts.push(``, `Write the next segment of the show now.`);
  return parts.join("\n");
}

// ── Generation ───────────────────────────────────────────────────────────────

/** In-flight generation, per deployment. Collapses a thundering herd of pollers
 *  into ONE Claude call: everyone awaits the same promise. */
let inFlight: Promise<Episode360 | null> | null = null;

async function callClaude(ctx: Live360Context, recentlyCovered: string[]): Promise<Line360[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: systemPrompt(),
    messages: [{ role: "user", content: userPrompt(ctx, recentlyCovered) }],
  });

  const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: { lines?: Array<{ speaker?: unknown; text?: unknown }> };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const lines: Line360[] = (parsed.lines ?? [])
    .filter((l) => l && isSpeaker360(l.speaker) && typeof l.text === "string" && l.text.trim().length > 0)
    .map((l) => {
      const speaker = l.speaker as Speaker360;
      return { speaker, text: (l.text as string).trim(), voiceId: ROUNDTABLE_VOICES[speaker] };
    });

  // A two-line "segment" is dead air with extra steps — reject and let the
  // caller keep the previous episode on air rather than airing a stub.
  return lines.length >= 4 ? lines : null;
}

/** The newest episode for this deployment, or null. */
export async function latestEpisode(): Promise<Episode360 | null> {
  try {
    const row = await prisma.live360Episode.findFirst({
      where: { tournamentId: SPORT.id },
      orderBy: { generatedAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      lines: row.lines as unknown as Line360[],
      fixtures: row.fixtures,
      matchContext: row.matchContext as unknown as Live360Context["matches"],
      leadMomentKey: row.leadMomentKey,
      leadMomentType: row.leadMomentType,
      generatedAt: row.generatedAt.toISOString(),
    };
  } catch {
    // Table may not exist until the first deploy after this schema push.
    return null;
  }
}

export interface GenerateResult {
  episode: Episode360 | null;
  /** True when an existing episode was served instead of generating a new one. */
  reused: boolean;
  reason?: string;
}

/**
 * Produce the next segment.
 *
 * Order of guards: nothing live → no show; too soon since the last segment →
 * reuse it; another request already generating → await theirs; otherwise call
 * Claude. A model failure reuses the last episode rather than going silent —
 * dead air is the one thing this feature exists to prevent.
 */
export async function generateEpisode(fixtureIds?: number[]): Promise<GenerateResult> {
  const ctx = await buildLive360Context(fixtureIds);
  const previous = await latestEpisode();

  if (ctx.matches.length === 0) {
    return { episode: previous, reused: true, reason: "no matches in play" };
  }
  if (previous && Date.now() - new Date(previous.generatedAt).getTime() < MIN_REGEN_MS) {
    return { episode: previous, reused: true, reason: "within regeneration cooldown" };
  }
  if (inFlight) {
    const shared = await inFlight;
    return { episode: shared ?? previous, reused: true, reason: "joined in-flight generation" };
  }

  // The previous segment's lead stops the booth breaking the same goal twice.
  const recentlyCovered = previous?.leadMomentKey
    ? [`the moment keyed ${previous.leadMomentKey}`]
    : [];

  inFlight = (async () => {
    const lines = await callClaude(ctx, recentlyCovered);
    if (!lines) return null;

    const lead = ctx.lead && (!previous || leadKey(ctx.lead) !== previous.leadMomentKey) ? ctx.lead : null;

    const row = await prisma.live360Episode.create({
      data: {
        tournamentId: SPORT.id,
        fixtures: ctx.matches.map((m) => m.fixture),
        lines: lines as unknown as Prisma.InputJsonValue,
        matchContext: ctx.matches as unknown as Prisma.InputJsonValue,
        leadMomentKey: lead ? leadKey(lead) : null,
        leadMomentType: lead ? lead.type : null,
        promptRev: PROMPT_REV_360,
      },
    });

    return {
      id: row.id,
      lines,
      fixtures: row.fixtures,
      matchContext: ctx.matches,
      leadMomentKey: row.leadMomentKey,
      leadMomentType: row.leadMomentType,
      generatedAt: row.generatedAt.toISOString(),
    } satisfies Episode360;
  })();

  try {
    const fresh = await inFlight;
    if (!fresh) {
      return { episode: previous, reused: true, reason: "generation failed — previous segment kept on air" };
    }
    return { episode: fresh, reused: false };
  } catch (e) {
    console.error("[roundtable360] generate", e);
    return { episode: previous, reused: true, reason: "generation error — previous segment kept on air" };
  } finally {
    inFlight = null;
  }
}

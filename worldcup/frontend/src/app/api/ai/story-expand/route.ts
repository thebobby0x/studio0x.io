import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { put, head } from "@vercel/blob";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// L1: in-memory (hot path within a warm instance, content-keyed so survives hourly story regen)
const _memCache = new Map<string, string>();

// Stable cache key derived from story content, not the ephemeral storyId.
// Same headline+body always maps to the same key across regenerations and instances.
function blobKey(headline: string, body: string): string {
  const hash = createHash("sha256").update(headline + body).digest("hex").slice(0, 16);
  return `deep-dives/${hash}.json`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { headline, body, category, teamsInvolved } = await req.json() as {
    storyId: string;
    headline: string;
    body: string;
    category: string;
    teamsInvolved: string[];
  };

  const key = blobKey(headline, body);

  // L1 — in-memory hit
  if (_memCache.has(key)) {
    return NextResponse.json({ deepDive: _memCache.get(key), cached: true });
  }

  // L2 — Vercel Blob hit (shared across all instances + cold starts)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const existing = await head(key);
      if (existing?.url) {
        const res = await fetch(existing.url);
        const { deepDive } = await res.json() as { deepDive: string };
        _memCache.set(key, deepDive);
        return NextResponse.json({ deepDive, cached: true });
      }
    } catch {
      // Not cached yet — fall through to generate
    }
  }

  // Generate via Sonnet
  const teams = teamsInvolved.join(", ");
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are a senior editor at studio0x, a premium AI sports analytics platform covering the 2026 World Cup.

A reader just clicked "Go Deeper" on this story:

HEADLINE: ${headline}
CATEGORY: ${category}
TEAMS: ${teams}
SUMMARY: ${body}

Write a deep-dive editorial expanding on this story. Structure it with these three sections, each with a bold heading:

**The Full Picture**
3-4 sentences expanding the context behind the story. Ground every claim in the facts stated in the HEADLINE and SUMMARY above — you may interpret and analyse them, but do NOT invent specifics that are not given: no made-up formations, player names, match minutes, statistics, or xG figures. If the summary lacks a detail, discuss the situation in general terms instead of fabricating it.

**Historical Context**
2-3 sentences placing this in the broader history of these teams or the World Cup. Speak in general, well-known terms (e.g. a nation's pedigree or past deep runs) — do NOT cite specific historical scorelines, years, match incidents, or statistics unless they appear in the summary above, and never invent a historical anecdote.

**What to Watch Next**
2-3 sentences on the direct consequences — what a result like this typically means for a side's path, situations to monitor, or tactical questions it raises. Only reference specific upcoming fixtures or standings if they are stated above.

Write in the authoritative-but-engaging style of The Athletic. No fluff, no filler. 350-450 words total. Accuracy beats specificity: a general true statement always beats an invented specific one. Do not add any intro or outro beyond the three sections.`,
    }],
  });

  const deepDive = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  // Persist to both caches
  _memCache.set(key, deepDive);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(key, JSON.stringify({ deepDive }), {
      access: "public",
      contentType: "application/json",
    }).catch(() => { /* non-fatal — response is already ready */ });
  }

  return NextResponse.json({ deepDive, cached: false });
}

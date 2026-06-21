import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cache deep dives per story id (in-memory, lives for the server instance)
const _cache = new Map<string, string>();

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { storyId, headline, body, category, teamsInvolved } = await req.json() as {
    storyId: string;
    headline: string;
    body: string;
    category: string;
    teamsInvolved: string[];
  };

  if (_cache.has(storyId)) {
    return NextResponse.json({ deepDive: _cache.get(storyId), cached: true });
  }

  const teams = teamsInvolved.join(", ");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are a senior editor at Studio0x, a premium AI sports analytics platform covering the 2026 FIFA World Cup.

A reader just clicked "Go Deeper" on this story:

HEADLINE: ${headline}
CATEGORY: ${category}
TEAMS: ${teams}
SUMMARY: ${body}

Write a deep-dive editorial expanding on this story. Structure it with these three sections, each with a bold heading:

**The Full Picture**
3-4 sentences expanding the tactical, statistical, or narrative context behind the story. Be specific — reference formations, player roles, match minutes, xG-style analysis, or group stage implications.

**Historical Context**
2-3 sentences placing this in the broader history of these teams or the World Cup. Reference past tournaments, rivalries, or comparable moments when relevant.

**What to Watch Next**
2-3 sentences on the direct consequences — upcoming fixtures, player situations to monitor, group stage mathematics, or tactical adjustments to expect.

Write in the authoritative-but-engaging style of The Athletic. No fluff, no filler. 350-450 words total. Do not add any intro or outro beyond the three sections.`,
    }],
  });

  const deepDive = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  _cache.set(storyId, deepDive);

  return NextResponse.json({ deepDive, cached: false });
}

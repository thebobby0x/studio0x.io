import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface Story {
  id: string;
  category: "MATCH REPORT" | "ANALYSIS" | "STANDINGS" | "METRIC SPOTLIGHT";
  headline: string;
  body: string;
  teamsInvolved: string[];
  generatedAt: string;
  audioUrl?: string;
}

// In-memory cache — regenerate once per hour
let _cache: { ts: number; stories: Story[] } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function buildPrompt(matchData: string, standingsData: string): string {
  return `You are Studio0x's AI sports analyst covering the 2026 FIFA World Cup. Write 5 original editorial news stories based on the tournament data below.

TOURNAMENT DATA (last 14 days):
${matchData}

GROUP STANDINGS SNAPSHOT:
${standingsData}

STUDIO0X CUSTOM METRICS (simulated, proprietary):
Our platform tracks Match DNA™ metrics including:
- Pressing Intensity Index (how aggressively a team presses out of possession)
- Transition Danger Rating (threat level on counter-attacks)
- Clutch Moment Score (performance in critical match minutes: 75'–90')
- Goal Gravity (probability of a goal in any given 5-minute window)

Write exactly 5 stories in JSON format:
[
  {
    "category": "MATCH REPORT" | "ANALYSIS" | "STANDINGS" | "METRIC SPOTLIGHT",
    "headline": "Punchy headline (max 12 words)",
    "body": "3-4 sentences of editorial copy. Be specific with scores, teams, and dates. For METRIC SPOTLIGHT stories, reference our proprietary metrics naturally as 'per Studio0x data'. Sound like The Athletic or ESPN — authoritative but engaging.",
    "teamsInvolved": ["TLA1", "TLA2"]
  }
]

Mix the categories. Include at least one METRIC SPOTLIGHT and one STANDINGS story. Be specific with the data provided. Return only the JSON array, no other text.`;
}

async function generateStories(): Promise<Story[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [matches, allMatches] = await Promise.all([
    prisma.match.findMany({
      where: { status: "FT", date: { gte: since } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "desc" },
    }),
    prisma.match.findMany({
      where: { status: "FT" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    }),
  ]);

  if (matches.length === 0) return [];

  // Build match summary
  const matchLines = matches.map((m) => {
    const date = new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const result = m.homeScore > m.awayScore ? "W" : m.homeScore < m.awayScore ? "L" : "D";
    return `${date}: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} [${result} for ${m.homeTeam.name}]`;
  });

  // Build standings from all FT matches
  const table: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; group: string }> = {};
  for (const m of allMatches) {
    const hCode = m.homeTeam.code;
    const aCode = m.awayTeam.code;
    const hGroup = m.homeTeam.groupStage;
    if (!table[hCode]) table[hCode] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, group: hGroup };
    if (!table[aCode]) table[aCode] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, group: m.awayTeam.groupStage };
    table[hCode].p++; table[aCode].p++;
    table[hCode].gf += m.homeScore; table[hCode].ga += m.awayScore;
    table[aCode].gf += m.awayScore; table[aCode].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { table[hCode].w++; table[aCode].l++; }
    else if (m.homeScore < m.awayScore) { table[aCode].w++; table[hCode].l++; }
    else { table[hCode].d++; table[aCode].d++; }
  }

  const standingsLines = Object.entries(table)
    .map(([tla, s]) => ({ tla, ...s, pts: s.w * 3 + s.d }))
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga))
    .slice(0, 16)
    .map((s) => `Group ${s.group} - ${s.tla}: ${s.p}P ${s.w}W ${s.d}D ${s.l}L ${s.gf}-${s.ga} (${s.pts}pts)`);

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: buildPrompt(matchLines.join("\n"), standingsLines.join("\n")),
    }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const raw = JSON.parse(jsonMatch[0]) as Array<{
    category: Story["category"];
    headline: string;
    body: string;
    teamsInvolved: string[];
  }>;

  return raw.map((s, i) => ({
    ...s,
    id: `story-${Date.now()}-${i}`,
    generatedAt: new Date().toISOString(),
  }));
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json({ stories: _cache.stories, cached: true });
  }

  try {
    const stories = await generateStories();
    if (stories.length > 0) {
      _cache = { ts: Date.now(), stories };
    }
    return NextResponse.json({ stories, cached: false });
  } catch (e) {
    return NextResponse.json({ stories: _cache?.stories ?? [], error: String(e) });
  }
}

// Force regenerate
export async function POST() {
  _cache = null;
  return GET();
}

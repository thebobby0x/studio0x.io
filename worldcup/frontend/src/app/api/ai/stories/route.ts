import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { maybeScheduleRefresh } from "@/lib/storyRefresh";

export const dynamic = "force-dynamic";

export interface Story {
  id: string;
  category: "MATCH REPORT" | "ANALYSIS" | "STANDINGS" | "METRIC SPOTLIGHT" | "GAME RECAP" | "DAILY RECAP" | "MATCH PREVIEW";
  headline: string;
  body: string;
  teamsInvolved: string[];
  generatedAt: string;
  audioUrl?: string;
}

// In-memory cache — regenerate once per hour
let _cache: { ts: number; stories: Story[] } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Metric computations from score data ────────────────────────────────────────

function scoreVolatilityLabel(homeScore: number, awayScore: number, total: number): string {
  const margin = Math.abs(homeScore - awayScore);
  if (margin === 0) return "High Tension (draw)";
  if (margin === 1 && total >= 4) return "High Drama (close high-scoring)";
  if (margin === 1) return "Tight Contest";
  if (margin >= 3) return "Dominant";
  return "Controlled";
}

function clutchLabel(homeScore: number, awayScore: number): string {
  const margin = Math.abs(homeScore - awayScore);
  if (margin === 0) return "Maximum (all goals decisive)";
  if (margin === 1) return "High (every goal mattered)";
  if (margin === 2) return "Medium";
  return "Low (comfortable margin)";
}

function goalGravityPeak(homeScore: number, awayScore: number, total: number): string {
  const margin = Math.abs(homeScore - awayScore);
  if (margin === 0 && total >= 2) return "Very High — equaliser(s) in play";
  if (margin === 1 && total >= 3) return "High — lead changes likely";
  if (total === 1) return "Critical — sole goal decided everything";
  if (total >= 5) return "Extreme — multiple lead-changing moments";
  return "Moderate";
}

// Labels below are derived from the FINAL SCORE ONLY — never claim data we
// don't have (possession, exact goal gaps). The AI cites these verbatim as
// "Studio0x readings", so a fabricated stat here becomes a published lie.
function strikeClock(total: number): string {
  if (total === 0) return "Goalless";
  if (total >= 5) return `High-scoring rhythm — ${total} goals`;
  if (total >= 3) return `Active — ${total} goals`;
  if (total === 1) return "Single decisive strike";
  return "Measured — 2 goals";
}

function momentumLabel(homeScore: number, awayScore: number, homeName: string, awayName: string): string {
  if (homeScore > awayScore) return `${homeName} finished on top on the scoreboard`;
  if (awayScore > homeScore) return `${awayName} took it on the road`;
  return "Level on the scoreboard — spoils shared";
}

function buildMatchMetrics(
  homeName: string, awayName: string,
  homeScore: number, awayScore: number,
): string {
  const total = homeScore + awayScore;
  return [
    `  Score Volatility™: ${scoreVolatilityLabel(homeScore, awayScore, total)}`,
    `  Clutch Index™: ${clutchLabel(homeScore, awayScore)}`,
    `  Goal Gravity™ Peak: ${goalGravityPeak(homeScore, awayScore, total)}`,
    `  Strike Clock™: ${strikeClock(total)}`,
    `  Momentum Pulse™: ${momentumLabel(homeScore, awayScore, homeName, awayName)}`,
  ].join("\n");
}

function buildPrompt(matchData: string, metricsData: string, standingsData: string): string {
  return `You are Studio0x's AI sports analyst covering the 2026 FIFA World Cup. Write 5 original editorial news stories based on the tournament data below.

RECENT MATCHES (last 14 days):
${matchData}

STUDIO0X PROPRIETARY METRIC READINGS (per-match data):
${metricsData}

Our proprietary stats:
- Match DNA™: Goal timeline, home vs away striking patterns across the 90 minutes
- Clutch Index™: Weighted scorer rating — lead-changing goals score 3x, equalisers 2.5x, late goals (80'+) get a 1.5x multiplier
- Strike Clock™: Goal timing rhythm (first strike minute, average gap between goals, rhythm label)
- Score Volatility™: Drama index — counts lead changes and equalisers
- Momentum Pulse™: Scoreboard momentum reading (derived from the final result)
- Goal Gravity™: Most impactful goal in a match, ranked by score context and timing

GROUP STANDINGS SNAPSHOT:
${standingsData}

Write exactly 5 stories in JSON format:
[
  {
    "category": "MATCH REPORT" | "ANALYSIS" | "STANDINGS" | "METRIC SPOTLIGHT",
    "headline": "Punchy headline (max 12 words)",
    "body": "3-4 sentences of editorial copy. ONLY reference facts you can see in the data above — NEVER invent player names, goal minutes, scorers, assists, or any match events not in the data. Stick to scores, standings, and metric readings. For METRIC SPOTLIGHT stories, reference specific metric readings naturally as 'per Studio0x data' or 'Studio0x Clutch Index™ shows'. Sound like The Athletic — authoritative but engaging.",
    "teamsInvolved": ["TLA1", "TLA2"]
  }
]

Mix the categories. Include at least 2 METRIC SPOTLIGHT stories that cite specific metric readings from the data above. Include 1 STANDINGS story. Return only the JSON array, no other text.`;
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

  // Build match summary + per-match proprietary metrics
  const matchLines: string[] = [];
  const metricsLines: string[] = [];

  for (const m of matches) {
    const date = new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const result = m.homeScore > m.awayScore ? "W" : m.homeScore < m.awayScore ? "L" : "D";
    matchLines.push(
      `${date}: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} [${result} for ${m.homeTeam.name}]`
    );
    metricsLines.push(
      `${m.homeTeam.name} vs ${m.awayTeam.name} (${m.homeScore}-${m.awayScore}):\n${buildMatchMetrics(m.homeTeam.name, m.awayTeam.name, m.homeScore, m.awayScore)}`
    );
  }

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
      content: buildPrompt(matchLines.join("\n"), metricsLines.join("\n\n"), standingsLines.join("\n")),
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
  // ── 1. In-memory editorial stories (AI-generated analysis/standings) ────────
  let editorialStories: Story[] = [];
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    editorialStories = _cache.stories;
  } else {
    try {
      const fresh = await generateStories();
      if (fresh.length > 0) {
        _cache = { ts: Date.now(), stories: fresh };
        editorialStories = fresh;
      } else {
        editorialStories = _cache?.stories ?? [];
      }
    } catch {
      editorialStories = _cache?.stories ?? [];
    }
  }

  // ── 2. Recent DB stories: MATCH PREVIEW, GAME RECAP, DAILY RECAP (last 48h) ─
  const since = new Date(Date.now() - 48 * 60 * 60_000);
  let dbStories: Story[] = [];
  try {
    const rows = await prisma.newsStory.findMany({
      where: {
        date: { gte: since },
        category: { in: ["MATCH PREVIEW", "GAME RECAP", "DAILY RECAP"] },
      },
      orderBy: { generatedAt: "desc" },
      take: 15,
    });
    dbStories = rows.map(s => ({
      id: s.id,
      category: s.category as Story["category"],
      headline: s.headline,
      body: s.body,
      teamsInvolved: s.teamsInvolved,
      generatedAt: s.generatedAt.toISOString(),
      audioUrl: s.audioUrl ?? undefined,
    }));
  } catch { /* DB unavailable — fall through to editorial only */ }

  // ── 3. Merge: newest DB stories first, editorial after; dedup by headline ───
  const seen = new Set<string>();
  const merged: Story[] = [];
  for (const s of [...dbStories, ...editorialStories]) {
    if (!seen.has(s.headline)) {
      seen.add(s.headline);
      merged.push(s);
    }
  }

  // Opportunistic sub-daily refresh after the response (shared throttle).
  maybeScheduleRefresh();

  return NextResponse.json({ stories: merged.slice(0, 12), cached: !!_cache });
}

// Force regenerate
export async function POST() {
  _cache = null;
  return GET();
}

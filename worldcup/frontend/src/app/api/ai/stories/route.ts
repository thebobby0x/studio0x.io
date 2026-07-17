import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { maybeScheduleRefresh } from "@/lib/storyRefresh";
import { KNOCKOUT_START, classifyRound } from "@/lib/tournament";

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
// "studio0x readings", so a fabricated stat here becomes a published lie.
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

function buildPrompt(matchData: string, metricsData: string, standingsData: string, knockoutStarted: boolean): string {
  return `You are studio0x's AI sports analyst covering the 2026 World Cup. Write 5 original editorial news stories based on the tournament data below.
${knockoutStarted ? "\nIMPORTANT: The group stage is OVER — the tournament is in the knockout rounds. Each match below is labeled with its stage. Never describe a knockout match (Round of 32/16, Quarter-final, Semi-final, Final) as a group game or say a knockout result affects a group table.\n" : ""}
RECENT MATCHES (last 14 days, each labeled with its stage):
${matchData}

studio0x PROPRIETARY METRIC READINGS (per-match data):
${metricsData}

Our proprietary stats:
- Match DNA™: Goal timeline, home vs away striking patterns across the 90 minutes
- Clutch Index™: Weighted scorer rating — lead-changing goals score 3x, equalisers 2.5x, late goals (80'+) get a 1.5x multiplier
- Strike Clock™: Goal timing rhythm (first strike minute, average gap between goals, rhythm label)
- Score Volatility™: Drama index — counts lead changes and equalisers
- Momentum Pulse™: Scoreboard momentum reading (derived from the final result)
- Goal Gravity™: Most impactful goal in a match, ranked by score context and timing

GROUP STANDINGS SNAPSHOT (group-stage games only${knockoutStarted ? " — these are FINAL, settled tables" : ""}):
${standingsData}

Write exactly 5 stories in JSON format:
[
  {
    "category": "MATCH REPORT" | "ANALYSIS" | "STANDINGS" | "METRIC SPOTLIGHT",
    "headline": "Punchy headline (max 12 words)",
    "body": "3-4 sentences of editorial copy. ONLY reference facts you can see in the data above — NEVER invent player names, goal minutes, scorers, assists, or any match events not in the data. Stick to scores, standings, and metric readings. For METRIC SPOTLIGHT stories, reference specific metric readings naturally as 'per studio0x data' or 'studio0x Clutch Index™ shows'. Sound like The Athletic — authoritative but engaging.",
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
    // Stage label so the model never frames a knockout tie as a group game
    const stage = new Date(m.date) >= KNOCKOUT_START
      ? (classifyRound(new Date(m.date)) ?? "Knockout")
      : `Group ${m.homeTeam.groupStage}`;
    matchLines.push(
      `${date} [${stage}]: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} [${result} for ${m.homeTeam.name}]`
    );
    metricsLines.push(
      `${m.homeTeam.name} vs ${m.awayTeam.name} (${m.homeScore}-${m.awayScore}):\n${buildMatchMetrics(m.homeTeam.name, m.awayTeam.name, m.homeScore, m.awayScore)}`
    );
  }

  // Build standings from GROUP-STAGE FT matches only — knockout results must
  // never inflate a group table (groups are frozen after KNOCKOUT_START).
  const table: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; group: string }> = {};
  for (const m of allMatches.filter(m => new Date(m.date) < KNOCKOUT_START)) {
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
      content: buildPrompt(matchLines.join("\n"), metricsLines.join("\n\n"), standingsLines.join("\n"), new Date() >= KNOCKOUT_START),
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


// ── Final-week feature stories (owner request 7/17) ───────────────────────────
// Five pregame reads for the final matchup: goalkeeping, defense, the legacy
// angle, projected XIs, tactics. Grounded in DB squads + real results; the
// legacy piece may use well-established career facts qualitatively but no
// invented numbers. Own 6h cache; renders only during final week (pre-Jul 21).
let _featuresCache: { ts: number; stories: Story[] } | null = null;
const FEATURES_TTL = 6 * 60 * 60 * 1000;

async function generateFinalFeatures(): Promise<Story[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  if (Date.now() >= new Date("2026-07-21T00:00:00Z").getTime()) return [];

  const finalMatch = await prisma.match.findFirst({
    where: { date: { gte: new Date("2026-07-19T12:00:00Z"), lte: new Date("2026-07-20T23:59:59Z") } },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!finalMatch || finalMatch.homeTeam.code === "TBD" || finalMatch.awayTeam.code === "TBD") return [];

  const [homeSquad, awaySquad, results] = await Promise.all([
    prisma.player.findMany({ where: { teamId: finalMatch.homeTeamId }, orderBy: { number: "asc" } }),
    prisma.player.findMany({ where: { teamId: finalMatch.awayTeamId }, orderBy: { number: "asc" } }),
    prisma.match.findMany({
      where: {
        status: "FT",
        OR: [
          { homeTeamId: { in: [finalMatch.homeTeamId, finalMatch.awayTeamId] } },
          { awayTeamId: { in: [finalMatch.homeTeamId, finalMatch.awayTeamId] } },
        ],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "desc" },
      take: 14,
    }),
  ]);

  const squadBlock = (label: string, sq: typeof homeSquad) =>
    sq.length
      ? `${label} SQUAD (only players you may name for ${label}):\n` + sq.map((p) => `#${p.number} ${p.name} — ${p.position}${p.club ? `, ${p.club}` : ""}${p.caps ? `, ${p.caps} caps` : ""}${p.goals ? `, ${p.goals} intl goals` : ""}`).join("\n")
      : `${label} SQUAD: unavailable — name NO ${label} players.`;
  const resultsBlock = results.map((m) => `${new Date(m.date).toISOString().slice(0, 10)}: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}`).join("\n");

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: `You write pregame feature stories for the tournament final. Return ONLY valid JSON:
{"stories":[{"slug":string,"headline":string,"body":string}]}
Write EXACTLY five stories (~120-170 words each), slugs: "goalkeeping", "defense", "legacy", "lineups", "tactics".
- goalkeeping: the duel between the two keepers (name them ONLY if present in squads).
- defense: the defensive matchup, built from listed defenders and real results.
- legacy: the all-time-great angle for the biggest name on the pitch — well-established career facts allowed qualitatively (championships, longevity), NO invented statistics or quotes.
- lineups: projected XIs drawn ONLY from the listed squads, framed as projections ("expect", "likely"), plus a bench name or two. Never present as confirmed team news.
- tactics: each manager's likely plan — clearly framed as speculation.
HARD RULES: no invented players, stats, injuries, quotes, or history; cite only numbers in the data; call it "the tournament"/"the final"; punchy magazine tone.`,
    messages: [{ role: "user", content: `THE FINAL: ${finalMatch.homeTeam.name} v ${finalMatch.awayTeam.name}, ${new Date(finalMatch.date).toUTCString()}, ${finalMatch.venue}.\n\n${squadBlock(finalMatch.homeTeam.name, homeSquad)}\n\n${squadBlock(finalMatch.awayTeam.name, awaySquad)}\n\nTOURNAMENT RESULTS:\n${resultsBlock}` }],
  });

  const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { stories?: { slug: string; headline: string; body: string }[] };
    return (parsed.stories ?? [])
      .filter((f) => f.headline && f.body)
      .map((f) => ({
        id: `final-feature-${f.slug}`,
        category: "ANALYSIS" as const,
        headline: f.headline,
        body: f.body,
        teamsInvolved: [finalMatch.homeTeam.code, finalMatch.awayTeam.code],
        generatedAt: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
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

  // ── 1b. Final-week features (own cache — fail soft, serve stale) ───────────
  let featureStories: Story[] = [];
  if (_featuresCache && Date.now() - _featuresCache.ts < FEATURES_TTL) {
    featureStories = _featuresCache.stories;
  } else {
    try {
      const fresh = await generateFinalFeatures();
      if (fresh.length > 0) _featuresCache = { ts: Date.now(), stories: fresh };
      featureStories = _featuresCache?.stories ?? [];
    } catch {
      featureStories = _featuresCache?.stories ?? [];
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

  // ── 3. Merge: final-week features lead, then newest DB stories, then
  // editorial; dedup by headline ──────────────────────────────────────────────
  const seen = new Set<string>();
  const merged: Story[] = [];
  for (const s of [...featureStories, ...dbStories, ...editorialStories]) {
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

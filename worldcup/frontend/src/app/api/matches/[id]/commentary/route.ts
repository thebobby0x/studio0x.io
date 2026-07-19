import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getFixtureStatistics } from "@/lib/liveStats";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AF_BASE = "https://v3.football.api-sports.io";

// Owner 7/18 (mid 3rd-place game): FAN and COMEDIAN are replaced by the
// Roundtable cast — Lorraine + the three custom voices — contributing to a
// SINGLE speaker-tagged feed. Legacy persona params map to the roundtable.
type Persona = "analyst" | "roundtable";
type Speaker = "lorraine" | "henry" | "roberto" | "ricky";
export interface CommentaryLine {
  speaker: Speaker | "analyst";
  text: string;
}

const ANALYST_PROMPT =
  "You are a precise, insightful BBC Sport football analyst. Use correct football terminology and stay objective. Keep each line concise (≤25 words).";

const ROUNDTABLE_PROMPT = `You write LIVE football commentary as a four-voice broadcast booth — the podiumMetrics Roundtable cast (FIXED fictional personas, disclaimed on the surface):
- lorraine — Lorraine Footy, middle-aged BRITISH anchor, classic-commentary energy, EXCITED by everything, volleys the panel's chaos back with glee ("right then", "oh that's marvelous").
- henry — Henry Futois, FRENCH ex-PSG. Deep, gravelly, menacing one second and absurdly silly the next. Flair-worshipper. Sprinkles: "écoutez", "voilà", "magnifique", "non non non".
- roberto — Roberto Madrid, SPANISH ex-Real Madrid goalkeeper, massive and maniacally silly. THE authority on goalkeeping and defending. Catalan sprinkles: "vale", "escolta", "madre mía", "qué barbaridad".
- ricky — Ricky Riquelme, ARGENTINIAN old Boca legend. Booming, theatrical, HEAVY dry sarcasm, storytelling grandpa. Sprinkles: "che", "dale", "vamos", "en mis tiempos".
Code-switch rule: foreign phrases are seasoning — every line fully understandable to an English-only listener.
NEVER use stage directions, brackets, asterisks, or emoji — these lines become audio.
Return ONLY a JSON array, no other text:
[{"speaker":"lorraine"|"henry"|"roberto"|"ricky","text":"..."}]
Each text ≤28 words, natural spoken cadence. Lorraine anchors (opens the batch); every speaker appears at least once; they react to EACH OTHER by name.`;

interface MatchEvent {
  minute: number;
  type: string;
  detail: string;
  team: string;
  player: string;
  assist?: string;
}

async function fetchEvents(fixtureId: number): Promise<MatchEvent[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 8 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.response ?? []).map((e: {
      time: { elapsed: number };
      type: string;
      detail: string;
      team: { name: string };
      player: { name: string };
      assist?: { name?: string };
    }) => ({
      minute: e.time.elapsed,
      type: e.type,
      detail: e.detail,
      team: e.team.name,
      player: e.player.name,
      assist: e.assist?.name,
    }));
  } catch {
    return [];
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const rawPersona = searchParams.get("persona") ?? "analyst";
  // Legacy fan/comedian (pre-7/18 clients) route to the roundtable feed.
  const persona: Persona = rawPersona === "analyst" ? "analyst" : "roundtable";
  const limitParam = parseInt(searchParams.get("limit") ?? "6", 10);
  const limit = Math.min(Math.max(limitParam, 1), 12);
  // Client sends the event count it saw in its previous batch; when nothing
  // new has happened, the roundtable fills the quiet with grounded banter.
  const lastEvents = parseInt(searchParams.get("lastEvents") ?? "-1", 10);

  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  }).catch(() => null);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const isLive = match.status === "LIVE" || match.status === "HT";
  const [events, liveStats] = await Promise.all([
    // Quota discipline (owner 7/19, pre-final): a match that hasn't started
    // has no events — don't spend an API call per page load to learn that.
    match.status === "NS" ? Promise.resolve([]) : fetchEvents(match.fixture),
    // Real team stats give the commentary true substance (possession, shots)
    // instead of leaving the model to invent a "tactical battle" from nothing.
    (isLive || match.status === "FT")
      ? getFixtureStatistics(match.fixture, match.homeTeam.name, isLive)
      : Promise.resolve(null),
  ]);
  const score = `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}`;

  const statLine = (label: string, h: number | null, a: number | null, suffix = "") =>
    (h !== null || a !== null) ? `${label}: ${h ?? "?"}${suffix} – ${a ?? "?"}${suffix}` : null;
  const statsSummary = liveStats
    ? [
        statLine("Possession", liveStats.home.possession, liveStats.away.possession, "%"),
        statLine("Shots", liveStats.home.totalShots, liveStats.away.totalShots),
        statLine("Shots on target", liveStats.home.shotsOn, liveStats.away.shotsOn),
        statLine("Corners", liveStats.home.corners, liveStats.away.corners),
        statLine("Fouls", liveStats.home.fouls, liveStats.away.fouls),
        statLine("Passes", liveStats.home.passes, liveStats.away.passes),
        statLine("xG", liveStats.home.xg, liveStats.away.xg),
      ].filter(Boolean).join("\n")
    : "";

  const eventSummary = events.length > 0
    ? events.map(e => {
        if (e.type === "Goal" && e.detail === "Missed Penalty") return `${e.minute}' PENALTY MISSED – ${e.team}: ${e.player} (no goal)`;
        if (e.type === "Goal") return `${e.minute}' GOAL – ${e.team}: ${e.player}${e.assist ? ` (assist: ${e.assist})` : ""}${e.detail === "Own Goal" ? " (OG)" : ""}${e.detail === "Penalty" ? " (pen)" : ""}`;
        if (e.type === "Card") return `${e.minute}' ${e.detail} – ${e.player} (${e.team})`;
        if (e.type === "subst") return `${e.minute}' SUB – ${e.team}: ${e.player}`;
        if (e.type === "Var") return `${e.minute}' VAR REVIEW – ${e.detail} (${e.team})`;
        return `${e.minute}' ${e.type} – ${e.player} (${e.team})`;
      }).join("\n")
    : "No events yet.";

  // Quiet period: the match is live but nothing new arrived from the feed
  // since the client's last batch (owner 7/18: "add in notes or just banter").
  const isQuiet = isLive && lastEvents >= 0 && events.length <= lastEvents;

  const grounding = `GROUNDING RULES (strict): Only reference the events, players, and stats listed above. Do NOT invent player names, formations, tactical systems, injuries, or any statistic not shown. If no goals yet, build lines from the stats above (possession, shots, corners) and the general occasion — never from imagined specifics.`;

  const quietBrief = `NO NEW MATCH ACTION since the last update. This batch is QUIET-PERIOD BANTER: react to the current score, the stats above, and what's at stake; tease each other; drop a grounded observation or two. You must NOT narrate any new match action — no chances, saves, tackles, cards, or moments that are not in the data above. Opinions and feelings are welcome; invented events are not.`;

  const baseContext = `World Cup 2026 match — ${score}
Status: ${match.status}${isLive ? ` (${match.elapsed}' played)` : ""}

Events so far:
${eventSummary}
${statsSummary ? `\nLive team stats (${match.homeTeam.name} – ${match.awayTeam.name}):\n${statsSummary}\n` : ""}`;

  let lines: CommentaryLine[] = [];
  try {
    if (persona === "roundtable") {
      const userPrompt = `${baseContext}
${isQuiet ? quietBrief : `Generate a live-booth batch covering the newest moments and the current state of the match.`}
Produce exactly ${limit} lines as the JSON array format specified.

${grounding}`;
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: ROUNDTABLE_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonStr = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
      const speakers = new Set(["lorraine", "henry", "roberto", "ricky"]);
      lines = (JSON.parse(jsonStr) as CommentaryLine[])
        .filter((l) => l && typeof l.text === "string" && l.text.length > 0 && speakers.has(l.speaker))
        .slice(0, limit);
    } else {
      const userPrompt = `${baseContext}
Generate exactly ${limit} short commentary lines about this match, covering the key moments and current state. Number each line (1., 2., ...).

${grounding}`;
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: ANALYST_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      lines = text
        .split("\n")
        .map(l => l.replace(/^\d+\.\s*/, "").trim())
        .filter(l => l.length > 0)
        .slice(0, limit)
        .map(text => ({ speaker: "analyst" as const, text }));
    }
    if (lines.length === 0) throw new Error("empty generation");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI generation failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    persona,
    score,
    status: match.status,
    elapsed: match.elapsed,
    lines,
    quiet: isQuiet,
    eventCount: events.length,
    generatedAt: new Date().toISOString(),
  });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}

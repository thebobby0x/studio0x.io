import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getFixtureStatistics } from "@/lib/liveStats";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AF_BASE = "https://v3.football.api-sports.io";

type Persona = "analyst" | "fan" | "comedian";

const PERSONAS: Record<Persona, string> = {
  analyst:  "You are a precise, insightful BBC Sport football analyst. Use correct football terminology and stay objective. Keep each line concise (≤25 words).",
  fan:      "You are a passionate, emotional football fan watching live. Use exclamation points, emojis, slang. React to events with raw excitement or despair. Keep each line ≤20 words.",
  comedian: "You are a sharp football comedian. Find the absurd angle on every event. Make dry observations and cheeky puns. Keep each line ≤25 words.",
};

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
  const persona: Persona = (searchParams.get("persona") ?? "analyst") as Persona;
  const limitParam = parseInt(searchParams.get("limit") ?? "6", 10);
  const limit = Math.min(Math.max(limitParam, 1), 12);

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
    fetchEvents(match.fixture),
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

  const systemPrompt = PERSONAS[persona] ?? PERSONAS.analyst;
  const userPrompt = `World Cup 2026 match — ${score}
Status: ${match.status}${isLive ? ` (${match.elapsed}' played)` : ""}

Events so far:
${eventSummary}
${statsSummary ? `\nLive team stats (${match.homeTeam.name} – ${match.awayTeam.name}):\n${statsSummary}\n` : ""}
Generate exactly ${limit} short commentary lines about this match, covering the key moments and current state. Number each line (1., 2., ...).

GROUNDING RULES (strict): Only reference the events, players, and stats listed above. Do NOT invent player names, formations, tactical systems, injuries, or any statistic not shown. If no goals yet, build lines from the stats above (possession, shots, corners) and the general occasion — never from imagined specifics.`;

  let lines: string[] = [];
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    lines = text
      .split("\n")
      .map(l => l.replace(/^\d+\.\s*/, "").trim())
      .filter(l => l.length > 0)
      .slice(0, limit);
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

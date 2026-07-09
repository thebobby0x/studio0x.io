import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as authed } from "@/lib/adminAuth";
import { KNOCKOUT_START, classifyRound } from "@/lib/tournament";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Per-invocation caps so a single run stays well within the function timeout.
// Idempotent: re-running picks up whatever is still missing (cron + manual backfill).
const MAX_GAMES_PER_RUN = 110; // full tournament (104 matches) in one click
const MAX_DAYS_PER_RUN = 45;
const CONCURRENCY = 5;

const MODEL = "claude-haiku-4-5-20251001";


function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Stage context for prompts. Knockout matches must NEVER be described as group
// games — the group stage ended July 2 and "Group D performance" on an R16
// recap is wrong info (same bug class as the match-page group leak, PR #106).
function stageContext(date: Date): { label: string; stakes: string; isKnockout: boolean } {
  if (date < KNOCKOUT_START) {
    return { label: "Group stage", stakes: "what the result means for the group table", isKnockout: false };
  }
  const round = classifyRound(date) ?? "Knockout round";
  return {
    label: round,
    stakes: "what the result means for the winner's path and the loser's exit — this is a knockout game, NOT a group game",
    isKnockout: true,
  };
}

function dramaLabel(home: number, away: number): string {
  const margin = Math.abs(home - away);
  const total = home + away;
  if (margin === 0 && total >= 4) return "high-scoring draw";
  if (margin === 0) return "tight draw";
  if (margin === 1 && total >= 4) return "tense high-scoring win";
  if (margin === 1) return "narrow win";
  if (margin >= 3) return "dominant win";
  return "controlled win";
}

// Run an async mapper over items with bounded concurrency.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseStory(text: string): { headline: string; body: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { headline?: string; body?: string };
    if (obj.headline && obj.body) return { headline: obj.headline, body: obj.body };
  } catch {
    /* fall through */
  }
  return null;
}

type MatchWithTeams = {
  fixture: number;
  date: Date;
  homeScore: number;
  awayScore: number;
  homeTeam: { name: string; code: string };
  awayTeam: { name: string; code: string };
};

async function handler(req: Request) {
  if (!(await authed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey: key });

  const matches = (await prisma.match.findMany({
    where: { status: "FT" },
    select: {
      fixture: true, date: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true, code: true } },
      awayTeam: { select: { name: true, code: true } },
    },
    orderBy: { date: "asc" },
  })) as MatchWithTeams[];

  if (matches.length === 0) {
    return NextResponse.json({ error: "No finished matches to recap yet" }, { status: 400 });
  }

  // ── Self-heal: purge knockout stories that claim a group ─────────────────
  // Recaps generated before the stage-aware prompt could describe an R16 game
  // as a "Group D performance" (wrong info). Delete any knockout-dated recap
  // that names a specific group; this run regenerates it with the fixed
  // prompt. Idempotent: regenerated copy is banned from mentioning groups, so
  // this matches nothing on subsequent runs.
  const groupClaim = /\bGroup [A-L]\b/;
  const knockoutStories = await prisma.newsStory.findMany({
    where: {
      category: { in: ["GAME RECAP", "DAILY RECAP", "MATCH PREVIEW"] },
      date: { gte: KNOCKOUT_START },
    },
    select: { id: true, headline: true, body: true },
  });
  const badIds = knockoutStories
    .filter(s => groupClaim.test(s.headline) || groupClaim.test(s.body))
    .map(s => s.id);
  if (badIds.length > 0) {
    await prisma.newsStory.deleteMany({ where: { id: { in: badIds } } });
  }

  // ── Existing recaps (for idempotent skipping) ────────────────────────────
  const existing = await prisma.newsStory.findMany({
    where: { category: { in: ["GAME RECAP", "DAILY RECAP"] } },
    select: { fixture: true, category: true, date: true },
  });
  const haveGame = new Set(existing.filter(s => s.category === "GAME RECAP" && s.fixture != null).map(s => s.fixture));
  const haveDay = new Set(existing.filter(s => s.category === "DAILY RECAP").map(s => dayKey(s.date)));

  // ── 1. Per-game recaps ───────────────────────────────────────────────────
  const missingGames = matches.filter(m => !haveGame.has(m.fixture)).slice(0, MAX_GAMES_PER_RUN);

  const gameResults = await mapPool(missingGames, CONCURRENCY, async (m) => {
    const stage = stageContext(m.date);
    const prompt = `You are studio0x's AI football analyst covering the 2026 FIFA World Cup. Write a concise match recap.

MATCH: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}
STAGE: ${stage.label}${stage.isKnockout ? " (knockout — group stage is over; do NOT mention any group)" : ""}
RESULT TYPE: ${dramaLabel(m.homeScore, m.awayScore)}

Return ONLY a JSON object, no other text:
{
  "headline": "Punchy headline, max 11 words, references the teams or scoreline",
  "body": "2-3 sentences of authoritative match-report copy in the style of The Athletic. Reference the score and ${stage.stakes}. IMPORTANT: You only have the final score — do NOT invent player names, goal scorers, minutes, or any match events. Stick strictly to the result and its implications. No fluff."
}`;
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const parsed = parseStory(text);
      if (!parsed) return false;
      await prisma.newsStory.create({
        data: {
          date: m.date,
          fixture: m.fixture,
          category: "GAME RECAP",
          headline: parsed.headline,
          body: parsed.body,
          teamsInvolved: [m.homeTeam.code, m.awayTeam.code],
        },
      });
      return true;
    } catch {
      return false;
    }
  });
  const gamesWritten = gameResults.filter(Boolean).length;

  // ── 2. End-of-day recaps (only for completed past days) ───────────────────
  const today = dayKey(new Date());
  const byDay = new Map<string, MatchWithTeams[]>();
  for (const m of matches) {
    const k = dayKey(m.date);
    if (k >= today) continue; // skip today / future — day not complete yet
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  const missingDays = [...byDay.keys()].filter(k => !haveDay.has(k)).sort().slice(0, MAX_DAYS_PER_RUN);

  const dayResults = await mapPool(missingDays, CONCURRENCY, async (k) => {
    const dayMatches = byDay.get(k)!;
    const resultsList = dayMatches
      .map(m => `${stageContext(m.date).label}: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} (${dramaLabel(m.homeScore, m.awayScore)})`)
      .join("\n");
    const dayIsKnockout = dayMatches.every(m => stageContext(m.date).isKnockout);
    const prettyDate = new Date(k).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const prompt = `You are studio0x's AI football editor covering the 2026 FIFA World Cup. Write an end-of-day round-up for all matches played on ${prettyDate}.

RESULTS:
${resultsList}

Return ONLY a JSON object, no other text:
{
  "headline": "Punchy day round-up headline, max 12 words",
  "body": "4-6 sentences summarising the day's storylines across these matches. Pick out the standout result, any upsets, and what it means for the tournament. Authoritative, engaging, The Athletic style. IMPORTANT: You only have the final scores listed above — do NOT invent player names, goal scorers, minutes, or any match events. Describe each match by the STAGE shown next to it${dayIsKnockout ? " — these are all knockout games; do NOT mention any group" : ""}. Stick strictly to the results and their implications. No fluff."
}`;
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const parsed = parseStory(text);
      if (!parsed) return false;
      // flags: the two teams of the day's highest-scoring match
      const top = [...dayMatches].sort((a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore))[0];
      await prisma.newsStory.create({
        data: {
          date: new Date(`${k}T12:00:00.000Z`),
          category: "DAILY RECAP",
          headline: parsed.headline,
          body: parsed.body,
          teamsInvolved: [top.homeTeam.code, top.awayTeam.code],
        },
      });
      return true;
    } catch {
      return false;
    }
  });
  const daysWritten = dayResults.filter(Boolean).length;

  const remainingGames = matches.filter(m => !haveGame.has(m.fixture)).length - gamesWritten;
  const remainingDays = [...byDay.keys()].filter(k => !haveDay.has(k)).length - daysWritten;

  return NextResponse.json({
    ok: true,
    gamesWritten,
    daysWritten,
    remainingGames: Math.max(0, remainingGames),
    remainingDays: Math.max(0, remainingDays),
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

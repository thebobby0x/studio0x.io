import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-haiku-4-5-20251001";

function authed(req: Request): boolean {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") === "wc2026studio0x") return true;
  if (process.env.SEED_SECRET && searchParams.get("secret") === process.env.SEED_SECRET) return true;
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

function parseStory(text: string): { headline: string; body: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { headline?: string; body?: string };
    if (obj.headline && obj.body) return { headline: obj.headline, body: obj.body };
  } catch { /* */ }
  return null;
}

function dramaLabel(home: number, away: number): string {
  const margin = Math.abs(home - away);
  const total = home + away;
  if (margin === 0 && total >= 4) return "high-scoring draw";
  if (margin === 0) return "draw";
  if (margin === 1 && total >= 4) return "tense high-scoring win";
  if (margin === 1) return "narrow win";
  if (margin >= 3) return "dominant win";
  return "controlled win";
}

async function handler(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });

  const client = new Anthropic({ apiKey: key });
  const now = new Date();
  let previewsWritten = 0;
  let recapsWritten = 0;

  // ── 1. Pre-match previews ─────────────────────────────────────────────────
  // Generate a MATCH PREVIEW for matches kicking off in 50–70 minutes.
  const previewFrom = new Date(now.getTime() + 50 * 60_000);
  const previewTo   = new Date(now.getTime() + 70 * 60_000);

  const upcoming = await prisma.match.findMany({
    where: { status: "NS", date: { gte: previewFrom, lte: previewTo } },
    include: { homeTeam: true, awayTeam: true },
  });

  if (upcoming.length > 0) {
    const fixtures = upcoming.map(m => m.fixture);
    const existingPreviews = await prisma.newsStory.findMany({
      where: { fixture: { in: fixtures }, category: "MATCH PREVIEW" },
      select: { fixture: true },
    });
    const havePreview = new Set(existingPreviews.map(s => s.fixture));

    for (const m of upcoming.filter(m => !havePreview.has(m.fixture))) {
      const kickoffIn = Math.round((m.date.getTime() - now.getTime()) / 60_000);

      // Pull previous results for both teams this tournament for narrative context
      const prevMatches = await prisma.match.findMany({
        where: {
          status: "FT",
          OR: [
            { homeTeamId: m.homeTeamId }, { awayTeamId: m.homeTeamId },
            { homeTeamId: m.awayTeamId }, { awayTeamId: m.awayTeamId },
          ],
        },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { date: "asc" },
        take: 6,
      });

      const prevContext = prevMatches.length > 0
        ? `PREVIOUS RESULTS THIS TOURNAMENT FOR THESE TEAMS:\n${prevMatches.map(pm => `${pm.homeTeam.name} ${pm.homeScore}-${pm.awayScore} ${pm.awayTeam.name}`).join("\n")}`
        : "(First match of the tournament for both teams)";

      const prompt = `You are Studio0x's AI football analyst. Write a pre-match preview for this upcoming World Cup 2026 match, kicking off in ${kickoffIn} minutes.

MATCH: ${m.homeTeam.name} vs ${m.awayTeam.name}
GROUP: ${m.homeTeam.groupStage}
${prevContext}

Return ONLY valid JSON, no other text:
{
  "headline": "Pre-match headline, max 12 words, build anticipation",
  "body": "3-4 sentences of pre-match editorial in The Athletic style. Reference the group context and what is at stake. Only cite results visible above — do not invent stats."
}`;

      try {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = parseStory(text);
        if (parsed) {
          await prisma.newsStory.create({
            data: {
              date: m.date,
              fixture: m.fixture,
              category: "MATCH PREVIEW",
              headline: parsed.headline,
              body: parsed.body,
              teamsInvolved: [m.homeTeam.code, m.awayTeam.code],
            },
          });
          previewsWritten++;
        }
      } catch { /* skip on error, try next match */ }
    }
  }

  // ── 2. Post-match recaps (recently finished) ──────────────────────────────
  // A 90-min WC match takes ~115 min total. A match with kickoff 4h–110min ago
  // is likely finished. The 6AM /api/news/generate cron handles backfill;
  // this cron generates recaps quickly (within ~10 min of being marked FT).
  const recentFrom = new Date(now.getTime() - 4 * 60 * 60_000);

  const recentFT = await prisma.match.findMany({
    where: { status: "FT", date: { gte: recentFrom } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });

  if (recentFT.length > 0) {
    const fixtures = recentFT.map(m => m.fixture);
    const existingRecaps = await prisma.newsStory.findMany({
      where: { fixture: { in: fixtures }, category: "GAME RECAP" },
      select: { fixture: true },
    });
    const haveRecap = new Set(existingRecaps.map(s => s.fixture));

    for (const m of recentFT.filter(m => !haveRecap.has(m.fixture))) {
      const prompt = `You are Studio0x's AI football analyst covering the 2026 FIFA World Cup. Write a match recap.

RESULT: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}
TYPE: ${dramaLabel(m.homeScore, m.awayScore)}
GROUP: ${m.homeTeam.groupStage}

Return ONLY valid JSON:
{
  "headline": "Match recap headline, max 11 words, reference both teams and the result",
  "body": "2-3 sentences of authoritative match recap in The Athletic style. Reference the score and what it means for Group ${m.homeTeam.groupStage}. Do NOT invent player names, scorers, or match events."
}`;

      try {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = parseStory(text);
        if (parsed) {
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
          recapsWritten++;
        }
      } catch { /* skip on error */ }
    }
  }

  return NextResponse.json({ ok: true, previewsWritten, recapsWritten });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { KNOCKOUT_START, classifyRound } from "@/lib/tournament";

const MODEL = "claude-haiku-4-5-20251001";

// Shared opportunistic-refresh throttle. Any server route/page (dashboard, news,
// schedule…) can call maybeScheduleRefresh() to fire a story refresh AFTER its
// response is sent — without hammering the LLM. ~3 min per warm container.
// This is the sub-daily freshness mechanism on Hobby (which can't run sub-daily
// crons); the 6 AM /api/news/generate cron is the comprehensive daily backstop.
let _lastRefresh = 0;
const REFRESH_INTERVAL = 3 * 60_000;

export function maybeScheduleRefresh() {
  if (Date.now() - _lastRefresh < REFRESH_INTERVAL) return;
  _lastRefresh = Date.now();
  after(async () => {
    try { await runStoryRefresh(); } catch { /* non-blocking */ }
  });
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

// Stage context for prompts. Knockout matches must NEVER be framed as group
// games — teams carry a residual groupStage field, but after KNOCKOUT_START
// the group is history and "Group D performance" on an R16 story is wrong info.
function stageContext(date: Date, groupStage: string): { label: string; stakes: string; isKnockout: boolean } {
  if (date < KNOCKOUT_START) {
    return {
      label: `Group ${groupStage}`,
      stakes: `the group context and what is at stake in Group ${groupStage}`,
      isKnockout: false,
    };
  }
  const round = classifyRound(date) ?? "Knockout round";
  return {
    label: round,
    stakes: `what is at stake in this ${round} knockout tie — winner advances, loser goes home; do NOT mention any group`,
    isKnockout: true,
  };
}

/**
 * Core story-refresh logic, auth-free so it can be invoked two ways:
 *  - via the GET/POST route handlers in /api/cron/story-refresh (cron / admin)
 *  - directly in-process from /api/ai/stories after() (no network, no base URL,
 *    no CRON_SECRET dependency — avoids the whole class of internal-fetch bugs)
 *
 * Lives in lib/ (not the route file) because Next.js route modules may only
 * export route handlers + config, not arbitrary functions.
 * Returns counts; throws nothing fatal — individual match failures are skipped.
 */
export async function runStoryRefresh(): Promise<{ ok: boolean; previewsWritten: number; recapsWritten: number; skipped?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, previewsWritten: 0, recapsWritten: 0, skipped: "ANTHROPIC_API_KEY not set" };

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

      const stage = stageContext(m.date, m.homeTeam.groupStage);
      const prompt = `You are Studio0x's AI football analyst. Write a pre-match preview for this upcoming World Cup 2026 match, kicking off in ${kickoffIn} minutes.

MATCH: ${m.homeTeam.name} vs ${m.awayTeam.name}
STAGE: ${stage.label}${stage.isKnockout ? " (knockout — the group stage is over; do NOT mention any group)" : ""}
${prevContext}

Return ONLY valid JSON, no other text:
{
  "headline": "Pre-match headline, max 12 words, build anticipation",
  "body": "3-4 sentences of pre-match editorial in The Athletic style. Reference ${stage.stakes}. STRICT: only cite the results visible above — do not invent stats, player names, injuries, suspensions, or historical results/anecdotes not shown. General, well-known context (e.g. a nation's footballing pedigree) is fine; specific invented facts are not."
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
      const stage = stageContext(m.date, m.homeTeam.groupStage);
      const prompt = `You are Studio0x's AI football analyst covering the 2026 FIFA World Cup. Write a match recap.

RESULT: ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name}
TYPE: ${dramaLabel(m.homeScore, m.awayScore)}
STAGE: ${stage.label}${stage.isKnockout ? " (knockout — the group stage is over; do NOT mention any group)" : ""}

Return ONLY valid JSON:
{
  "headline": "Match recap headline, max 11 words, reference both teams and the result",
  "body": "2-3 sentences of authoritative match recap in The Athletic style. Reference the score and ${stage.stakes}. Do NOT invent player names, scorers, or match events."
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

  return { ok: true, previewsWritten, recapsWritten };
}

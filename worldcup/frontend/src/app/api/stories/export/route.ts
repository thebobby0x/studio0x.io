import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Story archive export (owner 7/18) — pull any slice of the tournament story
// archive as JSON or Markdown for socials/blog pushes. Read-only; everything
// here is already public on /news, so no auth gate.
//
//   /api/stories/export                          → JSON, newest first
//   /api/stories/export?format=md                → Markdown file download
//   ?category=GAME%20RECAP  ?team=ARG            → filters
//   ?from=2026-06-11&to=2026-06-30  ?limit=100   → date window + cap
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const format = (p.get("format") ?? "json").toLowerCase();
  const category = p.get("category");
  const team = p.get("team");
  const from = p.get("from");
  const to = p.get("to");
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "500", 10) || 500, 1), 1000);

  const where: Prisma.NewsStoryWhereInput = {};
  if (category) where.category = category.toUpperCase();
  if (team) where.teamsInvolved = { has: team.toUpperCase() };
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }

  let stories: Awaited<ReturnType<typeof prisma.newsStory.findMany>> = [];
  try {
    stories = await prisma.newsStory.findMany({
      where,
      orderBy: [{ date: "desc" }, { generatedAt: "desc" }],
      take: limit,
    });
  } catch {
    return NextResponse.json({ error: "archive unavailable" }, { status: 503 });
  }

  if (format === "md" || format === "markdown") {
    const md = stories
      .map((s) =>
        [
          `## ${s.headline}`,
          "",
          `*${s.date.toISOString().slice(0, 10)} · ${s.category}${s.teamsInvolved.length ? ` · ${s.teamsInvolved.join(" v ")}` : ""}*`,
          "",
          s.body,
        ].join("\n")
      )
      .join("\n\n---\n\n");
    const header = `# podiumMetrics — Tournament Story Archive\n\n*${stories.length} stories · exported ${new Date().toISOString().slice(0, 10)} · podiumMetrics by studio0x*\n\n---\n\n`;
    return new NextResponse(header + md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="podiummetrics-stories.md"',
      },
    });
  }

  return NextResponse.json({
    count: stories.length,
    stories: stories.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      category: s.category,
      headline: s.headline,
      body: s.body,
      teamsInvolved: s.teamsInvolved,
      fixture: s.fixture,
      generatedAt: s.generatedAt.toISOString(),
    })),
  });
}

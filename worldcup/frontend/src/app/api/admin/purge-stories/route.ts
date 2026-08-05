import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as authed } from "@/lib/adminAuth";
import { storyScope } from "@/lib/storyScope";
import { SPORT } from "@/lib/sportConfig";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Delete this deployment's news stories.
//
// PREVIEW-FIRST (owner directive 8/5: nothing is deleted without BK reviewing
// the exact list). A bare POST now COUNTS and returns what it would delete;
// deletion requires `?confirm=DELETE_STORIES` on top of admin auth.
//
// SCOPED. This used to be `deleteMany({})` — every NewsStory row in the
// database, with no tournament filter at all. The Neon DBs happen to be
// per-deployment today, so that was survivable; it is exactly the shape of
// mistake that stops being survivable the moment anything is consolidated, and
// it contradicted every read path (which all go through storyScope()).
//
// `?all=CONFIRM_ALL_TOURNAMENTS` restores the old unscoped behaviour for the
// case where a deployment genuinely needs to shed another tournament's legacy
// rows — but it has to be asked for by name.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const allTournaments = searchParams.get("all") === "CONFIRM_ALL_TOURNAMENTS";
  const confirmed = searchParams.get("confirm") === "DELETE_STORIES";
  const where = allTournaments ? {} : storyScope();

  const [matching, total] = await Promise.all([
    prisma.newsStory.count({ where }),
    prisma.newsStory.count(),
  ]);

  if (!confirmed) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldDelete: matching,
      totalInDatabase: total,
      wouldKeep: total - matching,
      scope: allTournaments ? "ALL tournaments" : `this deployment (${SPORT.id})`,
      hint: `Nothing deleted. Review the count, then re-run with confirm=DELETE_STORIES to proceed.`,
    });
  }

  const { count } = await prisma.newsStory.deleteMany({ where });
  return NextResponse.json({
    ok: true,
    dryRun: false,
    deleted: count,
    remaining: total - count,
    scope: allTournaments ? "ALL tournaments" : `this deployment (${SPORT.id})`,
  });
}

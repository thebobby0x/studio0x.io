import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { SPORT } from "@/lib/sportConfig";
import { runStoryRefresh } from "@/lib/storyRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Clear this deployment's news and regenerate it from scratch.
//
// /api/news/generate is idempotent — it SKIPS any fixture that already has a
// recap. That is the right behaviour for the 6am cron, but it means a fixed
// prompt never reaches stories that were already written with the broken one.
// The LC26 DB's two stories were World Cup copy ("sudden-death World Cup
// knockout showdown") and would have survived every future run untouched.
//
// So: delete first, then generate. Deletion is scoped to stories that are NOT
// tagged for another deployment, so this can never wipe a sibling tournament's
// archive from a shared database.
// ─────────────────────────────────────────────────────────────────────────────

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  // Default: clear everything not explicitly owned by another deployment
  // (ours + untagged legacy rows). `?scope=tagged` clears only our own rows.
  const scope = searchParams.get("scope") === "tagged" ? "tagged" : "all";

  const where =
    scope === "tagged"
      ? { tournamentId: SPORT.id }
      : { tournamentId: { in: [SPORT.id, ""] } };

  const cleared = await prisma.newsStory.deleteMany({ where });

  // Previews + fresh recaps for anything currently in window.
  const refresh = await runStoryRefresh();

  // Then the comprehensive backfill (every FT fixture + end-of-day round-ups).
  // Called in-process rather than over HTTP so it needs no base URL or secret.
  const self = new URL(req.url);
  let generate: unknown = null;
  try {
    // Carry the caller's own ?secret= through, so a script-driven call (which has
    // no session cookie) authenticates the sub-call the same way it did this one.
    const res = await fetch(`${self.origin}/api/news/generate${self.search}`, {
      method: "POST",
      headers: {
        // Forward this request's own credentials so the sub-call authenticates
        // the same way the caller did.
        ...(req.headers.get("authorization") ? { authorization: req.headers.get("authorization")! } : {}),
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
      },
    });
    generate = await res.json().catch(() => ({ status: res.status }));
  } catch (e) {
    generate = { error: e instanceof Error ? e.message : "generate call failed" };
  }

  return NextResponse.json({
    ok: true,
    tournament: SPORT.id,
    eventName: SPORT.eventName,
    scope,
    storiesCleared: cleared.count,
    previewsWritten: refresh.previewsWritten,
    recapsWritten: refresh.recapsWritten,
    refreshSkipped: refresh.skipped ?? null,
    generate,
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

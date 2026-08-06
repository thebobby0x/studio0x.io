import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { storyScope } from "@/lib/storyScope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Batch-generate narration for this deployment's stories, and PERSIST the URL.
//
// Story narration has always been generated on demand at play time and cached in
// Vercel Blob under a hash of the spoken text. `NewsStory.audioUrl` has existed
// the whole time and StoryCard already prefers it over calling TTS — but nothing
// ever wrote it. So every listen paid for a TTS round trip, and a Blob store
// that had filled up meant NOTHING could play, because the only copy of the
// audio lived in the very store that was refusing writes.
//
// Filling audioUrl makes narration durable: the row points at the blob, and the
// player skips the synthesis path entirely.
//
// ORDER MATTERS. If Blob is at quota this will fail on every story, because the
// generated audio still has to be written somewhere. Run "Free Up Blob Storage"
// FIRST — that purges the regenerable tts/ + deep-dives/ caches (on LC26 those
// are World Cup narration nobody will ever play again) — then run this.
//
// Chunked (offset/count) for the 60s function limit, same pattern as the anthem
// import and the weather backfill.
// ─────────────────────────────────────────────────────────────────────────────

interface Result {
  ok: boolean;
  candidates: number;
  processed: number;
  generated: number;
  alreadyHad: number;
  failed: number;
  nextOffset: number | null;
  /** First real failure, verbatim — this is what says WHY it stopped working. */
  blocker: string | null;
  errors: string[];
}

// Must match StoryCard's spoken text EXACTLY. The Blob cache key is a hash of
// the text, so any difference here would generate a SECOND copy of every story's
// audio rather than the one the player looks up — doubling storage on the store
// whose exhaustion is the whole problem.
function spokenText(headline: string, body: string): string {
  return `${headline}. ${body}`;
}

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const count = Math.min(Math.max(parseInt(searchParams.get("count") ?? "5", 10) || 5, 1), 15);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const force = searchParams.get("force") === "true";

  const result: Result = {
    ok: false, candidates: 0, processed: 0, generated: 0,
    alreadyHad: 0, failed: 0, nextOffset: null, blocker: null, errors: [],
  };

  const stories = await prisma.newsStory.findMany({
    where: {
      ...storyScope(),
      // `force` re-synthesises rows that already point at a blob — needed after
      // a purge, when the URL still exists on the row but the object behind it
      // is gone.
      ...(force ? {} : { OR: [{ audioUrl: null }, { audioUrl: "" }] }),
    },
    orderBy: { date: "desc" },
    select: { id: true, headline: true, body: true, audioUrl: true },
  });

  result.candidates = stories.length;
  const start = Math.min(offset, stories.length);
  const chunk = stories.slice(start, start + count);
  result.nextOffset = start + chunk.length < stories.length ? start + chunk.length : null;

  const origin = new URL(req.url).origin;

  for (const s of chunk) {
    result.processed++;
    if (!force && s.audioUrl) { result.alreadyHad++; continue; }
    try {
      // Goes through the real /api/ai/tts route rather than calling ElevenLabs
      // directly, so batch and on-demand share one cache key, one character cap
      // and one set of guards.
      const res = await fetch(`${origin}/api/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenText(s.headline, s.body) }),
      });
      const json = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!json.url) {
        result.failed++;
        const msg = `${s.id}: HTTP ${res.status} ${json.error ?? "no url"}`;
        if (!result.blocker) result.blocker = json.error ?? `HTTP ${res.status}`;
        if (result.errors.length < 5) result.errors.push(msg);
        continue;
      }
      await prisma.newsStory.update({ where: { id: s.id }, data: { audioUrl: json.url } });
      result.generated++;
    } catch (e) {
      result.failed++;
      const msg = `${s.id}: ${e instanceof Error ? e.message : String(e)}`;
      if (!result.blocker) result.blocker = msg;
      if (result.errors.length < 5) result.errors.push(msg);
    }
  }

  // Every story in the chunk failing is a systemic fault (quota, key, upstream),
  // not bad luck — stop the caller's loop instead of grinding through the rest
  // and burning ElevenLabs characters on writes that cannot land.
  if (result.processed > 0 && result.failed === result.processed) {
    result.nextOffset = null;
    if (result.blocker && /cache failed|quota/i.test(result.blocker)) {
      result.blocker =
        `${result.blocker} — Vercel Blob is at quota. Run "Free Up Blob Storage" first, then re-run this.`;
    }
  }

  result.ok = result.failed === 0;
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

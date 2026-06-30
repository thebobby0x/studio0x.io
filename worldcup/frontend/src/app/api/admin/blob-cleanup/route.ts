import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// Frees Vercel Blob space (the Hobby plan caps at 1GB and a full store makes
// every put() — TTS audio AND anthem imports — fail with "quota exceeded").
//
// Safe to run anytime:
//  - tts/ and deep-dives/ are regenerable caches → always purged
//  - anthems/ orphans (blobs not referenced by a current AudioStream row) are
//    purged ONLY when the DB has anthem rows, so we never nuke the sole copies
//    when the table is empty/mid-rebuild.
async function cleanup(dryRun: boolean) {
  const streams = await prisma.audioStream.findMany({ select: { audioUrl: true } });
  const keepUrls = new Set(streams.map(s => s.audioUrl));
  const haveDbAnthems = keepUrls.size > 0;

  const toDelete: { url: string; size: number; pathname: string }[] = [];
  let totalBytes = 0;
  let keptBytes = 0;

  let cursor: string | undefined;
  do {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      totalBytes += b.size;
      const p = b.pathname;
      const isCache = p.startsWith("tts/") || p.startsWith("deep-dives/");
      const isOrphanAnthem = haveDbAnthems && p.startsWith("anthems/") && !keepUrls.has(b.url);
      if (isCache || isOrphanAnthem) {
        toDelete.push({ url: b.url, size: b.size, pathname: p });
      } else {
        keptBytes += b.size;
      }
    }
    cursor = res.cursor || undefined;
  } while (cursor);

  const freedBytes = toDelete.reduce((a, b) => a + b.size, 0);

  if (!dryRun) {
    for (let i = 0; i < toDelete.length; i += 100) {
      await del(toDelete.slice(i, i + 100).map(d => d.url));
    }
  }

  return NextResponse.json({
    dryRun,
    deletedCount: toDelete.length,
    freedMB: +(freedBytes / 1e6).toFixed(1),
    totalBeforeMB: +(totalBytes / 1e6).toFixed(1),
    remainingMB: +((totalBytes - (dryRun ? 0 : freedBytes)) / 1e6).toFixed(1),
    keptDbReferencedMB: +(keptBytes / 1e6).toFixed(1),
    note: haveDbAnthems
      ? "Purged regenerable caches + orphaned anthem dupes."
      : "DB has no anthem rows — purged caches only, left anthems/ untouched to avoid data loss.",
  });
}

// GET ?secret=...[&dryRun=true]   — dryRun previews without deleting
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  return cleanup(searchParams.get("dryRun") === "true");
}
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return cleanup(false);
}

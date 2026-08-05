import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";
import { SPORT } from "@/lib/sportConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 60;


// Frees Vercel Blob space (the Hobby plan caps at 1GB and a full store makes
// every put() — TTS audio AND anthem imports — fail with "quota exceeded").
//
//  - tts/<deployment>/ and deep-dives/ are regenerable caches → purged
//  - anthems/ orphans (blobs not referenced by a current AudioStream row) are
//    purged ONLY when the DB has anthem rows, so we never nuke the sole copies
//    when the table is empty/mid-rebuild.
//
// ── SHARED-STORE SAFETY (8/5) ────────────────────────────────────────────────
// If two Vercel projects (worldcup-2026 and leaguescup) are configured with the
// SAME BLOB_READ_WRITE_TOKEN, they share one store, and this route running on
// one deployment would delete the other's cached narration. TTS keys are now
// namespaced `tts/<deployment>/…`, but everything written before that is FLAT
// and unattributable — it could belong to either site.
//
// So the default scope is THIS deployment plus blobs nothing else could own.
// Flat legacy `tts/…` keys are reported, not deleted, unless the caller passes
// `includeLegacy=CONFIRM_SHARED_OK`.
//
// Deleting them is recoverable either way — TTS blobs are a cache, and a story
// with no persisted audioUrl simply re-synthesises on next play — but it costs
// ElevenLabs characters on a site nobody is watching, and if a story row DOES
// carry a persisted audioUrl the purge leaves that URL pointing at nothing until
// the player falls back. That is the caller's call to make, not this route's.
const LEGACY_TTS = /^tts\/[^/]+\.mp3$/;           // tts/<hash>.mp3 — pre-namespace
const OURS_TTS = `tts/${SPORT.id}/`;

async function cleanup(dryRun: boolean, includeLegacy: boolean) {
  const streams = await prisma.audioStream.findMany({ select: { audioUrl: true } });
  const keepUrls = new Set(streams.map(s => s.audioUrl));
  const haveDbAnthems = keepUrls.size > 0;

  const toDelete: { url: string; size: number; pathname: string }[] = [];
  let totalBytes = 0;
  let keptBytes = 0;
  let legacyBytes = 0;
  let legacyCount = 0;

  let cursor: string | undefined;
  do {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      totalBytes += b.size;
      const p = b.pathname;
      const isOurTts = p.startsWith(OURS_TTS);
      const isLegacyTts = LEGACY_TTS.test(p);
      // deep-dives/ was never namespaced either; treat it as legacy-shared.
      const isDeepDive = p.startsWith("deep-dives/");
      const isOrphanAnthem = haveDbAnthems && p.startsWith("anthems/") && !keepUrls.has(b.url);

      if (isLegacyTts || isDeepDive) {
        legacyBytes += b.size;
        legacyCount++;
      }

      const deletable = isOurTts || isOrphanAnthem || (includeLegacy && (isLegacyTts || isDeepDive));
      if (deletable) {
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
    scope: includeLegacy ? "this deployment + shared legacy" : `this deployment (${SPORT.id}) only`,
    deletedCount: toDelete.length,
    freedMB: +(freedBytes / 1e6).toFixed(1),
    totalBeforeMB: +(totalBytes / 1e6).toFixed(1),
    remainingMB: +((totalBytes - (dryRun ? 0 : freedBytes)) / 1e6).toFixed(1),
    keptDbReferencedMB: +(keptBytes / 1e6).toFixed(1),
    // The number that decides whether this run can free anything at all.
    legacySharedCount: legacyCount,
    legacySharedMB: +(legacyBytes / 1e6).toFixed(1),
    legacyNote: includeLegacy
      ? "Legacy un-namespaced blobs INCLUDED — if this store is shared with another deployment, its cached narration was deleted too (regenerable on next play)."
      : legacyCount > 0
        ? `${legacyCount} un-namespaced blob(s) (${+(legacyBytes / 1e6).toFixed(1)}MB) were NOT touched — they predate deployment namespacing and may belong to another site sharing this store. Confirm the store is dedicated, then re-run with includeLegacy=CONFIRM_SHARED_OK to reclaim them.`
        : null,
    note: haveDbAnthems
      ? "Purged regenerable caches + orphaned anthem dupes."
      : "DB has no anthem rows — purged caches only, left anthems/ untouched to avoid data loss.",
  });
}

// Deletes EVERY blob under anthems/ unconditionally. This bypasses the empty-DB
// safety guard and is only correct when the canonical source (Google Drive) is
// intact — the reimport re-downloads all tracks from Drive afterward. Requires
// an explicit confirm token so it can't fire by accident.
async function purgeAnthemBlobs() {
  let freed = 0;
  let count = 0;
  const toDelete: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ cursor, prefix: "anthems/", limit: 1000 });
    for (const b of res.blobs) {
      toDelete.push(b.url);
      freed += b.size;
      count++;
    }
    cursor = res.cursor || undefined;
  } while (cursor);

  for (let i = 0; i < toDelete.length; i += 100) {
    await del(toDelete.slice(i, i + 100));
  }
  return NextResponse.json({
    purgedAnthemBlobs: count,
    freedMB: +(freed / 1e6).toFixed(1),
    note: "All anthems/ blobs deleted. Re-import from Drive to repopulate.",
  });
}

// GET  ?secret=...[&dryRun=true]                       — scoped cleanup (preview with dryRun)
// GET  ?secret=...&includeLegacy=CONFIRM_SHARED_OK     — also delete un-namespaced blobs
// GET  ?secret=...&purgeAnthems=CONFIRM_DRIVE_OK       — delete ALL anthems/ blobs (Drive is source)
export async function GET(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("purgeAnthems") === "CONFIRM_DRIVE_OK") {
    return purgeAnthemBlobs();
  }
  return cleanup(
    searchParams.get("dryRun") === "true",
    searchParams.get("includeLegacy") === "CONFIRM_SHARED_OK",
  );
}
export async function POST(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  return cleanup(
    searchParams.get("dryRun") === "true",
    searchParams.get("includeLegacy") === "CONFIRM_SHARED_OK",
  );
}

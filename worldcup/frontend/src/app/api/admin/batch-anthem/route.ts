import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { ANTHEM_MANIFEST, type AnthemSource } from "@/lib/anthemManifest";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — 24 Drive downloads run sequentially


// The full anthem set now lives in src/lib/anthemManifest.ts (single source of
// truth). preset=true imports every track; add clear=true to wipe first.
const PRESET = ANTHEM_MANIFEST;
type Item = AnthemSource;

type ImportResult = { title: string; ok: boolean; id?: string; url?: string; error?: string };

async function importOne(item: Item): Promise<ImportResult> {
  const { driveFileId, teamCode, title, durationSecs, artistCredit } = item;

  // Download from Google Drive (file must be publicly accessible)
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`;
  let audioRes: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    audioRes = await fetch(downloadUrl, { signal: ctrl.signal });
    clearTimeout(timer);
  } catch (e) {
    return { title, ok: false, error: `Fetch error: ${String(e)}` };
  }

  if (!audioRes.ok || !audioRes.body) {
    return { title, ok: false, error: `Drive returned ${audioRes.status} — is the file publicly accessible?` };
  }

  // Buffer + write to Blob. Wrapped so a Blob failure (e.g. missing
  // BLOB_READ_WRITE_TOKEN) returns a per-track error instead of throwing out of
  // the whole route with a 500.
  // STABLE filename so re-imports overwrite the same blob instead of piling up
  // new copies every run (which previously filled the 1GB Blob quota). With
  // allowOverwrite:true this caps anthem storage at one file per track.
  const slug = teamCode
    ? teamCode.toLowerCase()
    : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `anthems/${slug}.mp3`;
  let blobUrl: string;
  try {
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "audio/mpeg",
      allowOverwrite: true,
    });
    blobUrl = blob.url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { title, ok: false, error: `Blob write failed (check BLOB_READ_WRITE_TOKEN): ${msg}` };
  }

  // Upsert anthem record
  const credit = artistCredit ?? "Suno AI × studio0x";
  const secs = durationSecs ?? 180;

  try {
    if (!teamCode) {
      // FIFA universal track
      const existing = await prisma.audioStream.findFirst({ where: { teamId: null, title } });
      const rec = existing
        ? await prisma.audioStream.update({ where: { id: existing.id }, data: { audioUrl: blobUrl, durationSecs: secs, artistCredit: credit } })
        : await prisma.audioStream.create({ data: { teamId: null, title, audioUrl: blobUrl, durationSecs: secs, artistCredit: credit } });
      return { title, ok: true, id: rec.id, url: blobUrl };
    }

    const team = await prisma.team.findUnique({ where: { code: teamCode.toUpperCase() } });
    if (!team) return { title, ok: false, error: `Team ${teamCode} not in DB` };

    const rec = await prisma.audioStream.upsert({
      where: { teamId: team.id },
      update: { audioUrl: blobUrl, title, durationSecs: secs, artistCredit: credit },
      create: { teamId: team.id, title, audioUrl: blobUrl, durationSecs: secs, artistCredit: credit },
    });
    return { title, ok: true, id: rec.id, url: blobUrl };
  } catch (e) {
    return { title, ok: false, error: `DB write failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Process items with a bounded concurrency pool. Sequential downloads of all
// 24 tracks blow past the 60s Hobby function limit (504 GATEWAY_TIMEOUT); running
// a handful in parallel keeps total wall-clock well under the cap. Order of the
// results array is preserved so the response is readable.
const CONCURRENCY = 6;

async function runImport(items: Item[], clear: boolean) {
  const results: ImportResult[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await importOne(items[i]);
      } catch (e) {
        // importOne shouldn't throw, but never let one item abort the pool.
        results[i] = { title: items[i].title, ok: false, error: String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  const keptIds = results.filter(r => r.ok && r.id).map(r => r.id!) as string[];

  // IMPORTANT: prune AFTER a successful import, and ONLY when at least one track
  // imported. Never wipe-then-fail (which previously left the hub empty if the
  // very first Blob write threw). If everything failed, leave existing data intact.
  let pruned = 0;
  if (clear && keptIds.length > 0) {
    const del = await prisma.audioStream.deleteMany({ where: { id: { notIn: keptIds } } });
    pruned = del.count;
  }

  const imported = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const status = imported === 0 ? 502 : 200;
  return NextResponse.json(
    {
      imported,
      failed,
      pruned,
      clearedStaleOnly: clear,
      ...(imported === 0 ? { error: "All tracks failed — nothing imported, existing anthems left untouched. See results[].error (likely BLOB_READ_WRITE_TOKEN missing)." } : {}),
      results,
    },
    { status }
  );
}

// Import only a slice of the manifest (no prune). Used by the chunked admin
// button so no single HTTP request risks the 60s Hobby timeout.
async function runImportSlice(offset: number, count: number) {
  const slice = PRESET.slice(offset, offset + count);
  const results: ImportResult[] = new Array(slice.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= slice.length) return;
      try {
        results[i] = await importOne(slice[i]);
      } catch (e) {
        results[i] = { title: slice[i].title, ok: false, error: String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) }, worker));

  const imported = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const nextOffset = offset + slice.length;
  return NextResponse.json({
    offset,
    count: slice.length,
    imported,
    failed,
    total: PRESET.length,
    done: nextOffset >= PRESET.length,
    nextOffset: nextOffset >= PRESET.length ? null : nextOffset,
    results,
  });
}

// Prune any AudioStream rows that aren't part of the current manifest (leftover
// placeholders, duplicates, unlinked originals). Fast — no downloads. Run this
// once after all chunks have imported.
async function finalizePrune() {
  const teamCodes = ANTHEM_MANIFEST.filter(a => a.teamCode).map(a => a.teamCode!.toUpperCase());
  const fifaTitles = ANTHEM_MANIFEST.filter(a => !a.teamCode).map(a => a.title);

  const teams = await prisma.team.findMany({ where: { code: { in: teamCodes } }, select: { id: true } });
  const keptTeam = await prisma.audioStream.findMany({ where: { teamId: { in: teams.map(t => t.id) } }, select: { id: true } });
  const keptFifa = await prisma.audioStream.findMany({ where: { teamId: null, title: { in: fifaTitles } }, select: { id: true } });
  const keptIds = [...keptTeam, ...keptFifa].map(r => r.id);

  if (keptIds.length === 0) {
    return NextResponse.json({ pruned: 0, kept: 0, note: "Nothing matched the manifest — skipped prune to avoid wiping everything." });
  }
  const del = await prisma.audioStream.deleteMany({ where: { id: { notIn: keptIds } } });
  return NextResponse.json({ pruned: del.count, kept: keptIds.length });
}

// GET ?secret=...&preset=true[&clear=true]            → import whole manifest (one shot)
// GET ?secret=...&preset=true&offset=N&count=M        → import a slice only (chunked button)
// GET ?secret=...&finalize=true                       → prune stale rows after chunks
export async function GET(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);

  if (searchParams.get("finalize") === "true") {
    return finalizePrune();
  }

  if (searchParams.get("preset") !== "true") {
    return NextResponse.json({ hint: `Add &preset=true to import all ${PRESET.length} WC2026 anthems. Use the /admin button for chunked import, or &offset=N&count=M for a slice, then &finalize=true to prune.`, count: PRESET.length, tracks: PRESET.map(p => p.title) });
  }

  const offsetParam = searchParams.get("offset");
  if (offsetParam !== null) {
    const offset = Math.max(0, parseInt(offsetParam, 10) || 0);
    const count = Math.max(1, parseInt(searchParams.get("count") ?? "6", 10) || 6);
    return runImportSlice(offset, count);
  }

  // One-shot (may timeout on Hobby for the full 24 — the button uses chunks instead)
  return runImport(PRESET, searchParams.get("clear") === "true");
}

// POST ?secret=... body: Item[]  — custom list import
export async function POST(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = (await req.json()) as Item[];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Body must be a non-empty array of items" }, { status: 400 });
  }
  return runImport(items, false);
}

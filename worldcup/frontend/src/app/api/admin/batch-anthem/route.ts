import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { ANTHEM_MANIFEST, type AnthemSource } from "@/lib/anthemManifest";
import { SPORT } from "@/lib/sportConfig";
import { discoverClubAnthems } from "@/lib/clubAnthemDrive";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — 24 Drive downloads run sequentially


// SOURCE OF TRUTH, per deployment.
//
// WC26: src/lib/anthemManifest.ts — 54 national anthems, one hardcoded Drive FILE
// id each. Unchanged.
//
// Club deployments (LC26): the tracks live in a Drive FOLDER TREE that BK adds to
// as Suno songs are produced, so there is no static list to read. `PRESET` was
// `ANTHEM_MANIFEST` unconditionally, which meant "Wipe + Reimport ALL Anthems" on
// the Leagues Cup site would have imported 54 WORLD CUP NATIONAL ANTHEMS and then
// pruned everything else down to that manifest. Club deployments now discover
// their tracks from Drive at request time instead (see resolveItems below).
const IS_CLUB_ANTHEMS = SPORT.features.anthems === "club";
const PRESET: AnthemSource[] = IS_CLUB_ANTHEMS ? [] : ANTHEM_MANIFEST;
type Item = AnthemSource;

/** Discovery outcome carried alongside the items, so the response can report
 *  which folders were walked and which files could not be matched to a club. */
interface ResolvedItems {
  ok: boolean;
  items: Item[];
  error?: string;
  discovery?: {
    rootFolderId: string;
    foldersVisited: { id: string; name: string; fileCount: number }[];
    matched: number;
    generic: number;
    unmatched: { fileName: string; clubName: string }[];
  };
}

/**
 * The track list for THIS deployment.
 *
 * Nation deployments return the static manifest. Club deployments walk the Drive
 * tree, parse `{Club} — _{Title}_ v{n}.mp3`, and map each file to a real club.
 *
 * Fails CLOSED: if discovery errors (missing GOOGLE_DRIVE_API_KEY, folder not
 * shared publicly, Drive 403…) this returns ok:false with zero items and every
 * caller refuses to prune. An empty listing must NEVER be read as "there are no
 * anthems" — pruning against it would empty the hub.
 */
async function resolveItems(): Promise<ResolvedItems> {
  if (!IS_CLUB_ANTHEMS) return { ok: true, items: PRESET };

  const found = await discoverClubAnthems();
  if (!found.ok) return { ok: false, items: [], error: found.error };

  const unmatched = found.matches
    .filter((m) => m.segment !== "GENERIC" && !m.teamId)
    .map((m) => ({ fileName: m.fileName, clubName: m.clubName }));

  // A club track whose club could not be resolved is NOT imported — attaching a
  // song to a guessed team is exactly the fabrication the CONTENT TRUTH rule
  // bans. Generic (tournament-wide) tracks import with no team, like WC26's
  // FIFA tracks. Unmatched files come back in the response so BK can rename them.
  const items: Item[] = found.matches
    .filter((m) => m.teamId || m.segment === "GENERIC")
    .map((m) => ({
      driveFileId: m.driveFileId,
      teamCode: m.teamCode ?? undefined,
      title: m.title,
      artistCredit: "Suno AI × studio0x",
    }));

  return {
    ok: true,
    items,
    discovery: {
      rootFolderId: found.rootFolderId,
      foldersVisited: found.foldersVisited,
      matched: found.matches.filter((m) => m.teamId).length,
      generic: found.matches.filter((m) => m.segment === "GENERIC").length,
      unmatched,
    },
  };
}

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

// Import only a slice of the track list (no prune). Used by the chunked admin
// button so no single HTTP request risks the 60s Hobby timeout.
async function runImportSlice(all: Item[], offset: number, count: number) {
  const slice = all.slice(offset, offset + count);
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
    total: all.length,
    done: nextOffset >= all.length,
    nextOffset: nextOffset >= all.length ? null : nextOffset,
    results,
  });
}

// Prune any AudioStream rows that aren't part of the current track list (leftover
// placeholders, duplicates, unlinked originals). Fast — no downloads. Run this
// once after all chunks have imported.
//
// On club deployments the "current track list" is whatever Drive discovery just
// returned. If discovery FAILED we must not prune at all: an errored walk yields
// zero tracks, and pruning against zero deletes every anthem in the hub.
async function finalizePrune() {
  const resolved = await resolveItems();
  if (!resolved.ok) {
    return NextResponse.json(
      {
        pruned: 0,
        error: resolved.error,
        note: "Drive discovery failed — refusing to prune. Existing anthems left untouched.",
      },
      { status: 502 },
    );
  }

  const source = resolved.items;
  const teamCodes = source.filter(a => a.teamCode).map(a => a.teamCode!.toUpperCase());
  const genericTitles = source.filter(a => !a.teamCode).map(a => a.title);

  const teams = await prisma.team.findMany({ where: { code: { in: teamCodes } }, select: { id: true } });
  const keptTeam = await prisma.audioStream.findMany({ where: { teamId: { in: teams.map(t => t.id) } }, select: { id: true } });
  const keptGeneric = await prisma.audioStream.findMany({ where: { teamId: null, title: { in: genericTitles } }, select: { id: true } });
  const keptIds = [...keptTeam, ...keptGeneric].map(r => r.id);

  if (keptIds.length === 0) {
    return NextResponse.json({ pruned: 0, kept: 0, note: "Nothing matched the current track list — skipped prune to avoid wiping everything." });
  }
  const del = await prisma.audioStream.deleteMany({ where: { id: { notIn: keptIds } } });
  return NextResponse.json({ pruned: del.count, kept: keptIds.length, discovery: resolved.discovery });
}

// GET ?secret=...&preset=true[&clear=true]            → import the whole list (one shot)
// GET ?secret=...&preset=true&offset=N&count=M        → import a slice only (chunked button)
// GET ?secret=...&finalize=true                       → prune stale rows after chunks
// GET ?secret=...&discover=true                       → DRY RUN: list what Drive has, import nothing
export async function GET(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);

  if (searchParams.get("finalize") === "true") {
    return finalizePrune();
  }

  // Dry run — walk the folders and report what WOULD import. Safe to click any
  // time; writes nothing. This is the first thing to check when a club track
  // doesn't appear in the hub.
  if (searchParams.get("discover") === "true") {
    const resolved = await resolveItems();
    return NextResponse.json(
      {
        ok: resolved.ok,
        deployment: SPORT.id,
        source: IS_CLUB_ANTHEMS ? "google-drive-folders" : "static-manifest",
        trackCount: resolved.items.length,
        tracks: resolved.items.map(i => ({ title: i.title, teamCode: i.teamCode ?? null })),
        ...(resolved.error ? { error: resolved.error } : {}),
        ...(resolved.discovery ? { discovery: resolved.discovery } : {}),
      },
      { status: resolved.ok ? 200 : 502 },
    );
  }

  const resolved = await resolveItems();
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, imported: 0, note: "Discovery failed — nothing imported and nothing pruned." },
      { status: 502 },
    );
  }
  const source = resolved.items;

  if (searchParams.get("preset") !== "true") {
    return NextResponse.json({
      hint: `Add &preset=true to import all ${source.length} ${SPORT.eventName} tracks. Use the /admin button for chunked import, &offset=N&count=M for a slice, then &finalize=true to prune. &discover=true is a safe dry run.`,
      count: source.length,
      tracks: source.map(p => p.title),
      ...(resolved.discovery ? { discovery: resolved.discovery } : {}),
    });
  }

  if (source.length === 0) {
    return NextResponse.json(
      {
        imported: 0,
        error: IS_CLUB_ANTHEMS
          ? "Drive discovery returned no importable tracks. Nothing was imported or pruned. Check &discover=true for the folder walk and any unmatched filenames."
          : "Track list is empty.",
        ...(resolved.discovery ? { discovery: resolved.discovery } : {}),
      },
      { status: 502 },
    );
  }

  const offsetParam = searchParams.get("offset");
  if (offsetParam !== null) {
    const offset = Math.max(0, parseInt(offsetParam, 10) || 0);
    const count = Math.max(1, parseInt(searchParams.get("count") ?? "6", 10) || 6);
    return runImportSlice(source, offset, count);
  }

  // One-shot (may timeout on Hobby for a long list — the button uses chunks instead)
  return runImport(source, searchParams.get("clear") === "true");
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

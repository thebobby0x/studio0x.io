import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { ANTHEM_MANIFEST, type AnthemSource } from "@/lib/anthemManifest";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap — 24 Drive downloads run sequentially

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// The full anthem set now lives in src/lib/anthemManifest.ts (single source of
// truth). preset=true imports every track; add clear=true to wipe first.
const PRESET = ANTHEM_MANIFEST;
type Item = AnthemSource;

async function importOne(item: Item): Promise<{ title: string; ok: boolean; url?: string; error?: string }> {
  const { driveFileId, teamCode, title, durationSecs, artistCredit } = item;

  // Download from Google Drive (file must be publicly accessible)
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`;
  let audioRes: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    audioRes = await fetch(downloadUrl, { signal: ctrl.signal });
    clearTimeout(timer);
  } catch (e) {
    return { title, ok: false, error: `Fetch error: ${String(e)}` };
  }

  if (!audioRes.ok || !audioRes.body) {
    return { title, ok: false, error: `Drive returned ${audioRes.status} — is the file publicly accessible?` };
  }

  const safe = title.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `anthems/${Date.now()}-${safe}.mp3`;
  const blob = await put(filename, audioRes.body, {
    access: "public",
    contentType: "audio/mpeg",
    allowOverwrite: true,
  });

  // Upsert anthem record
  const credit = artistCredit ?? "Suno AI × Studio0x";
  const secs = durationSecs ?? 180;

  if (!teamCode) {
    // FIFA universal track
    const existing = await prisma.audioStream.findFirst({ where: { teamId: null, title } });
    if (existing) {
      await prisma.audioStream.update({ where: { id: existing.id }, data: { audioUrl: blob.url, durationSecs: secs, artistCredit: credit } });
    } else {
      await prisma.audioStream.create({ data: { teamId: null, title, audioUrl: blob.url, durationSecs: secs, artistCredit: credit } });
    }
  } else {
    const team = await prisma.team.findUnique({ where: { code: teamCode.toUpperCase() } });
    if (!team) return { title, ok: false, error: `Team ${teamCode} not in DB` };

    await prisma.audioStream.upsert({
      where: { teamId: team.id },
      update: { audioUrl: blob.url, title, durationSecs: secs, artistCredit: credit },
      create: { teamId: team.id, title, audioUrl: blob.url, durationSecs: secs, artistCredit: credit },
    });
  }

  return { title, ok: true, url: blob.url };
}

// GET ?secret=...&preset=true[&clear=true]  — import the hardcoded 12-file WC2026 list
// Add &clear=true to wipe all existing audio streams first (removes placeholder/demo songs)
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("preset") !== "true") {
    return NextResponse.json({ hint: `Add &preset=true to import all ${PRESET.length} WC2026 anthems. Add &clear=true to wipe ALL existing anthems first (full reset).`, count: PRESET.length, tracks: PRESET.map(p => p.title) });
  }

  if (searchParams.get("clear") === "true") {
    await prisma.audioStream.deleteMany({});
  }

  const results = [];
  for (const item of PRESET) {
    const result = await importOne(item);
    results.push(result);
  }
  return NextResponse.json({ results, imported: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
}

// POST ?secret=... body: Item[]  — custom list import
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = (await req.json()) as Item[];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Body must be a non-empty array of items" }, { status: 400 });
  }

  const results = [];
  for (const item of items) {
    const result = await importOne(item);
    results.push(result);
  }
  return NextResponse.json({ results, imported: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
}

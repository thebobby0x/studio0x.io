import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// All 12 Drive files from the WC2026 · Anthems folder
const PRESET: Item[] = [
  { driveFileId: "1_s8nMbjqvKa1SaWegM21WsjE6Q1MqC4M", teamCode: "ARG", title: "Bombo Murguero", durationSecs: 193 },
  { driveFileId: "1EPfXfQ3oy-7fqmO8V0OhLOWDsRuOaG8Q", teamCode: "BIH", title: "Zmajevi Na Pistu Bosna i Hercegovina", durationSecs: 328 },
  { driveFileId: "1A8W74-H11Os4tn26T_q6w4WqIWkmVVfG", teamCode: "CAN", title: "Rouges dans Brume", durationSecs: 284 },
  { driveFileId: "1nUal-cDanLtEA_6qZr5QtNHNtVqJqUeP", teamCode: "ENG", title: "England All Da Way", durationSecs: 170 },
  { driveFileId: "14Q8er7YpnkhuMHQlZEcK6xi9IGsxXqEb", teamCode: "FRA", title: "Bleus dans Brume", durationSecs: 277 },
  { driveFileId: "1nFD_kvcY62PWVlPXDBOVINcRBDtBs8PI", teamCode: "MEX", title: "Bandera Subiendo (En Vivo de Miami)", durationSecs: 315 },
  { driveFileId: "16D7EMWYmOOGGaA_QfLq7yDPy5SErn55d", teamCode: "RSA", title: "Wêreldspel Anthem (Afrikaanse Terrace Remix)", durationSecs: 485 },
  { driveFileId: "1hkwBRvV417qDOiZQvkeGEvJs4Rk_XJWk", teamCode: "USA", title: "Back When It Hit Like That", durationSecs: 276 },
  // FIFA universal playlist
  { driveFileId: "1ghtOnRMhDf4mWLjYDeJNx5SMKSpXb28l", title: "We Already Won", durationSecs: 293 },
  { driveFileId: "1LYcYGLwU-H3P3CNrcfEKdGkhgkPRAKdh", title: "One Champion Above All Champions", durationSecs: 250 },
  { driveFileId: "1qCkEY0HwxKah8awyJrX6jIRkjKX92iN9", title: "There Can Only Be One Number One", durationSecs: 151 },
  { driveFileId: "1pCgCapwESphxhdhgo99_zT7G4UHsWWX5", title: "World Cup Kings - We Ballin", durationSecs: 293 },
];

interface Item {
  driveFileId: string;
  teamCode?: string;
  title: string;
  durationSecs?: number;
  artistCredit?: string;
}

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

// GET ?secret=...&preset=true  — import the hardcoded 12-file WC2026 list
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("preset") !== "true") {
    return NextResponse.json({ hint: "Add &preset=true to import all 12 WC2026 anthems", count: PRESET.length, tracks: PRESET.map(p => p.title) });
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

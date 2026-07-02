import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { ANTHEM_MANIFEST } from "@/lib/anthemManifest";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";


// Derived from the shared manifest — the 12 "newer" team anthems (BEL…UZB).
// Kept for backwards compatibility; prefer /api/admin/batch-anthem?preset=true
// which imports the entire manifest in one call.
const NEWER_CODES = ["BEL", "BRA", "CRC", "ECU", "EGY", "JPN", "MAR", "NED", "PAN", "QAT", "URU", "UZB"];
const BATCH = ANTHEM_MANIFEST
  .filter((a) => a.teamCode && NEWER_CODES.includes(a.teamCode))
  .map((a) => ({ code: a.teamCode!, driveId: a.driveFileId, title: a.title }));

async function runImport(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: { code: string; title: string; status: "ok" | "error"; detail?: string; url?: string }[] = [];

  for (const entry of BATCH) {
    try {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${entry.driveId}&export=download&confirm=t`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45_000);
      let audioRes: Response;
      try {
        audioRes = await fetch(downloadUrl, { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!audioRes.ok || !audioRes.body) {
        results.push({ code: entry.code, title: entry.title, status: "error", detail: `Drive download failed (${audioRes.status})` });
        continue;
      }

      const filename = `anthems/${entry.code.toLowerCase()}-${Date.now()}.mp3`;
      const blob = await put(filename, audioRes.body, {
        access: "public",
        contentType: "audio/mpeg",
      });

      const team = await prisma.team.findUnique({ where: { code: entry.code } });
      if (!team) {
        results.push({ code: entry.code, title: entry.title, status: "error", detail: `Team code '${entry.code}' not found in DB` });
        continue;
      }

      await prisma.audioStream.upsert({
        where: { teamId: team.id },
        update: { audioUrl: blob.url, title: entry.title },
        create: {
          teamId: team.id,
          audioUrl: blob.url,
          title: entry.title,
          artistCredit: "Suno AI × Studio0x",
          durationSecs: 180,
        },
      });

      results.push({ code: entry.code, title: entry.title, status: "ok", url: blob.url });
    } catch (err) {
      results.push({ code: entry.code, title: entry.title, status: "error", detail: String(err) });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ summary: `${ok} imported, ${failed} failed`, results });
}

// GET so this can be triggered directly from a browser address bar
export async function GET(req: Request) { return runImport(req); }
export async function POST(req: Request) { return runImport(req); }

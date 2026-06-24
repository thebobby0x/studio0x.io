import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

const BATCH = [
  { code: "BEL", driveId: "1HSByvlXit1cS9RpA5D9p0SEvNUV7Iaj0", title: "Rode Duivels 2026" },
  { code: "BRA", driveId: "1tYgNe7cZMF_z40Z2B2VeuwDYcqT-TPaS", title: "Hexa 2026" },
  { code: "CRC", driveId: "1EBtzMp8jHmgWI0a9ooLe9FhABrCEgXY4", title: "Pura Vida, mae" },
  { code: "ECU", driveId: "1zYek9gP5RXM7_JweQuyJoFlUoPzGz-Lu", title: "La Tri en el Mundo" },
  { code: "EGY", driveId: "1dSk0XiECpehe6m_MY3ejNjB03b707_z4", title: "Pharaohs 2026" },
  { code: "JPN", driveId: "1TcKMBD8zhxzNhHtDxKSd6zl7QCIyDUHR", title: "Blue Wave 2026" },
  { code: "MAR", driveId: "1j9E2SvbRffwKC7CGc81pF6HNqJnG_0Qo", title: "Lions of Atlas 2026" },
  { code: "NED", driveId: "1ZXwlQQiVOX6Yen6_p4N2YdIwrLcIKaH8", title: "Oranje Machine 2026" },
  { code: "PAN", driveId: "1dNpHyaa-J50RoJQO8rwCduScKM-5P8wL", title: "La Marea Roja" },
  { code: "QAT", driveId: "1MbRpxV5rcrYcHVvwFXx1KYcvLbbfjMd7", title: "Al-Annabi Anthem 2026" },
  { code: "URU", driveId: "1MPjjmgLHChgfdOYTbOqi5MXfNi-v2XTi", title: "Celeste en la Calle" },
  { code: "UZB", driveId: "15432Eu6Q1AoP6WBGc1jylTX2MJr265qr", title: "Olgʼa, Oʻzbekiston!" },
];

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

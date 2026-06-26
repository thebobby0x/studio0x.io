import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// Canonical song titles keyed by team code.
// Add new entries here when new anthems are uploaded.
const CODE_TO_TITLE: Record<string, string> = {
  ARG: "Bombo Murguero",
  BIH: "Zmajevi Na Pistu Bosna i Hercegovina",
  CAN: "Rouges dans Brume",
  ENG: "England All Da Way",
  FRA: "Bleus dans Brume",
  MEX: "Bandera Subiendo (En Vivo de Miami)",
  RSA: "Wêreldspel Anthem (Afrikaanse Terrace Remix)",
  USA: "Back When It Hit Like That",
  BEL: "Rode Duivels 2026",
  BRA: "Hexa 2026",
  CRC: "Pura Vida, mae",
  ECU: "La Tri en el Mundo",
  EGY: "Pharaohs 2026",
  JPN: "Blue Wave 2026",
  MAR: "Lions of Atlas 2026",
  NED: "Oranje Machine 2026",
  PAN: "La Marea Roja",
  QAT: "Al-Annabi Anthem 2026",
  URU: "Celeste en la Calle",
  UZB: "Olgʼa, Oʻzbekiston!",
};

// Extract a known team code from a Vercel Blob URL by matching against all
// team codes in the DB. Handles both upload patterns:
//   anthems/1234567890-ARG.mp3   (admin UI file upload)
//   anthems/arg-1234567890.mp3   (batch import)
function extractCodeFromUrl(url: string, knownCodes: Set<string>): string | null {
  // Grab just the filename portion of the URL (after the last /)
  const filename = url.split("/").pop() ?? "";
  const upper = filename.toUpperCase();

  // Try each known code — look for it surrounded by non-alpha chars or at boundaries
  for (const code of knownCodes) {
    const re = new RegExp(`(?:^|[^A-Z])${code}(?:[^A-Z]|$)`);
    if (re.test(upper)) return code;
  }
  return null;
}

// GET /api/admin/anthem-relink?secret=...
// Links AudioStream records to teams by extracting country codes from Blob URLs.
// Also restores canonical song titles for all known codes.
// Idempotent — safe to run multiple times.
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [allStreams, allTeams] = await Promise.all([
    prisma.audioStream.findMany({ include: { team: true } }),
    prisma.team.findMany(),
  ]);

  const teamByCode = new Map(allTeams.map((t) => [t.code, t]));
  const knownCodes = new Set(allTeams.map((t) => t.code));

  const results: {
    id: string;
    url: string;
    detectedCode: string | null;
    action: "linked" | "title_updated" | "already_correct" | "no_match";
    detail?: string;
  }[] = [];

  for (const stream of allStreams) {
    // Skip FIFA-only tracks that have no URL match (they intentionally have teamId=null)
    const detectedCode = extractCodeFromUrl(stream.audioUrl, knownCodes);

    if (!detectedCode) {
      // No recognisable country code in the URL — leave as-is (FIFA track)
      results.push({ id: stream.id, url: stream.audioUrl, detectedCode: null, action: "no_match" });
      continue;
    }

    const team = teamByCode.get(detectedCode);
    if (!team) {
      results.push({ id: stream.id, url: stream.audioUrl, detectedCode, action: "no_match", detail: "team not found in DB" });
      continue;
    }

    const canonicalTitle = CODE_TO_TITLE[detectedCode];
    const needsLink = stream.teamId !== team.id;
    const needsTitle = !!canonicalTitle && stream.title !== canonicalTitle;

    if (!needsLink && !needsTitle) {
      results.push({ id: stream.id, url: stream.audioUrl, detectedCode, action: "already_correct" });
      continue;
    }

    // If we're about to set teamId, check if another stream already owns that slot
    if (needsLink) {
      const conflict = await prisma.audioStream.findFirst({
        where: { teamId: team.id, id: { not: stream.id } },
      });
      if (conflict) {
        // Unlink the conflicting stream first
        await prisma.audioStream.update({ where: { id: conflict.id }, data: { teamId: null } });
      }
    }

    await prisma.audioStream.update({
      where: { id: stream.id },
      data: {
        ...(needsLink ? { teamId: team.id } : {}),
        ...(needsTitle && canonicalTitle ? { title: canonicalTitle } : {}),
      },
    });

    results.push({
      id: stream.id,
      url: stream.audioUrl,
      detectedCode,
      action: needsLink ? "linked" : "title_updated",
      detail: needsLink ? `→ ${team.name}` : `title → "${canonicalTitle}"`,
    });
  }

  const linked = results.filter((r) => r.action === "linked").length;
  const titleFixed = results.filter((r) => r.action === "title_updated").length;
  const noMatch = results.filter((r) => r.action === "no_match").length;

  return NextResponse.json({
    summary: `${linked} linked, ${titleFixed} titles fixed, ${noMatch} unmatched (FIFA or unknown)`,
    results,
  });
}

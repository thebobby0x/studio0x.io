import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// Maps known anthem titles to their team codes.
// These 8 tracks were imported with teamId: null (FIFA) due to a seeding bug.
const TITLE_TO_TEAM: Record<string, string> = {
  "Bombo Murguero": "ARG",
  "Zmajevi Na Pistu Bosna i Hercegovina": "BIH",
  "Rouges dans Brume": "CAN",
  "England All Da Way": "ENG",
  "Bleus dans Brume": "FRA",
  "Bandera Subiendo (En Vivo de Miami)": "MEX",
  "Wêreldspel Anthem (Afrikaanse Terrace Remix)": "RSA",
  "Back When It Hit Like That": "USA",
};

// GET /api/admin/anthem-relink?secret=...
// Re-links known team anthems that were stored with teamId: null.
// Safe to run multiple times — idempotent.
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: { title: string; teamCode: string; status: "linked" | "already_linked" | "stream_not_found" | "team_not_found" }[] = [];

  for (const [title, teamCode] of Object.entries(TITLE_TO_TEAM)) {
    const team = await prisma.team.findUnique({ where: { code: teamCode } });
    if (!team) {
      results.push({ title, teamCode, status: "team_not_found" });
      continue;
    }

    const stream = await prisma.audioStream.findFirst({ where: { title } });
    if (!stream) {
      results.push({ title, teamCode, status: "stream_not_found" });
      continue;
    }

    if (stream.teamId === team.id) {
      results.push({ title, teamCode, status: "already_linked" });
      continue;
    }

    // If another stream is already linked to this team, unlink it first so the
    // unique constraint on teamId doesn't block the update.
    const existing = await prisma.audioStream.findFirst({ where: { teamId: team.id } });
    if (existing && existing.id !== stream.id) {
      await prisma.audioStream.update({ where: { id: existing.id }, data: { teamId: null } });
    }

    await prisma.audioStream.update({ where: { id: stream.id }, data: { teamId: team.id } });
    results.push({ title, teamCode, status: "linked" });
  }

  const linked = results.filter((r) => r.status === "linked").length;
  const alreadyLinked = results.filter((r) => r.status === "already_linked").length;
  const failed = results.filter((r) => r.status === "stream_not_found" || r.status === "team_not_found").length;

  return NextResponse.json({
    summary: `${linked} re-linked, ${alreadyLinked} already correct, ${failed} not found`,
    results,
  });
}

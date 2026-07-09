import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";


// GET /api/admin/anthem?secret=... — list all teams + current anthem
export async function GET(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teams = await prisma.team.findMany({
    include: { anthem: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(teams);
}

// PUT /api/admin/anthem?secret=... — add or update anthem for a team
export async function PUT(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    teamCode: string;
    audioUrl: string;
    title?: string;
    artistCredit?: string;
    durationSecs?: number;
    tiktokDeepLink?: string;
    coverArt?: string;
  };

  const { teamCode, audioUrl, title, artistCredit, durationSecs, tiktokDeepLink, coverArt } = body;
  if (!audioUrl || !title) {
    return NextResponse.json({ error: "audioUrl and title are required" }, { status: 400 });
  }

  const updateData = {
    audioUrl,
    ...(artistCredit && { artistCredit }),
    ...(durationSecs && { durationSecs }),
    ...(tiktokDeepLink !== undefined && { tiktokDeepLink }),
    ...(coverArt !== undefined && { coverArt }),
    title,
  };

  // FIFA / universal track — no team association
  if (!teamCode) {
    const existing = await prisma.audioStream.findFirst({ where: { teamId: null, title } });
    const stream = existing
      ? await prisma.audioStream.update({ where: { id: existing.id }, data: updateData, include: { team: true } })
      : await prisma.audioStream.create({
          data: { teamId: null, audioUrl, title, artistCredit: artistCredit ?? "Suno AI × studio0x", durationSecs: durationSecs ?? 180, tiktokDeepLink: tiktokDeepLink ?? null, coverArt: coverArt ?? null },
          include: { team: true },
        });
    return NextResponse.json(stream);
  }

  const team = await prisma.team.findUnique({ where: { code: teamCode.toUpperCase() } });
  if (!team) return NextResponse.json({ error: `Team '${teamCode}' not found` }, { status: 404 });

  const stream = await prisma.audioStream.upsert({
    where: { teamId: team.id },
    update: updateData,
    create: {
      teamId: team.id,
      audioUrl,
      title: title ?? `${team.name} World Cup Anthem 2026`,
      artistCredit: artistCredit ?? "Suno AI × studio0x",
      durationSecs: durationSecs ?? 180,
      tiktokDeepLink: tiktokDeepLink ?? null,
      coverArt: coverArt ?? null,
    },
    include: { team: true },
  });

  return NextResponse.json(stream);
}

// DELETE /api/admin/anthem?secret=&action=purge-placeholders
// Removes all AudioStream records backed by soundhelix.com placeholder URLs so those
// teams revert to "coming soon" in the Anthem Hub. Real Vercel Blob URLs are untouched.
export async function DELETE(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("action") !== "purge-placeholders") {
    return NextResponse.json({ hint: "Add ?action=purge-placeholders to delete soundhelix placeholder records." });
  }
  const deleted = await prisma.audioStream.deleteMany({
    where: { audioUrl: { contains: "soundhelix.com" } },
  });
  return NextResponse.json({ deleted: deleted.count, message: `Removed ${deleted.count} placeholder record(s). Those teams now show as coming soon.` });
}

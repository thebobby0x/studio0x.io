import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkAuth(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  return secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
}

// GET /api/admin/anthem?secret=... — list all teams + current anthem
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teams = await prisma.team.findMany({
    include: { anthem: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(teams);
}

// PUT /api/admin/anthem?secret=... — add or update anthem for a team
export async function PUT(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!teamCode || !audioUrl) {
    return NextResponse.json({ error: "teamCode and audioUrl are required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { code: teamCode.toUpperCase() } });
  if (!team) return NextResponse.json({ error: `Team '${teamCode}' not found` }, { status: 404 });

  const stream = await prisma.audioStream.upsert({
    where: { teamId: team.id },
    update: {
      audioUrl,
      ...(title && { title }),
      ...(artistCredit && { artistCredit }),
      ...(durationSecs && { durationSecs }),
      ...(tiktokDeepLink !== undefined && { tiktokDeepLink }),
      ...(coverArt !== undefined && { coverArt }),
    },
    create: {
      teamId: team.id,
      audioUrl,
      title: title ?? `${team.name} World Cup Anthem 2026`,
      artistCredit: artistCredit ?? "Suno AI × Studio0x",
      durationSecs: durationSecs ?? 180,
      tiktokDeepLink: tiktokDeepLink ?? null,
      coverArt: coverArt ?? null,
    },
    include: { team: true },
  });

  return NextResponse.json(stream);
}

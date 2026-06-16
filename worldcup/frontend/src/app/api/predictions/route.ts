import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
    select: { fixtureId: true, home: true, away: true },
  });

  const map: Record<number, { home: number; away: number }> = {};
  for (const p of predictions) map[p.fixtureId] = { home: p.home, away: p.away };

  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as Record<string, { home: number; away: number }>;
  const userId = session.user.id;

  const upserts = Object.entries(body).map(([fixtureStr, pred]) =>
    prisma.prediction.upsert({
      where: { userId_fixtureId: { userId, fixtureId: Number(fixtureStr) } },
      create: { userId, fixtureId: Number(fixtureStr), home: pred.home, away: pred.away },
      update: { home: pred.home, away: pred.away },
    })
  );

  await Promise.all(upserts);
  return NextResponse.json({ ok: true, saved: upserts.length });
}

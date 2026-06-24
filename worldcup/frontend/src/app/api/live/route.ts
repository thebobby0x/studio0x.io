export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Guard: a match can't still be LIVE/HT if it kicked off more than 4 hours ago
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const match = await prisma.match.findFirst({
      where: { status: { in: ["LIVE", "HT"] }, date: { gte: cutoff } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });

    // If nothing passes the time guard, heal any stragglers in the background
    if (!match) {
      prisma.match.updateMany({
        where: { status: { in: ["LIVE", "HT"] }, date: { lt: cutoff } },
        data: { status: "FT", elapsed: 90 },
      }).catch(() => {});
    }

    return NextResponse.json(match ?? null);
  } catch {
    return NextResponse.json(null);
  }
}

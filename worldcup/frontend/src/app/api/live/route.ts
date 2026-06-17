export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const match = await prisma.match.findFirst({
      where: { status: { in: ["LIVE", "HT"] } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(match ?? null);
  } catch {
    return NextResponse.json(null);
  }
}

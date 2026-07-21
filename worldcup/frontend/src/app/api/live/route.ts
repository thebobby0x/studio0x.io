export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Guard: a match can't still be LIVE/HT if it kicked off more than 4 hours ago
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const matches = await prisma.match.findMany({
      where: { status: { in: ["LIVE", "HT"] }, date: { gte: cutoff } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });

    // Heal stragglers in the background
    if (matches.length === 0) {
      prisma.match.updateMany({
        where: { status: { in: ["LIVE", "HT"] }, date: { lt: cutoff } },
        // H-5: only close the status; leave elapsed at its last feed value
        // (was hardcoded 90, corrupting ET/pens matches to 90').
        data: { status: "FT" },
      }).catch(() => {});
    }

    // Return array — null compat: return first match as primary + count for banner
    return NextResponse.json(
      { matches, primary: matches[0] ?? null, count: matches.length },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch {
    return NextResponse.json({ matches: [], primary: null, count: 0 });
  }
}

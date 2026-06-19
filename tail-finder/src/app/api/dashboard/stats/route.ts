import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [watchlistCount, zones, alertCount] = await Promise.all([
        prisma.watchlist.count({ where: { userId } }),
        prisma.monitoredZone.findMany({ where: { userId }, select: { id: true } }),
        prisma.zoneEvent.count({
            where: {
                zone: { userId },
                timestamp: { gte: since },
            },
        }),
    ]);

    return NextResponse.json({
        watchlistCount,
        zoneCount: zones.length,
        alertCount,
    });
}

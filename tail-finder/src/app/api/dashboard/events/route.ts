import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const events = await prisma.zoneEvent.findMany({
        where: { zone: { userId: session.user.id } },
        include: { zone: { select: { name: true } } },
        orderBy: { timestamp: "desc" },
        take: 50,
    });

    return NextResponse.json(events);
}

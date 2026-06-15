
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// GET: Fetch user's watchlist
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    const watchlist = await prisma.watchlist.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(watchlist);
}

// POST: Add to watchlist
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { icao } = await req.json();
    if (!icao) return new NextResponse("ICAO Required", { status: 400 });

    try {
        const entry = await prisma.watchlist.create({
            data: {
                userId: session.user.id,
                icao: icao.toLowerCase()
            }
        });
        return NextResponse.json(entry);
    } catch (e) {
        return new NextResponse("Already Watching", { status: 409 });
    }
}

// DELETE: Remove from watchlist
export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { icao } = await req.json();
    if (!icao) return new NextResponse("ICAO Required", { status: 400 });

    await prisma.watchlist.deleteMany({
        where: {
            userId: session.user.id,
            icao: icao.toLowerCase()
        }
    });

    return NextResponse.json({ success: true });
}

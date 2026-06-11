import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const seconds = typeof body.seconds === "number" ? Math.min(Math.max(body.seconds, 1), 3600) : 0;
  if (!seconds) return NextResponse.json({ error: "seconds required" }, { status: 400 });

  const updated = await prisma.audioStream.update({
    where: { id },
    data: {
      listenSeconds: { increment: seconds },
      ...(seconds >= 10 && { playCount: { increment: 1 } }),
    },
  });

  return NextResponse.json({ playCount: updated.playCount, listenSeconds: updated.listenSeconds });
}

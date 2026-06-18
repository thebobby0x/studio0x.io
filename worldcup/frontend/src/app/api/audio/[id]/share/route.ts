import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const platform = body.platform ?? "unknown";

  await prisma.audioStream.update({
    where: { id },
    data: { shareClicks: { increment: 1 } },
  }).catch(() => null);

  return NextResponse.json({ ok: true, platform });
}

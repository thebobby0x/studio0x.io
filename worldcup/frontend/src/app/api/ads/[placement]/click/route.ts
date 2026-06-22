import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ placement: string }> }
) {
  // params available but we use slotId from query string
  await params;

  const url = new URL(req.url);
  const slotId = url.searchParams.get("slotId");

  if (!slotId) {
    return NextResponse.json({ error: "slotId required" }, { status: 400 });
  }

  try {
    await prisma.adSlot.update({
      where: { id: slotId },
      data: { clicks: { increment: 1 } },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Slot not found or DB error — don't fail loudly
    return NextResponse.json({ ok: false });
  }
}

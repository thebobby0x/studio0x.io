import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdSlotPlacement } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ placement: string }> }
) {
  const { placement } = await params;

  // Validate that the placement is a known enum value
  const validPlacements = Object.values(AdSlotPlacement);
  if (!validPlacements.includes(placement as AdSlotPlacement)) {
    return NextResponse.json({ slot: null });
  }

  try {
    const now = new Date();

    // Find active ad slots for this placement from active sponsors
    const slot = await prisma.adSlot.findFirst({
      where: {
        placement: placement as AdSlotPlacement,
        active: true,
        sponsor: {
          active: true,
          OR: [
            { startDate: null },
            { startDate: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { endDate: null },
                { endDate: { gte: now } },
              ],
            },
          ],
        },
      },
      include: {
        sponsor: {
          select: {
            name: true,
            logoUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!slot) {
      return NextResponse.json({ slot: null });
    }

    // Increment impressions (fire and forget — don't block response)
    prisma.adSlot.update({
      where: { id: slot.id },
      data: { impressions: { increment: 1 } },
    }).catch(() => {});

    return NextResponse.json({
      slot: {
        id: slot.id,
        sponsorName: slot.sponsor.name,
        logoUrl: slot.sponsor.logoUrl,
        imageUrl: slot.imageUrl,
        linkUrl: slot.linkUrl,
        ctaText: slot.ctaText,
      },
    });
  } catch {
    return NextResponse.json({ slot: null });
  }
}

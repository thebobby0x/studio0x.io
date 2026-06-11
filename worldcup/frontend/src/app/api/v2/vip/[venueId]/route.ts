import { NextResponse } from "next/server";
import { getVipUtilization } from "@/lib/vipSimulator";

export async function GET(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  return NextResponse.json({ status: "stub", data: getVipUtilization(venueId) });
}

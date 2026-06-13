import { NextResponse } from "next/server";
import { getGroupWinnerMarkets } from "@/lib/polymarket";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ group: string }> }
) {
  const { group } = await params;
  const data = await getGroupWinnerMarkets(group);
  if (!data) return NextResponse.json({ error: "No markets found" }, { status: 404 });
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { getTournamentWinnerMarkets } from "@/lib/polymarket";

export async function GET() {
  const data = await getTournamentWinnerMarkets();
  if (!data) return NextResponse.json({ error: "No data" }, { status: 404 });
  return NextResponse.json(data);
}

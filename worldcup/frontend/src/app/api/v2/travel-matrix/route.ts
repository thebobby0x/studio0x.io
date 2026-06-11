import { NextResponse } from "next/server";
import { getTravelMatrix } from "@/lib/travelMatrix";

export async function GET() {
  return NextResponse.json({ status: "stub", data: getTravelMatrix() });
}

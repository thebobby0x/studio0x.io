import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const streams = await prisma.audioStream.findMany({ include: { team: true } });
  return NextResponse.json(streams);
}

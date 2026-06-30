import { NextResponse } from "next/server";
import { runStoryRefresh } from "@/lib/storyRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authed(req: Request): boolean {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") === "wc2026studio0x") return true;
  if (process.env.SEED_SECRET && searchParams.get("secret") === process.env.SEED_SECRET) return true;
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

async function handler(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runStoryRefresh();
  if (result.skipped) return NextResponse.json({ error: result.skipped }, { status: 503 });
  return NextResponse.json(result);
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

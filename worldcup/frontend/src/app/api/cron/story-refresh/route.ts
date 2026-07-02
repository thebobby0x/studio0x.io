import { NextResponse } from "next/server";
import { runStoryRefresh } from "@/lib/storyRefresh";
import { isAdminAuthed as authed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;


async function handler(req: Request) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runStoryRefresh();
  if (result.skipped) return NextResponse.json({ error: result.skipped }, { status: 503 });
  return NextResponse.json(result);
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

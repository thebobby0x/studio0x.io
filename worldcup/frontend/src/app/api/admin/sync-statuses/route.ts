import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";

const BASE = "https://v3.football.api-sports.io";
const STATUS_MAP: Record<string, string> = {
  NS: "NS", "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET: "LIVE", BT: "HT", P: "LIVE",
  FT: "FT", AET: "FT", PEN: "FT",
  PST: "NS", CANC: "NS", ABD: "NS",
  AWD: "FT", WO: "FT",
};

export async function POST(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 503 });

  // Find all matches the DB thinks are still LIVE or HT
  const stale = await prisma.match.findMany({
    where: { status: { in: ["LIVE", "HT"] } },
    select: { fixture: true, status: true, date: true },
  });

  if (stale.length === 0) {
    return NextResponse.json({ updated: 0, message: "No stale LIVE/HT matches found" });
  }

  const ids = stale.map(m => m.fixture).join("-");
  const res = await fetch(`${BASE}/fixtures?ids=${ids}`, {
    headers: { "x-apisports-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: `api-football ${res.status}` }, { status: 502 });
  }

  const json = await res.json();
  const fixtures = json.response ?? [];

  let updated = 0;
  for (const f of fixtures) {
    const mapped = STATUS_MAP[f.fixture.status.short] ?? "NS";
    if (mapped === "FT" || mapped === "NS") {
      await prisma.match.updateMany({
        where: { fixture: f.fixture.id },
        data: {
          status: mapped,
          homeScore: f.goals.home ?? 0,
          awayScore: f.goals.away ?? 0,
          elapsed: f.fixture.status.elapsed ?? 90,
        },
      });
      updated++;
    }
  }

  // Also time-guard: anything LIVE/HT with a kickoff >4h ago must be FT by now
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const timeGuard = await prisma.match.updateMany({
    where: { status: { in: ["LIVE", "HT"] }, date: { lt: cutoff } },
    data: { status: "FT", elapsed: 90 },
  });

  return NextResponse.json({
    staleFound: stale.length,
    updatedFromApi: updated,
    timeGuardFixed: timeGuard.count,
  });
}

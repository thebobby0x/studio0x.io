import { prisma } from "@/lib/prisma";
import { getFlag } from "@/lib/flags";
import { getVenueInfo } from "@/lib/venues";

// ─────────────────────────────────────────────────────────────────────────────
// Non-destructive fixture sync — the permanent fix for the stale-DB class of
// bugs. Runs nightly from the cron (and on demand from /admin). Unlike the
// full /api/seed, it NEVER deletes anything:
//   · upserts teams by code (stable IDs → anthem links can't sever)
//   · creates fixtures that appeared since the last sync (e.g. knockout rounds)
//   · updates status/scores/elapsed/date on existing fixtures
//   · upgrades TBD knockout slots to real teams once api-football assigns them
// Diff-aware: only writes rows that actually changed.
// ─────────────────────────────────────────────────────────────────────────────

const AF_BASE = "https://v3.football.api-sports.io";
const AF_LEAGUE = 1; // World Cup
const AF_SEASON = 2026;

export const STATUS_MAP: Record<string, string> = {
  NS: "NS", "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET: "LIVE", BT: "HT", P: "LIVE",
  FT: "FT", AET: "FT", PEN: "FT",
  PST: "NS", CANC: "NS", ABD: "NS",
  AWD: "FT", WO: "FT", SUSP: "LIVE", INT: "LIVE", LIVE: "LIVE",
};

// Static group assignments (api-football doesn't include group in fixtures)
export const TEAM_GROUPS: Record<string, string> = {
  MEX: "A", RSA: "A", KOR: "A", CZE: "A",
  CAN: "B", BIH: "B", QAT: "B", SUI: "B",
  BRA: "C", MAR: "C", HAI: "C", SCO: "C",
  USA: "D", PAR: "D", AUS: "D", TUR: "D",
  GER: "E", CUW: "E", CUR: "E", CIV: "E", ECU: "E",
  NED: "F", JPN: "F", SWE: "F", TUN: "F",
  BEL: "G", EGY: "G", IRN: "G", NZL: "G",
  ESP: "H", CPV: "H", KSA: "H", URU: "H",
  FRA: "I", SEN: "I", IRQ: "I", NOR: "I",
  ARG: "J", ALG: "J", AUT: "J", JOR: "J",
  POR: "K", COD: "K", UZB: "K", COL: "K",
  ENG: "L", CRO: "L", GHA: "L", PAN: "L",
};

interface AFFixture {
  fixture: {
    id: number;
    date: string;
    referee: string | null;
    status: { short: string; elapsed: number | null };
    venue: { name: string | null; city: string | null };
  };
  league: { round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

interface AFTeam { team: { id: number; name: string; code: string | null } }

export interface SyncResult {
  ok: boolean;
  skipped?: string;
  teamsUpserted: number;
  matchesCreated: number;
  matchesUpdated: number;
  unchanged: number;
  errors: string[];
}

export async function syncFixtures(): Promise<SyncResult> {
  const result: SyncResult = { ok: false, teamsUpserted: 0, matchesCreated: 0, matchesUpdated: 0, unchanged: 0, errors: [] };

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    result.skipped = "API_FOOTBALL_KEY not set";
    return result;
  }

  // ── 1. Fetch fixtures + team codes ─────────────────────────────────────────
  const headers = { "x-apisports-key": apiKey };
  const [fixturesRes, teamsRes] = await Promise.all([
    fetch(`${AF_BASE}/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, { headers, cache: "no-store" }),
    fetch(`${AF_BASE}/teams?league=${AF_LEAGUE}&season=${AF_SEASON}`, { headers, cache: "no-store" }),
  ]);
  if (!fixturesRes.ok) {
    result.skipped = `api-football fixtures returned ${fixturesRes.status}`;
    return result;
  }
  const fixturesJson = (await fixturesRes.json()) as { response?: AFFixture[] };
  const afFixtures = fixturesJson.response ?? [];
  if (afFixtures.length === 0) {
    result.skipped = "api-football returned 0 fixtures — leaving DB untouched";
    return result;
  }

  const teamsJson = teamsRes.ok ? ((await teamsRes.json()) as { response?: AFTeam[] }) : { response: [] };
  const teamCodeById = new Map<number, string>(
    (teamsJson.response ?? [])
      .filter((t) => t.team.code)
      .map((t) => [t.team.id, t.team.code!.toUpperCase()])
  );

  // ── 2. Upsert teams by code (stable IDs — anthem links survive) ────────────
  const teamMeta = new Map<string, string>(); // code → name
  for (const f of afFixtures) {
    const h = teamCodeById.get(f.teams.home.id);
    const a = teamCodeById.get(f.teams.away.id);
    if (h && !teamMeta.has(h)) teamMeta.set(h, f.teams.home.name);
    if (a && !teamMeta.has(a)) teamMeta.set(a, f.teams.away.name);
  }
  await Promise.all(
    [...teamMeta.entries()].map(([code, name]) =>
      prisma.team
        .upsert({
          where: { code },
          create: { code, name, flagEmoji: getFlag(code), groupStage: TEAM_GROUPS[code] ?? "KO" },
          update: { name, flagEmoji: getFlag(code) },
        })
        .then(() => { result.teamsUpserted++; })
        .catch((e) => result.errors.push(`team ${code}: ${String(e)}`))
    )
  );
  // TBD sentinel for undecided knockout slots
  await prisma.team.upsert({
    where: { code: "TBD" },
    create: { code: "TBD", name: "TBD", flagEmoji: "🏳️", groupStage: "KO" },
    update: {},
  });

  const allTeams = await prisma.team.findMany({ select: { id: true, code: true } });
  const teamIdByCode = new Map(allTeams.map((t) => [t.code, t.id]));

  // ── 3. Diff-aware match upsert by fixture id ───────────────────────────────
  const existing = await prisma.match.findMany({
    select: { fixture: true, status: true, homeScore: true, awayScore: true, elapsed: true, date: true, homeTeamId: true, awayTeamId: true, referee: true },
  });
  const existingByFixture = new Map(existing.map((m) => [m.fixture, m]));

  for (const f of afFixtures) {
    const rawHome = teamCodeById.get(f.teams.home.id) ?? "";
    const rawAway = teamCodeById.get(f.teams.away.id) ?? "";
    const isKnockout = !f.league.round.toLowerCase().includes("group");
    const homeCode = rawHome || (isKnockout ? "TBD" : "");
    const awayCode = rawAway || (isKnockout ? "TBD" : "");
    const homeTeamId = teamIdByCode.get(homeCode);
    const awayTeamId = teamIdByCode.get(awayCode);
    if (!homeTeamId || !awayTeamId) continue; // group fixture with unknown code — skip

    const status = STATUS_MAP[f.fixture.status.short] ?? "NS";
    const homeScore = f.goals.home ?? 0;
    const awayScore = f.goals.away ?? 0;
    const elapsed = f.fixture.status.elapsed ?? 0;
    const date = new Date(f.fixture.date);
    const referee = f.fixture.referee?.trim() || null;

    const cur = existingByFixture.get(f.fixture.id);
    try {
      if (!cur) {
        const venue = f.fixture.venue.name ?? "World Cup Stadium";
        await prisma.match.create({
          data: {
            fixture: f.fixture.id,
            homeTeamId,
            awayTeamId,
            venue,
            // Prefer OUR canonical city name (matches travel-stats/venue maps);
            // api-football's raw city string only as fallback.
            city: getVenueInfo(venue)?.city ?? f.fixture.venue.city ?? "",
            date,
            status,
            homeScore,
            awayScore,
            elapsed,
            referee,
          },
        });
        result.matchesCreated++;
      } else {
        const changed =
          cur.status !== status ||
          cur.homeScore !== homeScore ||
          cur.awayScore !== awayScore ||
          cur.elapsed !== elapsed ||
          cur.date.getTime() !== date.getTime() ||
          cur.homeTeamId !== homeTeamId || // TBD → real team upgrade
          cur.awayTeamId !== awayTeamId ||
          (referee !== null && cur.referee !== referee); // don't null-out a known ref
        if (changed) {
          await prisma.match.update({
            where: { fixture: f.fixture.id },
            data: { status, homeScore, awayScore, elapsed, date, homeTeamId, awayTeamId, ...(referee !== null ? { referee } : {}) },
          });
          result.matchesUpdated++;
        } else {
          result.unchanged++;
        }
      }
    } catch (e) {
      result.errors.push(`fixture ${f.fixture.id}: ${String(e)}`);
    }
  }

  result.ok = true;
  return result;
}

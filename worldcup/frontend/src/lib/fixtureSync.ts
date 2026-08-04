import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";
// league/season from the active deployment config (Stage 3): worldcup → 1/2026
// (unchanged, behavior-preserving); leaguescup → 772/2026.
import { AF_LEAGUE, AF_SEASON, SPORT } from "@/lib/sportConfig";
import { resolveTeams, type FeedTeam } from "@/lib/teamIdentity";

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
// AF_LEAGUE / AF_SEASON now come from @/lib/sportConfig (imported at top).

export const STATUS_MAP: Record<string, string> = {
  NS: "NS", "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET: "LIVE", BT: "HT", P: "LIVE",
  FT: "FT", AET: "FT", PEN: "FT",
  PST: "NS", CANC: "NS", ABD: "NS",
  AWD: "FT", WO: "FT", SUSP: "LIVE", INT: "LIVE", LIVE: "LIVE",
};

// Static group assignments come from the deployment config (api-football doesn't
// include group in fixtures). WC26 keeps its nation map; LC26's is empty because
// the competition has no groups — applying the WC map to clubs is what put
// Columbus Crew ("COL" = Colombia) into World Cup Group K.
export const TEAM_GROUPS: Record<string, string> = SPORT.teamGroups;

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
  score?: { penalty?: { home: number | null; away: number | null } };
}

interface AFTeam { team: { id: number; name: string; code: string | null; country: string | null } }

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

  // Resolve feed teams to DB identities. Nation deployments key off the feed's
  // FIFA TLA (unchanged); club deployments key off the api-football team id,
  // because 14 of the 36 Leagues Cup clubs have no `team.code` at all and every
  // fixture involving them was being silently skipped below (36/54 affected).
  // Seed from /teams, then top up from the fixtures themselves so a club that
  // /teams omits still resolves.
  const feedTeams = new Map<number, FeedTeam>();
  for (const t of teamsJson.response ?? []) {
    feedTeams.set(t.team.id, { id: t.team.id, name: t.team.name, code: t.team.code, country: t.team.country });
  }
  for (const f of afFixtures) {
    for (const side of [f.teams.home, f.teams.away]) {
      if (!feedTeams.has(side.id)) feedTeams.set(side.id, { id: side.id, name: side.name });
    }
  }
  const resolved = resolveTeams([...feedTeams.values()]);

  // Guard: an empty resolution means the /teams call failed or came back hollow.
  // Proceeding would resolve EVERY knockout fixture to the TBD sentinel and the
  // diff-writer would downgrade real, already-played pairings back to TBD
  // (owner report 7/15: dashboard full of "TBD 0-2 TBD" for finished semis).
  // The fixtures call has this guard; the teams call never did.
  if (resolved.size === 0) {
    result.skipped = "api-football /teams returned no usable teams — refusing to sync (would downgrade knockout teams to TBD)";
    return result;
  }

  // ── 2. Upsert teams (stable IDs — anthem links survive) ────────────────────
  // Upsert by api-football team id where we have one, so a club whose derived
  // code changes (rename, collision reshuffle) updates in place instead of
  // minting a duplicate row.
  // Pre-pass: free every wanted code that is currently held by a DIFFERENT team.
  //
  // Team.code is @unique, and this change reassigns codes. Two ways that bites:
  //   · a stale row squats a code nothing owns any more;
  //   · a code moves between two teams that are BOTH still in the competition —
  //     Atlas was stored as "ATL", and "ATL" now resolves to Atlante FC. Without
  //     this pass, resolving Atlante would find Atlas by code and overwrite the
  //     wrong row (or hit a unique violation).
  // Ownership is decided by NAME: the row entitled to code C is the one named
  // whatever the resolver says owns C. Everyone else gets parked; parked rows are
  // either re-coded moments later in this same loop (if they're still in the
  // competition) or pruned by clear-foreign-data.
  const nameForCode = new Map([...resolved.values()].map((t) => [t.code, t.name]));
  const held = await prisma.team.findMany({
    where: { code: { in: [...nameForCode.keys()] } },
    select: { id: true, code: true, name: true },
  });
  for (const row of held) {
    if (nameForCode.get(row.code) === row.name) continue; // rightful owner
    await prisma.team
      .update({ where: { id: row.id }, data: { code: `X-${row.id.slice(0, 8)}` } })
      .catch((e) => result.errors.push(`free code ${row.code}: ${String(e)}`));
  }

  for (const [afId, t] of resolved) {
    try {
      // Match an existing row by api-football id, then NAME, then code. Name
      // outranks code because this change REASSIGNS codes: rows seeded by the old
      // code-keyed path have no afTeamId and carry a code that may now belong to
      // another club. Name is stable, unique, and comes straight from the feed.
      const existing =
        (await prisma.team.findFirst({ where: { afTeamId: afId } })) ??
        (await prisma.team.findUnique({ where: { name: t.name } })) ??
        (await prisma.team.findUnique({ where: { code: t.code } }));
      if (existing) {
        await prisma.team.update({
          where: { id: existing.id },
          data: { code: t.code, name: t.name, flagEmoji: t.flagEmoji, country: t.country, afTeamId: afId, groupStage: t.groupStage || existing.groupStage },
        });
      } else {
        await prisma.team.create({
          data: { code: t.code, name: t.name, flagEmoji: t.flagEmoji, country: t.country, afTeamId: afId, groupStage: t.groupStage || "KO" },
        });
      }
      result.teamsUpserted++;
    } catch (e) {
      result.errors.push(`team ${t.code} (af:${afId}): ${String(e)}`);
    }
  }
  // TBD sentinel for undecided knockout slots
  await prisma.team.upsert({
    where: { code: "TBD" },
    create: { code: "TBD", name: "TBD", flagEmoji: "🏳️", groupStage: "KO" },
    update: {},
  });

  const allTeams = await prisma.team.findMany({ select: { id: true, code: true, afTeamId: true } });
  const teamIdByCode = new Map(allTeams.map((t) => [t.code, t.id]));
  const teamIdByAfId = new Map(allTeams.filter((t) => t.afTeamId != null).map((t) => [t.afTeamId!, t.id]));

  // ── 3. Diff-aware match upsert by fixture id ───────────────────────────────
  const existing = await prisma.match.findMany({
    select: { fixture: true, status: true, homeScore: true, awayScore: true, penHome: true, penAway: true, elapsed: true, date: true, homeTeamId: true, awayTeamId: true, referee: true, leagueId: true },
  });
  const existingByFixture = new Map(existing.map((m) => [m.fixture, m]));

  for (const f of afFixtures) {
    const isKnockout = !f.league.round.toLowerCase().includes("group");
    // Resolve by api-football team id first (always present), falling back to
    // the TBD sentinel only for genuinely undecided knockout slots.
    const homeTeamId =
      teamIdByAfId.get(f.teams.home.id) ??
      (isKnockout ? teamIdByCode.get("TBD") : undefined);
    const awayTeamId =
      teamIdByAfId.get(f.teams.away.id) ??
      (isKnockout ? teamIdByCode.get("TBD") : undefined);
    if (!homeTeamId || !awayTeamId) {
      result.errors.push(`fixture ${f.fixture.id}: unresolved team (${f.teams.home.name} v ${f.teams.away.name})`);
      continue;
    }

    // Belt-and-braces with the empty-map guard above: a real team is NEVER
    // downgraded to the TBD sentinel on a per-fixture basis either (a single
    // unmapped id must not un-pair a decided knockout slot). Upgrades
    // (TBD → real) and corrections (real → different real) still apply.
    const tbdId = teamIdByCode.get("TBD");
    const curRow = existingByFixture.get(f.fixture.id);
    const effHomeTeamId = (homeTeamId === tbdId && curRow && curRow.homeTeamId !== tbdId) ? curRow.homeTeamId : homeTeamId;
    const effAwayTeamId = (awayTeamId === tbdId && curRow && curRow.awayTeamId !== tbdId) ? curRow.awayTeamId : awayTeamId;

    const status = STATUS_MAP[f.fixture.status.short] ?? "NS";
    const homeScore = f.goals.home ?? 0;
    const awayScore = f.goals.away ?? 0;
    const penHome = f.score?.penalty?.home ?? null;
    const penAway = f.score?.penalty?.away ?? null;
    const elapsed = f.fixture.status.elapsed ?? 0;
    const date = new Date(f.fixture.date);
    const referee = f.fixture.referee?.trim() || null;

    const cur = existingByFixture.get(f.fixture.id);
    try {
      if (!cur) {
        // "World Cup Stadium" is a WC26 DB sentinel (see CLAUDE.md) — never
        // stamp it on another tournament's fixture. Unknown venue stays blank.
        const venue = f.fixture.venue.name ?? (SPORT.id === "worldcup" ? "World Cup Stadium" : "");
        await prisma.match.create({
          data: {
            fixture: f.fixture.id,
            leagueId: AF_LEAGUE,
            homeTeamId: effHomeTeamId,
            awayTeamId: effAwayTeamId,
            venue,
            // Prefer OUR canonical city name (matches travel-stats/venue maps);
            // api-football's raw city string only as fallback.
            city: getVenueInfo(venue)?.city ?? f.fixture.venue.city ?? "",
            date,
            status,
            homeScore,
            awayScore,
            penHome,
            penAway,
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
          cur.homeTeamId !== effHomeTeamId || // TBD → real team upgrade (never the reverse)
          cur.awayTeamId !== effAwayTeamId ||
          cur.leagueId !== AF_LEAGUE || // backfills rows seeded before leagueId existed
          (penHome !== null && cur.penHome !== penHome) ||
          (penAway !== null && cur.penAway !== penAway) ||
          (referee !== null && cur.referee !== referee); // don't null-out a known ref
        if (changed) {
          await prisma.match.update({
            where: { fixture: f.fixture.id },
            // Only write pens when the feed has them (never null-out a shootout result).
            data: { status, homeScore, awayScore, elapsed, date, leagueId: AF_LEAGUE, homeTeamId: effHomeTeamId, awayTeamId: effAwayTeamId, ...(penHome !== null ? { penHome } : {}), ...(penAway !== null ? { penAway } : {}), ...(referee !== null ? { referee } : {}) },
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

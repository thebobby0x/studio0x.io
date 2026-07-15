import { prisma } from "@/lib/prisma";
import type { Competition } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Depot sync — non-destructive by design (lessons inherited from podiumMetrics):
//   · empty upstream response → skip, never wipe (a failed feed must not
//     erase or downgrade good rows)
//   · upsert by (source, sourceId) reference — internal cuid stays the key;
//     re-syncs update in place, never duplicate
//   · team/venue links only ever upgrade null → real, never real → null
//   · per-competition status/error recorded for the sync center UI
// ─────────────────────────────────────────────────────────────────────────────

const TSDB_KEY = process.env.TSDB_KEY ?? "3"; // "3" = TheSportsDB free/dev key
const TSDB_BASE = () => `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;
const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

interface TSDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  idHomeTeam: string | null;
  idAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string | null;    // "2026-06-11"
  strTime: string | null;      // "20:00:00"
  strTimestamp: string | null; // ISO, preferred when present
  strVenue: string | null;
  strCity: string | null;
  strCountry: string | null;
  strStatus: string | null;    // "Match Finished" | "Not Started" | minute | …
  intRound: string | null;
}

interface JolpicaRace {
  round: string;
  raceName: string;
  date: string;  // "2026-07-05"
  time?: string; // "14:00:00Z"
  Circuit: { circuitName: string; Location: { locality: string; country: string } };
}

export interface SyncOutcome {
  ok: boolean;
  eventsUpserted: number;
  teamsUpserted: number;
  error?: string;
}

function tsdbStatus(s: string | null, hasScore: boolean): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("finished") || v === "ft" || v === "aet" || v === "pen") return "finished";
  if (v === "" || v.includes("not started") || v === "ns") return hasScore ? "finished" : "scheduled";
  return "live"; // TSDB reports a minute or period label while in play
}

async function ensureVenue(name: string | null, city: string | null, country: string | null): Promise<string | null> {
  if (!name) return null;
  const v = await prisma.venue.upsert({
    where: { name_city: { name, city: city ?? "" } },
    create: { name, city: city ?? "", country: country ?? "" },
    update: country ? { country } : {},
  });
  return v.id;
}

async function syncTheSportsDB(c: Competition): Promise<SyncOutcome> {
  const res = await fetch(
    `${TSDB_BASE()}/eventsseason.php?id=${encodeURIComponent(c.sourceId)}&s=${encodeURIComponent(c.season)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: `TheSportsDB ${res.status}` };
  const json = (await res.json()) as { events?: TSDBEvent[] | null };
  const events = json.events ?? [];
  if (events.length === 0) {
    return { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: "0 events returned — check league id/season (DB left untouched)" };
  }

  let teamsUpserted = 0;
  let eventsUpserted = 0;

  // Teams first (referenced by events)
  const teamNames = new Map<string, string>(); // vendor team id → name
  for (const e of events) {
    if (e.idHomeTeam && e.strHomeTeam) teamNames.set(e.idHomeTeam, e.strHomeTeam);
    if (e.idAwayTeam && e.strAwayTeam) teamNames.set(e.idAwayTeam, e.strAwayTeam);
  }
  const teamIdByRef = new Map<string, string>(); // vendor id → internal cuid
  for (const [sourceId, name] of teamNames) {
    const team = await prisma.team.upsert({
      where: { source_sourceId: { source: "thesportsdb", sourceId } },
      create: { source: "thesportsdb", sourceId, name, sport: c.sport },
      update: { name },
    });
    teamIdByRef.set(sourceId, team.id);
    teamsUpserted++;
  }

  for (const e of events) {
    const iso = e.strTimestamp
      ? e.strTimestamp
      : `${e.dateEvent ?? "2099-01-01"}T${e.strTime && e.strTime !== "00:00:00" ? e.strTime : "12:00:00"}Z`;
    const date = new Date(iso);
    if (isNaN(date.getTime())) continue;
    const homeScore = e.intHomeScore != null && e.intHomeScore !== "" ? parseInt(e.intHomeScore, 10) : null;
    const awayScore = e.intAwayScore != null && e.intAwayScore !== "" ? parseInt(e.intAwayScore, 10) : null;
    const venueId = await ensureVenue(e.strVenue, e.strCity, e.strCountry);
    const homeId = e.idHomeTeam ? teamIdByRef.get(e.idHomeTeam) ?? null : null;
    const awayId = e.idAwayTeam ? teamIdByRef.get(e.idAwayTeam) ?? null : null;

    await prisma.event.upsert({
      where: { source_sourceId: { source: "thesportsdb", sourceId: e.idEvent } },
      create: {
        source: "thesportsdb",
        sourceId: e.idEvent,
        competitionId: c.id,
        name: e.strEvent,
        round: e.intRound ?? "",
        date,
        venueId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore,
        awayScore,
        status: tsdbStatus(e.strStatus, homeScore !== null),
      },
      update: {
        name: e.strEvent,
        round: e.intRound ?? "",
        date,
        // Links only ever upgrade null → real, never real → null
        ...(venueId ? { venueId } : {}),
        ...(homeId ? { homeTeamId: homeId } : {}),
        ...(awayId ? { awayTeamId: awayId } : {}),
        homeScore,
        awayScore,
        status: tsdbStatus(e.strStatus, homeScore !== null),
      },
    });
    eventsUpserted++;
  }

  return { ok: true, eventsUpserted, teamsUpserted };
}

async function syncJolpica(c: Competition): Promise<SyncOutcome> {
  const res = await fetch(`${JOLPICA_BASE}/${encodeURIComponent(c.season)}/races/?format=json`, { cache: "no-store" });
  if (!res.ok) return { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: `Jolpica ${res.status}` };
  const json = (await res.json()) as { MRData?: { RaceTable?: { Races?: JolpicaRace[] } } };
  const races = json.MRData?.RaceTable?.Races ?? [];
  if (races.length === 0) {
    return { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: "0 races returned (DB left untouched)" };
  }

  let eventsUpserted = 0;
  const now = Date.now();
  for (const r of races) {
    const date = new Date(`${r.date}T${r.time ?? "12:00:00Z"}`);
    if (isNaN(date.getTime())) continue;
    const venueId = await ensureVenue(r.Circuit.circuitName, r.Circuit.Location.locality, r.Circuit.Location.country);
    const sourceId = `${c.season}-r${r.round}`;
    const data = {
      competitionId: c.id,
      name: r.raceName,
      round: r.round,
      date,
      venueId,
      status: date.getTime() < now - 4 * 3600_000 ? "finished" : "scheduled",
    };
    await prisma.event.upsert({
      where: { source_sourceId: { source: "jolpica", sourceId } },
      create: { source: "jolpica", sourceId, ...data },
      update: data,
    });
    eventsUpserted++;
  }

  return { ok: true, eventsUpserted, teamsUpserted: 0 };
}

export async function syncCompetition(c: Competition): Promise<SyncOutcome> {
  if (c.source === "thesportsdb" && !c.sourceId) {
    return { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: "no TheSportsDB league id mapped yet" };
  }
  let outcome: SyncOutcome;
  try {
    outcome = c.source === "jolpica" ? await syncJolpica(c) : await syncTheSportsDB(c);
  } catch (e) {
    outcome = { ok: false, eventsUpserted: 0, teamsUpserted: 0, error: String(e) };
  }
  await prisma.competition.update({
    where: { id: c.id },
    data: outcome.ok
      ? { status: "synced", lastSyncAt: new Date(), syncError: null }
      : { status: c.status === "synced" ? "synced" : "error", syncError: outcome.error ?? "unknown" },
  }).catch(() => {});
  return outcome;
}

// ─────────────────────────────────────────────────────────────────────────────
// Venue coordinates — the thing the weather ingest actually needs.
//
// WHY (LC26, 8/5): backfillMatchWeather did `getVenueInfo(m.venue)` and skipped
// the match when it returned null (`skippedNoVenue: 4`). lib/venues.ts is a
// curated table of the SIXTEEN World Cup stadiums, so on any other competition
// it returns null for every venue and no match ever gets weather.
//
// The reported cause — "the city field is empty" — is real but is not the whole
// story: api-football's fixture feed omits `venue.city` for 40 of the 54 Leagues
// Cup fixtures, and it never supplies coordinates for ANY venue. So writing the
// feed's city through (which the fixture sync now does) is necessary but not
// sufficient. Coordinates have to come from somewhere.
//
// Resolution order, most precise first:
//   1. lib/venues.ts     — exact stadium coordinates. WC26 behaviour unchanged.
//   2. api-football /venues?id= — authoritative city/country/capacity for the
//      venue, filling the city the fixture feed left blank.
//   3. Open-Meteo geocoding — lat/lng for that city.
//
// Results are cached in the Venue table, so this costs one /venues call and one
// geocode per venue for the life of the deployment, not one per match.
//
// TRUTH: `source` records the provenance. A city-centroid reading is tagged
// "geocoded-city" and must never be presented as a stadium-exact measurement.
// Nothing here invents a coordinate — an unresolved venue stays unresolved and
// the match is skipped, exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";

const AF_BASE = "https://v3.football.api-sports.io";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Nominatim requires a descriptive User-Agent identifying the application.
const NOMINATIM_UA = "studio0x-podiumMetrics/1.0 (venue geocoding; b@studio0x.io)";

export interface VenueGeo {
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  source: "venue-table" | "geocoded-venue" | "geocoded-city";
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** api-football venue metadata — city/country/capacity. Costs one API call. */
async function fetchVenueMeta(afVenueId: number): Promise<{ city: string; country: string; capacity: number | null } | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;
  const json = (await fetchJson(`${AF_BASE}/venues?id=${afVenueId}`, {
    headers: { "x-apisports-key": apiKey },
  })) as { response?: Array<{ city?: string | null; country?: string | null; capacity?: number | null }> } | null;
  const v = json?.response?.[0];
  if (!v) return null;
  return { city: v.city ?? "", country: v.country ?? "", capacity: v.capacity ?? null };
}

/**
 * api-football country name → ISO-3166 alpha-2, which is what Open-Meteo's
 * geocoder returns as `country_code`.
 *
 * Matching on the country NAME does not work: api-football says "USA" and
 * Open-Meteo says "United States", so a name comparison failed and the code fell
 * through to the first global hit — "Mansfield" (Texas) resolved to Mansfield,
 * ENGLAND, which would have attached English weather to a Texas match.
 */
const COUNTRY_CODE: Record<string, string> = {
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  us: "US",
  mexico: "MX",
  méxico: "MX",
  mx: "MX",
  canada: "CA",
  ca: "CA",
};

function countryCodeFor(country: string): string | null {
  const k = country.trim().toLowerCase();
  if (!k) return null;
  return COUNTRY_CODE[k] ?? (k.length === 2 ? k.toUpperCase() : null);
}

/** Normalise a place name for comparison (accents, case, punctuation). */
function normPlace(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface GeoHit { lat: number; lng: number; city: string }

/**
 * Free-text venue lookup (OpenStreetMap Nominatim), constrained to the expected
 * country. Precise when it works — "Allianz Field" resolves to Saint Paul, MN —
 * but NOT trustworthy on its own: generic names collide badly ("Q2 Stadium"
 * returns Richmond, Virginia instead of Austin, Texas, and unconstrained it
 * returns Kenya). The caller therefore only accepts a hit that CORROBORATES the
 * city api-football reported for the venue.
 *
 * Nominatim usage policy: identify via User-Agent, max ~1 request/second. This
 * runs once per venue for the life of the deployment (results are cached), and
 * the backfill loop paces itself.
 */
async function geocodeVenueName(venue: string, countryCode: string | null): Promise<GeoHit | null> {
  const cc = countryCode ? `&countrycodes=${countryCode.toLowerCase()}` : "";
  const json = (await fetchJson(
    `${NOMINATIM}?q=${encodeURIComponent(venue)}&format=json&limit=1&addressdetails=1${cc}`,
    { headers: { "User-Agent": NOMINATIM_UA } },
  )) as Array<{ lat: string; lon: string; address?: Record<string, string> }> | null;
  const hit = json?.[0];
  if (!hit) return null;
  const a = hit.address ?? {};
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    city: a.city || a.town || a.village || a.municipality || a.county || "",
  };
}

/**
 * City centroid from Open-Meteo geocoding (free, no key).
 *
 * When the country is known the match is REQUIRED, not preferred: city names
 * repeat across countries (Mansfield, San Luis, Guadalajara, Toledo…), and
 * silently taking the first global hit is how a match gets another continent's
 * weather. Duplicates WITHIN a country are refused too — "Mansfield, US" is both
 * Ohio and Texas, and there is no way to choose without more signal, so we
 * return null and the venue stays unresolved rather than guessing a state.
 */
async function geocodeCity(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  if (!city) return null;
  const json = (await fetchJson(
    `${GEOCODE}?name=${encodeURIComponent(city)}&count=10&language=en&format=json`,
  )) as { results?: Array<{ latitude: number; longitude: number; country_code?: string; admin1?: string }> } | null;
  const results = json?.results ?? [];
  if (results.length === 0) return null;

  const code = countryCodeFor(country);
  const inCountry = code
    ? results.filter((r) => (r.country_code ?? "").toUpperCase() === code)
    : results;

  if (inCountry.length === 1) return { lat: inCountry[0].latitude, lng: inCountry[0].longitude };
  return null; // zero hits, or ambiguous within the country — refuse
}

/**
 * Resolve coordinates for a venue, caching the result.
 *
 * `city` is the city already on the Match row (may be empty). `afVenueId` is the
 * api-football venue id when known. Returns null when the venue genuinely cannot
 * be resolved — callers skip those matches rather than guessing.
 */
export async function resolveVenueGeo(
  venueName: string,
  city = "",
  afVenueId?: number | null,
  /**
   * Country hint — ONLY from a source that describes the VENUE.
   *
   * Do NOT pass the home team's country. In Leagues Cup the nominal home side is
   * frequently a Liga MX club playing at an MLS ground, so "home club country"
   * is not the venue's country: it stamped Allianz Field (Minnesota) and America
   * First Field (Utah) as Mexico, which then blocked their correct US matches.
   */
  countryHint = "",
): Promise<VenueGeo | null> {
  const name = (venueName ?? "").trim();
  if (!name) return null;

  // 1. Exact stadium coordinates (WC26 path — unchanged).
  const curated = getVenueInfo(name);
  if (curated) {
    return {
      name,
      city: curated.city,
      country: curated.country,
      lat: curated.lat,
      lng: curated.lng,
      source: "venue-table",
    };
  }

  // 2. Cache.
  const cached = await prisma.venue.findUnique({ where: { name } }).catch(() => null);
  if (cached?.lat != null && cached.lng != null) {
    return {
      name,
      city: cached.city,
      country: cached.country,
      lat: cached.lat,
      lng: cached.lng,
      source: (cached.source === "geocoded-venue" ? "geocoded-venue" : "geocoded-city"),
    };
  }

  // 3. Resolve: venue metadata (fills a missing city), then geocode.
  let resolvedCity = cached?.city || city || "";
  let resolvedCountry = cached?.country || countryHint || "";
  let capacity: number | null = cached?.capacity ?? null;

  if (afVenueId && (!resolvedCity || !resolvedCountry)) {
    const meta = await fetchVenueMeta(afVenueId);
    if (meta) {
      resolvedCity = meta.city || resolvedCity;
      resolvedCountry = meta.country || resolvedCountry;
      capacity = meta.capacity ?? capacity;
    }
  }

  // Resolution, most precise first, and NEVER accepting an uncorroborated guess.
  //
  //   A. Venue name (Nominatim, country-constrained) — accepted only when the
  //      city it returns matches the city api-football gave for the venue. That
  //      corroboration is what rejects "Q2 Stadium → Richmond, Virginia" (it is
  //      in Austin, Texas) while accepting "Allianz Field → Saint Paul".
  //   B. City centroid (Open-Meteo) — accepted only when unambiguous within the
  //      country. "Mansfield, US" is both Ohio and Texas, so it refuses.
  //   C. Neither → unresolved. The match gets no weather, which is the honest
  //      outcome; it is never given a plausible-looking wrong location.
  const cc = countryCodeFor(resolvedCountry);
  let coords: { lat: number; lng: number } | null = null;
  let source: VenueGeo["source"] = "geocoded-city";

  const byName = await geocodeVenueName(name, cc);
  if (byName && Number.isFinite(byName.lat) && Number.isFinite(byName.lng)) {
    if (resolvedCity && byName.city && normPlace(byName.city) === normPlace(resolvedCity)) {
      coords = { lat: byName.lat, lng: byName.lng };
      source = "geocoded-venue";
    }
    // With NO provider city there is nothing to corroborate against, and the
    // hit is not trustworthy on its own: "Q2 Stadium" returns Richmond,
    // Virginia when the ground is in Austin, Texas. Accepting it would write a
    // confident, wrong location — so the venue stays unresolved and is reported
    // instead. Run "Seed Fixtures" to populate Match.venueId; /venues then
    // supplies the city this check needs.
  }

  if (!coords && resolvedCity) {
    const byCity = await geocodeCity(resolvedCity, resolvedCountry);
    if (byCity) { coords = byCity; source = "geocoded-city"; }
  }

  // Persist whatever we learned, including a failed attempt — so the next run
  // reuses the city/country and only retries the part that failed.
  await prisma.venue
    .upsert({
      where: { name },
      create: {
        name,
        afVenueId: afVenueId ?? null,
        city: resolvedCity,
        country: resolvedCountry,
        capacity,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        source: coords ? source : "unresolved",
      },
      update: {
        ...(afVenueId ? { afVenueId } : {}),
        ...(resolvedCity ? { city: resolvedCity } : {}),
        ...(resolvedCountry ? { country: resolvedCountry } : {}),
        ...(capacity != null ? { capacity } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng, source } : {}),
      },
    })
    .catch(() => null);

  if (!coords) return null;
  return { name, city: resolvedCity, country: resolvedCountry, lat: coords.lat, lng: coords.lng, source };
}

/**
 * Backfill Match.city from resolved venue metadata.
 *
 * The fixture feed left `city` blank on most LC26 fixtures, which is what made
 * Travel Pulse group only a handful of host cities. Once a venue resolves, its
 * city is authoritative and gets written back to every match at that venue.
 */
export async function backfillMatchCities(limit = 40): Promise<{
  venuesResolved: number;
  matchesUpdated: number;
  citiesCorrected: number;
  unresolved: string[];
}> {
  const out = { venuesResolved: 0, matchesUpdated: 0, citiesCorrected: 0, unresolved: [] as string[] };

  // Correction pass: clear cities that CONTRADICT the home team's country.
  //
  // Before the WC venue table's substring matching was gated to the World Cup
  // deployment, "BMO Stadium" (LAFC) matched the "BMO" alias and every LAFC home
  // fixture was stamped Toronto, Canada. A home fixture is played in the home
  // club's country, so a stored city whose country disagrees with the home
  // team's is provably wrong — clear it and let the resolver below redo it.
  const withCity = await prisma.match.findMany({
    where: { NOT: { city: "" } },
    select: { id: true, venue: true, city: true, homeTeam: { select: { country: true } } },
  });
  for (const m of withCity) {
    const curated = getVenueInfo(m.venue);
    const homeCC = countryCodeFor(m.homeTeam?.country ?? "");
    const cityCC = curated ? countryCodeFor(curated.country) : null;
    if (curated && homeCC && cityCC && homeCC !== cityCC) {
      await prisma.match.update({ where: { id: m.id }, data: { city: "" } }).catch(() => null);
      out.citiesCorrected++;
    }
  }

  // EVERY distinct venue, not just the ones on city-less matches.
  //
  // This used to select `where: { city: "" }`, so a venue was only ever resolved
  // if some match at it was missing a city. api-football DID supply a city for 14
  // of the 54 LC26 fixtures — those venues therefore never got a Venue row, never
  // got coordinates, and this route still reported success. Weather backfill then
  // had to geocode them inline, one match at a time, against Nominatim and
  // Open-Meteo — which is what pushed it past the function timeout.
  //
  // Coordinates, not the city string, are what the weather ingest needs, so the
  // work list is "venues without coordinates" and city backfill is a by-product.
  const fixtures = await prisma.match.findMany({
    where: { NOT: { venue: "" } },
    select: { venue: true, venueId: true },
  });
  const byVenue = new Map<string, number | null>();
  for (const m of fixtures) {
    // Prefer a row that actually carries the api-football venue id — that id is
    // what /venues needs to supply the city the corroboration check requires.
    if (!byVenue.get(m.venue)) byVenue.set(m.venue, m.venueId ?? null);
  }

  const resolvedVenues = await prisma.venue.findMany({
    where: { lat: { not: null }, lng: { not: null } },
    select: { name: true },
  });
  const haveCoords = new Set(resolvedVenues.map((v) => v.name));

  // Already-resolved venues cost nothing to re-check (resolveVenueGeo short-
  // circuits on the cache), but they must not consume the budget either.
  const todo = [...byVenue.entries()].filter(([name]) => !haveCoords.has(name));

  for (const [venue, afVenueId] of todo.slice(0, limit)) {
    // No country hint: the venue's own metadata is the only valid source.
    const geo = await resolveVenueGeo(venue, "", afVenueId);
    if (!geo) { out.unresolved.push(venue); continue; }
    out.venuesResolved++;
    if (geo.city) {
      const res = await prisma.match.updateMany({ where: { venue, city: "" }, data: { city: geo.city } });
      out.matchesUpdated += res.count;
    }
  }

  return out;
}

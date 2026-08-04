// ─────────────────────────────────────────────────────────────────────────────
// Team identity resolution — how a feed team becomes a DB `Team` row.
//
// WHY THIS EXISTS (LC26 launch bug, 2026-08-04): every ingestion path resolved a
// team purely by api-football's `team.code`, which is a FIFA nation TLA. That
// holds for WC26 and breaks completely for a club competition:
//
//   · 14 of the 36 Leagues Cup clubs have NO `team.code` at all (Inter Miami,
//     LAFC, Club América, NYCFC, Orlando, Nashville, Austin, Charlotte, San
//     Diego, Vancouver, Cincinnati, Tijuana, Juárez, Atlante). Both /api/seed
//     and fixtureSync `continue` past a fixture whose code can't be resolved, so
//     36 of 54 fixtures had an unresolvable side and only 22 ever reached the DB
//     — the real cause of the "empty sections" and the short schedule.
//   · The codes that DO exist collide with nation TLAs: Columbus Crew emits
//     "COL" (Colombia), Portland Timbers "POR" (Portugal), Chicago Fire "CHI"
//     (Chile), Guadalajara "GUA" (Guatemala), Real Salt Lake "SAL" (El
//     Salvador). getFlag() therefore hung a Colombian flag on Columbus Crew, and
//     the static WC group map put it in World Cup Group K.
//
// The fix, per deployment config:
//   · nation deployments (feedCodesAreNationTlas: true) — unchanged behaviour,
//     the feed code IS the identity.
//   · club deployments — the identity is the api-football TEAM ID (stable,
//     unique, always present). The stored `code` is a deterministic slug used
//     only as a short display label, and the badge comes from `Team.country`,
//     which the sync now reads from the feed. Nothing about a club is guessed.
// ─────────────────────────────────────────────────────────────────────────────

import { SPORT, type DeploymentConfig } from "@/lib/sportConfig";
import { nationFlag } from "@/lib/flags";

/** Country name (as api-football spells it) → flag emoji. Extend as deployments
 *  add host nations; unknown countries fall back to the neutral flag. */
const COUNTRY_FLAG: Record<string, string> = {
  USA: "🇺🇸",
  "United States": "🇺🇸",
  Canada: "🇨🇦",
  Mexico: "🇲🇽",
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return "🏳️";
  return COUNTRY_FLAG[country] ?? COUNTRY_FLAG[country.trim()] ?? "🏳️";
}

const STOPWORDS = new Set([
  "fc", "cf", "sc", "afc", "cd", "club", "de", "the", "city", "united",
]);

/**
 * Deterministic short code for a club, derived from its name. Pure function of
 * the name — the same club always produces the same code, across every run and
 * every deployment, so DB rows stay stable without a hand-maintained map.
 *
 * This is an internal identifier and a compact display label. It is NOT presented
 * as an official abbreviation anywhere.
 */
export function slugCode(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : words;

  let code: string;
  if (source.length >= 3) {
    code = source.slice(0, 3).map((w) => w[0]).join("");
  } else if (source.length === 2) {
    code = source[0].slice(0, 2) + source[1][0];
  } else {
    code = source[0]?.slice(0, 3) ?? "UNK";
  }
  return code.toUpperCase().padEnd(3, "X").slice(0, 4);
}

export interface FeedTeam {
  id: number;
  name: string;
  code?: string | null;
  country?: string | null;
}

export interface ResolvedTeam {
  /** Value written to Team.code — unique per deployment. */
  code: string;
  name: string;
  country: string;
  flagEmoji: string;
  /** Group letter, or "" when the format has no groups. */
  groupStage: string;
}

/**
 * Resolve a batch of feed teams to DB identities. Batch-scoped so slug
 * collisions between two clubs can be broken deterministically (by api-football
 * team id) rather than silently overwriting one another via the unique `code`.
 *
 * Returns a Map keyed by api-football team id — the ONLY key ingestion should
 * use, because it is the one identifier the feed always supplies.
 */
export function resolveTeams(
  teams: FeedTeam[],
  cfg: DeploymentConfig = SPORT,
): Map<number, ResolvedTeam> {
  const out = new Map<number, ResolvedTeam>();

  if (cfg.feedCodesAreNationTlas) {
    // Nation deployment (WC26): the feed code is the identity. Behaviour is
    // byte-for-byte what fixtureSync/seed did before — teams without a code are
    // simply absent, exactly as they were.
    for (const t of teams) {
      if (!t.code) continue;
      const code = t.code.toUpperCase();
      out.set(t.id, {
        code,
        name: t.name,
        country: t.country ?? "",
        flagEmoji: nationFlag(code),
        groupStage: cfg.teamGroups[code] ?? "",
      });
    }
    return out;
  }

  // Club deployment: identity is the team id; code is a derived label.
  const taken = new Map<string, number>(); // code → owning team id
  const ordered = [...teams].sort((a, b) => a.id - b.id); // stable across runs

  for (const t of ordered) {
    const base = slugCode(t.name);
    let code = base;
    // Deterministic collision break: append digits until free. Sorting by team
    // id above means the same club keeps the same suffix on every sync.
    for (let n = 2; taken.has(code) && taken.get(code) !== t.id; n++) {
      code = `${base.slice(0, 3)}${n}`;
    }
    taken.set(code, t.id);

    const country = t.country ?? "";
    out.set(t.id, {
      code,
      name: t.name,
      country,
      flagEmoji: countryFlag(country),
      // Club formats declare their groups in config; LC26's map is empty.
      groupStage: cfg.teamGroups[code] ?? "",
    });
  }
  return out;
}

/** Badge for an already-persisted team row. Nation deployments key off the code
 *  (FIFA TLA); club deployments key off the stored country. */
export function teamBadge(
  team: { code: string; country?: string | null },
  cfg: DeploymentConfig = SPORT,
): string {
  return cfg.feedCodesAreNationTlas ? nationFlag(team.code) : countryFlag(team.country);
}

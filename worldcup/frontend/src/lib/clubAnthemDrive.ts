// ─────────────────────────────────────────────────────────────────────────────
// LC26 club anthems — discovered from Drive, not from a hand-written manifest.
//
// WC26's 54 national anthems are enumerated file-by-file in lib/anthemManifest.ts.
// LC26's live in a folder tree that BK adds to as Suno tracks are produced, so a
// static manifest would go stale on every upload. This module walks the tree and
// derives the manifest at import time.
//
//   Anthems_LeaguesCup_2026/            1rapmjFdpd5VX_0Kb4s9vO6lJ25NW_Qn8
//     ├── 01_MLS_Clubs/                 1EtVyauH_ODiQRYJ3-VzaOOs-lEhwLJRD
//     ├── 02_LigaMX_Clubs/              1T0NEaXYsUyl6T8Kd0D43cap2za7oPVHX
//     └── 03_Tournament_Generic/        1DbTLDFJDacJqTUCF_fBcpAZvQ2PMqg-t
//
// Filename convention:  {Club Name} — _{Anthem Title}_ v{version}.mp3
//
// TRUTH GUARD (carries CR-1, CLAUDE.md gotcha): a file that cannot be matched to
// a real club is REPORTED, never guessed at and never attached to an arbitrary
// team. Tracks in 03_Tournament_Generic are tournament-wide and deliberately
// carry no club.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { listAudioFilesRecursive, type DriveFile } from "@/lib/driveFolder";

/** Root of the LC26 anthem tree. Env override so the id isn't a code change. */
export const LC26_ANTHEM_ROOT_FOLDER_ID =
  process.env.LC26_ANTHEM_FOLDER_ID ?? "1rapmjFdpd5VX_0Kb4s9vO6lJ25NW_Qn8";

/** Folder id → which side of the border a track belongs to. Used for hub
 *  grouping and to narrow club matching to the right league. */
export const LC26_ANTHEM_FOLDERS: Record<string, "MLS" | "LigaMX" | "GENERIC"> = {
  "1EtVyauH_ODiQRYJ3-VzaOOs-lEhwLJRD": "MLS",
  "1T0NEaXYsUyl6T8Kd0D43cap2za7oPVHX": "LigaMX",
  "1DbTLDFJDacJqTUCF_fBcpAZvQ2PMqg-t": "GENERIC",
};

/** Fallback when a folder id isn't one of the three known ones (BK may add
 *  more): infer from the folder NAME, else treat as generic. */
function segmentFor(file: DriveFile): "MLS" | "LigaMX" | "GENERIC" {
  const byId = LC26_ANTHEM_FOLDERS[file.parentFolderId];
  if (byId) return byId;
  const n = file.parentFolderName.toLowerCase();
  if (n.includes("mls")) return "MLS";
  if (n.includes("ligamx") || n.includes("liga_mx") || n.includes("liga mx")) return "LigaMX";
  return "GENERIC";
}

export interface ParsedAnthemFile {
  driveFileId: string;
  fileName: string;
  segment: "MLS" | "LigaMX" | "GENERIC";
  /** Club name as written in the filename ("" for generic tracks). */
  clubName: string;
  /** Anthem title, underscores and version suffix stripped. */
  title: string;
  version: string | null;
}

/**
 * Parse `{Club Name} — _{Anthem Title}_ v{version}.mp3`.
 *
 * Tolerant on purpose — filenames are hand-made:
 *   · separator may be an em dash, en dash, or hyphen, with or without spaces
 *   · the underscores around the title are optional
 *   · the version suffix is optional
 * A file with no separator is treated as title-only (no club), which routes it
 * to the "unmatched" report rather than being attached to a guessed club.
 */
export function parseAnthemFileName(fileName: string): { clubName: string; title: string; version: string | null } {
  // Strip extension
  let base = fileName.replace(/\.(mp3|m4a|wav|aac|ogg)$/i, "").trim();

  // Trailing version marker: " v2", " v1.1", " V3"
  let version: string | null = null;
  const vMatch = base.match(/\s+[vV](\d+(?:\.\d+)?)\s*$/);
  if (vMatch) {
    version = vMatch[1];
    base = base.slice(0, vMatch.index).trim();
  }

  // Club/title separator. The em/en dash is the CONVENTION and is tried first;
  // a spaced hyphen is only a fallback when no dash is present. Order matters:
  // "U.N.A.M. - Pumas — _Goya_" contains a spaced hyphen INSIDE the club name,
  // and a single alternation regex took the leftmost match, splitting it into
  // club "U.N.A.M." / title "Pumas — _Goya". The DB name is "U.N.A.M. - Pumas".
  let clubName = "";
  let title = base;
  const sep = base.match(/\s*[—–]\s*/) ?? base.match(/\s+-\s+/);
  if (sep && sep.index !== undefined) {
    clubName = base.slice(0, sep.index).trim();
    title = base.slice(sep.index + sep[0].length).trim();
  }

  // Title is conventionally wrapped in underscores: _Crew Till I Die_
  title = title.replace(/^_+/, "").replace(/_+$/, "").trim();
  // Any remaining underscores are word separators in a slugged name.
  if (!title.includes(" ") && title.includes("_")) title = title.replace(/_/g, " ").trim();

  return { clubName, title, version };
}

/** Normalise for matching: lowercase, strip accents, punctuation and noise words. */
const NOISE = new Set(["fc", "cf", "sc", "afc", "cd", "club", "de", "the", "deportivo"]);
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(" ")
    .trim();
}

// Common club acronyms/short names → the club's full name as api-football spells
// it. These are naming ALIASES, not data: each maps a well-known abbreviation to
// exactly one real club, and anything not listed here simply fails to match and
// is reported. Add an entry when a filename legitimately uses a short form.
const CLUB_ALIASES: Record<string, string> = {
  lafc: "Los Angeles FC",
  "la fc": "Los Angeles FC",
  nycfc: "New York City FC",
  nyc: "New York City FC",
  rsl: "Real Salt Lake",
  "inter miami cf": "Inter Miami",
  chivas: "Guadalajara Chivas",
  guadalajara: "Guadalajara Chivas",
  pumas: "U.N.A.M. - Pumas",
  unam: "U.N.A.M. - Pumas",
  america: "Club America",
  tigres: "Tigres UANL",
  pachuca: "CF Pachuca",
  queretaro: "Club Queretaro",
  tijuana: "Club Tijuana",
  xolos: "Club Tijuana",
  santos: "Santos Laguna",
  "atletico san luis": "Atletico San Luis",
  "san luis": "Atletico San Luis",
  juarez: "FC Juarez",
  dallas: "FC Dallas",
  cincinnati: "FC Cincinnati",
  "minnesota united": "Minnesota United FC",
  "orlando city": "Orlando City SC",
  nashville: "Nashville SC",
  vancouver: "Vancouver Whitecaps",
  portland: "Portland Timbers",
  philadelphia: "Philadelphia Union",
  chicago: "Chicago Fire",
  columbus: "Columbus Crew",
  seattle: "Seattle Sounders",
};

export interface AnthemMatch extends ParsedAnthemFile {
  /** DB Team.id, or null for generic/unmatched. */
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  matchConfidence: "exact" | "contains" | "tokens" | "none";
}

/**
 * Match parsed files to DB teams by NAME. Never guesses: a file that doesn't
 * clear a real threshold comes back with teamId null and confidence "none", and
 * the caller reports it instead of importing it against the wrong club.
 */
export async function matchFilesToClubs(parsed: ParsedAnthemFile[]): Promise<AnthemMatch[]> {
  const teams = await prisma.team.findMany({
    where: { NOT: { code: "TBD" } },
    select: { id: true, code: true, name: true, country: true },
  });
  const normed = teams.map((t) => ({ ...t, n: norm(t.name), tokens: new Set(norm(t.name).split(" ")) }));

  return parsed.map((p) => {
    if (p.segment === "GENERIC" || !p.clubName) {
      return { ...p, teamId: null, teamCode: null, teamName: null, matchConfidence: "none" as const };
    }

    // Narrow to the right side of the border when the folder says so — stops a
    // Mexican club matching a similarly-named MLS one and vice versa.
    const wantCountry = p.segment === "LigaMX" ? "Mexico" : null;
    const pool = wantCountry
      ? normed.filter((t) => t.country === wantCountry)
      : p.segment === "MLS"
        ? normed.filter((t) => t.country !== "Mexico")
        : normed;
    const candidates = pool.length > 0 ? pool : normed;

    let q = norm(p.clubName);
    if (!q) return { ...p, teamId: null, teamCode: null, teamName: null, matchConfidence: "none" as const };
    // Resolve a known abbreviation to the club's full feed name before matching.
    if (CLUB_ALIASES[q]) q = norm(CLUB_ALIASES[q]);

    const exact = candidates.find((t) => t.n === q);
    if (exact) return { ...p, teamId: exact.id, teamCode: exact.code, teamName: exact.name, matchConfidence: "exact" as const };

    const contains = candidates.find((t) => t.n.includes(q) || q.includes(t.n));
    if (contains) return { ...p, teamId: contains.id, teamCode: contains.code, teamName: contains.name, matchConfidence: "contains" as const };

    // Token overlap — requires EVERY query token to appear in the team name, so
    // "Chivas" matches "Guadalajara Chivas" but "Real Salt Lake" never matches
    // "Real Madrid". Ambiguous (>1 hit) is treated as no match.
    const qTokens = q.split(" ").filter(Boolean);
    const hits = candidates.filter((t) => qTokens.every((tok) => t.tokens.has(tok)));
    if (hits.length === 1) {
      return { ...p, teamId: hits[0].id, teamCode: hits[0].code, teamName: hits[0].name, matchConfidence: "tokens" as const };
    }

    return { ...p, teamId: null, teamCode: null, teamName: null, matchConfidence: "none" as const };
  });
}

export interface DiscoveryResult {
  ok: boolean;
  error?: string;
  rootFolderId: string;
  foldersVisited: { id: string; name: string; fileCount: number }[];
  matches: AnthemMatch[];
}

/** Walk the LC26 anthem tree, parse every filename, and match to clubs. */
export async function discoverClubAnthems(rootFolderId = LC26_ANTHEM_ROOT_FOLDER_ID): Promise<DiscoveryResult> {
  const listed = await listAudioFilesRecursive(rootFolderId, { rootName: "Anthems_LeaguesCup_2026" });
  if (!listed.ok) {
    return { ok: false, error: listed.error, rootFolderId, foldersVisited: listed.foldersVisited, matches: [] };
  }

  const parsed: ParsedAnthemFile[] = listed.files.map((f) => {
    const { clubName, title, version } = parseAnthemFileName(f.name);
    return {
      driveFileId: f.id,
      fileName: f.name,
      segment: segmentFor(f),
      clubName,
      title: title || f.name.replace(/\.[^.]+$/, ""),
      version,
    };
  });

  const matches = await matchFilesToClubs(parsed);
  return { ok: true, rootFolderId, foldersVisited: listed.foldersVisited, matches };
}

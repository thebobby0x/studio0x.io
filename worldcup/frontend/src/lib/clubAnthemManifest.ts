// ─────────────────────────────────────────────────────────────────────────────
// Club-anthem manifest — the Leagues Cup 2026 counterpart to ANTHEM_MANIFEST.
//
// LC26 is a CLUB tournament, so "anthems" are club songs (BK has an Inter Miami
// track; more via Suno). Same single-source-of-truth pattern as the national
// manifest: one entry per club song; the anthem module picks THIS list when
// SPORT.features.anthems === "club".
//
// TRUTH GUARD (carries the CR-1 fix): entries here are the ONLY source. No seed
// path may synthesize a placeholder. A club with no entry simply shows
// "coming soon" — never a stock/SoundHelix track. Do NOT add an entry until its
// real Drive file id exists (an empty/invalid id must never be committed).
//
// To add a club song: drop one entry below with its real Google Drive file id
// and exact title, then run the anthem re-import for the LC26 deployment.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClubAnthemSource {
  driveFileId: string;
  /** api-football club code/slug for the club (the LC26 entity key). */
  clubCode: string;
  /** Which side of the border — for grouping in the hub. */
  league?: "MLS" | "LigaMX";
  title: string;
  durationSecs?: number;
  artistCredit?: string;
}

// Populated by BK as Suno tracks are produced. Inter Miami is first — its entry
// is intentionally NOT stubbed here because a real driveFileId is required and
// none may be fabricated. Shape to copy when adding:
//
//   { driveFileId: "<real-drive-id>", clubCode: "MIA", league: "MLS",
//     title: "<exact title>", durationSecs: 180 },
//
export const CLUB_ANTHEM_MANIFEST: ClubAnthemSource[] = [
  // (empty — add club songs here as their Drive files are ready)
];

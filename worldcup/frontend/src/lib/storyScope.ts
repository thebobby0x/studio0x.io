// ─────────────────────────────────────────────────────────────────────────────
// Which NewsStory rows belong to THIS deployment.
//
// WHY (LC26, 8/4): the prompts that wrote "sudden-death World Cup knockout
// showdown" onto a Leagues Cup league-phase fixture are fixed, but the stories
// they already wrote sit in the database and keep rendering. Generation is
// idempotent by design — it SKIPS any fixture that already has a story — so a
// corrected prompt never reaches them on its own. Until an admin runs
// "Regenerate News", the read path must not surface them.
//
// The rule turns on `tournamentId`, added the same day:
//   · rows tagged with this deployment's id  → always ours.
//   · UNTAGGED rows ("")                     → written before the column existed.
//     On WC26 that legacy content is correct and must keep showing. On any other
//     deployment the same rows are, by definition, World Cup copy — the only
//     thing that could have written them — so they are excluded.
//
// Use `storyScope()` in every READ path. Write paths stamp SPORT.id directly.
// ─────────────────────────────────────────────────────────────────────────────

import { SPORT } from "@/lib/sportConfig";

/** Prisma `where` fragment scoping NewsStory rows to this deployment. */
export function storyScope(): { tournamentId: { in: string[] } } {
  return {
    tournamentId: {
      in: SPORT.id === "worldcup" ? [SPORT.id, ""] : [SPORT.id],
    },
  };
}

/** True when a story row should be shown on this deployment. */
export function isOwnStory(story: { tournamentId: string }): boolean {
  return story.tournamentId === SPORT.id || (SPORT.id === "worldcup" && story.tournamentId === "");
}

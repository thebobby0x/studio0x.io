// ─────────────────────────────────────────────────────────────────────────────
// Tournament context for AI prompts — ONE place every Claude prompt gets its
// "what am I covering?" line from.
//
// WHY (LC26 launch bug, 2026-08-04): every prompt hardcoded the string "the 2026
// World Cup". The Leagues Cup deployment ran the same code, so Claude was told it
// was covering the World Cup while being handed MLS-vs-Liga-MX club fixtures. It
// wrote what it was told: the two stories in the LC26 DB were headlined
// "Crew and Atlas meet in sudden-death World Cup knockout showdown" and
// "Tigres UANL and Real Salt Lake clash in knockout survival battle" — a World
// Cup framing AND an invented knockout stage, on August league-phase fixtures.
//
// Nominative use only (CLAUDE.md BRANDING): prompts may name the tournament
// factually in editorial copy. They must never claim the product is official.
// ─────────────────────────────────────────────────────────────────────────────

import { SPORT } from "@/lib/sportConfig";

/** e.g. "Leagues Cup 2026" / "World Cup 2026". Use in prompt prose. */
export const EVENT_NAME = SPORT.eventName;

/** "club" competitions must never be described in nation-vs-nation terms. */
export const IS_CLUB = SPORT.entityKind === "club";

/**
 * The standing context block for every editorial prompt. Facts only — competitors,
 * what a "team" is, and the invent-bans required by the CONTENT TRUTH rule.
 */
export function tournamentBrief(): string {
  const lines = [
    `TOURNAMENT: ${EVENT_NAME}.`,
  ];

  if (SPORT.id === "leaguescup") {
    lines.push(
      `FORMAT: a club competition between Major League Soccer (USA/Canada) and Liga MX (Mexico) clubs, played at MLS and Liga MX home venues across the United States, Canada and Mexico in August 2026.`,
      `The competitors are CLUBS, not national teams. Never describe a fixture as a national-team game, never call a club by a country's name, and never reference the World Cup, national squads, group letters, or FIFA tournament structure.`,
    );
  } else if (IS_CLUB) {
    lines.push(`The competitors are CLUBS, not national teams — never describe a fixture as a national-team game.`);
  } else {
    lines.push(`The competitors are NATIONAL TEAMS.`);
  }

  lines.push(
    `Do not name, imply or compare to any other tournament unless that tournament appears in the data supplied below.`,
  );
  return lines.join("\n");
}

/** Short inline form for prompts that only need the name in a sentence. */
export function coveringLine(role = "AI football analyst"): string {
  return `You are studio0x's ${role} covering the ${EVENT_NAME}.`;
}

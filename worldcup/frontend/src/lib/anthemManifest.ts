// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for every Studio0x anthem backed by a Google Drive file.
//
// Before this existed, anthem sources were split across two batch routes
// (batch-anthem = original 8 teams + 4 FIFA, batch-import-anthems = 12 newer
// teams), so a full re-import was a 3-endpoint dance and titles were duplicated
// in a third place (anthem-relink). Everything now derives from this one list.
//
// teamCode omitted  → FIFA universal track (stored with teamId = null).
// To add an anthem: drop one entry here. Re-import wipes + reloads from this list.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnthemSource {
  driveFileId: string;
  teamCode?: string; // omit for FIFA universal tracks
  title: string;
  durationSecs?: number;
  artistCredit?: string;
}

export const ANTHEM_MANIFEST: AnthemSource[] = [
  // ── Team anthems (original 8) ──
  { driveFileId: "1_s8nMbjqvKa1SaWegM21WsjE6Q1MqC4M", teamCode: "ARG", title: "Bombo Murguero", durationSecs: 193 },
  { driveFileId: "1EPfXfQ3oy-7fqmO8V0OhLOWDsRuOaG8Q", teamCode: "BIH", title: "Zmajevi Na Pistu Bosna i Hercegovina", durationSecs: 328 },
  { driveFileId: "1A8W74-H11Os4tn26T_q6w4WqIWkmVVfG", teamCode: "CAN", title: "Rouges dans Brume", durationSecs: 284 },
  { driveFileId: "1nUal-cDanLtEA_6qZr5QtNHNtVqJqUeP", teamCode: "ENG", title: "England All Da Way", durationSecs: 170 },
  { driveFileId: "14Q8er7YpnkhuMHQlZEcK6xi9IGsxXqEb", teamCode: "FRA", title: "Bleus dans Brume", durationSecs: 277 },
  { driveFileId: "1nFD_kvcY62PWVlPXDBOVINcRBDtBs8PI", teamCode: "MEX", title: "Bandera Subiendo (En Vivo de Miami)", durationSecs: 315 },
  { driveFileId: "16D7EMWYmOOGGaA_QfLq7yDPy5SErn55d", teamCode: "RSA", title: "Wêreldspel Anthem (Afrikaanse Terrace Remix)", durationSecs: 485 },
  { driveFileId: "1hkwBRvV417qDOiZQvkeGEvJs4Rk_XJWk", teamCode: "USA", title: "Back When It Hit Like That", durationSecs: 276 },

  // ── Team anthems (12 newer countries) ──
  { driveFileId: "1HSByvlXit1cS9RpA5D9p0SEvNUV7Iaj0", teamCode: "BEL", title: "Rode Duivels 2026", durationSecs: 180 },
  { driveFileId: "1tYgNe7cZMF_z40Z2B2VeuwDYcqT-TPaS", teamCode: "BRA", title: "Hexa 2026", durationSecs: 180 },
  { driveFileId: "1EBtzMp8jHmgWI0a9ooLe9FhABrCEgXY4", teamCode: "CRC", title: "Pura Vida, mae", durationSecs: 180 },
  { driveFileId: "1zYek9gP5RXM7_JweQuyJoFlUoPzGz-Lu", teamCode: "ECU", title: "La Tri en el Mundo", durationSecs: 180 },
  { driveFileId: "1dSk0XiECpehe6m_MY3ejNjB03b707_z4", teamCode: "EGY", title: "Pharaohs 2026", durationSecs: 180 },
  { driveFileId: "1TcKMBD8zhxzNhHtDxKSd6zl7QCIyDUHR", teamCode: "JPN", title: "Blue Wave 2026", durationSecs: 180 },
  { driveFileId: "1j9E2SvbRffwKC7CGc81pF6HNqJnG_0Qo", teamCode: "MAR", title: "Lions of Atlas 2026", durationSecs: 180 },
  { driveFileId: "1ZXwlQQiVOX6Yen6_p4N2YdIwrLcIKaH8", teamCode: "NED", title: "Oranje Machine 2026", durationSecs: 180 },
  { driveFileId: "1dNpHyaa-J50RoJQO8rwCduScKM-5P8wL", teamCode: "PAN", title: "La Marea Roja", durationSecs: 180 },
  { driveFileId: "1MbRpxV5rcrYcHVvwFXx1KYcvLbbfjMd7", teamCode: "QAT", title: "Al-Annabi Anthem 2026", durationSecs: 180 },
  { driveFileId: "1MPjjmgLHChgfdOYTbOqi5MXfNi-v2XTi", teamCode: "URU", title: "Celeste en la Calle", durationSecs: 180 },
  { driveFileId: "15432Eu6Q1AoP6WBGc1jylTX2MJr265qr", teamCode: "UZB", title: "Olgʼa, Oʻzbekiston!", durationSecs: 180 },

  // ── FIFA universal tracks (no team) ──
  { driveFileId: "1ghtOnRMhDf4mWLjYDeJNx5SMKSpXb28l", title: "We Already Won", durationSecs: 293 },
  { driveFileId: "1LYcYGLwU-H3P3CNrcfEKdGkhgkPRAKdh", title: "One Champion Above All Champions", durationSecs: 250 },
  { driveFileId: "1qCkEY0HwxKah8awyJrX6jIRkjKX92iN9", title: "There Can Only Be One Number One", durationSecs: 151 },
  { driveFileId: "1pCgCapwESphxhdhgo99_zT7G4UHsWWX5", title: "World Cup Kings - We Ballin", durationSecs: 293 },
];

// Derived map of team code → canonical title, for the relink/title-repair route.
export const CODE_TO_TITLE: Record<string, string> = Object.fromEntries(
  ANTHEM_MANIFEST.filter((a) => a.teamCode).map((a) => [a.teamCode!, a.title])
);

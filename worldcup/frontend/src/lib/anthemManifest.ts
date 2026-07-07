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
  // Costa Rica (CRC) did not qualify for WC26 — moved to the future "NON WC26
  // Anthems" page. Drive file "Pura Vida, mae" preserved; just excluded here.
  { driveFileId: "1zYek9gP5RXM7_JweQuyJoFlUoPzGz-Lu", teamCode: "ECU", title: "La Tri en el Mundo", durationSecs: 180 },
  { driveFileId: "1dSk0XiECpehe6m_MY3ejNjB03b707_z4", teamCode: "EGY", title: "Pharaohs 2026", durationSecs: 180 },
  { driveFileId: "1TcKMBD8zhxzNhHtDxKSd6zl7QCIyDUHR", teamCode: "JPN", title: "Blue Wave 2026", durationSecs: 180 },
  { driveFileId: "1j9E2SvbRffwKC7CGc81pF6HNqJnG_0Qo", teamCode: "MAR", title: "Lions of Atlas 2026", durationSecs: 180 },
  { driveFileId: "1ZXwlQQiVOX6Yen6_p4N2YdIwrLcIKaH8", teamCode: "NED", title: "Oranje Machine 2026", durationSecs: 180 },
  { driveFileId: "1dNpHyaa-J50RoJQO8rwCduScKM-5P8wL", teamCode: "PAN", title: "La Marea Roja", durationSecs: 180 },
  { driveFileId: "1MbRpxV5rcrYcHVvwFXx1KYcvLbbfjMd7", teamCode: "QAT", title: "Al-Annabi Anthem 2026", durationSecs: 180 },
  { driveFileId: "1MPjjmgLHChgfdOYTbOqi5MXfNi-v2XTi", teamCode: "URU", title: "Celeste en la Calle", durationSecs: 180 },
  { driveFileId: "15432Eu6Q1AoP6WBGc1jylTX2MJr265qr", teamCode: "UZB", title: "Olgʼa, Oʻzbekiston!", durationSecs: 180 },

  // ── Team anthems (18 added Jul 7) ──
  { driveFileId: "1ZQVauyPuaw2uB_bLaI45NKgvhCM9vr1z", teamCode: "ALG", title: "Fennec Fire 2026" },
  { driveFileId: "1pQoAQIAupHkPpjf5O8Fd4n7WkPWSO8Cm", teamCode: "AUS", title: "The Socceroos" },
  { driveFileId: "1m88mXRJQ2eWc_kjbmbavJwGfMqiaMHZL", teamCode: "CIV", title: "Éléphants 2026" },
  { driveFileId: "1D6S-ro3uppU15Kp6_oBJQ6sKC0Abl4FQ", teamCode: "COL", title: "Caribe en la Casa" },
  { driveFileId: "1Thqq1fTXx_KRi-HdjxfaH2Zc1apWttJd", teamCode: "CRO", title: "Vatreni 2026" },
  { driveFileId: "1-ebwo4PAFGJ4gMhm4c6ZFQgjL3zDIS1_", teamCode: "ESP", title: "La Roja 2026" },
  { driveFileId: "1aAfnH0wayRKAxXEVSJwtHcZpjjni_uPc", teamCode: "GHA", title: "Black Star Drill" },
  { driveFileId: "143_wmreGvRAKpM2TbKKAMYwLGB48F3H1", teamCode: "HAI", title: "Grenadiye a l'aso" },
  { driveFileId: "1_ftQjAbvihBXvYLGW0fzJcNoM4Ma1_TA", teamCode: "IRN", title: "Ghadamgari (The Roaring Cheetah's)" },
  { driveFileId: "1QrZL3fi9_hqai0DnyIAtRkwu9Kk95rzV", teamCode: "IRQ", title: "Asoud el-Rafidain (The Lions of Mesopotamia)" },
  { driveFileId: "18nJTbqFDuMwxQIHP1ZZVXFvj_6vdEZqP", teamCode: "KOR", title: "Dae-Han-Min-Guk 2026" },
  { driveFileId: "1eMwupKOPNHFS0gUjv5n-PF36jEwK86bJ", teamCode: "KSA", title: "Ya Akhdar (The Green Falcon Anthem)" },
  { driveFileId: "1uvshrpO4kzSZt73HbTLSDgSUKVw9EjQ0", teamCode: "NZL", title: "Tuatara on the Pitch" },
  { driveFileId: "1NTZSgjjR-9N4aQV5bBHKwNmt4DQlU3bW", teamCode: "PAR", title: "Albirroja" },
  { driveFileId: "1BdAm2fF74gWbFnWg30vHKkIG0tflo50i", teamCode: "POR", title: "Bora Portugal" },
  { driveFileId: "1nM6BtJ_25_vuvdrbN--paaVbrpTwSmQD", teamCode: "SCO", title: "The Scottish Machine" },
  { driveFileId: "1jmVCyJoqzv6Q2JOOA5wsbKCBAvkeelEa", teamCode: "SEN", title: "Lions of Teranga (2026)" },
  { driveFileId: "1d25a8sujV6hLir8f5u21bTJryuDAyLWB", teamCode: "TUN", title: "Tunis Lelyom" },

  // ── Audition copies (owner is choosing between two versions) ──
  // Schema allows ONE anthem per team, so the second version of each pair is
  // imported UNLINKED (no teamCode) with its full filename as the title so both
  // are playable side-by-side in the hub. Once the owner picks: move the winner's
  // teamCode here if needed, delete the loser's entry, re-run finalize prune.
  { driveFileId: "12qYSPEBj0hfvMtUHFpTfGfmvREETQkrS", title: "AUS - Socceroos 2026 V1" },
  { driveFileId: "1uny3oG0-uOP0sEH2O0P4eS1GKQCAWkGb", title: "IRN - Ghadamgari (The Roaring Cheetah's) V1" },

  // ── FIFA universal tracks (no team) ──
  { driveFileId: "1ghtOnRMhDf4mWLjYDeJNx5SMKSpXb28l", title: "We Already Won", durationSecs: 293 },
  { driveFileId: "1LYcYGLwU-H3P3CNrcfEKdGkhgkPRAKdh", title: "One Champion Above All Champions", durationSecs: 250 },
  { driveFileId: "1qCkEY0HwxKah8awyJrX6jIRkjKX92iN9", title: "There Can Only Be One Number One", durationSecs: 151 },
  { driveFileId: "1pCgCapwESphxhdhgo99_zT7G4UHsWWX5", title: "World Cup Kings - We Ballin", durationSecs: 293 },
  { driveFileId: "1YDettNc0_eiR-gxFAxyEVSx78CY2_Yk5", title: "Winners Get To Toast" },
];

// Derived map of team code → canonical title, for the relink/title-repair route.
export const CODE_TO_TITLE: Record<string, string> = Object.fromEntries(
  ANTHEM_MANIFEST.filter((a) => a.teamCode).map((a) => [a.teamCode!, a.title])
);

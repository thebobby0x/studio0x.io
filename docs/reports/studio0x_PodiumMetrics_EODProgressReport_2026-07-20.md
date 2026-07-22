# studio0x · PodiumMetrics · EOD Progress Report · 2026-07-20

## 1. TL;DR
FIFA World Cup 2026 finished (Spain 1–0 Argentina, AET) — Deployment #1 of podiumMetrics is complete: 104 matches, a 120-minute final, ~50 PRs, two survived quota crises. Tonight ran a full 4-lens code postmortem (~27,650 LOC) and shipped the CRITICAL + HIGH fixes: security holes closed, the SoundHelix fake-anthem bug killed at the root, penalty-shootout columns added, and the Golden Boot verified 100% complete (Mbappé 10, Messi 8). Owner ran the squad seed (clean: 48 teams / 1,248 players) and the club seed, which surfaced a real data bug (club=nation, league="World Cup") — now guarded so no false claim displays, with the root fix documented for tomorrow. Strategic direction locked: structured module-by-module extraction (not a rebuild), F1 Wrapped next, then News Depot → WWC27 → Leagues Cup 2026.

Overall status: 🟡 Yellow — engine trustworthy and hardened, but club/league DATA is still wrong (guarded, not corrected) and two HIGH live-merge fixes (H-3/H-4) are deliberately deferred to supervised daylight.

## 2. ✅ Shipped / done today
| Item | Status | Notes |
|---|---|---|
| WC26 completed & data verified | Done | All 104 matches attributed; Golden Boot 100% (Mbappé 10, Messi 8) — verified against prod `/api/stats/boards` |
| 4-lens code postmortem | Done | truth / data-reliability / security / architecture over ~27,650 LOC → `docs/postmortem-2026-07-20.md` |
| Security hardening (PR #186) | Done | CR-2/CR-3/M-1..3: TTS text cap + server-derived cache key (open-wallet + poisoning); admin-gated boards `?fresh/?retryMissing/?debug`, `debug/*`, POST stories; capped story-expand; de-amplified commentary cache key. CI green, merged |
| Anthem truth fix — CR-1 (PR #186) | Done | Seed never writes SoundHelix placeholders; anthems manifest-owned; purges stock rows. The "fix-one-thing-anthems-revert" bug fixed at root |
| Data-integrity H-1/5/6/7 (PR #186) | Done | predict venue-sentinel guard; **added `Match.penHome/penAway`** (DB couldn't represent a shootout); no more hardcoded `elapsed=90` on ET heals; DNA metrics use confirmed goals only |
| Golden Boot goal backfill | Done | `?retryMissing` pass → coverage 92→96; remaining 8 event-less fixtures confirmed genuine 0-0 draws |
| Seed Full Squads (owner-run) | Done | 48 teams / 1,248 players / 0 errors — squad gap closed (verified via owner screenshot + admin response) |
| Club/league truth guard — H-2 (PR #187) | Done | `lib/clubData REAL_CLUB_WHERE` excludes `league="World Cup"` junk from leagues page + ClubWCImpact + ClubContributionIndex → honest "club data pending" instead of false claim. CI green, merged |
| Strategy docs | Done | `docs/extraction-plan.md`, `docs/roadmap-nextbuilds.md`, `docs/eod-2026-07-20.md`, CLAUDE.md state + EOD-report convention |

## 3. 🟡 In flight
| Item | Owner | State |
|---|---|---|
| Core extraction (constants→config, shared libs) | CC | Planned in `extraction-plan.md`; not started (Phase 1 is the first code task) |
| News Depot module (`modules/news/`) | CC | Scoped in `roadmap-nextbuilds.md`; not started |
| F1 Wrapped | CC / BK | Data path exists (podiumSchedule Jolpica sync); build not started |

## 4. ⛔ Blocked / needs input
| Item | Blocking | Needed |
|---|---|---|
| Real domestic club/league data | Seed route queries `league=1` (=World Cup) → wrong data | CC to rewrite `seedFromApi` (`/players?id=X&season=2025`, pick domestic entry); then BK to re-run (~1,248 api-football calls, SUPER_ADMIN session) |
| Ratings-based PPI™ | api-football `/fixtures/players` empty on current plan | BK: api-football plan-tier decision |
| H-3 (VAR score-down) + H-4 (DB-FT promotion) | Live-merge hot path — needs supervision | CC + BK together in daylight (deferred deliberately; no live match to protect now) |
| Leagues Cup 2026 build | api-football league id + coverage unconfirmed | CC to scope league id / coverage; BK to confirm plan covers it |

## 5. 🚩 Risk flags
1. **Club/league data is still wrong, only guarded.** Every player currently has club=nation, league="World Cup". The 3 main surfaces suppress it, but the DATA won't be real until `seedFromApi` is rewritten + re-run. Anything reading `player.club`/`league` outside the guarded three could still show junk.
2. **`team/[tla]` page still renders `p.club`** (the nation) next to each player — NOT covered by tonight's H-2 guard (which hit leagues/ClubWCImpact/ClubContributionIndex only). Milder than the false league superlative (shows "Argentina" as a club, no false claim), but still placeholder-as-fact. (unverified: whether other minor surfaces read raw club/league.)
3. **H-3/H-4 live-merge correctness bugs remain in prod** (VAR-disallowed goal can stick at inflated score; a DB-FT match can show "NS 0-0" if the feed holds out-of-window LIVE). No live matches now, so zero current impact — but they must land before the next live tournament.
4. **`wc2026studio0x` legacy secret is still compiled into the client bundle** (AdminDashboard). Benign only while it's the public legacy value; becomes a real leak if a rotated `SEED_SECRET` is ever sent the same way. Not fixed tonight. (unverified: whether `SEED_SECRET` is set in Vercel env.)
5. **Squad seed `notFound: 515`** on the club run — ~41% of players didn't name-match api-football. The domestic-club rewrite should also improve matching (fuzzy/id-based), or those players stay clubless.
6. **`STATUS_MAP` still duplicated 6× and already diverged** across routes — a latent wrong-status bug until the Phase 1 extraction consolidates it.

## 6. 📋 Tomorrow's punch list (priority-ordered)
1. **CC:** Rewrite `seedFromApi` to pull DOMESTIC clubs (`/players?id=X&season=2025`, skip the World Cup/national-team entry); verify a sample. → **BK:** re-run "Seed Clubs (Live API)", then re-run boards. Unlocks real La-Liga-vs-PL bragging rights. (Fixes flags #1, #2, #5.)
2. **CC + BK (supervised):** Land H-3 (no blind score max-merge) and H-4 (DB-FT promotion) — finish the postmortem HIGHs. (Flag #3.)
3. **CC:** Extraction Phase 1 — constants→config (`STATUS_MAP`, `TEAM_GROUPS`, kickoff-window, `league/season` → `lib/sportConfig.ts`). Small, unblocks everything. (Flag #6.)
4. **CC:** Kick off the **News Depot** module (`modules/news/`), WC26 as first consumer.
5. **CC / BK:** F1 Wrapped data spike (Jolpica vs OpenF1 for 2026).
6. **CC:** Remove the client-bundled `wc2026studio0x` secret; **BK:** confirm `SEED_SECRET` set in Vercel. (Flag #4.)
7. **BK:** api-football plan decision (unlocks PPI™); scope Leagues Cup 2026 league id.

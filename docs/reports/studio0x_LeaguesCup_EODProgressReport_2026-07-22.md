# studio0x · LeaguesCup · EOD Progress Report · 2026-07-22

## 1. TL;DR
Kicked off the **Leagues Cup 2026 (LC26)** build (tournament starts Aug 4). Confirmed the
strategy: LC26 is the **same sport as WC26, a new config instance — not a fork**, so tonight
laid the config foundation and translated BK's six notes into a concrete spec. Shipped (to
**draft PR #192**, tsc-clean, WC26 behavior unchanged): `lib/sportConfig.ts` (the constants→
config extraction), the six new ™-metric formulas as pure reviewable functions, a club-anthem
manifest scaffold, and a full build-plan doc. All heavier feature work (Roundtable radio,
travel/national-mirror/news reframes) is deliberately queued behind two owner inputs.

Overall status: 🟡 Yellow — real foundation shipped and verified, but the build can't touch
real data until BK confirms the **api-football Leagues Cup league id + coverage** and the
**deployment topology** (new deployment vs re-point). Nothing merged to the live WC26 app.

## 2. ✅ Shipped / done today
| Item | Status | Notes |
|---|---|---|
| LC26 build plan | Done | `docs/leaguescup-build-plan.md` — the six notes → specs + ™-metric proposals + blockers |
| `lib/sportConfig.ts` foundation | Draft PR #192 (tsc ✓, CI pending) | league/season/eventName/entityKind/feature-flags in one config; `TOURNAMENT` env selects; **defaults to WC26 exact values → behavior-preserving** |
| Admin seed route wired to config | Draft PR #192 (tsc ✓) | `api/seed/route.ts` imports `AF_LEAGUE/AF_SEASON`; identical behavior on WC26 |
| Six new ™ metric formulas | Draft PR #192 (tsc ✓) | Border Clash, Cross-Border Pedigree, WC Carryover, National Mirror, Rivalry Heat, Summit Path — pure fns, return `null` not fake 0 (CONTENT TRUTH). **v1 drafts, need BK sign-off** |
| Club-anthem manifest scaffold | Draft PR #192 (tsc ✓) | `lib/clubAnthemManifest.ts` — club-keyed, empty by design (no fabricated Drive ids), carries CR-1 truth guard |
| Time-awareness hooks (side task) | Done, live in session | SessionStart+UserPromptSubmit inject real time + elapsed gap; durable-repo option paused at BK's request |

## 3. 🟡 In flight
| Item | Owner | State |
|---|---|---|
| WC-hardcoding code map (Explore agent) | CC | Launched; informs the precise travel/anthem/mirror edits |
| `fixtureSync.ts` league/season → config | CC + BK | Pointer comment left; it's the live/cron hot path → **supervised-daylight swap** per postmortem |
| Roundtable live radio auto-play (#4) | CC | Spec written; frontend build queued (needs code map + a design pass) |
| National-mirror + team-travel + news build-up (#2/#3/#5) | CC | Spec'd; scaffolds await the code map + real LC26 data |

## 4. ⛔ Blocked / needs input
| Item | Blocking | Needed |
|---|---|---|
| All LC26 real-data wiring | api-football league id + 2026 coverage unconfirmed | **BK:** dashboard → Ids → Leagues → "Leagues Cup" → id + confirm coverage; set `LEAGUES_CUP_LEAGUE_ID` |
| Deployment shape | topology undecided | **BK:** new deployment (own Neon DB + subdomain — CC's rec) vs re-point WC26 |
| Club songs | no Drive file ids yet | **BK:** Suno tracks + Drive ids (Inter Miami first) |
| ™ metric formulas | v1 drafts unreviewed | **BK:** approve/edit the six formulas in the build-plan doc |

## 5. 🚩 Risk flags
1. **Everything real-data is gated on the league id.** The config guards feed calls
   (`isConfigured()` false while id ≤ 0), so nothing fires against a bogus league — but no
   LC26 data flows until BK provides it. ~13 days to Aug 4; this is the critical path.
2. **`fixtureSync.ts` swap deferred (correctly).** It's the live-merge hot path the
   postmortem flagged; changing it needs supervised daylight. Left as a comment, not code.
3. **™ metric formulas are unreviewed v1 drafts.** Weights are guesses in named consts;
   they must not surface as "studio0x metrics" until BK signs off (they compute honestly from
   real inputs, but the *design* is provisional).
4. **Deployment topology unresolved** blocks DNS/env/DB setup — the long-lead-time items for
   an Aug 4 launch. Recommend deciding this first thing.
5. **Scope realism:** six notes in 13 days is achievable ONLY as config instances on the clean
   core. If the api-football coverage for Leagues Cup is thin (like `/fixtures/players` was for
   WC), the player-level metrics (#3, WC Carryover) degrade to event-only — same diligence as
   the WC plan check.

## 6. 📋 Tomorrow's punch list (priority-ordered)
1. **BK:** Confirm api-football **Leagues Cup league id + coverage**; set `LEAGUES_CUP_LEAGUE_ID`. (Unblocks flags #1, #5.)
2. **BK:** Decide **deployment topology** (new deployment vs re-point). (Flag #4 — long lead time.)
3. **BK:** Review **draft PR #192** (foundation + metrics + plan) and approve/edit the six ™ formulas.
4. **CC + BK (supervised):** Swap `fixtureSync.ts` to `sportConfig` (finish Phase 1 on the hot path). (Flag #2.)
5. **CC:** With league id in hand — build the LC26 sportConfig for real, seed a club roster sample, wire one metric end-to-end as proof.
6. **CC:** Roundtable radio auto-play (#4) frontend build + national-mirror scaffold (#3) once the code map lands.
7. **BK:** Start Suno club songs (Inter Miami → Drive) for the club-anthem manifest.

*Nothing merged to the live WC26 showcase tonight. All code is on draft PR #192 for morning review.*

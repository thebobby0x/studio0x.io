# podiumMetrics — World Cup 2026 Postmortem & Hardening Plan (2026-07-20)

Deployment #1 (FIFA World Cup 2026) is complete. Spain 1–0 Argentina (Ferrán
Torres, 106'). The platform ran the full 104-match tournament including a
120-minute final, survived two api-football quota crises, and shipped ~40 PRs
during live matches. This document is the top-to-bottom postmortem: a
four-lens code audit (truth, data-reliability, security, architecture) plus a
data-verification plan, written to make the platform 110% stable and truthful
before the next deployment (F1 / UCL).

Method: four parallel deep-read audit agents, each covering the whole
`worldcup/frontend` codebase (~27,650 LOC) through one lens. Findings below are
de-duplicated and re-ranked into a single priority order. Raw per-lens reports
are archived in the session scratchpad.

---

## Top-line verdict

The platform is **truthful in its live match data and AI content** — every AI
prompt carries invent-bans (verified, no gaps), simulated team-stats are
correctly quarantined behind `dataSources` tags and hidden by every consumer,
and reconstructed goals are disclosed. The engine is sound.

The real problems cluster in three places:
1. **Placeholder content that ships as real fact** — the anthems are stock demo
   music; club/league fields render nation-as-club junk with authoritative
   claims layered on top.
2. **Unauthenticated cost/quota levers** — the incident-response debug params
   and the TTS endpoint are open doors to drain the API budget or the
   ElevenLabs balance, and TTS audio can be cache-poisoned.
3. **Copy-paste of domain logic** — core feed-mapping and tournament constants
   are duplicated 3–6× and *already diverging into bugs*; this is the single
   biggest obstacle to re-skinning for F1/UCL.

Nothing here caused a user-visible falsehood during the tournament that wasn't
disclosed, but several are latent landmines for the next deployment.

---

## CRITICAL — fix before anything else (fake data as fact, or open money/quota taps)

**CR-1 · Anthems are SoundHelix stock demo tracks presented as real 2026 anthems.**
`api/seed/route.ts:250-267,562-566`, `schema.prisma:281`. Every team without an
uploaded anthem is (re)seeded to a `soundhelix.com` demo mp3, titled e.g.
"¡Viva México! (World Cup Anthem 2026)" with a fabricated `artistCredit
"Suno AI × Studio0x"`. `AnthemHub` renders these with no "demo" indicator and
builds social-share copy from them. A fan hears random stock music as Mexico's
anthem and can broadcast it. **This is the clearest violation of the truth rule
in the codebase.** Fix: never seed a placeholder audio URL — no-real-anthem →
existing "coming soon" state; drop the default `artistCredit`.

**CR-2 · Public, unauthenticated quota-drain: `stats/boards?retryMissing=1` / `?fresh=1`.**
`stats/boards/route.ts:109,113,119,156,160,79`. Anyone can loop the URL to
bypass the 15-min cache AND the 3-day skip-guard, issuing an uncached
`fixtures/events` call for every event-less FT match on every hit — draining
the daily api-football budget in minutes. This is exactly the quota-crisis
class we fought live. (These params were added by me under incident pressure
and never gated.) Fix: `isAdminAuthed(req)` on `fresh`/`retryMissing`/`debug`.

**CR-3 · TTS endpoint is an open ElevenLabs wallet + a cache-poisoning vector.**
`api/ai/tts/route.ts`. (a) No text-length cap and no auth: scripted POSTs of
max-length text on the expensive `eleven_v3` model = attacker-controlled dollar
burn. (b) The blob key uses a **client-supplied** `storyId` with
`allowOverwrite:true`, and those ids are derivable (`commentary-<matchId>-…`,
story ids). An attacker can overwrite the cached audio *every other visitor
hears* for a known line. Fix: cap `rawText.length`; derive the blob key
server-side from a hash of the trusted text (ignore client `storyId`); only
overwrite when the existing blob is absent or byte-identical.

**CR-4 · Nightly stats-ingest cron can permanently half-ingest a fixture.**
`cron/ingest-stats/route.ts:8,33-35`. `maxDuration=60` wraps an in-process
ingest that can need 300s (the child's own 300 is inert when called as a
function). On timeout, any fixture with ≥1 `PlayerMatchStat` row is treated as
"done" forever (`alreadyIngested` skip) — its remaining players are lost until
a manual `?force=true`, and the blob-eviction + weather steps never run. Fix:
paginate/cursor the ingest (K fixtures per invocation), track completion
per-fixture not "has ≥1 row", or move to a 300s job. (Moot for PPI while the
players endpoint is empty on our plan, but this is the live-data ingest for the
next plan tier — fix before relying on it.)

---

## HIGH — data-integrity & correctness (wrong data can display, disclosed or not)

**H-1 · `predict` page shows the "World Cup Stadium" DB sentinel as a real venue.**
`predict/page.tsx:811-813` — the only surface missing the
`venue !== "World Cup Stadium"` guard every other page has. Fix: reuse the
guard / centralize a `displayVenue()` helper.

**H-2 · Club/League junk renders as authoritative claims on 6 surfaces.**
`leagues/page.tsx` (groups by `league` → mints a bogus "World Cup" league
bucket), `ClubWCImpact.tsx` (makes claims like "{league} clubs account for
{pct}% of all tournament goals — the clearest argument for global supremacy"),
`ClubContributionIndex`, `PlayerPerformanceIndex`, `TournamentXMetrics`,
`team/[tla]`. Empty is handled; legacy nation-as-club rows are not. Fix: a
`verified` flag / real-club whitelist before render; suppress the ClubWCImpact
narrative when unverified. (Ties to the data-backfill sweep — real club data
fixes the source.)

**H-3 · `applyDbOverlay` max-merge can't represent a score going down (VAR).**
`schedule/route.ts:261-266`. A goal chalked off by VAR sticks at the inflated
`Math.max` score between live polls / at FT. Fix: prefer the fresher-timestamped
source; never blind-max scores.

**H-4 · A finished (DB=FT) match can be demoted to "NS 0-0".**
`schedule/route.ts:244-267,387-396`. If the feed erroneously holds a fixture at
out-of-window LIVE (the 7/18 bug) while DB has the real FT score, the DB overlay
ignores DB status and the kickoff-window guard nulls the scores → a completed
match shows "not started, 0-0". Also fires on legit >4.5h suspensions (F1 red
flags, UCL abandonments). Fix: if DB says FT, promote to FT regardless of feed
(symmetric with the existing feed-FT→DB heal).

**H-5 · LIVE→FT heals hardcode `elapsed=90`, corrupting ET/pens matches.**
`schedule:375`, `live/route.ts:20`, `sync-statuses:55,66`. A 120-minute
knockout gets stamped 90'. Fix: heal `elapsed` from the feed value.

**H-6 · Schema has no penalty-shootout columns; the degraded path drops
champions.** `schema.prisma` Match has no `penHome/penAway`; `synthesizeFromDb`
always emits `null`. If api-football returns 0 fixtures during a shootout final,
the DB literally cannot name the champion. Fix: add pen columns to Match.

**H-7 · Reconstructed (pending) goal minutes still drive Strike Clock / Score
Volatility / Momentum.** `MatchDNA.tsx:80-157,367-368`. Only Clutch Index
excludes pending goals; the other studio0x readings are computed from
seeded-RNG minutes with only a general banner as cover. Fix: suppress
minute-derived metrics when `hasPending`, not just Clutch.

---

## MEDIUM — hardening & disclosure

- **M-1 · Auth-gate `story-expand` (unauth Sonnet spend + the one real
  prompt-injection surface)** — expand only server-known stories by id.
- **M-2 · Auth-gate `POST /api/ai/stories` force-regen** and `debug/football` /
  `debug/kalshi` (public quota + account-status leak).
- **M-3 · Commentary shared-cache key `id|persona|limit` allows ~24× Haiku
  amplification** — normalize to one canonical batch per match.
- **M-4 · Cron returns `ok:true` even when the critical fixture-sync was
  skipped/failed** — top-level `ok = sync.ok && !ingest.errors`; non-200 on skip.
- **M-5 · Broad `catch{}→empty` hides outages as "quiet data"** (Records page
  blank == "no goals yet") — add a `degraded:true`/`stale:true` flag to payloads.
- **M-6 · `goalEvents` JSON column has divergent readers/writers** — route all
  reads through one `asEventArray` normalizer; validate the `goal-override`
  body; add zod at the boundary.
- **M-7 · Sim in-game market prices render full-size behind a tiny "Simulated"
  pill** (`SentimentTickers`) — mute/hide like `MatchMarkets` already does.
- **M-8 · `Match` has no index on `status`/`date`** despite nearly every hot
  read filtering them — `@@index([status, date])`.
- **M-9 · `footballData` caches empty-on-error** for up to its TTL — only cache
  genuine 200s. Same for `liveStats` null-caching (L).
- **M-10 · `?mock=true` seed writes approximate caps/goals as fact** if run in
  prod (Messi 191/112) — stamp mock rows unverified.
- **M-11 · `vipSimulator` returns "Estadio Azteca" for every venueId** — resolve
  the real name or omit it.
- **M-12 · Live win-probability + travel-revenue models shown as precise
  figures** — bands / visible "model estimate" microcopy.

---

## REWRITE / RETHINK — architecture for the multi-sport template

The extraction plan (`docs/sportos-modules.md`) requires no cross-module
imports, per-sport data adapters, and feature flags. The blockers, in priority:

1. **Constants → config (huge leverage, mostly small effort):**
   `STATUS_MAP` (defined **6×, already diverged**), `TEAM_GROUPS` (3×),
   kickoff-window clamp (2×, must stay identical or the quota guard fails
   asymmetrically), stale-LIVE 4h guard (3×), `league=1`/`season=2026` (3
   files) → centralize into `lib/tournament.ts` + a new `lib/sportConfig.ts`.
2. **Shared libs for copy-pasted logic:** `parseStory`, `dramaLabel` (2×,
   **diverged into a bug** — "tight draw" vs "draw" for the same score),
   `stageContext`, `textHash` (2×, the TTS-key fn), persona bios/`SPEAKERS`
   (3-4×) → `lib/aiJson.ts`, `lib/textHash.ts`, `lib/personas.ts`. Adopt the
   already-written-but-unused `lib/cache.ts InMemoryCache` (~10 bespoke caches
   today).
3. **Type boundaries:** zod-parse the JSON columns (`goalEvents`,
   roundtable `lines`/`itFactor`) at every read; replace `as unknown as`;
   fix `|| 0` numeric fallbacks in ingest (a malformed rating becomes a real
   "0" stat).
4. **Consistency:** add `force-dynamic` to the live-data GETs (**`schedule` is
   the most-hit route and is missing it**); a `lib/apiResponse.ts` error helper
   (shapes differ: 401 vs 403 vs `{roundtable:null}`).
5. **Delete dead code:** `AdBanner` (0 imports), unused `InMemoryCache`,
   `batch-import-anthems` (self-labeled legacy), `sync-statuses` (overlaps
   `sync-fixtures`, unwired, carries a 4th `STATUS_MAP`), fan/comedian remnants
   + the dead `lastEvents` param, and — importantly — **stop compiling the
   `wc2026studio0x` secret into the client bundle** (admin buttons should use
   the SUPER_ADMIN cookie path, which `isAdminAuthed` already supports; confirm
   `SEED_SECRET` is set in every deployment).
6. **De-couple deployment URL** (`worldcup-2026-sandy.vercel.app` hardcoded 6×
   → `NEXT_PUBLIC_SITE_URL`); parameterize the WC-shaped `lib/tournament.ts`
   into a `TournamentShape` interface; derive `104`/`48`/`12` from data.
7. **Split oversized files, `page.tsx` (942 lines) first** — it calls the
   schedule route handler in-process, an anti-pattern that will fight the
   no-cross-module-imports extraction rule.

---

## DATA VERIFICATION & BACKFILL SWEEP (after 00:00Z api-football reset)

Budget: fresh 7,500 calls. All items are bounded and cheap.

1. **4 fixtures hide 14 real unattributed goals** (day-cache-poisoning
   survivors): TUR 3-2 USA (`1539012`), SEN 5-0 IRQ (`1539074`), ENG 2-1 CGO
   (`1567307`), POR 0-1 ESP (`1576756`). One `retryMissing` pass fills them →
   Golden Boot / boards become fully complete. (~a handful of calls.)
2. **8 event-less fixtures are genuine 0-0 draws** (ESP-CPV, ECU-CUR, BEL-IRN,
   ENG-GHA, PAR-AUS, CPV-KSA, COL-POR, SUI-COL) — nothing to backfill. Fix the
   boards "coverage" copy to distinguish "goalless" from "no data" so 92/104
   reads honestly (it currently understates coverage).
3. **28 of 48 squads unseeded** (only ~20 teams have players). Seed the rest
   from api-football (~1 call/team) so the boards/leagues cover every team, not
   just the ones that went deep.
4. **Club/League enrichment** (~412+ calls): pull real club/league per player →
   fixes H-2 at the source (CCI™, League Squad Strength become real). Do after
   squads are complete.
5. **Real venue names**: backfill from the fixtures feed to retire the "World
   Cup Stadium" sentinel where the real venue is known.
6. **Full score/status reconciliation**: cross-check all 104 stored results
   against upstream; anything upstream genuinely lacks is *documented as a known
   gap in the coverage footer*, never fabricated.

---

## Suggested execution order

1. **Tonight (post-reset):** data sweep items 1–3 + 6 (cheap, high-truth-value),
   and the two CRITICAL security gates CR-2 + CR-3 (small, stop active exposure).
2. **This week:** CR-1 (anthems), CR-4 (cron), all HIGH data-integrity fixes,
   M-1…M-6.
3. **Pre-F1/UCL:** the REWRITE/RETHINK constants-to-config + shared-libs work
   (items 1–2 there are small and unblock everything), then type boundaries and
   dead-code deletion; club/league enrichment (sweep item 4) as its own pass.

No user-facing falsehood shipped undisclosed during the tournament. The
engine — live data, AI grounding, sim quarantine — is trustworthy. The work
above makes it *durably* so and ready to fork.

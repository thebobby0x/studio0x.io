# Studio0x — AI Sports Platform · CLAUDE.md

This file is read automatically at the start of every Claude Code session.
It captures decisions, context, and conventions that would otherwise be lost between sessions.

---

## MONOREPO BOUNDARIES (agreed 7/3 with the store session — all sessions obey)

Four tenants share `thebobby0x/studio0x.io`, each with its own Claude session:
- **worldcup/** → this file's app (Vercel project `worldcup-2026`, Neon Postgres). THIS session's lane.
- **store/**, **supabase/**, **tools/** → the STORE session's lane (Supabase `cmwdvxvxlfjeaknftobb`).
- **studio0x-content/**, **tail-finder/** → other tenants.

**Shared root files — do not change without flagging the other session in the PR:**
- `CNAME` + GitHub Pages settings → serve apex `studio0x.io` (root `index.html` + store).
  **NEVER disable GitHub Pages or touch CNAME — it takes the store down.**
- Root `index.html` → store session owns.
- `CLAUDE.md` → sectioned; append your own sections, never rewrite others'.
- `docs/` → namespaced: worldcup uses `docs/eod-*.md` / `docs/backlog-*.md`; store uses `docs/EOD-*.md` (avoid case-collisions — prefer distinct prefixes).
- `.github/workflows/refresh-news.yml` → worldcup's (schedule+manual only, never on push).
- Root `package.json`/lockfile → shared legacy (prisma); worldcup builds from `worldcup/frontend/` only.

**Deploy separation:** worldcup's `vercel.json` has an `ignoreCommand` so Vercel only
builds on `worldcup/**` changes — store/content commits no longer trigger worldcup builds.
Worldcup never reads store/, supabase/, tools/; uses its OWN Neon DB, never the store's Supabase.

---

## What This Project Is

**Studio0x.io** is an AI-powered sports stats and media platform. This lane's app is
**podiumMetrics** — the sport-agnostic stats PLATFORM under the **sportOS** umbrella —
live at **`podiummetrics.studio0x.io`** (Vercel project `worldcup-2026`;
`worldcup-2026-sandy.vercel.app` still serves as an alias). Deployment #1 is the 2026
World Cup. Sibling product **podiumSchedule** (the fixtures depot) lives at
`podiumschedule/frontend/` with its own Vercel project + Neon DB. See the BRANDING and
MODULES blocks + `docs/sportos-modules.md` for the full structure.

The long-term vision is a **white-label platform** that can be skinned for any tournament:
F1, UEFA Champions League, NFL, etc. The World Cup build is the reference implementation.
The codebase is intentionally structured so sport-specific data sources, team lists, and
metric definitions sit in isolation from the shared platform infrastructure.

---

## Repo Layout

```
studio0x.io/
├── worldcup/
│   └── frontend/          ← Next.js 15 app (primary app — all active work is here)
│       ├── prisma/
│       │   └── schema.prisma
│       ├── src/
│       │   ├── app/       ← App Router pages + API routes
│       │   ├── components/
│       │   │   ├── admin/
│       │   │   ├── anthem/
│       │   │   ├── match/
│       │   │   ├── news/
│       │   │   ├── sentiment/
│       │   │   ├── stats/     ← All proprietary metric components live here
│       │   │   ├── ui/
│       │   │   └── venue/
│       │   └── lib/
│       └── package.json
├── podiumschedule/
│   └── frontend/          ← podiumSchedule — sportOS fixtures depot (own Vercel + Neon)
├── docs/                  ← EOD reports, session notes
│   └── eod-2026-06-21.md  ← Most recent session report
├── studio0x-content/      ← Separate repo for social/content distribution
└── store/                 ← Unrelated Shopify store
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router | Server components + API routes in one deploy |
| React | React 19 | Required by Next 15 |
| Language | TypeScript strict | Catches Prisma type mismatches early |
| Styling | Tailwind CSS 3 | Design tokens via `tailwind.config.ts` |
| ORM | Prisma 5 on Neon PostgreSQL | Serverless-compatible, instant schema push |
| Auth | NextAuth v5 beta + Google OAuth + PrismaAdapter | Google-only, no password infra needed |
| AI commentary | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) | Low cost, fast, good enough for sports copy |
| AI deep dives | Anthropic Claude Sonnet (`claude-sonnet-4-6`) | Higher quality for on-demand long reads |
| TTS | ElevenLabs `eleven_turbo_v2_5` | Best sports-voice quality, cached in Vercel Blob |
| Live data | api-football v3 (`v3.football.api-sports.io`) | Fixtures, events, lineups, player stats |
| Deployment | Vercel (serverless) | Auto-deploy on push to main |
| Blob storage | Vercel Blob | TTS audio cache, avoids re-generating on every request |

**No OpenAI in the codebase.** OpenAI was discussed as a fallback for Anthropic outages
but deferred. If Anthropic credits run out, add credits first before switching providers.

---

## Design System Tokens (Tailwind)

```ts
brand: {
  green:  "#10b981",   // live indicators, wins, positive states
  gold:   "#f59e0b",   // headlines, primary accent, proprietary metric badges
  blue:   "#3b82f6",   // links, info
  dark:   "#060b18",   // page background
  card:   "#0d1828",   // card backgrounds
  border: "#182a42",   // card borders, dividers
}
```

Font: **Inter** (loaded via Google Fonts in layout.tsx).

Card pattern: `rounded-2xl bg-brand-card border border-brand-border overflow-hidden`
Metric badge pattern: `text-[10px] font-black uppercase tracking-widest text-brand-gold`
Proprietary metric subtitle: `text-[9px] text-slate-700 font-mono` with text "studio0x"

**COLOR DISCIPLINE (owner directive 7/9 — enforce on every new surface):**
- **Gold** = brand, CTAs, proprietary badges, "next up", AWAY team in duels
- **Green** = LIVE indicators, HOME team in duels, positive/win states
- **Red** = live dot + negative/loss states ONLY
- **Slate** = ALL informational text, draw/neutral states, secondary badges
- **NO sky/blue/purple/teal accents** on user-facing surfaces (swept 7/9; the flight
  map's data-viz blue is the one sanctioned exception). Three-way probability/market
  displays: home green · draw slate · away gold.

**BRANDING (owner directives 7/9 + 7/15 — durable, enforce on every new surface):**
- Wordmark is **studio0x** — never "Studio0x" or "STUDIO0X" (swept 7/9, PR #135).
- **sportOS structure (owner decision, Wed 7/15/2026 8:30am ET — CURRENT):** the umbrella
  project is **sportOS**. Under it:
  1. **podiumSelect** — the VIP sport-related travel app (has ALWAYS been the travel app —
     it is NOT a renamed footyPassport).
  2. **podiumSchedule** — global sport calendar (exists under a different name on anything.com;
     owner providing links).
  3. **podiumMetrics** — THIS app, and it is **the PLATFORM product, sport-agnostic**:
     one consistent product name across every sport, with per-deployment branding like
     "podiumMetrics – World Cup 26", "podiumMetrics – F1 2026", "podiumMetrics – UEFA
     Champions League 2027", "podiumMetrics – Women's World Cup 2027" (owner examples,
     7/15 follow-up). Swept footy26 → podiumMetrics (PR #138). Product names are
     camelCase (podiumXxx), matching the studio0x family style.
- **footyPassport** (owner clarification 7/15): a Digital Passport product — users download
  it at tournaments (World Cup as example) and complete activities / check in at games, fan
  zones, and other activations. A distinct product concept, still in dev; not superseded by
  and not the same as podiumSelect. The app's temp brand footy26 (PRs #136–#137) WAS
  superseded by podiumMetrics; don't reuse "footy" for new surfaces without owner confirmation.
- Deployment-name caveat: the owner's examples put the tournament name in the deployment
  subtitle ("podiumMetrics – World Cup 26"). Descriptive/nominative subtitle is a lighter IP
  footprint than branding the product itself with FIFA marks, but it still uses the mark —
  flagged to owner 7/15; get explicit owner sign-off (ideally after the TM screen) before
  putting "World Cup" into any user-facing product title. In-app brand today remains
  plain "podiumMetrics".
- FIFA-free rules stand: no FIFA marks in product branding ("FIFA", "World Cup" as branding).
  AI-generated editorial content may still reference the tournament factually (nominative
  use); product branding may not. Never claim "official" anything.
  Launch target subdomain: `podiummetrics.studio0x.io` (apex stays GitHub Pages — store).
  Domain structure is FLAT (owner 7/15): one subdomain per product, no sportOS hub subdomain
  for now. DNS lives on GoDaddy. Internal names (repo `worldcup/`, Vercel `worldcup-2026`,
  DB) stay as-is — owner 7/15: current build is the trial/refinement iteration; carry
  learnings into the next iteration rather than renaming internals now.
- Tournament-reference copy is NOT brand copy: things a team can win, play in, or score at
  are "the tournament"/"the 2026 tournament", never the product name (a team can't "win
  podiumMetrics"). Brand goes in titles, wordmarks, footers, share-text sign-offs.
- The `"World Cup Stadium"` string is a DB **venue sentinel**, not branding — never
  rename it in comparisons without migrating the data (near-miss 7/9).

**MODULES (owner directive, standing + expanded 7/15):** everything is built in
add/removable MODULES; modules are white-label and re-wrappable across verticals
(podiumSelect ≡ festivalHopper ≡ "ETP" under **eventOS** — which is a FUNCTIONING
product, world debut IMEX America Oct 2026). sportOS module ideas to pursue:
podiumNews, podiumCommunity, podiumMuseum, podiumArcade, podiumPassport,
podiumCollectors — several already exist as proto-modules inside this app (news,
predict/fan zone, records/anthems, sentiment). Three name layers per module:
neutral code-ID → white-label product (podiumXxx) → go-to-market skins, both ours
(podiumPassport → footyPassport) and customers' (FIFA could license podiumPassport
as "FIFA World Cup Passport"). News is a SEPARATE module from live-game following
(one News-creation depot feeds both apps). Full registry + extraction plan:
**`docs/sportos-modules.md`**. Keep module code/IDs vertical-neutral (owner-agreed);
module extraction is post-tournament work — don't refactor mid-tournament.

**CONTENT TRUTH — HARD RULE (owner directive 7/18, verbatim intent):** "actual facts
and truths, with opinions based on facts and truths, NO false, NO fake, NO invented,
NO imaginary anything." Applies to EVERY content surface, present and future:
- Every AI prompt must carry explicit invent-bans (no players, stats, scorers,
  minutes, injuries, quotes, odds, or history not present in the prompt data) —
  copy the grounding block when adding any new AI surface (see gotcha #21).
- Opinions/speculation must be grounded in provided facts and clearly framed as
  opinion ("my guess", "I think", "likely").
- Sim/fabricated data stays quarantined behind `dataSources` tags and is never
  shown as real (gotcha #20).
- The Roundtable pundits are clearly-labeled fictional CHARACTERS (disclaimed on
  the surface) — the personas are the one sanctioned fiction, and even they may
  only discuss real, provided facts and may never invent specifics (career
  matches, stats, teammates, dates).

**OWNER SHORTHAND:** "QCC" = "any Questions, Comments, Concerns (or suggestions)
before we move forward?" — when the owner writes QCC, respond with genuine
questions/feedback on the plan just described, then proceed.

---

## Key Decisions & Why

### Server vs Client Components
- **API routes** fetch from api-football using `API_FOOTBALL_KEY` (server-only — never expose to client)
- **Match detail page** (`/schedule/[matchId]/page.tsx`) is a server component that calls
  inner async helper functions (`MatchDNAPanel`, `UpsetMeterForMatch`, etc.) rather than
  importing client components directly — this avoids "async server component" TypeScript errors
- **Stats components** that need live data polling are client components (`"use client"`)
  fetching from our own API routes
- **DB-query components** (PlayerPerformanceIndex, ClubContributionIndex) are async server
  components imported directly into server pages

### Why Prisma `db push` not migrations
Vercel build script runs `prisma db push && prisma generate` on every deploy. This is
intentional during rapid development — no migration history to manage. Switch to
`prisma migrate` when the schema stabilises pre-launch.

### Why `btoa(unescape(encodeURIComponent(text)))` not `btoa(text)`
The fan persona commentary uses emoji. Plain `btoa()` throws `InvalidCharacterError` on
any non-Latin-1 character. This encoding pattern is used throughout wherever commentary
text is base64-encoded for TTS cache keys.

### Why commentary accumulates newest-first
Each 45s auto-refresh **prepends** a new timestamped batch rather than replacing. This
gives users a scrollable history of the commentary session rather than a single snapshot.
Timeline shows elapsed match minute per batch.

### Why the admin seed route uses `?mock=true`
The live api-football squad endpoint (`/players?team=&league=1&season=2026`) only works
once teams are registered with the tournament. During development and pre-tournament,
`?mock=true` seeds 30+ key players with real club/league data from known squad lists.

### Why `studio0x_view_as` cookie is not httpOnly
The AdminBanner component reads it client-side via `document.cookie` to show the amber
impersonation banner. Making it httpOnly would require an API round-trip on every page.
Security impact is minimal — it only affects UI presentation, not actual auth.

### Why ElevenLabs TTS is cached in Vercel Blob
TTS is expensive (~$0.011/line listened). Caching by a hash of the text means each
unique line is only generated once ever, even across different users and page loads.

---

## Auth & Roles

```
SUPER_ADMIN  → b@studio0x.io (auto-promoted on every sign-in in auth.ts)
ADMIN        → platform admins
WHITE_LABEL  → paid partners (branded embed + API access)
USER         → default for all new sign-ups
```

Role impersonation: SUPER_ADMIN can set `studio0x_view_as` cookie via `/admin` panel
to preview the app as any role. Amber sticky banner shows when impersonating.

Role check pattern in API routes:
```ts
const session = await auth();
if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

---

## Environment Variables

Never commit these. All live in Vercel environment settings.

| Variable | Used in | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | AI commentary, stories, Go Deeper | Check balance at console.anthropic.com |
| `API_FOOTBALL_KEY` | All live match data | Never expose to client — server only |
| `ELEVENLABS_API_KEY` | TTS generation | |
| `ELEVENLABS_VOICE_ID` | TTS generation | Default voice; more can be added per persona |
| `AUTH_GOOGLE_ID` | NextAuth | |
| `AUTH_GOOGLE_SECRET` | NextAuth | |
| `AUTH_SECRET` | NextAuth | |
| `AUTH_URL` | NextAuth | `https://podiummetrics.studio0x.io` — pins OAuth flow to the canonical domain (set 7/15 with the Google-console redirect URI; sign-in on the custom domain broke without it) |
| `CRON_SECRET` | Nightly crons | Vercel auto-sends as bearer on cron calls; REQUIRED since SEED_SECRET rotation killed the legacy `?secret=` params (set 7/15 — crons had been silently 401ing) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (TTS cache) | |
| `CONTENT_REPO_TOKEN` | GitHub PAT for studio0x-content repo | Needs `contents` + `workflow` scopes |

---

## Data Sources

### api-football (`v3.football.api-sports.io`)
- FIFA World Cup 2026: `league=1, season=2026`
- Used for: fixtures (`/fixtures`), events (`/fixtures/events`), lineups (`/fixtures/lineups`), player stats (`/fixtures/players`), squads (`/players/squads`)
- Pro plan: ~$10/month, ~400–500 calls/game
- Revalidation: match list 60s, events 10s during live, lineups 300s

### Anthropic
- Commentary: Claude Haiku, 45s auto-refresh during LIVE/HT, ~$0.06/game
- Stories: Claude Haiku, 1hr cache, ~$0.005/game
- Go Deeper: Claude Sonnet, user-triggered, ~$0.017/click
- **If credits deplete**: add funds at console.anthropic.com → Plans & Billing
- ~$20–50 covers the full 48-game group stage

### ElevenLabs TTS
- Model: `eleven_turbo_v2_5`
- Triggered by user clicking "Listen" on commentary lines or story cards
- Audio cached in Vercel Blob — only generated once per unique text string
- ~$0.011 per line actually listened to

### Polymarket / Kalshi
- Tournament winner odds via Polymarket (pre-match probability data)
- Used in UpsetFactor™ calculation and TournamentOddsPanel
- Fetched in `src/lib/polymarket.ts` and `src/lib/kalshi.ts`

---

## Proprietary Metrics

All metrics are Studio0x™ branded. They appear with a gold badge header + `studio0x` mono subtitle.

### Match-level (computed from GoalEvent[])

| Metric | Component | Source data | Formula |
|---|---|---|---|
| **Match DNA™** | `MatchDNA.tsx` | api-football goal events | Timeline visualisation of home vs away goals across 90 min |
| **Clutch Index™** | inside `MatchDNA.tsx` | Goal events | lead-change goal = 3pts, equaliser = 2.5pts, ×1.5 if min≥80 |
| **Strike Clock™** | inside `MatchDNA.tsx` | Goal events | First goal minute, avg gap between goals, rhythm label |
| **Score Volatility™** | inside `MatchDNA.tsx` | Goal events | Counts lead changes + equalisers |
| **Momentum Pulse™** | inside `MatchDNA.tsx` | Goal events | Timeline of score state across 90 min |
| **Goal Gravity™** | `GoalGravity.tsx` | Goal events | Impact score: comeback=3.0, lead-break=2.5, equaliser=2.0, ×1.8 if min≥80 |
| **Upset Factor™** | `UpsetMeter.tsx` | Polymarket odds + FT score | (1 - pre-match win probability) × 100 |
| **Pressing Intensity Index™** | `PressingIntensityIndex.tsx` | api-football player stats | Fouls×2 + Yellows×8 + Reds×20, normalised to 100 |
| **Transition Danger Rating™** | `TransitionDangerRating.tsx` | Goal events | Counter goals (scored within 4min of prev goal) + burst goals |

### Tournament-level (computed from DB / standings)

| Metric | Component | Source data | Formula |
|---|---|---|---|
| **Form Meter™** | `FormMeter.tsx` | Schedule API (all FT matches) | Last 5 results W/D/L with points total |
| **Elimination Proximity™** | `EliminationProximity.tsx` | Schedule API (standings) | Group position + remaining games → danger score |
| **Player Performance Index™** | `PlayerPerformanceIndex.tsx` | `PlayerTournamentStat` DB table | Goals×3 + Assists×2 + Rating×1.5 − RedCards×3 − Yellows×0.5 |
| **Club Contribution Index™** | `ClubContributionIndex.tsx` | `Player.club` DB field | Players×2 + CareerGoals×0.5 |
| **Group Intensity™** | inside `standings/page.tsx` | Standings API | Points spread tightness + goals per match |
| **Group Danger Index™** | inside `standings/page.tsx` | Polymarket odds | How many tournament favourites are in the same group |

### Stories-level (computed for AI prompt context)
These are computed in `/api/ai/stories/route.ts` from match score data and fed into the
Claude prompt to generate METRIC SPOTLIGHT stories. They are not standalone components.

Score Volatility™, Clutch Index™, Goal Gravity™ Peak, Strike Clock™, Momentum Pulse™

---

## Page Map

| Route | Component | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard: live match card, stories, standings, odds, predictions |
| `/schedule` | `app/schedule/page.tsx` | All fixtures grouped by date |
| `/schedule/[matchId]` | `app/schedule/[matchId]/page.tsx` | Match detail: all metrics + Live Match Market (Kalshi) + MatchPulse live polling |
| `/standings` | `app/standings/page.tsx` | Group tables + Group Intensity™ + Elimination Proximity™ |
| `/news` | `app/news/page.tsx` | AI news: previews, recaps, daily round-ups (15-min pinger keeps fresh) |
| `/bracket` | `app/bracket/page.tsx` | Knockout bracket R32→Final |
| `/officials` | `app/officials/page.tsx` | Referee profiles + Whistle Index™/Card Threshold™/Let It Flow™ + Officials on the Move |
| `/leagues` | `app/leagues/page.tsx` | Club/league breakdown + CCI™ + PPI™ |
| `/team/[tla]` | `app/team/[tla]/page.tsx` | Team detail (exists but sparse) |
| `/pulse` | `app/pulse/page.tsx` | Travel pulse / fan origin map |
| `/predict` | `app/predict/page.tsx` | Score predictions |
| `/anthems` | `app/anthems/page.tsx` | AI-generated national anthems with TTS |
| `/admin` | `app/admin/page.tsx` | SUPER_ADMIN only — role switcher, user management, tools |
| `/admin/anthems` | `app/admin/anthems/page.tsx` | Anthem upload/management |
| `/admin/stats` | `app/admin/stats/page.tsx` | Stats admin |

---

## Admin Tools & Seed Routes

All seed/admin routes require SUPER_ADMIN session OR a `?secret=wc2026studio0x` query param.

| Route | Purpose |
|---|---|
| `POST /api/admin/sync-fixtures` | **Preferred**: NON-destructive fixture sync — new fixtures/knockouts, scores, statuses, TBD→real team upgrades. Also runs nightly via the 2:30am cron. |
| `POST /api/seed` | Full re-seed of match data (kalshi/liveMetric/playerMatchStat/match wiped + rebuilt). Teams/players/anthems are PRESERVED (upserted by code, stable IDs). Use sync-fixtures unless you need a hard reset. |
| `POST /api/admin/seed-players?mock=true` | Seeds 30+ key players with club/league data (mock mode, no API needed) |
| `POST /api/admin/seed-players` | Seeds players from api-football live squad data |
| `POST /api/admin/seed-full-squads` | Seeds all 26-man squads for all 48 WC teams from api-football (~1,248 players) |
| `POST /api/ai/stories` | Force-regenerates story cache (also invalidated after 1hr) |
| `PATCH /api/admin/users` | Updates user role (SUPER_ADMIN only) |
| `POST /api/admin/view-as` | Sets impersonation cookie |
| `GET /api/admin/batch-anthem?preset=true&offset=N&count=M` | Imports a slice of the anthem manifest (chunked — used by the Wipe+Reimport button to dodge the 60s limit) |
| `GET /api/admin/batch-anthem?finalize=true` | Prunes anthem DB rows down to the current manifest (no downloads) |
| `GET /api/admin/blob-cleanup` | Purges regenerable tts/+deep-dives/ caches + orphaned anthem dupes (`?dryRun=true` previews) |
| `GET /api/admin/blob-cleanup?purgeAnthems=CONFIRM_DRIVE_OK` | Deletes ALL anthems/ blobs to reclaim quota (Drive is the source; behind the "Purge ALL Anthem Blobs" button) |
| `GET /api/admin/anthem-relink` | Re-links orphaned anthem records to teams + restores canonical titles from the manifest |

**Anthem source of truth:** `src/lib/anthemManifest.ts` (Drive file IDs + exact titles). To add a
team anthem, add one entry there. Re-import via the **"Wipe + Reimport ALL Anthems"** admin button.
Costa Rica excluded (did not qualify) — destined for a future "NON WC26 Anthems" page/manifest.

**Admin auth (single source):** `src/lib/adminAuth.ts` — every admin/seed/cron route accepts
(1) SUPER_ADMIN session, (2) `Bearer CRON_SECRET`, (3) `?secret=` matching the `SEED_SECRET`
env var, or (4) the legacy hardcoded secret ONLY while `SEED_SECRET` is unset. **Rotation is
self-activating:** set `SEED_SECRET` in Vercel env and the hardcoded value (public repo!) stops
working. Rotation checklist: set `SEED_SECRET` + `CRON_SECRET` in Vercel, update the GH Action
secret `NEWS_REFRESH_SECRET`, update `vercel.json` cron `?secret=` params, redeploy.

**Nightly cron (2:30am, `/api/cron/ingest-stats`)** runs three jobs: fixture sync (non-destructive
DB refresh — the permanent fix for stale data), player-stats ingest, and Blob cache eviction when
the store exceeds ~800 MB (prevents the 1 GB quota wall from ever silently killing audio again).

---

## Branch Strategy

- **`main`** → production (Vercel auto-deploys)
- **`claude/world-cup-stats-mvp-32spgw`** → current feature branch, PR into main

When starting a new session, check which branch is active:
```bash
git branch --show-current
git log --oneline -5
git status
```

Always develop on `claude/world-cup-stats-mvp-32spgw` and PR to main.
Never push directly to main.

---

## Things Tried & Abandoned / Important Gotchas

1. **`btoa(text)` crashes on emoji** — fan persona uses emoji in commentary. Always use
   `btoa(unescape(encodeURIComponent(text)))`. This is in MatchCommentary.tsx.

2. **Branch divergence disaster** — in an earlier session the feature branch diverged
   ~76 commits from main. Git rebase produced 75 conflicts. Fix: `git reset --hard origin/main`
   + cherry-pick only the new commits. Never let branches diverge more than a session's worth.

3. **`prisma generate` must run in Vercel build** — `package.json` build script is
   `prisma db push --skip-generate && prisma generate && next build`. If you change the
   schema, the types won't update in production until the next deploy.

4. **api-football events endpoint returns empty during pre-match** — `MatchDNAPanel` in
   the match detail page early-returns `null` if no goal events. This is correct behaviour.
   The component uses simulated goals as a fallback when the live feed has none yet
   (see `simulateGoals()` in `/api/matches/[id]/goals/route.ts`).

5. **NextAuth v5 `params` is a Promise** — In Next.js 15, route params and dynamic segment
   params are Promises. Always `await params` in API routes and page components.
   ```ts
   export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
     const { id } = await params;
   ```

6. **TTS `storyId` must be unicode-safe** — Story TTS uses a base64 hash of the story body
   as the Vercel Blob key. Same btoa issue as commentary.

7. **`force-dynamic` on all data pages** — Pages that fetch live data must export
   `export const dynamic = "force-dynamic"` to prevent Next.js from caching them at build time.

8. **Anthropic credit depletion ends all AI features** — commentary, stories, and Go Deeper
   all fail silently (return empty arrays or null). ElevenLabs TTS and api-football live data
   are unaffected. Add credits at console.anthropic.com before assuming a bug.

9. **PlayerTournamentStat is empty until seeded** — PPI™ shows a "no data" state.
   To populate: `POST /api/admin/seed-players?mock=true` first (adds club/league),
   then update stats manually as matches play out (no automated ingestion yet).

10. **`team/[tla]` page exists but is sparse** — FormMeter™ is wired to read schedule data
    client-side so it works anywhere you pass a `teamTla` prop. The team detail page needs
    more content added in a future session.

11. **Seed wipe order must delete child tables first** — The correct order to avoid FK RESTRICT violations:
    `kalshiMarket` → `liveMetric` → `playerMatchStat` → `match` → `player` → `team`.
    Missing `playerMatchStat` before `match` caused a hard crash when PlayerMatchStat rows existed.

12. **Power Rankings™ formula had `* 100` bug** — The pts/game component was `ptsPerGame * 40 / 3 * 100`
    instead of `ptsPerGame * 40 / 3`. This pushed all raw scores to ~4000+, causing `Math.min(100, score)`
    to clamp every team to 100. Fixed Jun 25.

13. **TBD sentinel team for knockout fixtures** — When api-football hasn't assigned teams to knockout
    fixtures yet, we store them using a `TBD` sentinel team (code: "TBD"). The bracket page maps
    `team.code === "TBD"` → null so cards render as TBD placeholders with real dates/venues.
    After group stage settles and api-football updates fixtures, re-run `/api/seed` to replace TBD with real teams.

14. **TTS route: buffer before Blob put** — `elRes.body` is a stream that can only be read once.
    Always `Buffer.from(await elRes.arrayBuffer())` before calling `put()`. Wrap `put()` in try/catch
    so Blob failures are logged and returned as errors rather than silently crashing the route.

15. **Vercel Blob 1 GB Hobby quota is the silent killer** — when `put()` fails with
    `"Storage quota exceeded for Hobby plan (1GB maximum)"`, EVERY Blob write fails: TTS audio
    ("Audio unavailable") AND anthem imports. Reads keep working (public URLs need no token), so it
    looks like the system is fine. **Symptoms mimic missing keys — check Blob usage FIRST.** The
    bloat is usually orphaned `anthems/` dupes, not caches. Free space with the **"Free Up Blob
    Storage"** or **"Purge ALL Anthem Blobs"** admin buttons (`/api/admin/blob-cleanup`).

16. **Never write timestamped Blob filenames for re-importable content** — the old anthem import
    wrote `anthems/${Date.now()}-${title}.mp3` every run without deleting old copies, piling up to
    1 GB over months. Use STABLE names (`anthems/<code-or-slug>.mp3`) + `allowOverwrite: true` so
    re-imports overwrite instead of accumulating.

17. **Import-then-prune, never wipe-first** — an early anthem reimport ran `deleteMany()` BEFORE
    importing; a mid-run failure (quota/timeout) then left the hub empty AND 500'd. Always import
    first, and prune stale rows only after ≥1 success. See `runImport`/`finalizePrune` in
    `batch-anthem/route.ts`.

18. **60s Hobby function limit kills bulk Drive imports** — 24 sequential Drive downloads exceed
    60s → 504 FUNCTION_INVOCATION_TIMEOUT. The reimport is CHUNKED (`?offset=N&count=M`, 6 at a
    time) and driven by the admin button loop, then `?finalize=true`. Don't paste the one-shot
    `preset=true` URL for the full set — it times out; use the button.

19. **Multi-param admin URLs get mangled in browser/agent hand-offs** — the `&purgeAnthems=…` flag
    was silently dropped TWICE when relayed as a URL. Put destructive/multi-param actions behind
    **admin buttons** (URL baked into the fetch), not hand-typed URLs.

20. **`dataSources` tags are load-bearing truth gates** — `/api/matches/[id]/live` tags every
    payload section (`match`/`markets`/`stats`/`probs`) with its real source, and the UI HIDES
    anything tagged `"sim"`. Real team stats come from `lib/liveStats.ts` (api-football
    `/fixtures/statistics`); `lib/simulation.ts` is QUARANTINED fabricated data (every unknown
    team gets Mexico's numbers). Never surface sim-tagged values as real, and never fabricate
    scorer names — reconstructed goals use `scorer: "Scorer TBC"` + `pending: true` (goals route).

21. **AI prompts must be grounded in provided data only** — every Claude prompt (commentary,
    stories, previews, recaps, Go Deeper) carries explicit invent-bans: no player names,
    formations, minutes, stats, injuries, or historical anecdotes not present in the prompt data.
    When adding a new AI surface, copy the grounding rules; a missing guardrail = published
    hallucinations (see docs/eod-2026-07-06.md, PR #108).

24. **TTS pronunciation + accent preservation (Roundtable)** — three stacked fixes,
    all required: (1) panel renders on `eleven_v3` with an audio-only
    `[strong X accent]` tag per persona (turbo flattened accents entirely;
    multilingual_v2 still genericized them — owner incognito-verified 7/18); the
    route auto-falls-back to `eleven_multilingual_v2` WITHOUT the tag (older
    models read tags aloud). (2) audio-only respell lexicon (`AUDIO_RESPELL`):
    models read short foreign words with English phonetics inside English
    sentences ("dale" → [day-ul]; "Henry" → [hen-ree]); display text is never
    respelled. (3) panel sends NO voice_settings — the custom voices' stored
    VoiceLab settings apply. ANY change to TTS model/settings/lexicon MUST bump
    `PERSONA_AUDIO_REV` — blob cache keys are text-derived, so old audio serves
    forever otherwise (bit us repeatedly on 7/18).

23. **fixtureSync can only be trusted if the /teams call succeeded** — teamCodeById is
    built from a SECOND api-football call; when it failed, every knockout fixture
    resolved to the TBD sentinel and the diff-writer downgraded real, already-played
    pairings back to TBD (owner report 7/15 launch night: "TBD 0-2 TBD" everywhere,
    AI story "TBD Stuns TBD"). Fixed (PR #145): empty team-map aborts the sync, and
    per-fixture real→TBD downgrades are refused (upgrades and real→real corrections
    still apply). Recovery is one "Sync Fixtures (Safe)" click once /teams works.

22. **Live-data freshness: the DB and the bulk feed disagree mid-game** — the banner
    (`/api/live`) reads DB rows maintained by the per-match live route, while pages read
    `/api/schedule` (bulk feed + overlays). When api-football flakes, the schedule side
    serves stale caches or DB-synthesis and the hero froze at 0-0 under a 0-2 banner
    (owner 7/14, FRA-ESP semi). Hardened (PR #139): max-merge DB scores/minutes into
    LIVE/HT feed rows (both only move up); synthesizeFromDb classifies stage by DATE
    (`classifyRound`) not group membership and keeps LIVE scores; the live route never
    persists clock-simulated state to the DB; LiveRefresh mounts on schedule + match
    pages. If hero/banner diverge again, suspect a NEW writer of stale Match rows.

---

## Current Production State (as of 2026-07-16)

**Jul 15–16 shipped (PRs #138–#153, see `docs/eod-2026-07-15.md` + `eod-2026-07-16.md`):**
- **podiumMetrics brand live under sportOS** (owner structure decision 7/15): wordmark,
  metadata, sportOS family footer with quiet links. Tournament-reference copy is not
  brand copy (a team can't "win podiumMetrics").
- **`podiummetrics.studio0x.io` LIVE**: GoDaddy CNAME + Vercel domain (production env),
  canonical metadata (`metadataBase`/OG). Sign-in works on the custom domain
  (`AUTH_URL` env + Google-console redirect URI). `CRON_SECRET` set — nightly crons
  authenticate again (they had been silently 401ing since SEED_SECRET rotation).
- **Live-data hardening** (PR #139): max-merge DB↔feed for LIVE/HT, date-based stage
  classification, LiveRefresh on schedule + match pages, no sim persistence.
- **TBD-downgrade guards** (PR #145): empty /teams map aborts sync; real→TBD refused.
- **Round windows corrected** (PR #147): 3rd place (FRA-ENG ~Jul 19 00Z) vs Final
  (ESP-ARG ~Jul 19 22Z) split at Jul 19 12:00Z.
- **podiumSchedule DEPLOYED & SYNCING** (PRs #146, #149–#152): own Vercel project
  `podiumschedule` + Neon (DIRECT connection string — pooled fails `prisma db push`),
  env SYNC_SECRET/CRON_SECRET/TSDB_KEY(optional), TheSportsDB free key is "123"
  (retired "3" broke soccer syncs; free tier caps season lists — paid key for full
  seasons), /api/events depot API live. F1 2026 fully synced via Jolpica.
- **Remaining tournament state**: 3rd place FRA-ENG Jul 18 (ET), Final ESP-ARG Jul 19.

## Previous Production State (2026-07-07)

**Jul 7 shipped (see `docs/eod-2026-07-07.md`, PRs #112–#118):** **ANTHEM HUB COMPLETE —
53 tracks: all 48 teams + 5 FIFA** (manifest-driven; NB: manifest teamCodes must match the
DB's api-football codes — Curaçao=CUR, DR Congo=CGO, NOT FIFA's CUW/COD); news prompts made
stage-aware + self-heal purge for knockout stories naming a group; bracket overlays the live
schedule feed (never staler than the DB sync); standings page declares group tables FINAL
once knockouts start; predict page newest-first with filter chips; Travel Pulse totals are
progress-aware ("to date" grows per completed match). Squads/Clubs seeded by owner (412
players with club data; full-squad count verification is tomorrow's first task).

## Previous Production State (2026-07-06)

**Jul 6 shipped (see `docs/eod-2026-07-06.md`, PRs #106–#110):** knockout pages no longer leak
group panels/tables; **Live Match Market** (real Kalshi, bid/ask/volume/ticks) on every match
page; **real live team stats** via `lib/liveStats.ts` drive Match DNA™/Momentum Pulse™ (Live
Pressure bar) so metrics move even at 0-0; truth audit fixes (grounded prompts, labeled models,
honest failure badges, no fabricated scorers); **ShareButton** on every content surface (native
share sheet on mobile → IG stories/reels; X/LinkedIn/WhatsApp/FB/copy popover on desktop);
CI build-check guardrail live on every worldcup PR; news pinger active (15-min).

**Jun 30 resolved (see `docs/eod-2026-06-30.md`):** TTS audio now plays (root cause was a full
1 GB Blob store rejecting every write, not missing keys); anthems rebuilt to 19 team + 4 FIFA with
flags/titles; countdowns unified (`lib/tournament.ts`); dashboard stale-LIVE + refresh fixes;
stories generate in-process. New Blob cleanup/purge + chunked-import tooling shipped. Env vars
`BLOB_READ_WRITE_TOKEN` / `ELEVENLABS_API_KEY` confirmed present in prod.

**Working:**
- Live match scores + events (api-football)
- AI Commentary (Analyst / Fan / Comedian personas, 45s auto-refresh, TTS per line)
- Tournament Stories with METRIC SPOTLIGHT category
- Go Deeper on-demand deep dive per story
- Match DNA™, Goal Gravity™, Upset Factor™, Live Win Meter on match detail pages
- Pressing Intensity Index™ and Transition Danger Rating™ on match detail pages
- Form Meter™ on match detail pages for both teams
- Elimination Proximity™ on standings page
- Club Contribution Index™ + Player Performance Index™ on leagues page
- Club WC Impact™ on leagues page (dual-mode: preview squad strength / live WC stats)
- Leagues page at `/leagues` with club/league breakdown
- Admin panel at `/admin` with role switcher, user management, Sync Match Statuses button
- Group standings, tournament odds, travel pulse, predictions, anthems
- Dashboard global error boundary + 20s live auto-refresh (LiveRefresh component)
- Stale LIVE status hardened: 4-hour time guard + background self-heal + applyDbOverlay fix
- Anthem Hub: 19 real tracks (8 team + 4 FIFA from session 1; + 11 new team anthems Jun 24)
  - Teams with no anthem show greyed out "coming soon" (soundhelix placeholders purged)
- Batch import endpoint: `/api/admin/batch-import-anthems` (GET/POST, pulls from Drive by file ID)
- `/api/live` returns all concurrent live matches (multi-game aware dashboard)
- LiveMatchBanner shows "+N more live" chip for simultaneous games
- Dashboard split view with `?focus=0|1` match selector
- Bracket pre-knockout announcement card + predict strips on upcoming slots
- Full squad seed route (`POST /api/admin/seed-full-squads`) — admin button added
- Power Rankings™ formula fixed (was clamping all teams to 100) — Jun 25
- TTS route hardened with proper buffering + error logging — Jun 25

**Pending one-time admin actions:**
- **Run "Seed Full Squads (Live API)"** from `/admin` — player count is 78 (mock), needs ~1,248
- **Run "Seed Clubs (Mock)" + "Ingest Player Stats"** after full squads seeded
- **Re-run `/api/seed`** after July 3 to pull R32 knockout fixtures from api-football
- Check TTS audio in production — Vercel logs will show exact error after PR #78 deploys
- CRC (Costa Rica) anthem song exists in Drive but team not in WC 2026 DB — skipped for now

**Blocked / incomplete:**
- TTS audio may still be failing in production — exact cause unknown until Vercel logs checked
- Bracket all TBD — api-football has 72 fixtures (group stage only); knockout fixtures after July 3
- PlayerTournamentStat empty until seeded — PPI™ shows empty state
- `team/[tla]` page needs more content (FormMeter is wired but page is sparse)
- `workflow` scope missing from CONTENT_REPO_TOKEN PAT (blocks social workflow pushes)
- Social API secrets (LinkedIn, X, Medium) not yet set up in studio0x-content repo

---

## Cost Per Live Match (reference)

| Service | Cost/game |
|---|---|
| api-football | ~$0.06 |
| Anthropic commentary | ~$0.06 |
| Anthropic stories | ~$0.005 |
| Go Deeper (per click) | ~$0.017 |
| ElevenLabs TTS | ~$0.011/line listened |
| **Total typical** | **~$0.15–0.25** |

$20–50 Anthropic credits covers the full 48-game group stage.

---

## Tomorrow's Session Priorities (2026-06-25)

### 0. Morning admin actions (do first)
- Merge PR #78 (Power Rankings fix + TTS hardening) if not already merged
- Run "Seed Full Squads (Live API)" from `/admin` → gets player count to ~1,248
- Run "Seed Clubs (Mock)" + "Ingest Player Stats"
- Check Vercel function logs for the TTS error — click Listen on a story, then check logs

### 1. Monetization + Public Launch
- **Custom domain**: set up `worldcup.studio0x.io` (or `wc2026.studio0x.io`) in Vercel — point DNS, add domain in project settings
- **AdSense / ad slots**: wire up real ad content in the sponsor admin panel; consider Google AdSense as fallback fill
- **Pre-launch checklist**:
  - Top up Anthropic credits before going live (commentary/stories fail silently if depleted)
  - Check SEO meta tags (`<title>`, `<meta description>`, OG image) on key pages
  - Verify all Vercel environment variables are set in production (especially ELEVENLABS_API_KEY, BLOB_READ_WRITE_TOKEN)

### 2. WC × Club World Cup Cross-Reference
- The FIFA Club World Cup ran June–July 2025 (32-club format) — api-football has this data under a different league ID
- Feature: side-by-side player stat comparison across both tournaments ("Haaland averaged 7.8 at Club WC → 8.1 at WC 2026 — peak form")
- Implementation: seed a second tournament's `PlayerMatchStat` with a `tournamentTag` discriminator; add comparison view to leagues/team pages
- Data cost: ~$2–5 in api-football credits to pull Club WC player stats

### 3. Club Form → Country Enrichment (reverse flow)
- Currently: WC stats → club narrative (Club WC Impact™)
- New: player's club performance (domestic league + Club WC) → national team profile
- Messi's Inter Miami stats enrich Argentina's team page; Haaland's Real Madrid form feeds Norway
- Makes team pages much richer — "arriving in form" vs "arriving cold"
- Implementation: fetch `/players?team=X&league=Y&season=2025` from api-football per player, store in new `PlayerClubStat` model, surface on team pages

### 4. Platform Story — telling the Studio0x narrative correctly
**The framing that must come through:**
- The stat engine is the product. The World Cup is the use case.
- Studio0x is a proprietary AI-powered stat engine for elite sports — WC 2026 is the live reference deployment.
- The platform is white-label: reskinnable for F1, UCL, NFL, etc. This is the business case for partners and investors.

**What's broken about the current story:**
- Someone landing on `/` sees a scoreboard app, not a stat engine platform
- Studio0x branding is secondary to "WC 2026" — should be the other way around
- The white-label / multi-sport angle is invisible unless you already know to look for it
- Proprietary metric formula footnotes ("CCI score = Players×2 + Career Goals×0.5") undercut the mystique — that math belongs on a methodology page, not every card

**What to build:**
1. `/about` page or above-the-fold hero on `/` — Platform Story section
   - Headline: Studio0x is an AI-powered stat engine for elite sports
   - Sub: World Cup 2026 is live. F1, UCL, NFL coming.
   - Visual: show 2–3 proprietary metric names as the differentiator
2. Move formula footnotes off cards → link to `/methodology` page instead
3. Make Studio0x brand more prominent than the sport/tournament in the nav and header
4. Add a "For Partners" or "White Label" CTA visible to non-logged-in users

---

## Roadmap (Deferred)

Features explicitly scoped out for now but confirmed as future work:

### Internationalisation (i18n)
- **Status**: Deferred — English-only for WC 2026 launch
- **Timezone**: Already works correctly — all match times use `toLocaleTimeString()` with no explicit timezone, so the browser auto-converts UTC to the user's local time
- **Language**: Not implemented — all UI text is hardcoded English
- **When ready**: Install `next-intl`, extract strings to locale JSON files, add locale routing (`/es/`, `/pt/`, `/fr/`), prompt Claude in target language for AI content
- **Priority markets**: Brazilian Portuguese and Spanish (largest WC fan bases outside English)

---

## Platform Architecture Intent (Future)

The codebase is being built toward a **multi-sport white-label platform**:

- **Core** (sport-agnostic): auth, DB schema, design system, admin panel, AI commentary
  framework, TTS pipeline, proprietary metric components, ElevenLabs integration
- **Sport module** (swappable): data source (api-football for football, Ergast/OpenF1 for F1,
  etc.), team/driver lists, tournament structure, sport-specific metrics

This means: when building F1 or UCL support, create a new app in the monorepo
(`f1/frontend/` or `ucl/frontend/`) that reuses the shared component library and design
tokens. Do not mix sport-specific logic into the shared core.

The Prisma schema (`Team`, `Match`, `Player`, etc.) is intentionally generic enough to
support other sports with minor additions.

---

## Session Handoff Notes

Before ending any session:
1. Commit and push all changes
2. Run `npx tsc --noEmit` to verify no TypeScript errors
3. Update this CLAUDE.md if new patterns or decisions were made
4. Append to `docs/eod-YYYY-MM-DD.md` with what shipped and what's pending

The stop hook (`~/.claude/stop-hook-git-check.sh`) will warn if there are uncommitted files.

---

## STORE SESSION NOTES (appended by the store session — store lane only)

*Per the append-only protocol: this section is the store's; other tenant sessions please don't edit it, and I won't edit yours.*

**What it is:** **studio0x market** — a digital-products storefront (24 AI kits across 4 brands: agentEdge / eComKiller / bookedBNB / coachKit), live at **studio0x.io/store/** via GitHub Pages. Backend = Supabase project **`cmwdvxvxlfjeaknftobb`** (edge functions + Postgres).

**Store lane (this session only touches these):** `store/**`, `supabase/**`, `tools/**`, and `docs/store-EOD-*.md`. Never touches `worldcup/`, `studio0x-content/`, `tail-finder/`, `CNAME`, or Pages settings.

**Deploy:** static — GitHub Pages serves root `index.html` + `store/` from `main` (no build step). Pages `"try again later"` failures are **transient superseded-deploy noise** from high multi-tenant commit volume; the latest deploy wins, so the live site stays current. Never disable Pages / touch `CNAME`.

**Stripe:** dedicated **studio0x** account (`acct_1SXQcK...`) — NOT the `STUDIO0X LLC` account (`acct_1TM9zi...`, which is singularityLab). Store edge-function secrets are namespaced: **`STRIPE_SECRET_KEY_marketEdgeFunctions`** / **`STRIPE_WEBHOOK_SECRET_marketEdgeFunctions`** (the plain `STRIPE_SECRET_KEY` in the project belongs to singularityLab — leave it).

**Conventions:** product prices end in **7** ($27/$37/$47); brand names are camelCase. Store EOD reports live at **`docs/store-EOD-YYYY-MM-DD.md`** (distinct prefix to avoid case-twins with worldcup's `docs/eod-*.md`).

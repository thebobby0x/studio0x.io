# Studio0x — AI Sports Platform · CLAUDE.md

This file is read automatically at the start of every Claude Code session.
It captures decisions, context, and conventions that would otherwise be lost between sessions.

---

## What This Project Is

**Studio0x.io** is an AI-powered sports stats and media platform. The first deployment
is a **FIFA World Cup 2026 stats engine** at `worldcup-2026-sandy.vercel.app`.

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
| `/schedule/[matchId]` | `app/schedule/[matchId]/page.tsx` | Match detail with all metrics |
| `/standings` | `app/standings/page.tsx` | Group tables + Group Intensity™ + Elimination Proximity™ |
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
| `POST /api/seed` | Seeds teams + matches from api-football (run once on new DB) |
| `POST /api/admin/seed-players?mock=true` | Seeds 30+ key players with club/league data (mock mode, no API needed) |
| `POST /api/admin/seed-players` | Seeds players from api-football live squad data |
| `POST /api/ai/stories` | Force-regenerates story cache (also invalidated after 1hr) |
| `PATCH /api/admin/users` | Updates user role (SUPER_ADMIN only) |
| `POST /api/admin/view-as` | Sets impersonation cookie |

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

---

## Current Production State (as of 2026-06-21)

**Working:**
- Live match scores + events (api-football)
- AI Commentary (Analyst / Fan / Comedian personas, 45s auto-refresh, TTS per line)
- Tournament Stories with METRIC SPOTLIGHT category
- Go Deeper on-demand deep dive per story
- Match DNA™, Goal Gravity™, Upset Factor™, Live Win Meter on match detail pages
- Pressing Intensity Index™ and Transition Danger Rating™ on match detail pages (new)
- Form Meter™ on match detail pages for both teams (new)
- Elimination Proximity™ on standings page (new)
- Club Contribution Index™ + Player Performance Index™ on leagues page (new)
- Leagues page at `/leagues` with club/league breakdown (new)
- Admin panel at `/admin` with role switcher and user management
- Group standings, tournament odds, travel pulse, predictions, anthems

**Blocked / incomplete:**
- All Anthropic features blocked if API credit balance is zero
- PlayerTournamentStat empty until seeded — PPI™ shows empty state
- Club/league data empty until seed route is run — CCI™ shows empty state
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

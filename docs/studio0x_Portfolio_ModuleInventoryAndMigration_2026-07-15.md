# studio0x Portfolio — Module Inventory & Migration · 2026-07-15

*Cross-session document. Append-only per section (CLAUDE.md protocol): each session owns
its own sections. This section is from the **worldcup/podiumMetrics session** — the
podiumSchedule rebuild report requested in the 7/15 cross-session brief.*

---

## podiumSchedule rebuild report (worldcup session, 7/15 night)

### 2. Repo / stack / hosting (answering brief item 2 first — it frames the rest)

- **Location:** `podiumschedule/frontend/` — new tenant in the `thebobby0x/studio0x.io`
  monorepo, same pattern as `worldcup/` (own Vercel project, own Neon DB, own
  `ignoreCommand` so only `podiumschedule/**` commits build it).
- **Stack:** Next.js 15 / React 19 / TypeScript strict / Tailwind 3 (podiumMetrics
  design tokens copied verbatim — CSS-variable skin layer) / Prisma 5 / Neon Postgres.
- **Hosting target:** new Vercel project (suggest name `podiumschedule`), launch
  subdomain `podiumschedule.studio0x.io` (flat structure, GoDaddy CNAME — same
  2-click flow as podiummetrics). **Owner infra actions needed:** create Neon DB +
  Vercel project, set `DATABASE_URL`, `SYNC_SECRET`, `CRON_SECRET`, optional `TSDB_KEY`.
- **This is a fresh rebuild, not a data migration** — sources are public APIs
  (TheSportsDB + Jolpica), so data re-ingests from origin. Nothing needs exporting
  from Anything.com for v1 to function.

### Architecture requests: adopted

- **Neutral code-ID `schedule` — ratified** (also recorded in `docs/sportos-modules.md`).
  podiumSchedule is the white-label name layer.
- **SIE vocabulary from day one:** schema is `Competition → Event → Venue → Team`
  ("Event", never "match"). No World-Cup coupling anywhere.
- **No vendor-keyed records:** internal opaque cuid PKs; vendor ids live in
  `(source, sourceId)` unique *reference* columns per entity — the `Match.fixture`
  mistake (assessment §4.1) is not reproduced. **Flag for BK:** a full multi-source
  `ExternalRef` join table (N vendor refs per entity — needed when TSDB + FIFA +
  api-football all reference the same Event) is deliberately deferred to v1.1;
  the `(source, sourceId)` columns migrate to it cleanly. Ratify or pull forward.
- **Data-adapter ingest:** per-source sync functions behind one `syncCompetition()`
  dispatch; no cross-module imports (module shares zero code with worldcup/ — only
  the design-token files are copied, which is the skin contract working as intended).
- **Non-destructive sync discipline inherited from podiumMetrics' scars:** empty
  upstream response → abort, never wipe; links only upgrade null→real, never
  real→null (the 7/15 TBD-downgrade lesson, baked in from day one).

### 3. The /events query API — SHIPS IN V1 ✅

`GET /api/events?city=&sport=&competition=&team=&from=&to=&limit=` — live in the
scaffold, shaped for the known consumers named in the brief:

| Consumer | Query shape |
|---|---|
| podiumMetrics | `?competition=fifa-world-cup-2026&from=…` |
| podiumSelect (travel) | `?city=Miami&from=2026-07-01&to=2026-07-20` |
| passport (check-ins) | `?city=…&from=…&to=…` |
| arcade (prediction slates) | `?competition=…&from=…` |

Plus `GET /api/competitions` (registry + sync state) and `POST /api/sync` (per-slug
or `?all=true`; nightly Vercel cron at 03:00; auth = `SYNC_SECRET` / `CRON_SECRET`
bearer, fail-closed with no hardcoded fallback).

### 1. Data location + row-count checksums — CANNOT VERIFY FROM THIS SESSION ⚠️

This environment's network policy can't reach Anything.com/created.app or their DB,
and no connection string is available here. **BK action:** check the GSEIE project's
settings on Anything.com for a Neon connection string (portable) vs Anything-managed
storage (needs export). For v1 this is *informational only* — we re-ingest from
public sources — but the brief's checksums remain useful validation targets:

- Brief says **111 WC26 matches**; the official WC26 slate is **104** (72 group + 32
  knockout). **Discrepancy flagged, not resolved** — plausibly qualifiers/placeholders
  in GSEIE. After first sync, compare our count for `fifa-world-cup-2026` against
  both numbers and reconcile.
- **26 global league seasons** vs our v1 registry of **17 competitions** (the sync
  center's visible set + known TSDB ids 4429/4480/4455 + Jolpica F1). The other ~9
  league mappings should come from the GSEIE export or be re-mapped by id in the
  admin (popular ids footnoted in the UI).

### 4. Contradictions / notes on the brief

- None found against the repo. Two cautions:
  - The reverse-engineered FIFA endpoint (`givevoicetofootball.fifa.com`): treating
    it as optional enrichment is right, but flagging harder — it's FIFA's private
    API, keyless or not; using it in a commercial product without authorization is a
    ToS/legal exposure beyond our trademark discipline. Recommend it stays OUT until
    counsel or an official data agreement says otherwise.
  - Dev-vs-live schema drift + "ghost-fixes" warnings are moot for v1 (fresh rebuild,
    no import), but become relevant if BK wants historical GSEIE rows (e.g. the 26
    league seasons) imported rather than re-synced.

### Status & next steps

- Scaffold complete and building clean (`tsc` + `next build` ✓) — PR into `main`
  pending. Functional the moment the owner creates the Neon DB + Vercel project and
  clicks Sync.
- v1.1 candidates: ExternalRef table (above), TSDB premium key for rate limits,
  podiumMetrics reading its schedule tier from this depot, remaining league mappings.

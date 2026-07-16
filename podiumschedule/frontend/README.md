# podiumSchedule

The sportOS fixtures/schedule depot (module code-ID: `schedule`). Global sport
calendar: one queryable store for tournaments, fixtures and race weekends across
sports — TheSportsDB (soccer + more) and Jolpica (F1) behind a non-destructive
sync, serving sibling modules via the depot read API.

## Deploy (Vercel)

- Root directory: `podiumschedule/frontend`
- Env vars: `DATABASE_URL` (Neon, pooled), `SYNC_SECRET` (admin UI), `CRON_SECRET`
  (nightly 03:00 auto-sync; Vercel sends it as a bearer automatically), optional
  `TSDB_KEY` (TheSportsDB premium; defaults to the free dev key).
- Build runs `prisma db push` — tables are created automatically on first deploy.
- Deploys only trigger on `podiumschedule/**` changes (`ignoreCommand`).

## Use

- `/` — public calendar, upcoming events grouped by day, sport filter.
- `/admin` — Data Sync Center: paste `SYNC_SECRET` once (stored in the browser),
  per-competition Sync, editable TheSportsDB id + season mappings, Sync All Mapped.
- Depot read API: `GET /api/events?city=&sport=&competition=&team=&from=&to=&limit=`
- Registry + sync state: `GET /api/competitions`

## Architecture notes

SIE vocabulary (Competition → Event → Venue → Team); internal cuid keys with
`(source, sourceId)` vendor references; sync never wipes on empty upstream and
never downgrades a real link. See `docs/sportos-modules.md` and
`docs/studio0x_Portfolio_ModuleInventoryAndMigration_2026-07-15.md` at repo root.

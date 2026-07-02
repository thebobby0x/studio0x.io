# Overnight Report — 2026-07-02 (autonomous session)

Owner asked: *"Why do the same problems keep resurfacing?"* and authorized an
unsupervised overnight pass to fix the root causes permanently. Done. Summary:

## Why things kept breaking (the two design debts)

1. **The DB was a manual snapshot of a moving tournament.** api-football's data
   kept advancing (new fixtures, knockout rounds, statuses) but the DB only
   changed when someone pressed a seed button → "stale data" recurred every
   time the tournament advanced a phase.
2. **The re-seed was destructive.** It wiped and recreated teams, which severed
   anthem→team links (SetNull) every run → "anthems broken" recurred every
   re-seed. Debt #1 forced re-seeds; debt #2 made each one break anthems.

## Permanent fixes shipped tonight

| Fix | Where | Effect |
|---|---|---|
| **Nightly fixture auto-sync** | `lib/fixtureSync.ts`, runs in the 2:30am cron + "Sync Fixtures (Safe)" admin button | Non-destructive upsert: new fixtures (knockouts!), scores, statuses, TBD→real team upgrades. Diff-aware (only writes changes). Stale DB is structurally impossible now. |
| **Non-destructive seed** | `api/seed` | No longer wipes teams/players — upserts by code (stable IDs). Anthem links can never sever again. Match tables still hard-reset (that's its job). |
| **Blob auto-eviction** | `lib/blobMaintenance.ts` in the nightly cron | Purges regenerable `tts/`+`deep-dives/` caches when the store exceeds ~800 MB. The 6/30 quota-wall class of failure can't recur. |
| **One admin auth** | `lib/adminAuth.ts` across ALL admin/seed/cron routes | Accepts SUPER_ADMIN session, `Bearer CRON_SECRET`, `?secret=SEED_SECRET`. Legacy hardcoded secret works ONLY while `SEED_SECRET` is unset → rotation is self-activating. Also fixed: the ingest cron previously ignored the `?secret` param (was silently 401ing unless CRON_SECRET was set) and used a fragile internal HTTP hop — now in-process. |
| **Secret out of public UI** | predict page | Empty state no longer prints the admin secret. |
| **Results tiebreaker** | dashboard hero | Simultaneous kickoffs no longer order arbitrarily (fixture-id secondary sort). |

## Owner actions to finish the security rotation (5 min, whenever)

1. Vercel env: add **`SEED_SECRET`** (new random value) and **`CRON_SECRET`**
   (Vercel auto-authenticates crons with it). Redeploy.
2. Update `vercel.json` cron `?secret=` params to the new value (or drop them —
   CRON_SECRET covers crons) and the GH Action secret **`NEWS_REFRESH_SECRET`**.
3. Done — the hardcoded public-repo secret stops being accepted automatically.

Note: admin **buttons need nothing** — they now authenticate via your
SUPER_ADMIN session.

## What was verified
- `tsc --noEmit` clean; full `next build` passes; new `/api/admin/sync-fixtures`
  route registered. All changes net-negative in lines (−26) despite new features.

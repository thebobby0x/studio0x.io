// Single admin gate for the depot's write endpoints (sync, registry edits).
// v1: shared secrets only (no user auth yet). Fail closed: with neither env
// var set, write endpoints are disabled.
//   · ?secret= / x-sync-secret header  → SYNC_SECRET (admin UI)
//   · Authorization: Bearer <token>    → CRON_SECRET (Vercel cron auto-header)
export function isAuthorized(req: Request): boolean {
  const url = new URL(req.url);
  const syncSecret = process.env.SYNC_SECRET;
  if (syncSecret) {
    const given = url.searchParams.get("secret") ?? req.headers.get("x-sync-secret") ?? "";
    if (given === syncSecret) return true;
  }
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  return false;
}

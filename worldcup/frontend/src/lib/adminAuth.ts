import { auth } from "@/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Shared auth for ALL admin/seed/cron API routes. One place, four rules:
//
//  1. SUPER_ADMIN session          → admin UI buttons (cookie sent by browser)
//  2. Authorization: Bearer CRON_SECRET → Vercel crons (auto-sent when env set)
//  3. ?secret=<SEED_SECRET env>    → scripts / GH Actions with the rotated secret
//  4. ?secret=<legacy hardcoded>   → ONLY while SEED_SECRET is unset.
//
// Rule 4 makes secret rotation self-activating: the legacy secret lives in this
// public repo, so the moment you set SEED_SECRET in Vercel env (and redeploy),
// the hardcoded value stops being accepted — no code change needed.
// ROTATION CHECKLIST (do together): set SEED_SECRET + CRON_SECRET in Vercel env,
// update the GH Action secret NEWS_REFRESH_SECRET, update vercel.json cron
// ?secret= params (or rely on CRON_SECRET), redeploy.
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_SECRET = "wc2026studio0x";

export async function isAdminAuthed(req: Request): Promise<boolean> {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  // 3. Rotated secret from env
  if (process.env.SEED_SECRET && secret === process.env.SEED_SECRET) return true;

  // 4. Legacy hardcoded secret — auto-retired once SEED_SECRET exists
  if (!process.env.SEED_SECRET && secret === LEGACY_SECRET) return true;

  // 2. Vercel cron auth
  const header = req.headers.get("authorization");
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`) return true;

  // 1. Logged-in SUPER_ADMIN (admin dashboard buttons)
  try {
    const session = await auth();
    if (session?.user?.role === "SUPER_ADMIN") return true;
  } catch {
    // No session context (e.g. cron invocation) — fall through
  }

  return false;
}

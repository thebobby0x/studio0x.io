import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { syncLiveMatches, getQuotaSnapshot, type LiveSyncResult } from "@/lib/matchStatsIngest";

export const dynamic = "force-dynamic";
// Headroom over LOOP_BUDGET_MS so the final in-flight poll can finish and the
// response can still be written. Vercel Pro allows up to 300s.
export const maxDuration = 90;

// ── Live stats cron ─────────────────────────────────────────────────────────
//
// Vercel's minimum cron granularity is ONE MINUTE, which is too slow to feel
// live. To go sub-minute without sub-minute crons, each invocation polls in a
// loop: poll → wait LIVE_SYNC_INTERVAL_MS → poll → … until the time budget is
// spent. The cron fires every minute (vercel.json "* * * * *"), so the loop just
// fills the gap between firings.
//
// Iterations are NOT hardcoded — they're derived from the interval and the
// remaining time budget, so changing the env var alone changes the cadence:
//
//   LIVE_SYNC_INTERVAL_MS=20000 → ~3 polls/invocation  (~20s effective)
//   LIVE_SYNC_INTERVAL_MS=10000 → ~5 polls/invocation  (~10s effective)
//   LIVE_SYNC_INTERVAL_MS=3000  → ~18 polls/invocation (~3s effective)
//
// ── COST, because this multiplies api-football usage linearly ───────────────
// One poll costs (matches in play) × 2 calls. Per 90-minute window with FOUR
// simultaneous matches:
//
//   interval   polls/min   calls/min   calls/90min
//   60s (none)      1           8           720
//   20s             3          24         2,160
//   10s             6          48         4,320
//    3s            18         144        12,960
//
// So the 20s default already costs ~3× the un-looped route, and it is the
// highest setting that fits a 7,500/day Pro plan across a couple of match slots.
// **3000–5000ms is an ENTERPRISE-plan setting (50k+ calls/day).** On 7,500/day a
// single 90-minute window at 3s would exhaust the entire daily budget and take
// live data down for the rest of the day — precisely the 7/18 outage recorded in
// CLAUDE.md gotcha #25, where the quota ran out mid-match and the platform froze
// at 51'. The quota guard below exists so that can't happen silently.
//
// Guards, in order of precedence:
//   1. Provider quota  — the loop stops when api-football's own
//      x-ratelimit-requests-remaining falls under QUOTA_RESERVE. Authoritative:
//      it counts calls from every route and every instance, which a local
//      counter cannot.
//   2. Match window    — syncLiveMatches() fetches nothing unless a kickoff is
//      within ±120 minutes, so off-peak invocations cost zero calls.
//   3. In-play only    — only LIVE/HT fixtures are polled.
//   4. Time budget     — never overruns the function timeout.
// Any of 1–3 also ends the loop early, because continuing would poll nothing.

/** Total wall-clock the loop may consume, leaving room to write the response. */
const LOOP_BUDGET_MS = 55_000;

/** Floor on the interval. Below this the loop is pure quota burn — the provider
 *  does not update fixture statistics faster than a few seconds anyway. */
const MIN_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 60_000;
const DEFAULT_INTERVAL_MS = 20_000;

/** Stop looping while this many daily calls remain, so the nightly ingest, the
 *  schedule route and the per-match live route are never starved by this loop. */
const QUOTA_RESERVE = 300;

function resolveIntervalMs(override?: string | null): number {
  const raw = override ?? process.env.LIVE_SYNC_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(n)));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  // ?intervalMs= overrides for a single manual run (admin testing) without
  // touching the env var that the cron uses.
  const intervalMs = resolveIntervalMs(searchParams.get("intervalMs"));
  const startedAt = Date.now();

  const polls: Array<LiveSyncResult & { pollStartedMs: number }> = [];
  let stoppedBecause = "time budget spent";

  for (;;) {
    const pollStartedMs = Date.now() - startedAt;
    const result = await syncLiveMatches(120).catch((e) => ({
      ok: false as const, skipped: String(e), inWindow: false, liveMatches: 0,
      statsOk: 0, eventsOk: 0, apiCalls: 0,
      details: [] as Array<{ fixture: number; stats: string; events: string }>,
    }));
    polls.push({ ...result, pollStartedMs });

    // Nothing to poll — looping would just re-run the same two cheap DB queries.
    if (!result.inWindow) { stoppedBecause = result.skipped ?? "outside match window"; break; }
    if (result.liveMatches === 0) { stoppedBecause = "no matches in play"; break; }

    // Provider quota is the hard stop.
    const quota = getQuotaSnapshot();
    if (quota.dailyRemaining != null && quota.dailyRemaining <= QUOTA_RESERVE) {
      stoppedBecause = `api-football daily quota low (${quota.dailyRemaining} left, reserve ${QUOTA_RESERVE})`;
      break;
    }
    if (quota.minuteRemaining != null && quota.minuteRemaining <= 2) {
      stoppedBecause = "api-football per-minute rate limit nearly reached";
      break;
    }

    // Room for another full cycle inside the budget?
    const elapsed = Date.now() - startedAt;
    if (elapsed + intervalMs >= LOOP_BUDGET_MS) break;
    await sleep(intervalMs);
  }

  const last = polls[polls.length - 1];
  const totalApiCalls = polls.reduce((s, p) => s + p.apiCalls, 0);

  return NextResponse.json({
    ok: polls.some((p) => p.ok),
    intervalMs,
    polls: polls.length,
    stoppedBecause,
    totalApiCalls,
    elapsedMs: Date.now() - startedAt,
    // Effective cadence achieved this invocation, for sanity-checking the env var.
    effectiveIntervalMs: polls.length > 1 ? Math.round((Date.now() - startedAt) / polls.length) : null,
    liveMatches: last?.liveMatches ?? 0,
    statsOk: last?.statsOk ?? 0,
    eventsOk: last?.eventsOk ?? 0,
    quota: getQuotaSnapshot(),
    lastPoll: last ? { skipped: last.skipped ?? null, details: last.details } : null,
  });
}

export async function POST(req: Request) { return GET(req); }

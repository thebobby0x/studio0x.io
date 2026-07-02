import { list, del } from "@vercel/blob";

// ─────────────────────────────────────────────────────────────────────────────
// Automatic Blob-quota protection. The 1 GB Hobby store filling up silently
// killed ALL audio writes (TTS + anthem imports) on 6/30 — see CLAUDE.md
// gotcha #15. This runs in the nightly cron: when usage crosses the threshold,
// it purges the regenerable caches (tts/, deep-dives/) so the store can never
// creep to the quota wall again. Anthems are NEVER touched here.
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLD_BYTES = 800 * 1e6; // evict when store exceeds ~800 MB (quota is 1 GB)
const CACHE_PREFIXES = ["tts/", "deep-dives/"];

export interface EvictionResult {
  ok: boolean;
  skipped?: string;
  totalMB: number;
  evicted: number;
  freedMB: number;
}

export async function evictCachesIfNearQuota(): Promise<EvictionResult> {
  const result: EvictionResult = { ok: false, totalMB: 0, evicted: 0, freedMB: 0 };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    result.skipped = "BLOB_READ_WRITE_TOKEN not set";
    return result;
  }

  try {
    let totalBytes = 0;
    const cacheBlobs: { url: string; size: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ cursor, limit: 1000 });
      for (const b of page.blobs) {
        totalBytes += b.size;
        if (CACHE_PREFIXES.some((p) => b.pathname.startsWith(p))) {
          cacheBlobs.push({ url: b.url, size: b.size });
        }
      }
      cursor = page.cursor || undefined;
    } while (cursor);

    result.totalMB = +(totalBytes / 1e6).toFixed(1);

    if (totalBytes < THRESHOLD_BYTES) {
      result.ok = true;
      result.skipped = `usage ${result.totalMB}MB below ${THRESHOLD_BYTES / 1e6}MB threshold`;
      return result;
    }

    let freed = 0;
    for (let i = 0; i < cacheBlobs.length; i += 100) {
      const slice = cacheBlobs.slice(i, i + 100);
      await del(slice.map((b) => b.url));
      freed += slice.reduce((a, b) => a + b.size, 0);
      result.evicted += slice.length;
    }
    result.freedMB = +(freed / 1e6).toFixed(1);
    result.ok = true;
    return result;
  } catch (e) {
    result.skipped = `eviction error: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }
}

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { storyScope } from "@/lib/storyScope";
import { SPORT } from "@/lib/sportConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Audio chain diagnostics — answers "why is there no sound?" with a fact.
//
// Two DIFFERENT audio systems get confused with each other constantly:
//
//   1. Story / commentary narration — ElevenLabs TTS, generated ON DEMAND when a
//      listener presses play, cached in Vercel Blob under a hash of the spoken
//      text. Nothing is pre-generated, so regenerating stories never leaves them
//      "without audio" — but it does need ELEVENLABS_API_KEY *and* a Blob store
//      with room in it.
//   2. Anthems — real mp3 files imported from Google Drive into Blob. Needs
//      GOOGLE_DRIVE_API_KEY to LIST a folder on club deployments.
//
// CLAUDE.md gotcha #15: a full Blob store fails EVERY write, which looks exactly
// like a missing API key. This route separates the two by actually exercising
// the chain rather than only reporting which env vars exist.
//
// ?synth=true performs a real ~20-character round trip (key → ElevenLabs →
// Blob). It costs a fraction of a cent and is the only way to prove the whole
// path works; without it the check is env-presence only and free.
// ─────────────────────────────────────────────────────────────────────────────

const PROBE_TEXT = "studio0x audio check.";

// Vercel Blob Hobby ceiling. Every put() fails once the store reaches it — TTS
// AND anthem imports — while reads keep working, so the app looks healthy while
// nothing new can be written (CLAUDE.md gotcha #15).
const BLOB_QUOTA_MB = 1000;

/**
 * Blob usage by prefix, and — the question that decides whether a purge is safe
 * — whether this store looks SHARED with another deployment.
 *
 * TTS keys are namespaced `tts/<deployment>/…` since 8/5. Two signals matter:
 *   · another deployment's namespace present → the store is definitely shared.
 *   · flat `tts/<hash>.mp3` keys present → written before namespacing, so they
 *     are unattributable and could belong to either site.
 * Neither is proof of a dedicated store; only the Vercel dashboard is.
 */
async function blobUsage(): Promise<{
  totalMB: number; ttsMB: number; anthemsMB: number; otherMB: number;
  reclaimableMB: number; percentOfQuota: number; count: number;
  ownTtsMB: number; legacyTtsMB: number; legacyTtsCount: number;
  otherDeploymentNamespaces: string[]; sharedStore: "yes" | "unknown";
} | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    let cursor: string | undefined;
    let total = 0, tts = 0, anthems = 0, count = 0;
    let ownTts = 0, legacyTts = 0, legacyTtsCount = 0;
    const namespaces = new Set<string>();
    do {
      const res = await list({ cursor, limit: 1000 });
      for (const b of res.blobs) {
        count++;
        total += b.size;
        const p = b.pathname;
        if (p.startsWith("tts/") || p.startsWith("deep-dives/")) {
          tts += b.size;
          const ns = p.startsWith("tts/") ? p.split("/")[1] : null;
          if (ns && p.split("/").length > 2) {
            namespaces.add(ns);
            if (ns === SPORT.id) ownTts += b.size;
          } else {
            legacyTts += b.size;
            legacyTtsCount++;
          }
        } else if (p.startsWith("anthems/")) anthems += b.size;
      }
      cursor = res.cursor || undefined;
    } while (cursor);
    const mb = (n: number) => +(n / 1e6).toFixed(1);
    const others = [...namespaces].filter((n) => n !== SPORT.id);
    return {
      totalMB: mb(total), ttsMB: mb(tts), anthemsMB: mb(anthems),
      otherMB: mb(total - tts - anthems),
      // Only what THIS deployment owns is safely reclaimable without a decision.
      reclaimableMB: mb(ownTts),
      percentOfQuota: Math.round((total / 1e6 / BLOB_QUOTA_MB) * 100),
      count,
      ownTtsMB: mb(ownTts),
      legacyTtsMB: mb(legacyTts),
      legacyTtsCount,
      otherDeploymentNamespaces: others,
      sharedStore: others.length > 0 ? "yes" : "unknown",
    };
  } catch {
    return null;
  }
}

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const synth = searchParams.get("synth") === "true";

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasVoice = !!process.env.ELEVENLABS_VOICE_ID;
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const hasDriveKey = !!process.env.GOOGLE_DRIVE_API_KEY;

  const [anthemCount, anthemsWithUrl, storyCount, storiesWithAudio, blob] = await Promise.all([
    prisma.audioStream.count().catch(() => -1),
    prisma.audioStream.count({ where: { NOT: { audioUrl: "" } } }).catch(() => -1),
    prisma.newsStory.count({ where: storyScope() }).catch(() => -1),
    prisma.newsStory.count({ where: { ...storyScope(), NOT: { audioUrl: null } } }).catch(() => -1),
    blobUsage(),
  ]);

  // Ordered worst-first: the first blocker is the one to fix.
  const blockers: string[] = [];
  if (!hasElevenLabs) blockers.push("Audio generation requires ELEVENLABS_API_KEY — set it in Vercel env.");
  if (!hasBlob) blockers.push("BLOB_READ_WRITE_TOKEN is not set — generated audio cannot be cached, so every play fails.");
  // The quota wall is the single most common cause of "audio unavailable", and
  // it is silent: reads keep working, so nothing looks broken until a write.
  if (blob && blob.percentOfQuota >= 90) {
    blockers.push(
      `Vercel Blob is at ${blob.percentOfQuota}% of the ${BLOB_QUOTA_MB}MB quota — every new audio write fails. ` +
      (blob.reclaimableMB > 0
        ? `Run "Free Up Audio Storage" to reclaim ~${blob.reclaimableMB}MB owned by this deployment.`
        : `NOTHING is safely reclaimable by this deployment alone: ${blob.legacyTtsCount} un-namespaced blob(s) ` +
          `(${blob.legacyTtsMB}MB) predate namespacing and may belong to another site sharing this store. ` +
          `Confirm in the Vercel dashboard whether worldcup-2026 and leaguescup use the same Blob store before purging them.`),
    );
  }
  if (blob?.sharedStore === "yes") {
    blockers.push(
      `This Blob store is SHARED — it also holds namespaces: ${blob.otherDeploymentNamespaces.join(", ")}. ` +
      `Purging un-namespaced blobs here would clear that deployment's narration cache too (regenerable, but it re-bills on next play).`,
    );
  }
  if (!hasVoice) blockers.push("ELEVENLABS_VOICE_ID is not set — the default narration voice is unconfigured.");
  if (anthemCount === 0) {
    blockers.push(
      hasDriveKey
        ? "No anthems imported yet — run \"Discover Anthems\", then \"Reimport ALL Anthems\"."
        : "No anthems imported, and GOOGLE_DRIVE_API_KEY is not set — folder discovery cannot list the Drive tree.",
    );
  } else if (anthemsWithUrl >= 0 && anthemsWithUrl < anthemCount) {
    blockers.push(`${anthemCount - anthemsWithUrl} anthem row(s) have no audioUrl — re-run the anthem import.`);
  }

  let probe: { ok: boolean; detail: string } | null = null;
  if (synth) {
    if (!hasElevenLabs) {
      probe = { ok: false, detail: "skipped — ELEVENLABS_API_KEY not set" };
    } else {
      try {
        // Same route the player uses, so the probe exercises the real path
        // (cap checks, hashing, Blob write) rather than a parallel one.
        const origin = new URL(req.url).origin;
        const res = await fetch(`${origin}/api/ai/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: PROBE_TEXT }),
        });
        const json = await res.json().catch(() => ({})) as { url?: string; error?: string; cached?: boolean };
        probe = json.url
          ? { ok: true, detail: `synthesized + cached (${json.cached ? "cache hit" : "fresh"})` }
          : { ok: false, detail: `HTTP ${res.status}: ${json.error ?? "no url returned"}` };
      } catch (e) {
        probe = { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    }
    if (probe && !probe.ok) blockers.push(`TTS round-trip failed — ${probe.detail}`);
  }

  return NextResponse.json({
    ok: blockers.length === 0,
    // Narration (stories, commentary, Go Deeper) — ON DEMAND, never pre-generated.
    narration: {
      generatedAt: "play time (on demand), cached in Vercel Blob by text hash",
      elevenLabsKey: hasElevenLabs,
      voiceId: hasVoice,
      blobToken: hasBlob,
      probe,
    },
    // Anthems — imported mp3s, a completely separate system from narration.
    anthems: { total: anthemCount, withAudioUrl: anthemsWithUrl, driveApiKey: hasDriveKey },
    // Where the audio actually LIVES. Note this is Vercel Blob, not ElevenLabs:
    // ElevenLabs synthesises and hands back bytes, it stores nothing for us, so
    // clearing ElevenLabs history would free none of this.
    blobStorage: blob ?? "unavailable (no BLOB_READ_WRITE_TOKEN, or list failed)",
    stories: { total: storyCount, withPersistedAudio: storiesWithAudio },
    blockers,
    hint: blockers[0] ?? "Audio chain looks healthy.",
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";

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

  const [anthemCount, anthemsWithUrl] = await Promise.all([
    prisma.audioStream.count().catch(() => -1),
    prisma.audioStream.count({ where: { NOT: { audioUrl: "" } } }).catch(() => -1),
  ]);

  // Ordered worst-first: the first blocker is the one to fix.
  const blockers: string[] = [];
  if (!hasElevenLabs) blockers.push("Audio generation requires ELEVENLABS_API_KEY — set it in Vercel env.");
  if (!hasBlob) blockers.push("BLOB_READ_WRITE_TOKEN is not set — generated audio cannot be cached, so every play fails.");
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
    blockers,
    hint: blockers[0] ?? "Audio chain looks healthy.",
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }

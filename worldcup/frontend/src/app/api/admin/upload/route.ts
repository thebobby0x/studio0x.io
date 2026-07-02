import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";


function extractDriveId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

// POST with multipart FormData (file upload) or JSON { driveUrl, filename? } (Drive import)
export async function POST(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const { driveUrl, filename: hint } = (await req.json()) as { driveUrl: string; filename?: string };
    const fileId = extractDriveId(driveUrl);
    if (!fileId) return NextResponse.json({ error: "Invalid Google Drive URL — share the file and paste the share link." }, { status: 400 });

    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let audioRes: Response;
    try {
      audioRes = await fetch(downloadUrl, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!audioRes.ok || !audioRes.body) {
      return NextResponse.json({ error: `Drive download failed (${audioRes.status})` }, { status: 502 });
    }

    const filename = `anthems/${hint ?? `import-${Date.now()}.mp3`}`;
    const blob = await put(filename, audioRes.body, {
      access: "public",
      contentType: audioRes.headers.get("content-type") ?? "audio/mpeg",
    });
    return NextResponse.json({ url: blob.url });
  }

  // Multipart file upload
  const form = await req.formData();
  const file = form.get("audio") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "No audio file received." }, { status: 400 });

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`anthems/${Date.now()}-${safe}`, file, {
    access: "public",
    contentType: file.type || "audio/mpeg",
  });
  return NextResponse.json({ url: blob.url, size: file.size });
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive folder listing (Drive API v3 `files.list`).
//
// WHY THIS EXISTS: every anthem path in this codebase downloads by hardcoded FILE
// id (`drive.usercontent.google.com/download?id=…`, which needs no auth for a
// public file). Nothing ever LISTED a folder. WC26 didn't need it — its 54 tracks
// are enumerated in src/lib/anthemManifest.ts.
//
// LC26's tracks live in a Drive folder tree instead:
//   Anthems_LeaguesCup_2026/
//     ├── 01_MLS_Clubs/
//     ├── 02_LigaMX_Clubs/
//     └── 03_Tournament_Generic/
// so the importer has to walk it. Listing (unlike downloading) requires an API
// key even for public folders: set GOOGLE_DRIVE_API_KEY (Google Cloud Console →
// Credentials → API key, with the Drive API enabled; restrict it to the Drive API).
//
// Read-only and non-destructive by construction — this module only lists.
// ─────────────────────────────────────────────────────────────────────────────

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Folder this file was found in — the LC26 importer maps folder → league. */
  parentFolderId: string;
  parentFolderName: string;
}

export interface DriveListResult {
  ok: boolean;
  files: DriveFile[];
  foldersVisited: { id: string; name: string; fileCount: number }[];
  error?: string;
}

function isAudio(f: { name: string; mimeType: string }): boolean {
  return f.mimeType.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg)$/i.test(f.name);
}

async function listChildren(
  folderId: string,
  apiKey: string,
): Promise<{ ok: boolean; items: { id: string; name: string; mimeType: string }[]; error?: string }> {
  const items: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: "1000",
      key: apiKey,
      // Needed for files inside Shared Drives; harmless for My Drive folders.
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    let res: Response;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      res = await fetch(`${DRIVE_API}?${params}`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
    } catch (e) {
      return { ok: false, items, error: `Drive list request failed: ${String(e)}` };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 403/404 here almost always means the folder isn't shared publicly or the
      // key lacks Drive API access — say which, rather than returning "0 files"
      // and letting a caller mistake that for "the folder is empty".
      return {
        ok: false,
        items,
        error:
          `Drive list returned ${res.status} for folder ${folderId}. ` +
          `Check the folder is shared "Anyone with the link" and GOOGLE_DRIVE_API_KEY has the Drive API enabled. ${body.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      files?: { id: string; name: string; mimeType: string }[];
      nextPageToken?: string;
    };
    items.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return { ok: true, items };
}

/**
 * Walk a Drive folder tree and return every audio file found, tagged with the
 * folder it came from. Depth-limited so a cyclic/huge tree can't hang the route.
 *
 * A failure ANYWHERE in the walk sets ok:false and is reported. Callers must not
 * treat a partial or failed listing as "the folder is empty" — pruning against
 * an empty listing would delete every anthem.
 */
export async function listAudioFilesRecursive(
  rootFolderId: string,
  opts: { apiKey?: string; maxDepth?: number; rootName?: string } = {},
): Promise<DriveListResult> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_DRIVE_API_KEY ?? "";
  const maxDepth = opts.maxDepth ?? 3;

  const result: DriveListResult = { ok: false, files: [], foldersVisited: [] };

  if (!apiKey) {
    result.error =
      "GOOGLE_DRIVE_API_KEY not set — cannot list Drive folders. " +
      "Create an API key in Google Cloud Console with the Drive API enabled and add it to the Vercel project.";
    return result;
  }

  const seen = new Set<string>();
  const queue: { id: string; name: string; depth: number }[] = [
    { id: rootFolderId, name: opts.rootName ?? "(root)", depth: 0 },
  ];

  while (queue.length > 0) {
    const folder = queue.shift()!;
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);

    const listed = await listChildren(folder.id, apiKey);
    if (!listed.ok) {
      result.error = listed.error;
      return result; // fail closed — never report a partial tree as complete
    }

    let fileCount = 0;
    for (const item of listed.items) {
      if (item.mimeType === FOLDER_MIME) {
        if (folder.depth < maxDepth) {
          queue.push({ id: item.id, name: item.name, depth: folder.depth + 1 });
        }
        continue;
      }
      if (!isAudio(item)) continue;
      fileCount++;
      result.files.push({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        parentFolderId: folder.id,
        parentFolderName: folder.name,
      });
    }
    result.foldersVisited.push({ id: folder.id, name: folder.name, fileCount });
  }

  result.ok = true;
  return result;
}

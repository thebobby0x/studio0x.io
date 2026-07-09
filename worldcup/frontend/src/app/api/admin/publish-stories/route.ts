import { NextResponse } from "next/server";
import type { Story } from "@/app/api/ai/stories/route";
import { isAdminAuthed as checkAuth } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;


function storiesToMarkdown(stories: Story[], date: string): string {
  const lines = [
    `# studio0x World Cup 2026 — ${date}`,
    "",
    `*AI-generated match analysis powered by studio0x · [studio0x.io](https://worldcup-2026-sandy.vercel.app)*`,
    "",
    "---",
    "",
  ];

  for (const s of stories) {
    lines.push(`## ${s.headline}`);
    lines.push(`**${s.category}** · ${s.teamsInvolved.join(" vs ")}`);
    lines.push("");
    lines.push(s.body);
    lines.push("");
    if (s.audioUrl) {
      lines.push(`🎙️ [Listen](${s.audioUrl})`);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push(`*Generated ${new Date().toUTCString()} · [studio0x](https://worldcup-2026-sandy.vercel.app)*`);
  return lines.join("\n");
}

function storiesToRssItem(story: Story, date: string): string {
  const pubDate = new Date().toUTCString();
  const audioTag = story.audioUrl
    ? `<enclosure url="${story.audioUrl}" type="audio/mpeg" length="0"/>`
    : "";
  return `
    <item>
      <title>${escapeXml(story.headline)}</title>
      <description>${escapeXml(story.body)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid>studio0x-${date}-${story.id}</guid>
      <link>https://worldcup-2026-sandy.vercel.app</link>
      ${audioTag}
    </item>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function pushToGitHub(
  repo: string,
  path: string,
  content: string,
  message: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const [owner, repoName] = repo.split("/");
  const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

  // Check if file exists (need SHA to update)
  let sha: string | undefined;
  try {
    const existing = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (existing.ok) {
      const data = await existing.json() as { sha: string };
      sha = data.sha;
    }
  } catch {
    // File doesn't exist yet — create it
  }

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err };
  }
  return { ok: true };
}

// POST /api/admin/publish-stories?secret=...
// Body: { stories: Story[] } or empty (will fetch from /api/ai/stories)
export async function POST(req: Request) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ghToken = process.env.CONTENT_REPO_TOKEN;
  const contentRepo = process.env.CONTENT_REPO ?? "thebobby0x/studio0x-content";

  if (!ghToken) {
    return NextResponse.json({ error: "CONTENT_REPO_TOKEN env var not set" }, { status: 500 });
  }

  // Use provided stories or fetch current ones
  let stories: Story[];
  const body = await req.text();
  if (body) {
    const parsed = JSON.parse(body) as { stories?: Story[] };
    stories = parsed.stories ?? [];
  } else {
    stories = [];
  }

  if (stories.length === 0) {
    return NextResponse.json({ error: "No stories to publish — provide stories in request body" }, { status: 400 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const markdown = storiesToMarkdown(stories, date);
  const json = JSON.stringify({ date, stories, generatedAt: new Date().toISOString() }, null, 2);

  const results: Record<string, { ok: boolean; error?: string }> = {};

  // Push markdown
  results.markdown = await pushToGitHub(
    contentRepo,
    `stories/${date}.md`,
    markdown,
    `stories: ${date} — ${stories.length} stories`,
    ghToken,
  );

  // Push JSON
  results.json = await pushToGitHub(
    contentRepo,
    `stories/${date}.json`,
    json,
    `data: ${date} stories JSON`,
    ghToken,
  );

  // Push/update podcast RSS feed
  const rssItems = stories.filter((s) => s.audioUrl).map((s) => storiesToRssItem(s, date)).join("");
  if (rssItems) {
    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>studio0x World Cup 2026 Digest</title>
    <link>https://worldcup-2026-sandy.vercel.app</link>
    <description>AI-powered match analysis and tournament stories from studio0x, the world's first AI sports analytics platform.</description>
    <language>en-us</language>
    <itunes:category text="Sports"/>
    <itunes:author>studio0x AI</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    ${rssItems}
  </channel>
</rss>`;
    results.podcast_rss = await pushToGitHub(
      contentRepo,
      "podcast/feed.xml",
      rssFeed,
      `podcast: update RSS feed ${date}`,
      ghToken,
    );
  }

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, date, pushed: Object.keys(results), results });
}

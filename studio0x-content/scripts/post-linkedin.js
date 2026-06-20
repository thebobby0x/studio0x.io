#!/usr/bin/env node
// Post top story to LinkedIn as a text post with link
const fs = require("fs");

const file = process.argv[2];
if (!file) { console.error("No file provided"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const stories = data.stories ?? [];
if (!stories.length) { console.log("No stories to post"); process.exit(0); }

// Build a LinkedIn post from the top 3 stories
const top = stories.slice(0, 3);
const lines = [
  `⚽ Studio0x World Cup 2026 Analysis — ${data.date}`,
  "",
  ...top.flatMap((s) => [
    `📌 ${s.headline}`,
    s.body.slice(0, 200) + (s.body.length > 200 ? "…" : ""),
    "",
  ]),
  "🔗 Full analysis + live odds: https://worldcup-2026-sandy.vercel.app",
  "",
  "#WorldCup2026 #Soccer #Football #AIAnalysis #Studio0x",
];

const text = lines.join("\n");
const urn = process.env.LINKEDIN_PERSON_URN;
const token = process.env.LINKEDIN_ACCESS_TOKEN;

if (!urn || !token) { console.error("Missing LINKEDIN_PERSON_URN or LINKEDIN_ACCESS_TOKEN"); process.exit(1); }

async function post() {
  const body = {
    author: urn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("LinkedIn error:", err);
    process.exit(1);
  }

  const result = await res.json();
  console.log("Posted to LinkedIn:", result.id);
}

post().catch(console.error);

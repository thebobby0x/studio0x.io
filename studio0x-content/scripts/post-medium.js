#!/usr/bin/env node
// Publish daily stories as a Medium article
const fs = require("fs");

const file = process.argv[2];
if (!file) { console.error("No file provided"); process.exit(1); }

const markdown = fs.readFileSync(file, "utf8");
const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

const token = process.env.MEDIUM_INTEGRATION_TOKEN;
const authorId = process.env.MEDIUM_AUTHOR_ID;
if (!token || !authorId) { console.error("Missing MEDIUM_INTEGRATION_TOKEN or MEDIUM_AUTHOR_ID"); process.exit(1); }

async function publish() {
  // Get author ID if not provided
  let userId = authorId;
  if (userId === "auto") {
    const meRes = await fetch("https://api.medium.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await meRes.json();
    userId = me.data.id;
  }

  const body = {
    title: `Studio0x World Cup 2026 Analysis — ${date}`,
    contentFormat: "markdown",
    content: markdown,
    tags: ["world-cup-2026", "soccer", "football", "ai", "sports-analytics"],
    publishStatus: "public",
    canonicalUrl: `https://worldcup-2026-sandy.vercel.app`,
  };

  const res = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Medium error:", err);
    process.exit(1);
  }

  const result = await res.json();
  console.log("Published to Medium:", result.data.url);
}

publish().catch(console.error);

#!/usr/bin/env node
// Post stories as a Twitter/X thread
const fs = require("fs");
const { TwitterApi } = require("twitter-api-v2");

const file = process.argv[2];
if (!file) { console.error("No file provided"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const stories = data.stories ?? [];
if (!stories.length) { console.log("No stories to post"); process.exit(0); }

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

async function postThread() {
  const tweets = [
    // Opening tweet
    `⚽ #WorldCup2026 Analysis — ${data.date}\n\nStudio0x AI breaks down today's matches 🧵👇\n\nhttps://worldcup-2026-sandy.vercel.app`,
    // One tweet per story
    ...stories.slice(0, 4).map((s) => {
      const flags = s.teamsInvolved.slice(0, 2).join(" vs ");
      const body = s.body.slice(0, 200) + (s.body.length > 200 ? "…" : "");
      return `📌 ${s.headline}\n\n${body}\n\n${flags} #WorldCup2026`;
    }),
    // Closing CTA
    `🔗 Live odds, Match DNA™ metrics & more:\nhttps://worldcup-2026-sandy.vercel.app\n\n#Soccer #Football #Studio0x #AI`,
  ];

  let lastId;
  for (const text of tweets) {
    const params = lastId ? { text, reply: { in_reply_to_tweet_id: lastId } } : { text };
    const { data: tweet } = await client.v2.tweet(params);
    lastId = tweet.id;
    console.log("Posted tweet:", tweet.id);
  }
}

postThread().catch(console.error);

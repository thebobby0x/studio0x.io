# studio0x-content

AI-generated World Cup 2026 match analysis, automatically published from [studio0x.io](https://worldcup-2026-sandy.vercel.app).

## Structure

```
stories/
  YYYY-MM-DD.json   — structured story data (headline, body, category, audio URL)
  YYYY-MM-DD.md     — formatted markdown for Medium / LinkedIn
podcast/
  feed.xml          — RSS feed (submit to Apple Podcasts + Spotify)
scripts/
  post-linkedin.js  — LinkedIn API posting
  post-x.js         — X / Twitter thread posting
  post-medium.js    — Medium article publishing
  gen-video.sh      — YouTube Shorts video generation (FFmpeg)
```

## How it works

1. Studio0x generates 5 editorial stories via Claude Haiku from real match data
2. ElevenLabs converts each story to audio (stored in Vercel Blob)
3. `/api/admin/publish-stories` pushes JSON + Markdown + updated podcast RSS here
4. GitHub Actions fire on push → distribute to LinkedIn, X, Medium, YouTube

## Required GitHub Secrets

| Secret | Where to get it |
|--------|----------------|
| `LINKEDIN_ACCESS_TOKEN` | [LinkedIn Developer Portal](https://developer.linkedin.com) — create an app, request `w_member_social` scope |
| `LINKEDIN_PERSON_URN` | Your LinkedIn person URN (e.g. `urn:li:person:AbC123`) |
| `TWITTER_API_KEY` | [developer.twitter.com](https://developer.twitter.com) |
| `TWITTER_API_SECRET` | Same |
| `TWITTER_ACCESS_TOKEN` | Same |
| `TWITTER_ACCESS_SECRET` | Same |
| `MEDIUM_INTEGRATION_TOKEN` | [medium.com/me/settings](https://medium.com/me/settings) → Integration tokens |
| `MEDIUM_AUTHOR_ID` | From Medium API: `GET https://api.medium.com/v1/me` |

## Podcast

The `podcast/feed.xml` is a valid RSS 2.0 + iTunes podcast feed.

**Submit once:**
- Apple Podcasts: [podcastsconnect.apple.com](https://podcastsconnect.apple.com)
- Spotify: [podcasters.spotify.com](https://podcasters.spotify.com)
- After submission, new episodes appear automatically on each push.

**Feed URL:** `https://raw.githubusercontent.com/thebobby0x/studio0x-content/main/podcast/feed.xml`

#!/usr/bin/env bash
# Generate a YouTube Shorts video from a story JSON file
# Requires: ffmpeg, curl, node
# Output: 9:16 vertical video (1080x1920) — 60s max

set -e

FILE="$1"
if [ -z "$FILE" ]; then echo "Usage: gen-video.sh <stories/YYYY-MM-DD.json>"; exit 1; fi

DATE=$(echo "$FILE" | grep -oP '\d{4}-\d{2}-\d{2}')
STORY=$(node -e "
  const d = require('./$FILE');
  const s = d.stories.find(s => s.audioUrl) || d.stories[0];
  console.log(JSON.stringify(s));
")

HEADLINE=$(echo "$STORY" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',x=>d+=x); process.stdin.on('end',()=>console.log(JSON.parse(d).headline));")
AUDIO_URL=$(echo "$STORY" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',x=>d+=x); process.stdin.on('end',()=>console.log(JSON.parse(d).audioUrl||''));")

echo "Generating video for: $HEADLINE"

# Download audio
if [ -n "$AUDIO_URL" ]; then
  curl -sL "$AUDIO_URL" -o /tmp/story-audio.mp3
  AUDIO_INPUT="-i /tmp/story-audio.mp3"
  AUDIO_MAP="-map 1:a"
else
  AUDIO_INPUT=""
  AUDIO_MAP="-an"
fi

# Create background (Studio0x branded — deep navy #060b18)
ffmpeg -y \
  -f lavfi -i "color=c=0x060b18:size=1080x1920:rate=30" \
  $AUDIO_INPUT \
  -vf "
    drawtext=text='STUDIO0X':fontcolor=f59e0b:fontsize=48:x=(w-text_w)/2:y=200:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf,
    drawtext=text='World Cup 2026 Analysis':fontcolor=ffffff:fontsize=36:x=(w-text_w)/2:y=270:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,
    drawtext=text='$DATE':fontcolor=94a3b8:fontsize=28:x=(w-text_w)/2:y=320:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,
    drawtext=textfile=/tmp/headline.txt:fontcolor=ffffff:fontsize=52:x=80:y=500:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:line_spacing=20:wrap_unicode=1:fix_bounds=1,
    drawtext=text='worldcup-2026-sandy.vercel.app':fontcolor=f59e0b:fontsize=32:x=(w-text_w)/2:y=1800:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
  " \
  -t 60 \
  $AUDIO_MAP \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -shortest \
  /tmp/studio0x-short.mp4

echo "Video generated: /tmp/studio0x-short.mp4"

# TODO: Upload to YouTube via YouTube Data API v3
# Requires: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
# See: https://developers.google.com/youtube/v3/guides/uploading_a_video
echo "Upload to YouTube: set YOUTUBE_* secrets and add upload step"

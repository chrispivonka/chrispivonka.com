#!/usr/bin/env bash
# go-live.sh — Update the kittycam YouTube stream ID instantly (no redeploy needed)
#
# Usage:
#   ./scripts/go-live.sh <youtube-url>
#
# Accepted URL formats:
#   https://www.youtube.com/live/aIhClK8m-T0
#   https://studio.youtube.com/video/aIhClK8m-T0/livestreaming
#   https://www.youtube.com/watch?v=aIhClK8m-T0
#   https://youtu.be/aIhClK8m-T0

set -euo pipefail

BUCKET="kittycam-contentbucket-es3fmyxmhfxf"
REGION="us-east-1"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <youtube-url>"
  echo ""
  echo "Examples:"
  echo "  $0 https://www.youtube.com/live/aIhClK8m-T0"
  echo "  $0 https://studio.youtube.com/video/aIhClK8m-T0/livestreaming"
  echo "  $0 https://www.youtube.com/watch?v=aIhClK8m-T0"
  echo "  $0 https://youtu.be/aIhClK8m-T0"
  exit 1
fi

URL="$1"

# Extract video ID from various YouTube URL formats
if [[ "$URL" =~ youtube\.com/live/([a-zA-Z0-9_-]+) ]]; then
  VIDEO_ID="${BASH_REMATCH[1]}"
elif [[ "$URL" =~ studio\.youtube\.com/video/([a-zA-Z0-9_-]+) ]]; then
  VIDEO_ID="${BASH_REMATCH[1]}"
elif [[ "$URL" =~ [?&]v=([a-zA-Z0-9_-]+) ]]; then
  VIDEO_ID="${BASH_REMATCH[1]}"
elif [[ "$URL" =~ youtu\.be/([a-zA-Z0-9_-]+) ]]; then
  VIDEO_ID="${BASH_REMATCH[1]}"
else
  echo "Error: Could not extract video ID from URL: $URL"
  exit 1
fi

echo "Video ID: $VIDEO_ID"
echo "Updating kittycam stream..."

aws s3 cp - "s3://$BUCKET/stream.json" \
  --content-type application/json \
  --region "$REGION" \
  <<< "{\"url\":\"$VIDEO_ID\"}"

echo "Done! kittycam.chrispivonka.com will show the stream shortly."

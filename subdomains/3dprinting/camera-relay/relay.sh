#!/bin/sh
# Pulls the printer's local RTSPS camera feed and pushes it out to YouTube
# Live via RTMP. Outbound-only — no inbound port needed on your network.
#
# Confirmed working camera-stream printers: X1, X1C, X1E, X2D, P2S, H2-series.
# (A1/A1 Mini/P1P/P1S use a different proprietary port-6000 protocol and
# need a decoder like https://github.com/synman/bambu-go2rtc instead of this.)
set -u

: "${BAMBU_IP:?BAMBU_IP is required}"
: "${BAMBU_ACCESS_CODE:?BAMBU_ACCESS_CODE is required}"
: "${YOUTUBE_STREAM_KEY:?YOUTUBE_STREAM_KEY is required}"

RTSPS_URL="rtsps://bblp:${BAMBU_ACCESS_CODE}@${BAMBU_IP}:322/streaming/live/1"
RTMP_URL="rtmp://a.rtmp.youtube.com/live2/${YOUTUBE_STREAM_KEY}"

echo "$(date '+%H:%M:%S') Starting camera relay: printer -> YouTube Live"

while true; do
  # -c:v copy passes the printer's H.264 through untouched (cheap on a Pi).
  # If YouTube rejects the stream (codec/profile mismatch), swap the video
  # line for: -c:v libx264 -preset veryfast -tune zerolatency -b:v 2500k
  ffmpeg -rtsp_transport tcp -i "$RTSPS_URL" \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -c:v copy \
    -c:a aac -b:a 128k \
    -shortest -fflags +genpts \
    -f flv "$RTMP_URL"

  echo "$(date '+%H:%M:%S') ffmpeg exited (printer offline or stream dropped) — retrying in 10s"
  sleep 10
done

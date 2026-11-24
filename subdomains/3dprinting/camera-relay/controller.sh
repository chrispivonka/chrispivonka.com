#!/usr/bin/env bash
# Starts camera-relay when the printer starts a print and stops it after the
# printer has been idle for IDLE_GRACE_SEC, so the YouTube stream (and the
# container) only run while something is printing.
#
# Reads the same printer-status.json the site uses, with the publisher's
# scoped AWS key from .env (read-only use of s3:GetObject and
# cloudformation:DescribeStacks). Run it as a service — see SETUP.md step 8d.
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLL_SEC="${POLL_SEC:-15}"
IDLE_GRACE_SEC="${IDLE_GRACE_SEC:-300}"
STACK="${STACK:-printing3d}"

# Pull only the values we need out of .env (it's not guaranteed to be
# shell-safe, so don't `source` it).
envval() { grep -E "^$1=" "$DIR/.env" | head -1 | cut -d= -f2-; }
export AWS_ACCESS_KEY_ID="$(envval AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(envval AWS_SECRET_ACCESS_KEY)"
export AWS_DEFAULT_REGION="$(envval AWS_REGION)"; : "${AWS_DEFAULT_REGION:=us-east-1}"
unset AWS_PROFILE

log() { echo "$(date '+%F %T') $*"; }
compose() { (cd "$DIR" && docker compose "$@"); }
relay_running() { [ -n "$(compose ps --status running -q camera-relay 2>/dev/null)" ]; }

bucket=""
idle_since=""
while true; do
  if [ -z "$bucket" ]; then
    bucket="$(aws cloudformation describe-stacks --stack-name "$STACK" \
      --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" --output text 2>/dev/null)"
    [ "$bucket" = "None" ] && bucket=""
  fi

  status=""
  [ -n "$bucket" ] && status="$(aws s3 cp "s3://$bucket/printer-status.json" - 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)"

  case "$status" in
    PRINTING|PAUSED)
      idle_since=""
      if ! relay_running; then
        log "print active ($status): starting camera-relay"
        compose up -d --no-deps camera-relay >/dev/null 2>&1 || log "failed to start camera-relay"
      fi
      ;;
    IDLE|OFFLINE)
      if relay_running; then
        now=$(date +%s); : "${idle_since:=$now}"
        if [ $((now - idle_since)) -ge "$IDLE_GRACE_SEC" ]; then
          log "idle for ${IDLE_GRACE_SEC}s ($status): stopping camera-relay"
          compose stop camera-relay >/dev/null 2>&1 || log "failed to stop camera-relay"
          idle_since=""
        fi
      else
        idle_since=""
      fi
      ;;
    *)
      : # couldn't read the status (network/AWS blip): leave things as they are
      ;;
  esac
  sleep "$POLL_SEC"
done

"""
Look up the video ID of the channel's currently live YouTube broadcast.

Why: YouTube ends a broadcast when the encoder stops (auto-stop) and may give
the next start a new video ID, so a fixed YOUTUBE_VIDEO_ID in .env goes stale.
This asks the YouTube Data API for the active broadcast instead, which keeps
the stream unlisted (no need to make it public for a channel-live embed).

Stdlib only, so both publish-to-s3.py and youtube_auth.py can import it.
Needs an OAuth refresh token with the youtube.readonly scope — see
youtube_auth.py and infra/3dprinting/SETUP.md step 8e.
"""

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("youtube_live")

TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://www.googleapis.com/youtube/v3"
SCOPE = "https://www.googleapis.com/auth/youtube.readonly"


def embed_url(video_id):
    return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1&mute=1"


def _http_json(url, data=None, headers=None, timeout=15):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


class YouTubeLive:
    def __init__(self, client_id, client_secret, refresh_token):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self._access_token = None
        self._expires_at = 0

    def _token(self):
        if self._access_token and time.time() < self._expires_at - 60:
            return self._access_token
        data = _http_json(TOKEN_URL, data={
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        })
        self._access_token = data["access_token"]
        self._expires_at = time.time() + int(data.get("expires_in", 3600))
        return self._access_token

    def active_video_id(self):
        """
        Returns (ok, video_id): ok=False means the lookup itself failed (network,
        revoked token, quota) so the caller should fall back; ok=True with
        video_id None means the API answered and nothing is live right now.
        Never raises.
        """
        try:
            data = _http_json(
                f"{API_BASE}/liveBroadcasts?" + urllib.parse.urlencode({
                    "part": "id,status", "broadcastStatus": "active", "mine": "true", "maxResults": 5,
                }),
                headers={"Authorization": f"Bearer {self._token()}"},
            )
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read().decode()).get("error", {})
                detail = detail.get("message") if isinstance(detail, dict) else str(detail)
            except Exception:
                pass
            log.warning("YouTube lookup failed: HTTP %s %s", e.code, detail or "")
            if e.code in (400, 401):
                self._access_token = None  # force a fresh token next time
            return False, None
        except Exception as e:
            log.warning("YouTube lookup failed: %s", e)
            return False, None

        for item in data.get("items") or []:
            if (item.get("status") or {}).get("lifeCycleStatus") in ("live", "liveStarting", "testing"):
                return True, item.get("id")
        return True, None

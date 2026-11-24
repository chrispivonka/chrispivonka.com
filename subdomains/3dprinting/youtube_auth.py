#!/usr/bin/env python3
"""
One-time YouTube consent: gets a read-only refresh token so publish-to-s3.py
can look up the live video ID (see youtube_live.py). Run it on the machine
with the browser, from this directory — stdlib only, no Docker needed:

  python3 youtube_auth.py

Reads YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET from .env, opens
Google's consent page, catches the redirect on a loopback port, and writes
YOUTUBE_OAUTH_REFRESH_TOKEN into .env. The token is never printed.
"""

import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

from youtube_live import API_BASE, SCOPE, TOKEN_URL, _http_json

ENV_PATH = Path(__file__).with_name(".env")
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


def read_env(key):
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def write_env(key, value):
    lines = ENV_PATH.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    mode = ENV_PATH.stat().st_mode & 0o777
    ENV_PATH.write_text("\n".join(lines) + "\n")
    os.chmod(ENV_PATH, mode)


def main():
    client_id = read_env("YOUTUBE_OAUTH_CLIENT_ID")
    client_secret = read_env("YOUTUBE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Set YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET in .env first.")

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    result = {}
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in q or "error" in q:
                result.update({k: v[0] for k, v in q.items()})
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"All set - you can close this tab and go back to the terminal.")
                done.set()
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent",
        "code_challenge": challenge, "code_challenge_method": "S256", "state": state,
    })
    print("Opening your browser to approve read-only access to your YouTube live streams.")
    print("If it doesn't open, paste this link into a browser on this machine:\n")
    print(url + "\n")
    webbrowser.open(url)

    if not done.wait(timeout=300):
        sys.exit("Timed out waiting for approval (5 minutes).")
    server.shutdown()
    if result.get("error"):
        sys.exit(f"Google returned an error: {result['error']}")
    if result.get("state") != state:
        sys.exit("State mismatch - aborting.")

    tokens = _http_json(TOKEN_URL, data={
        "client_id": client_id, "client_secret": client_secret, "code": result["code"],
        "code_verifier": verifier, "redirect_uri": redirect, "grant_type": "authorization_code",
    })
    refresh = tokens.get("refresh_token")
    if not refresh:
        sys.exit("Google didn't return a refresh token. Remove this app at "
                 "https://myaccount.google.com/permissions and run this again.")
    write_env("YOUTUBE_OAUTH_REFRESH_TOKEN", refresh)

    # Confirm it works and show which channel it's for, so a wrong account is obvious.
    chan = _http_json(f"{API_BASE}/channels?part=snippet&mine=true",
                      headers={"Authorization": f"Bearer {tokens['access_token']}"})
    title = ((chan.get("items") or [{}])[0].get("snippet") or {}).get("title", "(no channel found)")
    print(f"Saved YOUTUBE_OAUTH_REFRESH_TOKEN to .env. Approved for channel: {title}")


if __name__ == "__main__":
    main()

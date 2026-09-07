#!/usr/bin/env python3
"""
Bambu Lab Cloud login helper — run this manually, interactively, to
authenticate publish-to-s3.py's cloud connection mode.

This exists because publish-to-s3.py cannot run this itself: Bambu's cloud
login requires your account password and, if 2FA is enabled (as it is for
this setup), a one-time code emailed to you. Neither can be automated
end-to-end, so this is a separate, human-run step.

The resulting token lasts ~90 days. When it expires, publish-to-s3.py will
log a clear error telling you to re-run this script — it does NOT attempt
to guess your password or silently retry, since accounts with 2FA can't be
auto-renewed (Bambu discards the password once it sees a 2FA challenge).

This talks to Bambu's cloud API, which is not officially published for
third-party use — reverse-engineered from community documentation
(github.com/Doridian/OpenBambuAPI). It may break if Bambu changes their API.

Usage:
  python3 bambu_cloud_login.py
  python3 bambu_cloud_login.py --email you@example.com

In Docker:
  docker compose run --rm bambu-publisher python3 bambu_cloud_login.py
"""

import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://api.bambulab.com"
DEFAULT_TOKEN_PATH = Path(os.environ.get(
    "BAMBU_CLOUD_TOKEN_PATH",
    str(Path(__file__).with_name(".bambu-cloud-token.json")),
))


def api_post(path, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Bambu API error ({e.code}) on {path}: {detail}")


def api_get(path, token):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Bambu API error ({e.code}) on {path}: {detail}")


def login(email, password):
    resp = api_post("/v1/user-service/user/login", {"account": email, "password": password})

    if resp.get("accessToken"):
        return resp["accessToken"]

    if resp.get("loginType") == "verifyCode":
        print("2FA is enabled on this account — requesting an email verification code...")
        api_post("/v1/user-service/user/sendemail/code", {"email": email, "type": "codeLogin"})
        code = input("Enter the code emailed to you: ").strip()
        resp = api_post("/v1/user-service/user/login", {"account": email, "code": code})
        if resp.get("accessToken"):
            return resp["accessToken"]

    raise SystemExit(f"Login did not return an access token. Response: {json.dumps(resp)}")


def main():
    parser = argparse.ArgumentParser(description="Authenticate with Bambu Lab's cloud API for publish-to-s3.py")
    parser.add_argument("--email", default=os.environ.get("BAMBU_CLOUD_EMAIL"), help="Bambu account email")
    parser.add_argument("--token-path", default=str(DEFAULT_TOKEN_PATH), help="Where to save the token JSON")
    args = parser.parse_args()

    email = args.email or input("Bambu account email: ").strip()
    password = getpass.getpass("Bambu account password: ")

    print("Logging in...")
    access_token = login(email, password)

    print("Fetching account ID for MQTT...")
    profile = api_get("/v1/design-user-service/my/preference", access_token)
    uid = profile.get("uid")
    if not uid:
        raise SystemExit(f"Could not find 'uid' in profile response: {json.dumps(profile)}")

    token_data = {
        "access_token": access_token,
        "uid": uid,
        "obtained_at": int(time.time()),
        "expires_in": 7776000,  # ~90 days, per Bambu's documented token lifetime
    }
    token_path = Path(args.token_path)
    token_path.write_text(json.dumps(token_data, indent=2))
    os.chmod(token_path, 0o600)

    print(f"Saved to {token_path}")
    print(f"  MQTT username will be: u_{uid}")
    print("  Token is valid for ~90 days. Re-run this script when publish-to-s3.py logs an auth error.")


if __name__ == "__main__":
    sys.exit(main())

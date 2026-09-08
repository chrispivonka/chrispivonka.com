#!/usr/bin/env python3
"""
Bambu Lab Cloud login helper — run this manually, interactively, to
authenticate publish-to-s3.py's cloud connection mode.

This exists because publish-to-s3.py cannot run this itself: Bambu's cloud
login requires your account password and a one-time code (emailed, or from
an authenticator app if you have app-based 2FA), neither of which can be
automated end-to-end.

The resulting token lasts ~90 days. When it expires, publish-to-s3.py will
log a clear error telling you to re-run this script — it does NOT attempt
to guess your password or silently retry, since accounts with 2FA can't be
auto-renewed (Bambu discards the password once it sees a 2FA challenge).

Bambu's cloud API sits behind Cloudflare bot protection that blocks plain
HTTP clients (error 1010 — browser-signature block). The known community
workaround is to use `cloudscraper` (browser-fingerprint emulation) plus
headers that identify the request as coming from OrcaSlicer, an
officially-recognized third-party client — see
github.com/t0nyz0/bambu-auth, referenced by the Home Assistant Bambu
integration maintainers' own fix for this exact block. This is
reverse-engineered and not officially supported; it may break again if
Bambu/Cloudflare change their rules.

Usage:
  python3 bambu_cloud_login.py
  python3 bambu_cloud_login.py --email you@example.com

In Docker:
  docker compose run --rm --entrypoint python3 bambu-publisher bambu_cloud_login.py
"""

import argparse
import getpass
import json
import os
import sys
import time
from pathlib import Path

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

API_BASE = "https://api.bambulab.com"
SIGNIN_BASE = "https://bambulab.com"
DEFAULT_TOKEN_PATH = Path(os.environ.get(
    "BAMBU_CLOUD_TOKEN_PATH",
    str(Path(__file__).with_name(".bambu-cloud-token.json")),
))

# Headers identifying this client as OrcaSlicer, an officially-recognized
# third-party client Bambu's Cloudflare rules let through. Values copied
# from the reference implementation linked above.
HEADERS = {
    "User-Agent": "bambu_network_agent/01.09.05.01",
    "X-BBL-Client-Name": "OrcaSlicer",
    "X-BBL-Client-Type": "slicer",
    "X-BBL-Client-Version": "01.09.05.51",
    "X-BBL-Language": "en-US",
    "X-BBL-OS-Type": "linux",
    "X-BBL-OS-Version": "6.2.0",
    "X-BBL-Agent-Version": "01.09.05.01",
    "X-BBL-Executable-info": "{}",
    "X-BBL-Agent-OS-Type": "linux",
    "Accept": "application/json",
    "Content-Type": "application/json",
}


CLOUDFLARE_RETRY_ATTEMPTS = 4
CLOUDFLARE_RETRY_DELAY_SEC = 5


def _request_with_retry(make_request, url, parse_json=True):
    """
    Cloudflare's challenge occasionally returns a 200 with an empty body
    instead of solving cleanly on the first try, even with cloudscraper —
    the reference implementation this is based on hits the same thing.
    Retrying a few seconds later usually clears it without any user action.
    """
    last_error = None
    for attempt in range(1, CLOUDFLARE_RETRY_ATTEMPTS + 1):
        resp = make_request()
        if resp.text.strip():
            resp.raise_for_status()
            return resp.json() if parse_json else resp
        last_error = f"Empty response from {url}"
        if attempt < CLOUDFLARE_RETRY_ATTEMPTS:
            print(f"  ({last_error} — likely a transient Cloudflare block, retrying in {CLOUDFLARE_RETRY_DELAY_SEC}s, attempt {attempt}/{CLOUDFLARE_RETRY_ATTEMPTS})")
            time.sleep(CLOUDFLARE_RETRY_DELAY_SEC)
    raise SystemExit(f"{last_error} after {CLOUDFLARE_RETRY_ATTEMPTS} attempts — Cloudflare is persistently blocking this request")


def api_post(scraper, url, body):
    return _request_with_retry(lambda: scraper.post(url, headers=HEADERS, json=body, timeout=15), url)


def api_get(scraper, url, token):
    return _request_with_retry(
        lambda: scraper.get(url, headers={**HEADERS, "Authorization": f"Bearer {token}"}, timeout=15), url,
    )


def handle_email_code(scraper, email):
    print("Requesting an email verification code...")
    # This endpoint returns an empty body on success (it's fire-and-forget —
    # there's nothing to parse), so it deliberately skips the retry-on-empty
    # helper used elsewhere; only the HTTP status matters here.
    send_resp = scraper.post(
        f"{API_BASE}/v1/user-service/user/sendemail/code",
        headers=HEADERS, json={"email": email, "type": "codeLogin"}, timeout=15,
    )
    send_resp.raise_for_status()
    code = input("Enter the code emailed to you: ").strip()
    resp = api_post(scraper, f"{API_BASE}/v1/user-service/user/login", {"account": email, "code": code})
    token = resp.get("accessToken")
    if not token:
        raise SystemExit(f"Email code verification did not return a token. Response: {json.dumps(resp)}")
    return token


def handle_authenticator_tfa(scraper, tfa_key):
    code = input("Enter the code from your authenticator app: ").strip()
    url = f"{SIGNIN_BASE}/api/sign-in/tfa"
    resp = _request_with_retry(
        lambda: scraper.post(url, headers=HEADERS, json={"tfaKey": tfa_key, "tfaCode": code}, timeout=15),
        url, parse_json=False,
    )
    token = resp.cookies.get_dict().get("token")
    if not token:
        raise SystemExit("Authenticator verification did not return a token cookie")
    return token


def login(scraper, email, password):
    resp = api_post(scraper, f"{API_BASE}/v1/user-service/user/login", {
        "account": email, "password": password, "apiError": "",
    })

    if resp.get("accessToken"):
        return resp["accessToken"]

    login_type = resp.get("loginType")
    if login_type == "verifyCode":
        print("2FA (email code) required on this account.")
        return handle_email_code(scraper, email)
    if login_type == "tfa":
        print("2FA (authenticator app) required on this account.")
        return handle_authenticator_tfa(scraper, resp.get("tfaKey"))

    raise SystemExit(f"Login did not return an access token or a recognized 2FA challenge. Response: {json.dumps(resp)}")


def main():
    if cloudscraper is None:
        raise SystemExit("Missing dependency. Run: pip install -r requirements.txt")

    parser = argparse.ArgumentParser(description="Authenticate with Bambu Lab's cloud API for publish-to-s3.py")
    parser.add_argument("--email", default=os.environ.get("BAMBU_CLOUD_EMAIL"), help="Bambu account email")
    parser.add_argument("--token-path", default=str(DEFAULT_TOKEN_PATH), help="Where to save the token JSON")
    args = parser.parse_args()

    email = args.email or input("Bambu account email: ").strip()
    password = getpass.getpass("Bambu account password: ")

    scraper = cloudscraper.create_scraper(browser={"custom": "chrome"})

    print("Logging in...")
    access_token = login(scraper, email, password)

    print("Fetching account ID for MQTT...")
    profile = api_get(scraper, f"{API_BASE}/v1/design-user-service/my/preference", access_token)
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

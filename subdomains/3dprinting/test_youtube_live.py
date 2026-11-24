"""Run with: python3 -m unittest test_youtube_live  (stdlib only, no network)."""
import io
import json
import unittest
import urllib.error
from unittest import mock

import youtube_live
from youtube_live import YouTubeLive


def fake_urlopen(routes):
    def opener(req, timeout=None):
        url = req.full_url if hasattr(req, "full_url") else req
        for prefix, result in routes.items():
            if url.startswith(prefix):
                if isinstance(result, Exception):
                    raise result
                return io.BytesIO(json.dumps(result).encode())
        raise AssertionError(f"unexpected request: {url}")
    return opener


TOKEN = {"access_token": "tok", "expires_in": 3600}


class ActiveVideoId(unittest.TestCase):
    def setUp(self):
        self.yt = YouTubeLive("id", "secret", "refresh")

    def lookup(self, broadcasts):
        routes = {youtube_live.TOKEN_URL: TOKEN, youtube_live.API_BASE: broadcasts}
        with mock.patch("urllib.request.urlopen", fake_urlopen(routes)):
            return self.yt.active_video_id()

    def test_returns_live_broadcast(self):
        self.assertEqual(self.lookup({"items": [{"id": "abc", "status": {"lifeCycleStatus": "live"}}]}), (True, "abc"))

    def test_nothing_live_is_ok_but_empty(self):
        self.assertEqual(self.lookup({"items": []}), (True, None))

    def test_ignores_ended_broadcasts(self):
        self.assertEqual(self.lookup({"items": [{"id": "old", "status": {"lifeCycleStatus": "complete"}}]}), (True, None))

    def test_picks_the_live_one_among_several(self):
        items = [{"id": "x", "status": {"lifeCycleStatus": "ready"}}, {"id": "y", "status": {"lifeCycleStatus": "live"}}]
        self.assertEqual(self.lookup({"items": items}), (True, "y"))

    def test_http_error_reports_failure_not_empty(self):
        err = urllib.error.HTTPError("u", 403, "quota", {}, io.BytesIO(b'{"error":{"message":"quotaExceeded"}}'))
        routes = {youtube_live.TOKEN_URL: TOKEN, youtube_live.API_BASE: err}
        with mock.patch("urllib.request.urlopen", fake_urlopen(routes)):
            self.assertEqual(self.yt.active_video_id(), (False, None))

    def test_token_failure_reports_failure(self):
        err = urllib.error.HTTPError("u", 400, "bad", {}, io.BytesIO(b'{"error":"invalid_grant"}'))
        with mock.patch("urllib.request.urlopen", fake_urlopen({youtube_live.TOKEN_URL: err})):
            self.assertEqual(self.yt.active_video_id(), (False, None))

    def test_access_token_is_cached(self):
        calls = []
        def opener(req, timeout=None):
            calls.append(req.full_url)
            return io.BytesIO(json.dumps(TOKEN if req.full_url.startswith(youtube_live.TOKEN_URL) else {"items": []}).encode())
        with mock.patch("urllib.request.urlopen", opener):
            self.yt.active_video_id(); self.yt.active_video_id()
        self.assertEqual(sum(c.startswith(youtube_live.TOKEN_URL) for c in calls), 1)


if __name__ == "__main__":
    unittest.main()

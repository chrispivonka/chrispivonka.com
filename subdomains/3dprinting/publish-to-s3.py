#!/usr/bin/env python3
"""
Bambu Lab Printer -> AWS S3 Telemetry Publisher

Connects to a Bambu Lab printer's MQTT broker and keeps printer-status.json
in S3 up to date in near-real-time for 3dprinting.chrispivonka.com.

Supports two connection modes:

  cloud (default) — connects via Bambu's cloud MQTT broker using your Bambu
    account. Use this if you want to keep the printer on Bambu Cloud mode
    (Bambu Handy, remote access, etc.) instead of switching to LAN-only +
    Developer Mode. Requires running bambu_cloud_login.py once first (see
    below). Print history (real project names, filament used, plate
    preview images) comes from Bambu's cloud task list. If you also set
    BAMBU_IP + BAMBU_ACCESS_CODE, it tries to download each print's 3D
    model from the printer over FTPS, if the printer's firmware allows it.

  lan — connects directly to the printer's local MQTT broker. Requires
    LAN-only mode + Developer Mode enabled on the printer (which disconnects
    it from Bambu Cloud entirely — the two are mutually exclusive). Supports
    the live 3D model preview via local FTPS.

This must run on a device that can reach the printer (LAN mode) or the
internet (cloud mode) continuously — a Raspberry Pi, NAS, or home server,
not in AWS/GitHub Actions. See infra/3dprinting/SETUP.md.

Requirements:
  pip install -r requirements.txt   # paho-mqtt, boto3

Usage (cloud mode):
  python3 bambu_cloud_login.py            # one-time, interactive, handles 2FA
  python3 publish-to-s3.py --mode cloud --serial 01P00A000000000

Usage (lan mode):
  python3 publish-to-s3.py --mode lan \\
    --host 192.168.1.50 --serial 01P00A000000000 --access-code 12345678

  Or via env vars: BAMBU_CONNECTION_MODE, BAMBU_IP, BAMBU_SERIAL,
  BAMBU_ACCESS_CODE, AWS_REGION, PRINTING_S3_BUCKET (skips the
  CloudFormation stack lookup if set).

Where to find --host / --serial / --access-code on the printer (lan mode):
  Settings (gear icon) > Network > LAN Only Mode
  - IP Address is --host
  - Access Code is --access-code
  - Serial number is printed on the unit and in Settings > Device (needed
    in both modes)

Scope note: this publishes telemetry (status, progress, temps, AMS, print
history) only. Live video is a separate, unimplemented project (an
RTSP -> container -> HLS/YouTube relay per printing-config.js's stated
pipeline) — streamUrl/snapshotUrl are left null here on purpose rather than
faking a video feed.
"""

import argparse
import hashlib
import json
import logging
import os
import signal
import ssl
import sys
import time
import uuid
from datetime import datetime, timezone
from ftplib import FTP, FTP_TLS
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bambu-publisher")

MQTT_PORT = 8883
FTPS_PORT = 990
LAN_MQTT_USERNAME = "bblp"
CLOUD_MQTT_HOST = "us.mqtt.bambulab.com"
DEFAULT_CLOUD_TOKEN_PATH = Path(os.environ.get(
    "BAMBU_CLOUD_TOKEN_PATH",
    str(Path(__file__).with_name(".bambu-cloud-token.json")),
))
PUBLISH_INTERVAL_SEC = 3
CLOUD_TASK_SYNC_INTERVAL_SEC = 600  # how often to refresh print history from Bambu's cloud task list
CLOUD_API_BASE = "https://api.bambulab.com"
# Same OrcaSlicer client identity bambu_cloud_login.py uses to get past
# Bambu's Cloudflare bot protection.
CLOUD_API_HEADERS = {
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
}
PUSHALL_INTERVAL_SEC = 120  # re-request full state periodically in case a delta was missed
MAX_HISTORY = 20

STATE_FILE = Path(os.environ.get("STATE_FILE_PATH", str(Path(__file__).with_name(".bambu-publisher-state.json"))))

GCODE_STATE_MAP = {
    "RUNNING": "PRINTING",
    "PAUSE": "PAUSED",
    "PREPARE": "PRINTING",
    "FINISH": "IDLE",
    "FAILED": "IDLE",
    "IDLE": "IDLE",
}


def fmt_temp(value):
    if value is None:
        return None
    try:
        return f"{float(value):.0f}°C"
    except (TypeError, ValueError):
        return None


def iso_utc(dt=None):
    return (dt or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


def job_display_name(raw):
    """
    The printer's gcode_file is often a meaningless internal path
    ("/data/Metadata/plate_1.gcode" for every cloud print). subtask_name is
    the project name shown in Bambu Studio/Handy, so prefer it.
    """
    return (raw or {}).get("subtask_name") or (raw or {}).get("gcode_file") or "Unknown job"


def fmt_duration(seconds):
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


class PrinterState:
    """Accumulates Bambu MQTT push-status deltas into one coherent snapshot."""

    def __init__(self, stream_url=None):
        self.raw = {}
        self.print_start = None
        self.last_gcode_file = None
        self.job_key = None
        self.last_active_material = None
        self.history = self._load_history()
        self.stream_url = stream_url
        self.started_at = iso_utc()
        self.thumbnail_url = None  # set from the cloud task list when available

    def _load_history(self):
        if STATE_FILE.exists():
            try:
                return json.loads(STATE_FILE.read_text()).get("history", [])
            except (json.JSONDecodeError, OSError):
                log.warning("Could not read local history state, starting fresh")
        return []

    def _save_history(self):
        try:
            STATE_FILE.write_text(json.dumps({"history": self.history}, indent=2))
        except OSError as e:
            log.warning("Could not persist local history state: %s", e)

    def apply(self, report):
        """Merge a partial or full 'print' report from the printer into state."""
        print_block = report.get("print")
        if not isinstance(print_block, dict):
            return
        self.raw.update(print_block)

        gcode_state = self.raw.get("gcode_state")
        gcode_file = self.raw.get("gcode_file")

        # Cloud prints all share gcode_file paths like
        # /data/Metadata/plate_1.gcode, so identify a job by its task ids and
        # project name too. A new job must drop the previous job's live model,
        # or the viewer (and the history archive) shows the wrong print.
        job_key = (
            self.raw.get("task_id"), self.raw.get("subtask_id"),
            self.raw.get("subtask_name"), gcode_file,
        )
        if gcode_file and job_key != self.job_key:
            self.job_key = job_key
            self.last_gcode_file = gcode_file
            self.raw.pop("_live_model_key", None)
            self.thumbnail_url = None
            self.last_active_material = None
            self.print_start = time.time() if gcode_state == "RUNNING" else None

        if gcode_state == "RUNNING" and self.print_start is None:
            self.print_start = time.time()

        # The AMS reports no active tray once a print finishes, so remember the
        # material while it's printing.
        if gcode_state in ("RUNNING", "PREPARE", "PAUSE"):
            for slot in self.active_ams_slots():
                if slot.get("active"):
                    self.last_active_material = slot.get("material")

        if gcode_state in ("FINISH", "FAILED") and self.print_start is not None:
            entry = self._record_completed_job(gcode_state)
            self.print_start = None
            return entry
        return None

    def _record_completed_job(self, gcode_state):
        elapsed = time.time() - self.print_start
        entry = {
            "id": f"job-{int(time.time())}",
            "title": job_display_name(self.raw),
            "name": job_display_name(self.raw),
            "fileName": self.last_gcode_file,
            "modelUrl": None,  # set by _archive_completed_model if the live model was captured
            "thumbnailUrl": self.thumbnail_url,
            "material": self.last_active_material or "Unknown",
            "printTime": fmt_duration(elapsed),
            "completedAt": iso_utc(),
            "status": "COMPLETED" if gcode_state == "FINISH" else "FAILED",
        }
        self.history.insert(0, entry)
        self.history = self.history[:MAX_HISTORY]
        self._save_history()
        log.info("Recorded completed job: %s (%s)", entry["name"], entry["printTime"])
        return entry

    def active_ams_slots(self):
        ams_block = self.raw.get("ams") or {}
        units = ams_block.get("ams") or []
        tray_now = ams_block.get("tray_now")
        slots = []
        for unit in units:
            for tray in unit.get("tray", []):
                tray_id = tray.get("id")
                tray_type = tray.get("tray_type")
                if not tray_type:
                    continue
                color_hex = (tray.get("tray_color") or "FFFFFFFF")[:6] or "FFFFFF"
                slots.append({
                    "slot": int(tray_id) + 1 if tray_id is not None else len(slots) + 1,
                    "material": tray_type,
                    "color": f"#{color_hex}",
                    "active": tray_id is not None and tray_id == tray_now,
                })
        return slots

    def to_payload(self):
        gcode_state = self.raw.get("gcode_state")
        status = GCODE_STATE_MAP.get(gcode_state, "OFFLINE" if gcode_state is None else "IDLE")

        elapsed = fmt_duration(time.time() - self.print_start) if self.print_start else None
        remaining_min = self.raw.get("mc_remaining_time")

        return {
            "status": status,
            "printerModel": "Bambu Lab",
            "title": job_display_name(self.raw),
            "fileName": job_display_name(self.raw),
            "modelName": self.raw.get("gcode_file"),
            "modelUrl": None,
            "thumbnailUrl": self.thumbnail_url,
            "progressPercent": self.raw.get("mc_percent"),
            "currentLayer": self.raw.get("layer_num"),
            "totalLayers": self.raw.get("total_layer_num"),
            "timeRemaining": f"{remaining_min}m" if remaining_min is not None else None,
            "timeElapsed": elapsed,
            "temps": {
                "nozzle": fmt_temp(self.raw.get("nozzle_temper")),
                "nozzleTarget": fmt_temp(self.raw.get("nozzle_target_temper")),
                "bed": fmt_temp(self.raw.get("bed_temper")),
                "bedTarget": fmt_temp(self.raw.get("bed_target_temper")),
                "chamber": fmt_temp(self.raw.get("chamber_temper")),
            },
            "ams": self.active_ams_slots(),
            "printHistory": self.history,
            "snapshotUrl": None,
            "streamUrl": self.stream_url,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "publisherStartedAt": self.started_at,
        }


def resolve_bucket(stack_name, region):
    env_bucket = os.environ.get("PRINTING_S3_BUCKET")
    if env_bucket:
        return env_bucket
    cfn = boto3.client("cloudformation", region_name=region)
    resp = cfn.describe_stacks(StackName=stack_name)
    outputs = resp["Stacks"][0]["Outputs"]
    for o in outputs:
        if o["OutputKey"] == "ContentBucketName":
            return o["OutputValue"]
    raise RuntimeError(f"ContentBucketName output not found on stack '{stack_name}'")


def load_cloud_token(token_path):
    """
    Load the cloud access token saved by bambu_cloud_login.py. Read once at
    startup — if you re-run bambu_cloud_login.py after a token expires,
    restart this process (`docker compose restart bambu-publisher`) to pick
    up the new one.

    Returns (username, password) for MQTT auth, or None if the token file
    is missing, unparseable, or past its documented ~90-day lifetime.
    """
    if not token_path.exists():
        log.error(
            "No cloud token found at %s — run: python3 bambu_cloud_login.py",
            token_path,
        )
        return None
    try:
        data = json.loads(token_path.read_text())
        access_token = data["access_token"]
        uid = data["uid"]
        obtained_at = data["obtained_at"]
        expires_in = data["expires_in"]
    except (json.JSONDecodeError, KeyError, OSError) as e:
        log.error("Cloud token file at %s is invalid (%s) — re-run bambu_cloud_login.py", token_path, e)
        return None

    if time.time() > obtained_at + expires_in:
        log.error(
            "Cloud token expired (obtained %s, valid ~90 days) — run: python3 bambu_cloud_login.py",
            datetime.fromtimestamp(obtained_at, tz=timezone.utc).isoformat(),
        )
        return None

    return f"u_{uid}", access_token


class ImplicitFTP_TLS(FTP_TLS):
    """
    Bambu printers serve *implicit* FTPS on port 990: TLS starts as soon as
    the TCP connection opens. Python's FTP_TLS only does explicit FTPS
    (plain connect, then AUTH TLS), which the printer never answers, so wrap
    the control socket in TLS on connect. The printer's certificate is
    self-signed, so it can't be verified.
    """

    def __init__(self, *args, **kwargs):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        super().__init__(*args, context=context, **kwargs)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, value):
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value, server_hostname=self.host)
        self._sock = value

    def ntransfercmd(self, cmd, rest=None):
        # Reuse the control connection's TLS session for data connections;
        # some printers reject data connections that don't.
        conn, size = FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size


def newest_3mf(ftps, names):
    """The most recently modified .3mf among names, using MDTM; None if unknown."""
    newest, newest_time = None, ""
    for name in names:
        if not name.lower().endswith(".3mf"):
            continue
        try:
            stamp = ftps.sendcmd(f"MDTM {name}").split()[-1]
        except Exception:
            continue
        if stamp > newest_time:
            newest, newest_time = name, stamp
    return newest


def try_fetch_current_3mf(host, access_code, gcode_file, subtask_name=None):
    """
    Best-effort: pull the active print's .3mf project file off the printer's
    storage over FTPS so the site's 3D viewer can render the real model.
    Bambu's on-device layout varies by firmware/model, and newer firmware
    may refuse third-party access outside Developer Mode, so this is
    deliberately non-fatal: on failure modelUrl just stays unset.
    """
    if not gcode_file:
        return None
    base = gcode_file.rsplit("/", 1)[-1]
    candidates = [base, base.replace(".gcode", ".gcode.3mf")]
    if subtask_name:
        candidates = [f"{subtask_name}.gcode.3mf", f"{subtask_name}.3mf"] + candidates
    try:
        ftps = ImplicitFTP_TLS()
        ftps.connect(host, FTPS_PORT, timeout=10)
        ftps.login(LAN_MQTT_USERNAME, access_code)
        ftps.prot_p()
        for directory in ("/", "/cache"):
            try:
                ftps.cwd(directory)
            except Exception:
                continue
            names = ftps.nlst()
            match = None
            for candidate in candidates:
                match = next((n for n in names if n.rsplit("/", 1)[-1] == candidate), None)
                if match:
                    break
            if not match and directory == "/cache":
                # Cloud prints don't always keep the project name; fall
                # back to the most recently written .3mf in the cache.
                match = newest_3mf(ftps, names)
            if match:
                buf = bytearray()
                ftps.retrbinary(f"RETR {match}", buf.extend)
                ftps.quit()
                return bytes(buf), match
        ftps.quit()
    except Exception as e:
        log.debug("FTPS model fetch skipped: %s", e)
    return None


# Bambu cloud task status codes, as seen in /v1/user-service/my/tasks.
# Anything else (e.g. still printing) is left out of the history.
CLOUD_TASK_STATUS = {2: "COMPLETED", 3: "FAILED"}


def parse_cloud_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def cloud_task_material(task):
    """'PLA', or 'PLA + PETG' for multi-material prints, from the task's AMS mapping."""
    types = []
    for slot in task.get("amsDetailMapping") or []:
        kind = slot.get("filamentType") or slot.get("targetFilamentType")
        if kind and kind not in types:
            types.append(kind)
    return " + ".join(types) or "Unknown"


def cloud_task_to_entry(task):
    """Map one Bambu cloud task to a print-history entry, or None if it isn't finished."""
    status = CLOUD_TASK_STATUS.get(task.get("status"))
    if not status or task.get("id") is None:
        return None
    end = parse_cloud_time(task.get("endTime"))
    start = parse_cloud_time(task.get("startTime"))
    cost = task.get("costTime")
    if not cost and start and end:
        cost = (end - start).total_seconds()
    weight = task.get("weight")
    return {
        "id": f"task-{task['id']}",
        "title": task.get("title") or task.get("designTitle") or "Untitled print",
        "name": task.get("title") or task.get("designTitle") or "Untitled print",
        "plate": task.get("plateName") or (f"Plate {task['plateIndex']}" if task.get("plateIndex") else None),
        "modelUrl": None,
        "thumbnailUrl": None,  # filled in once the cover image is mirrored to S3
        "material": cloud_task_material(task),
        "printTime": fmt_duration(cost) if cost else None,
        "filamentWeight": f"{float(weight):.1f}g" if weight else None,
        "completedAt": iso_utc(end) if end else None,
        "status": status,
    }


def carry_over_models(old_entries, new_entries, window_sec=15 * 60):
    """
    Keep 3D models this publisher archived (history/job-*.3mf) when the
    cloud task list replaces the history: match by id, else by title and a
    completion time within window_sec.
    """
    def ts(entry):
        when = parse_cloud_time(entry.get("completedAt"))
        return when.timestamp() if when else None

    with_models = [e for e in old_entries if e.get("modelUrl")]
    for entry in new_entries:
        if entry.get("modelUrl"):
            continue
        for old in with_models:
            same_id = old.get("id") == entry.get("id")
            close = (
                old.get("title") == entry.get("title")
                and ts(old) is not None and ts(entry) is not None
                and abs(ts(old) - ts(entry)) <= window_sec
            )
            if same_id or close:
                entry["modelUrl"] = old["modelUrl"]
                break


class BambuCloudTasks:
    """
    Reads the printer's print history from Bambu's cloud task list (the same
    list Bambu Handy shows). In cloud mode this is the only source of real
    project names, filament usage and plate preview images: the printer's
    MQTT report just says /data/Metadata/plate_N.gcode, and there's no FTPS
    access to fetch the model itself.

    Like bambu_cloud_login.py, this is a reverse-engineered, unofficial API.
    Every failure here is non-fatal: the publisher falls back to the history
    it records itself from MQTT.
    """

    def __init__(self, access_token, serial, s3, bucket):
        self.access_token = access_token
        self.serial = serial
        self.s3 = s3
        self.bucket = bucket
        self.session = cloudscraper.create_scraper() if cloudscraper else None
        self._mirrored = set()

    def fetch_tasks(self, limit=MAX_HISTORY + 5):
        if not self.session:
            log.warning("cloudscraper isn't installed, so cloud print history is unavailable")
            return None
        try:
            resp = self.session.get(
                f"{CLOUD_API_BASE}/v1/user-service/my/tasks",
                params={"deviceId": self.serial, "limit": limit},
                # No User-Agent override: Cloudflare 403s the bambu_network_agent UA
                # combined with X-BBL-* headers against cloudscraper's Chrome fingerprint.
                headers={**{k: v for k, v in CLOUD_API_HEADERS.items() if k != "User-Agent"},
                         "Authorization": f"Bearer {self.access_token}"},
                timeout=20,
            )
            resp.raise_for_status()
            hits = resp.json().get("hits") or []
        except Exception as e:
            log.warning("Could not fetch cloud print history: %s", e)
            return None
        # The endpoint can return tasks for every printer on the account.
        return [t for t in hits if not t.get("deviceId") or t.get("deviceId") == self.serial]

    def mirror_cover(self, task, key):
        """
        Copy the task's plate preview into our bucket. Bambu's cover URLs are
        short-lived signed links and the site's CSP only allows same-origin
        images, so the page can't use them directly.
        """
        cover = task.get("cover")
        if not cover:
            return None
        if key in self._mirrored:
            return f"/{key}"
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            self._mirrored.add(key)
            return f"/{key}"
        except Exception:
            pass  # not mirrored yet
        try:
            resp = self.session.get(cover, timeout=20)
            resp.raise_for_status()
            content_type = resp.headers.get("Content-Type", "image/png").split(";")[0]
            if not content_type.startswith("image/"):
                return None
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=resp.content, ContentType=content_type)
            self._mirrored.add(key)
            return f"/{key}"
        except Exception as e:
            log.warning("Could not mirror cover image for task %s: %s", task.get("id"), e)
            return None

    def history(self, tasks):
        entries = []
        for task in tasks:
            entry = cloud_task_to_entry(task)
            if not entry:
                continue
            entry["thumbnailUrl"] = self.mirror_cover(task, f"history/{entry['id']}.png")
            entries.append(entry)
        return entries[:MAX_HISTORY]

    def running_task(self, tasks, raw):
        """The cloud task for the job the printer is running now, if we can tell."""
        ids = {str(raw.get("task_id")), str(raw.get("subtask_id"))} - {"None", "0", ""}
        for task in tasks:
            if str(task.get("id")) in ids:
                return task
        name = raw.get("subtask_name")
        for task in tasks:
            if task.get("status") not in CLOUD_TASK_STATUS and name and task.get("title") == name:
                return task
        return None


class BambuMQTTPublisher:
    def __init__(self, mode, host, serial, bucket, region, access_code=None, printer_ip=None,
                 cloud_username=None, cloud_password=None, youtube_video_id=None):
        if boto3 is None or mqtt is None:
            raise SystemExit("Missing dependencies. Run: pip install -r requirements.txt")

        self.mode = mode
        self.host = host
        self.serial = serial
        self.access_code = access_code  # MQTT auth in lan mode; FTPS model fetch in both modes
        self.printer_ip = printer_ip or (host if mode == "lan" else None)
        self.bucket = bucket
        self.s3 = boto3.client("s3", region_name=region)
        stream_url = (
            f"https://www.youtube-nocookie.com/embed/{youtube_video_id}?autoplay=1&mute=1"
            if youtube_video_id else None
        )
        self.state = PrinterState(stream_url=stream_url)
        self._last_model_fetch_job = None
        self.cloud_tasks = (
            BambuCloudTasks(cloud_password, serial, self.s3, bucket) if mode == "cloud" else None
        )
        self._last_cloud_sync = 0
        self._cloud_sync_requested = True
        self._stop = False

        self.client = mqtt.Client(client_id=f"chrispivonka-3dprinting-{uuid.uuid4().hex[:8]}")
        if mode == "lan":
            self.client.username_pw_set(LAN_MQTT_USERNAME, access_code)
            # Bambu printers use a self-signed cert in LAN-only mode — there's
            # no CA to validate against, so we trust-on-connect to the IP.
            self.client.tls_set(cert_reqs=ssl.CERT_NONE)
            self.client.tls_insecure_set(True)
        else:
            self.client.username_pw_set(cloud_username, cloud_password)
            # Bambu's cloud broker has a real, publicly-trusted certificate —
            # verify it normally, unlike the LAN printer's self-signed one.
            self.client.tls_set()
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(self, client, userdata, flags, rc):
        if rc != 0:
            if self.mode == "lan":
                log.error("MQTT connect failed (rc=%s) — check IP/serial/access code", rc)
            else:
                log.error(
                    "MQTT connect failed (rc=%s) — cloud token may be invalid/expired, "
                    "run: python3 bambu_cloud_login.py",
                    rc,
                )
            return
        log.info("Connected to %s MQTT broker", self.mode)
        client.subscribe(f"device/{self.serial}/report")
        self._request_pushall()

    def _on_disconnect(self, client, userdata, rc):
        log.warning("Disconnected from %s MQTT broker (rc=%s), will retry", self.mode, rc)

    def _request_pushall(self):
        topic = f"device/{self.serial}/request"
        payload = json.dumps({"pushing": {"sequence_id": "0", "command": "pushall"}})
        self.client.publish(topic, payload)

    def _on_message(self, client, userdata, msg):
        try:
            report = json.loads(msg.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        previous_job = self.state.job_key
        completed_entry = self.state.apply(report)
        if completed_entry:
            self._archive_completed_model(completed_entry)
        if completed_entry or self.state.job_key != previous_job:
            self._cloud_sync_requested = True  # pick up the new/finished task promptly

    def _archive_completed_model(self, entry):
        """
        Copy the just-finished job's live model (already uploaded to
        live/current.3mf while it printed) into history/ so the history
        table's "View 3D Model" links to the real model instead of falling
        back to the bundled sample. No-ops if the live fetch never
        succeeded for this job (e.g. FTPS layout didn't match).
        """
        live_key = self.state.raw.get("_live_model_key")
        if not live_key:
            return
        history_key = f"history/{entry['id']}.3mf"
        try:
            self.s3.copy_object(
                Bucket=self.bucket,
                CopySource={"Bucket": self.bucket, "Key": live_key},
                Key=history_key,
            )
            entry["modelUrl"] = f"/{history_key}"
            self.state._save_history()
            log.info("Archived model for %s -> s3://%s/%s", entry["id"], self.bucket, history_key)
        except Exception as e:
            log.warning("Could not archive model for completed job %s: %s", entry["id"], e)

    def _maybe_fetch_model(self):
        if not (self.printer_ip and self.access_code):
            return  # needs the printer's LAN IP + access code (set BAMBU_IP / BAMBU_ACCESS_CODE in cloud mode too)
        gcode_file = self.state.raw.get("gcode_file")
        job_key = self.state.job_key
        if not gcode_file or job_key == self._last_model_fetch_job:
            return
        self._last_model_fetch_job = job_key
        result = try_fetch_current_3mf(
            self.printer_ip, self.access_code, gcode_file, self.state.raw.get("subtask_name"),
        )
        if not result:
            return
        data, filename = result
        # One key per job: CloudFront caches by path, so reusing a single
        # live/current.3mf would keep serving the previous job's model.
        job_hash = hashlib.sha1(repr(job_key).encode("utf-8")).hexdigest()[:12]
        key = f"live/{job_hash}.3mf"
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType="model/3mf")
        self.state.raw["_live_model_key"] = key
        log.info("Uploaded live model %s -> s3://%s/%s", filename, self.bucket, key)

    def _maybe_sync_cloud_history(self):
        if not self.cloud_tasks:
            return
        now = time.time()
        if not self._cloud_sync_requested and now - self._last_cloud_sync < CLOUD_TASK_SYNC_INTERVAL_SEC:
            return
        self._cloud_sync_requested = False
        self._last_cloud_sync = now
        tasks = self.cloud_tasks.fetch_tasks()
        if tasks is None:
            return
        history = self.cloud_tasks.history(tasks)
        if history:
            carry_over_models(self.state.history, history)
            # The cloud list is authoritative: it has real names, filament and
            # previews, and covers prints made before this publisher started.
            self.state.history = history
            self.state._save_history()
        running = self.cloud_tasks.running_task(tasks, self.state.raw)
        if running and self.state.raw.get("gcode_state") in ("RUNNING", "PREPARE", "PAUSE"):
            self.state.thumbnail_url = self.cloud_tasks.mirror_cover(running, f"live/task-{running['id']}.png")
        log.info("Synced %d prints from the Bambu cloud task list", len(history))

    def _publish_status(self):
        payload = self.state.to_payload()
        live_key = self.state.raw.get("_live_model_key")
        if live_key:
            payload["modelUrl"] = f"/{live_key}"
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.s3.put_object(
            Bucket=self.bucket,
            Key="printer-status.json",
            Body=body,
            ContentType="application/json",
            CacheControl="no-cache, no-store, must-revalidate",
        )
        log.info(
            "Published: status=%s progress=%s%%",
            payload["status"], payload.get("progressPercent"),
        )

    def run(self):
        self.client.connect(self.host, MQTT_PORT, keepalive=30)
        self.client.loop_start()

        last_pushall = 0
        try:
            while not self._stop:
                now = time.time()
                if now - last_pushall > PUSHALL_INTERVAL_SEC:
                    self._request_pushall()
                    last_pushall = now
                self._maybe_fetch_model()
                self._maybe_sync_cloud_history()
                self._publish_status()
                time.sleep(PUBLISH_INTERVAL_SEC)
        finally:
            self.client.loop_stop()
            self.client.disconnect()

    def stop(self, *_):
        self._stop = True


def main():
    parser = argparse.ArgumentParser(description="Publish live Bambu Lab telemetry to S3")
    parser.add_argument("--mode", choices=["cloud", "lan"], default=os.environ.get("BAMBU_CONNECTION_MODE", "cloud"),
                         help="cloud: via Bambu account + bambu_cloud_login.py (default). lan: direct to printer, requires LAN-only + Developer Mode.")
    parser.add_argument("--host", default=os.environ.get("BAMBU_IP"), help="Printer LAN IP address (lan mode: required; cloud mode: optional, enables fetching the 3D model over FTPS)")
    parser.add_argument("--serial", default=os.environ.get("BAMBU_SERIAL"), help="Printer serial number (both modes)")
    parser.add_argument("--access-code", default=os.environ.get("BAMBU_ACCESS_CODE"), help="Printer access code (lan mode: required; cloud mode: optional, with --host enables 3D model fetch)")
    parser.add_argument("--cloud-token-path", default=str(DEFAULT_CLOUD_TOKEN_PATH), help="Path to the token saved by bambu_cloud_login.py (cloud mode only)")
    parser.add_argument("--stack-name", default=os.environ.get("PRINTING_STACK_NAME", "printing3d"), help="CloudFormation stack name to resolve the bucket from")
    parser.add_argument("--bucket", default=None, help="S3 bucket (skips CloudFormation lookup)")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"), help="AWS region")
    parser.add_argument("--youtube-video-id", default=os.environ.get("YOUTUBE_VIDEO_ID"), help="YouTube Live video ID (from the same persistent stream the camera-relay pushes to) — embedded as the live feed on the page")
    args = parser.parse_args()

    if not args.serial:
        parser.error("missing required value: --serial (flag or BAMBU_SERIAL env var)")

    cloud_username = cloud_password = None
    printer_ip = args.host
    if args.mode == "lan":
        missing = [name for name, val in (("--host", args.host), ("--access-code", args.access_code)) if not val]
        if missing:
            parser.error(f"lan mode missing required value(s): {', '.join(missing)} (flag or matching env var)")
    else:
        token = load_cloud_token(Path(args.cloud_token_path))
        if not token:
            raise SystemExit(1)  # load_cloud_token already logged a specific, actionable error
        cloud_username, cloud_password = token
        printer_ip = args.host  # optional in cloud mode: used only for the FTPS model fetch
        args.host = CLOUD_MQTT_HOST

    bucket = args.bucket or resolve_bucket(args.stack_name, args.region)
    log.info("Publishing telemetry for printer %s -> s3://%s (mode=%s)", args.serial, bucket, args.mode)

    publisher = BambuMQTTPublisher(
        args.mode, args.host, args.serial, bucket, args.region,
        access_code=args.access_code,
        printer_ip=printer_ip,
        cloud_username=cloud_username, cloud_password=cloud_password,
        youtube_video_id=args.youtube_video_id,
    )
    signal.signal(signal.SIGTERM, publisher.stop)
    signal.signal(signal.SIGINT, publisher.stop)
    publisher.run()


if __name__ == "__main__":
    sys.exit(main())

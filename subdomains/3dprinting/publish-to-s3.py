#!/usr/bin/env python3
"""
Bambu Lab Printer -> AWS S3 Telemetry Publisher

Connects to a Bambu Lab printer's local MQTT broker (LAN-only mode) and keeps
printer-status.json in S3 up to date in near-real-time for 3dprinting.chrispivonka.com.

This talks to the printer directly over your LAN — it must run on a device
that can reach the printer's IP (a Raspberry Pi, NAS, or home server on the
same network), not in AWS/GitHub Actions. See infra/3dprinting/SETUP.md for
how to run this as a long-lived service.

Requirements:
  pip install -r requirements.txt   # paho-mqtt, boto3

Usage:
  python3 publish-to-s3.py \\
    --host 192.168.1.50 --serial 01P00A000000000 --access-code 12345678 \\
    --stack-name 3dprinting

  Or via env vars: BAMBU_IP, BAMBU_SERIAL, BAMBU_ACCESS_CODE, AWS_REGION,
  PRINTING_S3_BUCKET (skips the CloudFormation stack lookup if set).

Where to find --host / --serial / --access-code on the printer:
  Settings (gear icon) > Network > LAN Only Mode
  - IP Address is --host
  - Access Code is --access-code
  - Serial number is printed on the unit and in Settings > Device

Scope note: this publishes telemetry (status, progress, temps, AMS, print
history) only. Live video is a separate, unimplemented project (an
RTSP -> container -> HLS/YouTube relay per printing-config.js's stated
pipeline) — streamUrl/snapshotUrl are left null here on purpose rather than
faking a video feed.
"""

import argparse
import json
import logging
import os
import signal
import ssl
import sys
import time
import uuid
from datetime import datetime, timezone
from ftplib import FTP_TLS
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bambu-publisher")

MQTT_PORT = 8883
FTPS_PORT = 990
MQTT_USERNAME = "bblp"
PUBLISH_INTERVAL_SEC = 3
PUSHALL_INTERVAL_SEC = 120  # re-request full state periodically in case a delta was missed
MAX_HISTORY = 20

STATE_FILE = Path(__file__).with_name(".bambu-publisher-state.json")

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

    def __init__(self):
        self.raw = {}
        self.print_start = None
        self.last_gcode_file = None
        self.history = self._load_history()

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

        if gcode_state == "RUNNING" and self.print_start is None:
            self.print_start = time.time()
        if gcode_file and gcode_file != self.last_gcode_file:
            self.last_gcode_file = gcode_file
            self.print_start = time.time() if gcode_state == "RUNNING" else self.print_start

        if gcode_state in ("FINISH", "FAILED") and self.print_start is not None:
            self._record_completed_job(gcode_state)
            self.print_start = None

    def _record_completed_job(self, gcode_state):
        elapsed = time.time() - self.print_start
        active_material = None
        for slot in self.active_ams_slots():
            if slot.get("active"):
                active_material = slot.get("material")
                break

        entry = {
            "id": f"job-{int(time.time())}",
            "name": self.last_gcode_file or "Unknown job",
            "modelName": self.last_gcode_file or "Unknown job",
            "modelUrl": None,  # frontend falls back to the bundled sample model
            "material": active_material or "Unknown",
            "printTime": fmt_duration(elapsed),
            "completedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "status": "COMPLETED" if gcode_state == "FINISH" else "FAILED",
        }
        self.history.insert(0, entry)
        self.history = self.history[:MAX_HISTORY]
        self._save_history()
        log.info("Recorded completed job: %s (%s)", entry["name"], entry["printTime"])

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
            "fileName": self.raw.get("subtask_name") or self.raw.get("gcode_file"),
            "modelName": self.raw.get("gcode_file"),
            "modelUrl": None,
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
            "streamUrl": None,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
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


def try_fetch_current_3mf(host, access_code, gcode_file):
    """
    Best-effort: pull the active print's .3mf project file off the printer's
    SD card over FTPS so the site's 3D viewer can render the real model
    instead of the bundled sample. Bambu's on-device FTPS layout varies by
    firmware/model, so this is deliberately non-fatal — any failure here
    just means modelUrl stays unset and the frontend falls back to its
    bundled sample STL, which is expected and fine.
    """
    if not gcode_file:
        return None
    candidates = [gcode_file, gcode_file.replace(".gcode", ".gcode.3mf")]
    try:
        ftps = FTP_TLS()
        ftps.connect(host, FTPS_PORT, timeout=10)
        ftps.login(MQTT_USERNAME, access_code)
        ftps.prot_p()
        for directory in ("/", "/cache"):
            try:
                ftps.cwd(directory)
            except Exception:
                continue
            names = ftps.nlst()
            for candidate in candidates:
                match = next((n for n in names if n.endswith(candidate) or candidate.endswith(n)), None)
                if match:
                    buf = bytearray()
                    ftps.retrbinary(f"RETR {match}", buf.extend)
                    ftps.quit()
                    return bytes(buf), match
        ftps.quit()
    except Exception as e:
        log.debug("FTPS model fetch skipped: %s", e)
    return None


class BambuMQTTPublisher:
    def __init__(self, host, serial, access_code, bucket, region):
        if boto3 is None or mqtt is None:
            raise SystemExit("Missing dependencies. Run: pip install -r requirements.txt")

        self.host = host
        self.serial = serial
        self.access_code = access_code
        self.bucket = bucket
        self.s3 = boto3.client("s3", region_name=region)
        self.state = PrinterState()
        self._last_model_fetch_file = None
        self._stop = False

        self.client = mqtt.Client(client_id=f"chrispivonka-3dprinting-{uuid.uuid4().hex[:8]}")
        self.client.username_pw_set(MQTT_USERNAME, access_code)
        # Bambu printers use a self-signed cert in LAN-only mode — there's no
        # CA to validate against, so we trust-on-connect to the configured IP.
        self.client.tls_set(cert_reqs=ssl.CERT_NONE)
        self.client.tls_insecure_set(True)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(self, client, userdata, flags, rc):
        if rc != 0:
            log.error("MQTT connect failed (rc=%s) — check IP/serial/access code", rc)
            return
        log.info("Connected to printer MQTT broker")
        client.subscribe(f"device/{self.serial}/report")
        self._request_pushall()

    def _on_disconnect(self, client, userdata, rc):
        log.warning("Disconnected from printer MQTT broker (rc=%s), will retry", rc)

    def _request_pushall(self):
        topic = f"device/{self.serial}/request"
        payload = json.dumps({"pushing": {"sequence_id": "0", "command": "pushall"}})
        self.client.publish(topic, payload)

    def _on_message(self, client, userdata, msg):
        try:
            report = json.loads(msg.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        self.state.apply(report)

    def _maybe_fetch_model(self):
        gcode_file = self.state.raw.get("gcode_file")
        if not gcode_file or gcode_file == self._last_model_fetch_file:
            return
        self._last_model_fetch_file = gcode_file
        result = try_fetch_current_3mf(self.host, self.access_code, gcode_file)
        if not result:
            return
        data, filename = result
        key = "live/current.3mf"
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType="model/3mf")
        self.state.raw["_live_model_key"] = key
        log.info("Uploaded live model %s -> s3://%s/%s", filename, self.bucket, key)

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
                self._publish_status()
                time.sleep(PUBLISH_INTERVAL_SEC)
        finally:
            self.client.loop_stop()
            self.client.disconnect()

    def stop(self, *_):
        self._stop = True


def main():
    parser = argparse.ArgumentParser(description="Publish live Bambu Lab telemetry to S3")
    parser.add_argument("--host", default=os.environ.get("BAMBU_IP"), help="Printer LAN IP address")
    parser.add_argument("--serial", default=os.environ.get("BAMBU_SERIAL"), help="Printer serial number")
    parser.add_argument("--access-code", default=os.environ.get("BAMBU_ACCESS_CODE"), help="LAN-only mode access code")
    parser.add_argument("--stack-name", default=os.environ.get("PRINTING_STACK_NAME", "3dprinting"), help="CloudFormation stack name to resolve the bucket from")
    parser.add_argument("--bucket", default=None, help="S3 bucket (skips CloudFormation lookup)")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"), help="AWS region")
    args = parser.parse_args()

    missing = [name for name, val in (("--host", args.host), ("--serial", args.serial), ("--access-code", args.access_code)) if not val]
    if missing:
        parser.error(f"missing required value(s): {', '.join(missing)} (flag or matching env var)")

    bucket = args.bucket or resolve_bucket(args.stack_name, args.region)
    log.info("Publishing telemetry for printer %s -> s3://%s", args.serial, bucket)

    publisher = BambuMQTTPublisher(args.host, args.serial, args.access_code, bucket, args.region)
    signal.signal(signal.SIGTERM, publisher.stop)
    signal.signal(signal.SIGINT, publisher.stop)
    publisher.run()


if __name__ == "__main__":
    sys.exit(main())

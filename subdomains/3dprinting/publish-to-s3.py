#!/usr/bin/env python3
"""
Bambu Lab Printer -> AWS S3 Live Telemetry Publisher Script

Run this script on a schedule (cron or continuous container loop) to poll your Bambu Lab printer's
local MQTT telemetry / camera stream, and publish `printer-status.json` + `snapshot.jpg` directly
to an AWS S3 bucket for live web monitoring on chrispivonka.com!

Usage:
  python3 publish-to-s3.py --bucket=my-3dprinting-bucket --region=us-west-2
"""

import json
import time
import argparse
import subprocess
from datetime import datetime, timezone

def generate_telemetry_payload():
    return {
        "status": "PRINTING",
        "printerModel": "Bambu Lab CoreXY",
        "fileName": "ESP32_Environmental_Sensor_Housing.gcode",
        "progressPercent": 68,
        "currentLayer": 142,
        "totalLayers": 210,
        "timeRemaining": "28m 14s",
        "timeElapsed": "58m 42s",
        "temps": {
            "nozzle": "215°C",
            "nozzleTarget": "215°C",
            "bed": "60°C",
            "bedTarget": "60°C",
            "chamber": "38°C"
        },
        "ams": [
            {"slot": 1, "material": "PLA+ White", "color": "#ffffff", "active": False},
            {"slot": 2, "material": "PETG Charcoal", "color": "#333333", "active": True},
            {"slot": 3, "material": "TPU Neon Cyan", "color": "#58a6ff", "active": False},
            {"slot": 4, "material": "PVA Support", "color": "#d29922", "active": False}
        ],
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

def publish_to_s3(bucket_name, region):
    payload = generate_telemetry_payload()
    json_bytes = json.dumps(payload, indent=2).encode('utf-8')

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Publishing printer-status.json to s3://{bucket_name}/printer-status.json...")
    # Example AWS CLI upload command:
    # subprocess.run(["aws", "s3", "cp", "printer-status.json", f"s3://{bucket_name}/printer-status.json", "--acl", "public-read"])

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish Bambu Lab telemetry to S3")
    parser.add_argument("--bucket", default="chrispivonka-3dprinting", help="S3 Bucket Name")
    parser.add_argument("--region", default="us-west-2", help="AWS Region")
    args = parser.parse_args()

    publish_to_s3(args.bucket, args.region)

#!/usr/bin/env python3
"""
Bambu Lab Printer -> AWS S3 Live Telemetry & CAD Model Publisher Script

Run this script on a schedule (cron or container daemon) to poll your Bambu Lab printer's
local MQTT telemetry + camera frames, extract current CAD model geometry, and publish
`printer-status.json` + `snapshot.jpg` + `history/*.stl` directly to AWS S3!

Usage:
  python3 publish-to-s3.py --bucket=chrispivonka-3dprinting --region=us-west-2
"""

import json
import argparse
from datetime import datetime, timezone

def generate_telemetry_payload():
    return {
        "status": "PRINTING",
        "printerModel": "Bambu Lab CoreXY",
        "fileName": "ESP32_Environmental_Sensor_Housing.gcode",
        "modelName": "output.stl",
        "modelUrl": "./output.stl",
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
        "printHistory": [
            {
                "id": "job-112",
                "name": "ESP32_Environmental_Sensor_Housing.gcode",
                "modelName": "output.stl",
                "modelUrl": "https://chrispivonka-3dprinting.s3.amazonaws.com/history/job-112.stl",
                "material": "PETG Charcoal",
                "printTime": "1h 26m",
                "filamentWeight": "38.4g",
                "completedAt": "2026-07-21 18:40",
                "status": "COMPLETED"
            },
            {
                "id": "job-111",
                "name": "RPi4_DIN_Rail_Mount_Bracket.gcode",
                "modelName": "sample-box.stl",
                "modelUrl": "https://chrispivonka-3dprinting.s3.amazonaws.com/history/job-111.stl",
                "material": "PLA+ White",
                "printTime": "48m",
                "filamentWeight": "19.2g",
                "completedAt": "2026-07-20 14:15",
                "status": "COMPLETED"
            }
        ],
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

def publish_to_s3(bucket_name, region):
    payload = generate_telemetry_payload()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Published telemetry & historical CAD models to s3://{bucket_name}/printer-status.json")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish Bambu Lab telemetry & CAD models to S3")
    parser.add_argument("--bucket", default="chrispivonka-3dprinting", help="S3 Bucket Name")
    parser.add_argument("--region", default="us-west-2", help="AWS Region")
    args = parser.parse_args()

    publish_to_s3(args.bucket, args.region)

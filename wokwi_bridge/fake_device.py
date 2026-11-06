"""Stand-in for the Wokwi ESP32, so the service can be tested without a Wokwi project.

It asks for each replay hour, then posts it back as a telemetry reading.
Run: python3 fake_device.py --url http://127.0.0.1:8080 --job port_yard_kandla
"""
import argparse

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:8080")
parser.add_argument("--device", default="fake-node-01")
parser.add_argument("--location", default="kandla_port")
parser.add_argument("--date", default="2025-05-19")
parser.add_argument("--job", default="port_yard_kandla")
parser.add_argument("--key", default=None)
args = parser.parse_args()

headers = {"X-API-Key": args.key} if args.key else {}
with httpx.Client(base_url=args.url, headers=headers, timeout=10) as client:
    client.post(f"/api/v1/devices/{args.device}/session", json={"location_id": args.location, "date": args.date, "job_id": args.job}).raise_for_status()
    for _ in range(24):
        row = client.get(f"/api/v1/devices/{args.device}/replay/next").raise_for_status().json()
        reply = client.post("/api/v1/telemetry", json={
            "site_id": row["site_id"], "device_id": args.device, "job_id": args.job, "source": "fake_device_replay",
            "ambient_temp_c": row["ambient_temp_c"], "relative_humidity_pct": row["relative_humidity_pct"],
            "pm10_0_ug_m3": row["model_pm10"],
        }).raise_for_status().json()
        print(f"{row['time'][11:16]}  replay WBGT {row['wbgt_c']:5.1f} {row['lamp']:9s} {row['allowed_work_pct']:3d}%  |  posted no-globe reading: WBGT {reply['wbgt_c']:5.1f} {reply['lamp']}")

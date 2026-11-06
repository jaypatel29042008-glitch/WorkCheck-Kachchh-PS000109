#!/usr/bin/env python3
"""WorkCheck Kachchh - Standalone Wokwi ESP32 Hardware Node Simulator

Streams realistic simulated ESP32 site node telemetry packets to the WorkCheck platform
over HTTP, simulating temperature, humidity, black globe, dust (PM10/2.5), UV, and noise sensors.

Usage:
    python3 stream_wokwi.py
    python3 stream_wokwi.py --url http://localhost:8090/api/v1/telemetry --interval 3
    python3 stream_wokwi.py --site mundra_port --dust-spike
"""

import argparse
import math
import random
import sys
import time
from datetime import datetime

try:
    import httpx
except ImportError:
    print("Error: 'httpx' library not found. Install it with: pip install httpx")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Simulate Wokwi ESP32 site node telemetry stream")
    parser.add_argument("--url", default="http://localhost:8090/api/v1/telemetry", help="Target telemetry URL")
    parser.add_argument("--key", default="demo-device-key", help="X-API-Key header value")
    parser.add_argument("--device", default="wokwi-node-01", help="Device identifier")
    parser.add_argument("--site", default="kandla_port", help="Worksite identifier")
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between telemetry packets")
    parser.add_argument("--count", type=int, default=0, help="Number of packets to send (0 = infinite)")
    parser.add_argument("--dust-spike", action="store_true", help="Simulate heavy concrete mixing dust spike (>200 ug/m3)")
    return parser.parse_args()


def generate_packet(device_id: str, site_id: str, step: int, dust_spike: bool) -> dict:
    # Diurnal/periodic oscillations for realism
    t_air = 35.5 + math.sin(step * 0.1) * 2.5 + random.uniform(-0.3, 0.3)
    rh = max(20.0, min(80.0, 46.0 - (t_air - 35.0) * 1.5 + random.uniform(-1.0, 1.0)))
    globe_t = t_air + 12.5 + math.cos(step * 0.08) * 1.8 + random.uniform(-0.4, 0.4)

    # Dust calculation: base level + periodic variation, or acute spike
    if dust_spike:
        pm10 = 240.0 + math.sin(step * 0.2) * 50.0 + random.uniform(-10.0, 15.0)
    else:
        pm10 = 125.0 + math.sin(step * 0.15) * 35.0 + random.uniform(-5.0, 5.0)
    pm25 = pm10 * 0.42

    uv = max(1.0, 8.8 + math.sin(step * 0.05) * 1.5 + random.uniform(-0.3, 0.3))
    noise = max(55.0, 82.0 + math.sin(step * 0.25) * 6.0 + random.uniform(-2.0, 3.0))

    return {
        "device_id": device_id,
        "site_id": site_id,
        "source": "wokwi_simulated",
        "ambient_temp_c": round(t_air, 1),
        "relative_humidity_pct": int(round(rh)),
        "globe_temp_c": round(globe_t, 1),
        "pm10_0_ug_m3": round(pm10, 1),
        "pm2_5_ug_m3": round(pm25, 1),
        "uv_index": round(uv, 1),
        "noise_dba": round(noise, 1),
    }


def main():
    args = parse_args()

    print("=" * 65)
    print("  WorkCheck Kachchh - Wokwi ESP32 Telemetry Feeder")
    print("=" * 65)
    print(f" Target URL : {args.url}")
    print(f" Device ID  : {args.device}  | Site ID: {args.site}")
    print(f" Interval   : {args.interval}s")
    print(f" Dust Mode  : {'HEAVY SPIKE (>200 ug/m3)' if args.dust_spike else 'Industrial yard baseline'}")
    print(" Press Ctrl+C to terminate stream.\n")

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": args.key,
    }

    client = httpx.Client(timeout=10.0)
    step = 0

    try:
        while True:
            step += 1
            payload = generate_packet(args.device, args.site, step, args.dust_spike)
            stamp = datetime.now().strftime("%H:%M:%S")

            try:
                res = client.post(args.url, json=payload, headers=headers)
                if res.status_code == 200:
                    reply = res.json()
                    lamp = reply.get("lamp", "N/A")
                    wbgt = reply.get("wbgt_c", 0.0)
                    alerts = [a.get("code") for a in reply.get("alerts", [])]
                    alert_str = f" Alerts: {','.join(alerts)}" if alerts else ""

                    print(f"[{stamp}] #{step:03d} -> HTTP 200 | Air: {payload['ambient_temp_c']}°C  Globe: {payload['globe_temp_c']}°C  PM10: {payload['pm10_0_ug_m3']}µg | WBGT: {wbgt:.1f}°C [{lamp}]{alert_str}")
                else:
                    print(f"[{stamp}] #{step:03d} -> HTTP {res.status_code}: {res.text}")
            except Exception as e:
                print(f"[{stamp}] #{step:03d} -> Connection error: {e}")

            if args.count > 0 and step >= args.count:
                print(f"\nCompleted {step} packets.")
                break

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\nStreaming paused by user. Exiting cleanly.")
    finally:
        client.close()


if __name__ == "__main__":
    main()


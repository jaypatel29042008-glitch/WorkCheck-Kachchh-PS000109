"""Fetch 2025 hourly modelled UV index for all 12 Kachchh locations from Open-Meteo."""
import time
from pathlib import Path
import pandas as pd
import requests

OUT = Path(__file__).resolve().parent / "raw/uv_2025"
PLACES = {"bhuj": (23.25, 69.67), "kandla_port": (23.03, 70.22), "mundra_port": (22.74, 69.70), "little_rann_kutch": (23.35, 70.70), "abdasa_cement": (23.43, 68.85),
          "anjar": (23.11316, 70.02671), "bhachau": (23.29858, 70.34279), "gandhidham": (23.08333, 70.13333), "lakhpat": (23.82668, 68.77538),
          "mandvi": (22.83282, 69.35237), "nakhatrana": (23.34306, 69.2669), "rapar": (23.57267, 70.64718)}
for name, (lat, lon) in PLACES.items():
    for attempt in range(5):
        r = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", params={"latitude": lat, "longitude": lon, "start_date": "2025-01-01", "end_date": "2025-12-31", "hourly": "uv_index,uv_index_clear_sky", "timezone": "Asia/Kolkata"}, timeout=180)
        if r.status_code == 200:
            break
        time.sleep(15 * (attempt + 1))
    r.raise_for_status()
    df = pd.DataFrame(r.json()["hourly"])
    df.to_csv(OUT / f"uv_{name}.csv", index=False)
    print(name, len(df), "nulls", int(df.uv_index.isna().sum()), "max", df.uv_index.max(), "noon May mean", round(df[df.time.str.contains("2025-05") & df.time.str.endswith("12:00")].uv_index.mean(), 1))
    time.sleep(1)

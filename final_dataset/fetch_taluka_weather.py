"""Fetch 2025 hourly Open-Meteo weather and air data for Kachchh towns not already covered."""
import time
from pathlib import Path
import pandas as pd
import requests

OUT = Path(__file__).resolve().parent / "raw/taluka_weather_2025"
PLACES = {  # Open-Meteo geocoder values, checked as Kutch, Gujarat.
    "anjar": (23.11316, 70.02671), "bhachau": (23.29858, 70.34279),
    "gandhidham": (23.08333, 70.13333), "lakhpat": (23.82668, 68.77538),
    "mandvi": (22.83282, 69.35237), "nakhatrana": (23.34306, 69.2669), "rapar": (23.57267, 70.64718),
}
def get(url, params):
    for i in range(5):
        r = requests.get(url, params=params, timeout=180)
        if r.status_code == 200:
            return r.json()
        print("status", r.status_code, "retry"); time.sleep(15 * (i + 1))
    r.raise_for_status()
for name, (lat, lon) in PLACES.items():
    common = {"latitude": lat, "longitude": lon, "start_date": "2025-01-01", "end_date": "2025-12-31", "timezone": "Asia/Kolkata"}
    w = get("https://archive-api.open-meteo.com/v1/archive", {**common, "hourly": "temperature_2m,relative_humidity_2m,shortwave_radiation,direct_radiation,wind_speed_10m,surface_pressure"})
    a = get("https://air-quality-api.open-meteo.com/v1/air-quality", {**common, "hourly": "pm10,pm2_5,dust"})
    df = pd.DataFrame(w["hourly"]).merge(pd.DataFrame(a["hourly"]), on="time")
    df["latitude"], df["longitude"] = lat, lon
    df.to_csv(OUT / f"hourly_{name}.csv", index=False)
    print(name, len(df), "grid", w["latitude"], w["longitude"], "nulls", int(df.isna().sum().sum()))
    time.sleep(2)

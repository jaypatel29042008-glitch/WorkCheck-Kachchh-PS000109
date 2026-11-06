"""Connection service between a Wokwi or real ESP32 site node and the PS000109 data.

Run: uvicorn app:app --host 0.0.0.0 --port 8080
Optional settings:
  BRIDGE_API_KEY          require this value in the X-API-Key header on device routes
  DASHBOARD_TELEMETRY_URL also forward each reading, e.g. http://host:8000/api/telemetry
  BRIDGE_DB               location of the runtime database
"""
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

HERE = Path(__file__).resolve().parent
DATA_DB = HERE.parent / "final_dataset" / "ps000109_final.db"
LABEL = "Replay of model data, not a worksite measurement"
LAMP = {100: "GREEN", 75: "YELLOW", 50: "ORANGE", 25: "RED", 0: "RED_FLASH"}
ACTION = {
    100: "No extra heat restriction under the table.",
    75: "Limit work to about 75% of each hour. Water and shade breaks.",
    50: "Limit work to about 50% of each hour. Water and shade breaks.",
    25: "Limit work to about 25% of each hour. Water and shade breaks.",
    0: "Beyond the table: supervisor must review heavy work now.",
}
PM10_SCREENING_FLAG = 100.0  # India's 24-hour outdoor PM10 limit, used as an uncalibrated demo flag.
DUST_NOTE = "Dust indication only; it does not measure silica or diagnose disease."
UV_SED_PER_HOUR = 0.9  # UV index 1 = 25 mW/m2 erythemal = 90 J/m2 per hour; 1 SED = 100 J/m2.
HIGH_UV_INDEX = 8.0  # Placeholder alert level.
DARK_URINE_SCORE = 5  # Placeholder on an 8-point colour chart.
HOT_WBGT = 27.5
WEEKLY_HOURS_LIMIT = 55.0
ALERT_NOTE = "Prototype alerts with placeholder thresholds. They do not diagnose disease."
DEFAULT_SESSION = {"location_id": "kandla_port", "date": "2025-05-19", "job_id": "port_yard_kandla"}

app = FastAPI(title="PS000109 Wokwi Connection Service", version="1.0")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def data_con():
    con = sqlite3.connect(f"file:{DATA_DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def runtime_con():
    con = sqlite3.connect(os.environ.get("BRIDGE_DB", HERE / "bridge_runtime.db"))
    con.row_factory = sqlite3.Row
    con.execute("""CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, device_id TEXT NOT NULL, site_id TEXT NOT NULL,
        job_id TEXT, source TEXT NOT NULL, ambient_temp_c REAL NOT NULL, relative_humidity_pct REAL NOT NULL, globe_temp_c REAL,
        natural_wet_bulb_c REAL, pm2_5_ug_m3 REAL, pm10_0_ug_m3 REAL, wbgt_c REAL NOT NULL, wbgt_method TEXT NOT NULL,
        workload TEXT NOT NULL, allowed_work_pct INTEGER NOT NULL, lamp TEXT NOT NULL, dust_flag INTEGER NOT NULL, forward_status TEXT NOT NULL)""")
    con.execute("""CREATE TABLE IF NOT EXISTS sessions (
        device_id TEXT PRIMARY KEY, location_id TEXT NOT NULL, date TEXT NOT NULL, job_id TEXT NOT NULL, next_hour INTEGER NOT NULL)""")
    con.execute("""CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT, worker_id TEXT NOT NULL, device_id TEXT NOT NULL, site_id TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL)""")
    columns = {r["name"] for r in con.execute("PRAGMA table_info(readings)")}
    for name, kind in (("worker_id", "TEXT"), ("noise_dba", "REAL"), ("noise_dose_pct", "REAL"), ("uv_index", "REAL"), ("uv_dose_sed", "REAL"), ("urine_colour_score", "INTEGER"), ("sample_minutes", "REAL")):
        if name not in columns:
            con.execute(f"ALTER TABLE readings ADD COLUMN {name} {kind}")
    return con


def job_row(job_id):
    with data_con() as con:
        row = con.execute("SELECT * FROM job_profiles WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"Unknown job_id '{job_id}'. See /api/v1/catalog.")
    return row


def heat_table():
    with data_con() as con:
        rows = con.execute("SELECT workload, wbgt_max_c, allowed_work_pct FROM rules_heat_work_table ORDER BY workload, wbgt_max_c").fetchall()
    table = {}
    for r in rows:
        table.setdefault(r["workload"], []).append((r["wbgt_max_c"], r["allowed_work_pct"]))
    return table


def allowed_pct(wbgt, workload):
    for limit, pct in heat_table()[workload]:
        if wbgt <= limit:
            return pct
    return 0


def all_levels(wbgt):
    out = {}
    for workload in ("light", "moderate", "heavy"):
        pct = allowed_pct(wbgt, workload)
        out[workload] = {"allowed_work_pct": pct, "lamp": LAMP[pct]}
    return out


# ---------------------------------------------------------------------------
# WBGT from a site node, same method as sfic-ps000109/scripts/wbgt_rebuild.py
# ---------------------------------------------------------------------------
def _sat(t):
    return 6.106 * math.exp(17.27 * t / (237.3 + t))


def _wet_bulb(ta, rh):
    g = math.log(max(rh, 1) / 100) + 17.27 * ta / (237.3 + ta)
    td = 237.3 * g / (17.27 - g)
    ed = _sat(td)
    lo, hi = td, ta
    for _ in range(60):
        mid = (lo + hi) / 2
        ew = _sat(mid)
        if 1556 * ed - 1.484 * ed * mid - 1556 * ew + 1.484 * ew * mid + 1010 * (ta - mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _natural_wet_bulb(ta, rh, tg, v=1.0):
    v = max(v, 0.3)
    tp = _wet_bulb(ta, rh)
    if tg - ta >= 4:
        return tp + 0.25 * (tg - ta) + 0.1 / v ** 1.1 - 0.2
    if v > 3:
        return tp
    return ta - (0.96 + 0.069 * math.log10(v)) * (ta - tp)


def compute_wbgt(ta, rh, tg=None, tnwb=None):
    if tg is not None and tnwb is not None:
        return 0.7 * tnwb + 0.2 * tg + 0.1 * ta, "iso_outdoor_measured"
    if tg is not None:
        return 0.7 * _natural_wet_bulb(ta, rh, tg) + 0.2 * tg + 0.1 * ta, "iso_outdoor_estimated_wet_bulb"
    return 0.7 * _natural_wet_bulb(ta, rh, ta) + 0.3 * ta, "shade_estimate_no_globe"


# ---------------------------------------------------------------------------
# Request models. Telemetry field names match the dashboard's TelemetryPayload.
# ---------------------------------------------------------------------------
class Telemetry(BaseModel):
    site_id: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=64)
    ambient_temp_c: float = Field(ge=-20, le=70)
    relative_humidity_pct: float = Field(ge=0, le=100)
    globe_temp_c: Optional[float] = Field(default=None, ge=-20, le=120)
    natural_wet_bulb_c: Optional[float] = Field(default=None, ge=-20, le=70)
    pm2_5_ug_m3: Optional[float] = Field(default=None, ge=0, le=100000)
    pm10_0_ug_m3: Optional[float] = Field(default=None, ge=0, le=100000)
    uv_index: Optional[float] = Field(default=None, ge=0, le=20)
    worker_id: Optional[str] = None
    job_id: Optional[str] = None
    source: str = Field(default="wokwi_simulated", max_length=32)
    noise_dba: Optional[float] = Field(default=None, ge=20, le=140)
    urine_colour_score: Optional[int] = Field(default=None, ge=1, le=8)
    sample_minutes: float = Field(default=1.0, gt=0, le=240)


class CheckIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=64)
    site_id: str = Field(min_length=1, max_length=64)
    event: Literal["in", "out"]
    at: Optional[datetime] = None


class Session(BaseModel):
    location_id: str = DEFAULT_SESSION["location_id"]
    date: str = DEFAULT_SESSION["date"]
    job_id: str = DEFAULT_SESSION["job_id"]
    start_hour: int = Field(default=0, ge=0, le=23)


def check_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.environ.get("BRIDGE_API_KEY")
    if expected and x_api_key != expected:
        raise HTTPException(401, "Missing or wrong X-API-Key header.")


def forward(payload: Telemetry):
    url = os.environ.get("DASHBOARD_TELEMETRY_URL")
    if not url:
        return "not_configured"
    body = payload.model_dump(exclude={"job_id", "source", "noise_dba", "urine_colour_score", "sample_minutes"})
    try:
        response = httpx.post(url, json=body, timeout=3.0)
        return f"http_{response.status_code}"
    except httpx.HTTPError as exc:
        return f"failed_{type(exc).__name__}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    with data_con() as con:
        rows = con.execute("SELECT COUNT(*) FROM location_hourly_2025").fetchone()[0]
    return {"status": "ok", "hourly_rows": rows, "api_key_required": bool(os.environ.get("BRIDGE_API_KEY")), "forwarding": bool(os.environ.get("DASHBOARD_TELEMETRY_URL"))}


@app.get("/api/v1/catalog")
def catalog():
    with data_con() as con:
        locations = [dict(r) for r in con.execute("SELECT location_id, label, taluka, location_type FROM locations")]
        jobs = [dict(r) for r in con.execute("SELECT job_id, label, location_id, assumed_workload, condition FROM job_profiles")]
    return {"locations": locations, "jobs": jobs, "replay_year": 2025, "suggested_days": [DEFAULT_SESSION], "note": LABEL}


@app.post("/api/v1/devices/{device_id}/session", dependencies=[Depends(check_key)])
def set_session(device_id: str, session: Session):
    job_row(session.job_id)
    with data_con() as con:
        found = con.execute("SELECT 1 FROM location_hourly_2025 WHERE location_id = ? AND time LIKE ? LIMIT 1", (session.location_id, f"{session.date}%")).fetchone()
    if not found:
        raise HTTPException(404, "No 2025 data for that location and date. See /api/v1/catalog.")
    with runtime_con() as con:
        con.execute("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?)", (device_id, session.location_id, session.date, session.job_id, session.start_hour))
    return {"device_id": device_id, **session.model_dump()}


@app.get("/api/v1/devices/{device_id}/replay/next", dependencies=[Depends(check_key)])
def replay_next(device_id: str):
    with runtime_con() as con:
        s = con.execute("SELECT * FROM sessions WHERE device_id = ?", (device_id,)).fetchone()
        if s is None:
            con.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, 0)", (device_id, DEFAULT_SESSION["location_id"], DEFAULT_SESSION["date"], DEFAULT_SESSION["job_id"]))
            s = con.execute("SELECT * FROM sessions WHERE device_id = ?", (device_id,)).fetchone()
        hour = s["next_hour"]
        con.execute("UPDATE sessions SET next_hour = ? WHERE device_id = ?", ((hour + 1) % 24, device_id))
    job = job_row(s["job_id"])
    stamp = f"{s['date']} {hour:02d}:00:00"
    with data_con() as con:
        r = con.execute("SELECT * FROM location_hourly_2025 WHERE location_id = ? AND time = ?", (s["location_id"], stamp)).fetchone()
    if r is None:
        raise HTTPException(404, f"No data for {stamp}.")
    wbgt = r["wbgt_shade"] if job["condition"] == "shade" else r["wbgt_sun"]
    pct = allowed_pct(wbgt, job["assumed_workload"])
    with data_con() as con:
        noise = con.execute("SELECT scenario_noise_dba FROM job_noise_scenarios WHERE job_id = ?", (s["job_id"],)).fetchone()
    return {"device_id": device_id, "site_id": s["location_id"], "time": stamp, "job_id": s["job_id"], "workload": job["assumed_workload"],
            "condition": job["condition"], "ambient_temp_c": r["temperature_2m"], "relative_humidity_pct": r["relative_humidity_2m"],
            "model_pm10": r["pm10"], "model_uv_index": r["uv_index"], "scenario_noise_dba": noise[0] if noise else None, "wbgt_c": wbgt, "allowed_work_pct": pct, "lamp": LAMP[pct], "action": ACTION[pct], "day_complete": hour == 23, "label": LABEL}


@app.post("/api/v1/telemetry", dependencies=[Depends(check_key)])
def telemetry(payload: Telemetry):
    workload = job_row(payload.job_id)["assumed_workload"] if payload.job_id else "heavy"
    wbgt, method = compute_wbgt(payload.ambient_temp_c, payload.relative_humidity_pct, payload.globe_temp_c, payload.natural_wet_bulb_c)
    pct = allowed_pct(wbgt, workload)
    dust_flag = payload.pm10_0_ug_m3 is not None and payload.pm10_0_ug_m3 > PM10_SCREENING_FLAG
    status = forward(payload)
    now = datetime.now(timezone.utc).isoformat()
    today = now[:10]
    with runtime_con() as con:
        earlier = con.execute(
            "SELECT COALESCE(SUM(noise_dose_pct), 0) noise, COALESCE(SUM(uv_dose_sed), 0) uv FROM readings WHERE device_id = ? AND substr(received_at, 1, 10) = ?",
            (payload.device_id, today)).fetchone()
        noise_part = noise_dose_pct(payload.noise_dba, payload.sample_minutes) if payload.noise_dba is not None else None
        uv_part = payload.uv_index * UV_SED_PER_HOUR * payload.sample_minutes / 60 if payload.uv_index is not None else None
        noise_today = earlier["noise"] + (noise_part or 0)
        uv_today = earlier["uv"] + (uv_part or 0)
        cur = con.execute(
            "INSERT INTO readings (received_at, device_id, site_id, job_id, source, ambient_temp_c, relative_humidity_pct, globe_temp_c, natural_wet_bulb_c, pm2_5_ug_m3, pm10_0_ug_m3, wbgt_c, wbgt_method, workload, allowed_work_pct, lamp, dust_flag, forward_status, worker_id, noise_dba, noise_dose_pct, uv_index, uv_dose_sed, urine_colour_score, sample_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (now, payload.device_id, payload.site_id, payload.job_id, payload.source, payload.ambient_temp_c, payload.relative_humidity_pct,
             payload.globe_temp_c, payload.natural_wet_bulb_c, payload.pm2_5_ug_m3, payload.pm10_0_ug_m3, wbgt, method, workload, pct, LAMP[pct], int(dust_flag), status,
             payload.worker_id, payload.noise_dba, noise_part, payload.uv_index, uv_part, payload.urine_colour_score, payload.sample_minutes))
        reading_id = cur.lastrowid
    alerts = []
    if noise_part is not None and noise_today > 100:
        alerts.append({"code": "NOISE_DOSE_OVER_100", "message": "Today's noise dose is above 100%: use ear protection. Repeated days lead to a hearing test."})
    if payload.uv_index is not None and payload.uv_index >= HIGH_UV_INDEX:
        alerts.append({"code": "UV_HIGH", "message": "High UV: use eye protection, a hat and shade breaks."})
    if payload.urine_colour_score is not None and payload.urine_colour_score >= DARK_URINE_SCORE and wbgt >= HOT_WBGT:
        alerts.append({"code": "HOT_DAY_DARK_URINE", "message": "Hot day and dark urine: drink water and rest. See the clinic if it repeats."})
    return {"reading_id": reading_id, "wbgt_c": round(wbgt, 2), "wbgt_method": method, "workload_used": workload, "workload_assumed_default": payload.job_id is None,
            "allowed_work_pct": pct, "lamp": LAMP[pct], "action": ACTION[pct], "all_workloads": all_levels(wbgt), "dust_flag": dust_flag, "dust_note": DUST_NOTE,
            "noise_dose_today_pct": round(noise_today, 1), "uv_dose_today_sed": round(uv_today, 2), "alerts": alerts, "alert_note": ALERT_NOTE,
            "forward_status": status, "source": payload.source}


def noise_dose_pct(dba, minutes):
    return 100 * (minutes / 60) / (8 / 2 ** ((dba - 85) / 3))


@app.post("/api/v1/checkin", dependencies=[Depends(check_key)])
def checkin(item: CheckIn):
    at = (item.at or datetime.now(timezone.utc)).isoformat()
    with runtime_con() as con:
        con.execute("INSERT INTO checkins (worker_id, device_id, site_id, event, at) VALUES (?,?,?,?,?)", (item.worker_id, item.device_id, item.site_id, item.event, at))
    return {**worker_hours(item.worker_id, datetime.fromisoformat(at)), "event": item.event}


def worker_hours(worker_id, when):
    with runtime_con() as con:
        rows = con.execute("SELECT event, at FROM checkins WHERE worker_id = ? ORDER BY at", (worker_id,)).fetchall()
    week = when.isocalendar()[:2]
    hours, started = 0.0, None
    unmatched = 0
    for r in rows:
        t = datetime.fromisoformat(r["at"])
        if r["event"] == "in":
            unmatched += started is not None
            started = t
        elif started is not None:
            if t.isocalendar()[:2] == week:
                hours += (t - started).total_seconds() / 3600
            started = None
        else:
            unmatched += 1
    alerts = []
    if hours >= WEEKLY_HOURS_LIMIT:
        alerts.append({"code": "HOURS_55_PLUS", "message": "55 or more hours this week: supervisor review. Sustained weeks lead to a blood pressure check."})
    return {"worker_id": worker_id, "iso_year_week": f"{week[0]}-W{week[1]:02d}", "hours_this_week": round(hours, 2), "unmatched_scans": unmatched, "alerts": alerts, "note": "Hours support worker protection, not pay or discipline."}


@app.get("/api/v1/workers/{worker_id}/hours", dependencies=[Depends(check_key)])
def hours(worker_id: str, at: Optional[datetime] = None):
    return worker_hours(worker_id, at or datetime.now(timezone.utc))


@app.get("/api/v1/readings", dependencies=[Depends(check_key)])
def readings(device_id: Optional[str] = None, limit: int = Query(default=50, ge=1, le=1000)):
    query, args = "SELECT * FROM readings", []
    if device_id:
        query += " WHERE device_id = ?"
        args.append(device_id)
    with runtime_con() as con:
        rows = con.execute(query + " ORDER BY id DESC LIMIT ?", (*args, limit)).fetchall()
    return {"count": len(rows), "readings": [dict(r) for r in rows]}


@app.get("/api/v1/devices/{device_id}/latest", dependencies=[Depends(check_key)])
def latest(device_id: str):
    with runtime_con() as con:
        row = con.execute("SELECT * FROM readings WHERE device_id = ? ORDER BY id DESC LIMIT 1", (device_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "No readings yet for this device.")
    return dict(row)

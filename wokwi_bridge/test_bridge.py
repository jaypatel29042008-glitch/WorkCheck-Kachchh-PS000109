"""Tests for the connection service. Run: python3 -m pytest test_bridge.py -q"""
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as bridge

DATA = Path(__file__).resolve().parent.parent / "final_dataset" / "ps000109_final.db"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("BRIDGE_DB", str(tmp_path / "runtime.db"))
    monkeypatch.delenv("BRIDGE_API_KEY", raising=False)
    monkeypatch.delenv("DASHBOARD_TELEMETRY_URL", raising=False)
    return TestClient(bridge.app)


def reading(**extra):
    return {"site_id": "kandla_port", "device_id": "d1", "ambient_temp_c": 35.0, "relative_humidity_pct": 50.0, **extra}


@pytest.mark.parametrize("wbgt,workload,expected", [
    (27.5, "heavy", 75), (27.6, "heavy", 50), (29.0, "heavy", 50), (30.5, "heavy", 25), (30.6, "heavy", 0),
    (28.0, "moderate", 100), (29.0, "moderate", 75), (30.0, "moderate", 50), (31.5, "moderate", 25), (31.6, "moderate", 0),
    (31.0, "light", 100), (32.0, "light", 50), (32.5, "light", 25), (32.6, "light", 0),
])
def test_heat_table_edges(wbgt, workload, expected):
    assert bridge.allowed_pct(wbgt, workload) == expected


def test_iso_wbgt_formula():
    wbgt, method = bridge.compute_wbgt(30.0, 50.0, tg=40.0, tnwb=25.0)
    assert method == "iso_outdoor_measured"
    assert wbgt == pytest.approx(0.7 * 25 + 0.2 * 40 + 0.1 * 30)


def test_health_and_catalog(client):
    assert client.get("/health").json()["hourly_rows"] == 105120
    catalog = client.get("/api/v1/catalog").json()
    assert len(catalog["locations"]) == 12 and len(catalog["jobs"]) == 9


def test_replay_matches_dataset_and_wraps(client):
    client.post("/api/v1/devices/d1/session", json={"location_id": "kandla_port", "date": "2025-05-19", "job_id": "port_yard_kandla"})
    rows = [client.get("/api/v1/devices/d1/replay/next").json() for _ in range(25)]
    with sqlite3.connect(DATA) as con:
        stored = con.execute("SELECT wbgt_sun FROM location_hourly_2025 WHERE location_id='kandla_port' AND time='2025-05-19 12:00:00'").fetchone()[0]
    assert rows[12]["wbgt_c"] == stored
    assert rows[23]["day_complete"] is True
    assert rows[24]["time"] == rows[0]["time"]
    assert "not a worksite measurement" in rows[0]["label"]


def test_same_weather_differs_by_job(client):
    for device, job in (("a", "port_yard_kandla"), ("b", "crane_cab")):
        client.post(f"/api/v1/devices/{device}/session", json={"location_id": "kandla_port", "date": "2025-05-19", "job_id": job, "start_hour": 12})
    loader = client.get("/api/v1/devices/a/replay/next").json()
    cab = client.get("/api/v1/devices/b/replay/next").json()
    assert loader["lamp"] == "RED_FLASH" and cab["lamp"] == "GREEN"


def test_telemetry_stored_and_readable(client):
    reply = client.post("/api/v1/telemetry", json=reading(globe_temp_c=45.0, pm10_0_ug_m3=150.0, job_id="cement_yard")).json()
    assert reply["wbgt_method"] == "iso_outdoor_estimated_wet_bulb"
    assert reply["workload_used"] == "heavy" and reply["workload_assumed_default"] is False
    assert reply["dust_flag"] is True and "does not measure silica" in reply["dust_note"]
    assert client.get("/api/v1/devices/d1/latest").json()["id"] == reply["reading_id"]
    assert client.get("/api/v1/readings", params={"device_id": "d1"}).json()["count"] == 1


def test_no_globe_is_labelled_and_default_workload_is_visible(client):
    reply = client.post("/api/v1/telemetry", json=reading()).json()
    assert reply["wbgt_method"] == "shade_estimate_no_globe"
    assert reply["workload_assumed_default"] is True


@pytest.mark.parametrize("bad", [{"ambient_temp_c": 200}, {"relative_humidity_pct": 120}, {"pm10_0_ug_m3": -1}])
def test_rejects_impossible_values(client, bad):
    assert client.post("/api/v1/telemetry", json=reading(**bad)).status_code == 422


def test_unknown_job_and_day(client):
    assert client.post("/api/v1/telemetry", json=reading(job_id="nope")).status_code == 404
    assert client.post("/api/v1/devices/d1/session", json={"date": "2019-01-01"}).status_code == 404


def test_api_key(client, monkeypatch):
    monkeypatch.setenv("BRIDGE_API_KEY", "secret")
    assert client.post("/api/v1/telemetry", json=reading()).status_code == 401
    assert client.post("/api/v1/telemetry", json=reading(), headers={"X-API-Key": "secret"}).status_code == 200


def test_noise_dose_matches_formula_and_accumulates(client):
    assert bridge.noise_dose_pct(85, 480) == pytest.approx(100)
    assert bridge.noise_dose_pct(88, 240) == pytest.approx(100)
    first = client.post("/api/v1/telemetry", json=reading(noise_dba=91.0, sample_minutes=60)).json()
    assert first["noise_dose_today_pct"] == pytest.approx(50, abs=0.1) and first["alerts"] == []
    second = client.post("/api/v1/telemetry", json=reading(noise_dba=91.0, sample_minutes=90)).json()
    assert second["noise_dose_today_pct"] == pytest.approx(125, abs=0.1)
    assert [a["code"] for a in second["alerts"]] == ["NOISE_DOSE_OVER_100"]


def test_uv_dose_and_alert(client):
    reply = client.post("/api/v1/telemetry", json=reading(uv_index=10.0, sample_minutes=60)).json()
    assert reply["uv_dose_today_sed"] == pytest.approx(9.0)
    assert "UV_HIGH" in [a["code"] for a in reply["alerts"]]
    assert client.post("/api/v1/telemetry", json=reading(device_id="d2", uv_index=5.0)).json()["alerts"] == []


def test_hydration_needs_both_heat_and_dark_urine(client):
    hot = reading(globe_temp_c=50.0, relative_humidity_pct=60.0)
    assert "HOT_DAY_DARK_URINE" in [a["code"] for a in client.post("/api/v1/telemetry", json={**hot, "urine_colour_score": 6}).json()["alerts"]]
    assert client.post("/api/v1/telemetry", json={**hot, "urine_colour_score": 3}).json()["alerts"] == []
    cool = reading(ambient_temp_c=18.0, relative_humidity_pct=40.0, urine_colour_score=6)
    assert client.post("/api/v1/telemetry", json=cool).json()["alerts"] == []
    assert client.post("/api/v1/telemetry", json=reading(urine_colour_score=9)).status_code == 422


def test_weekly_hours(client):
    base = {"worker_id": "w1", "device_id": "d1", "site_id": "kandla_port"}
    for day in range(11, 16):  # Monday to Friday, ISO week 33 of 2025.
        client.post("/api/v1/checkin", json={**base, "event": "in", "at": f"2025-08-{day}T08:00:00"})
        reply = client.post("/api/v1/checkin", json={**base, "event": "out", "at": f"2025-08-{day}T19:00:00"}).json()
    assert reply["hours_this_week"] == 55.0 and reply["iso_year_week"] == "2025-W33"
    assert [a["code"] for a in reply["alerts"]] == ["HOURS_55_PLUS"]
    assert client.get("/api/v1/workers/w1/hours", params={"at": "2025-08-25T08:00:00"}).json()["hours_this_week"] == 0


def test_checkin_handles_missing_scans(client):
    base = {"worker_id": "w2", "device_id": "d1", "site_id": "kandla_port"}
    client.post("/api/v1/checkin", json={**base, "event": "in", "at": "2025-08-11T08:00:00"})
    client.post("/api/v1/checkin", json={**base, "event": "in", "at": "2025-08-11T09:00:00"})
    reply = client.post("/api/v1/checkin", json={**base, "event": "out", "at": "2025-08-11T10:00:00"}).json()
    assert reply["hours_this_week"] == 1.0 and reply["unmatched_scans"] == 1


def test_replay_includes_new_parameters(client):
    client.post("/api/v1/devices/d1/session", json={"location_id": "kandla_port", "date": "2025-05-19", "job_id": "stone_crushing", "start_hour": 12})
    row = client.get("/api/v1/devices/d1/replay/next").json()
    assert row["scenario_noise_dba"] == 88.9 and row["model_uv_index"] > 5


def test_health_details_are_not_forwarded_or_public(client, monkeypatch):
    sent = {}

    class Reply:
        status_code = 200

    monkeypatch.setenv("DASHBOARD_TELEMETRY_URL", "http://dash/api/telemetry")
    monkeypatch.setattr(bridge.httpx, "post", lambda url, json, timeout: (sent.update(json), Reply())[1])
    client.post("/api/v1/telemetry", json=reading(urine_colour_score=6, noise_dba=90.0, worker_id="w1"))
    assert "urine_colour_score" not in sent and "noise_dba" not in sent
    monkeypatch.setenv("BRIDGE_API_KEY", "secret")
    assert client.get("/api/v1/readings").status_code == 401
    assert client.get("/api/v1/devices/d1/latest").status_code == 401
    assert client.get("/api/v1/workers/w1/hours").status_code == 401


def test_forwarding_success_and_failure(client, monkeypatch):
    sent = {}

    class Reply:
        status_code = 200

    def fake_post(url, json, timeout):
        sent.update(url=url, body=json)
        return Reply()

    monkeypatch.setenv("DASHBOARD_TELEMETRY_URL", "http://dash/api/telemetry")
    monkeypatch.setattr(bridge.httpx, "post", fake_post)
    assert client.post("/api/v1/telemetry", json=reading(job_id="cement_yard")).json()["forward_status"] == "http_200"
    assert "job_id" not in sent["body"] and "source" not in sent["body"] and sent["body"]["ambient_temp_c"] == 35.0

    def broken(*args, **kwargs):
        raise bridge.httpx.ConnectError("down")

    monkeypatch.setattr(bridge.httpx, "post", broken)
    reply = client.post("/api/v1/telemetry", json=reading())
    assert reply.status_code == 200 and reply.json()["forward_status"] == "failed_ConnectError"
    assert client.get("/api/v1/readings").json()["count"] == 2

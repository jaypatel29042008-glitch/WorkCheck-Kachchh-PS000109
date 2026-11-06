"""Run from workcheck_platform: python3 -m pytest tests -q"""
import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WC_RUNTIME_DB", str(tmp_path / "runtime.db"))
    monkeypatch.delenv("WC_FORWARD_URL", raising=False)
    return TestClient(main.app)


def signin(client, email):
    password = next(u[1] for u in main.DEMO_USERS if u[0] == email)
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()


def test_passwords_are_hashed_not_stored(client):
    client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "wrong"})
    with main.db() as con:
        stored = con.execute("SELECT password_hash FROM users WHERE email='ddo@workcheck.demo'").fetchone()[0]
    assert "Demo-DDO-2026" not in stored and "$" in stored


def test_login_logout_and_session(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "nope"}).status_code == 401
    assert signin(client, "ddo@workcheck.demo")["role"] == "ddo"
    assert client.get("/api/auth/me").json()["name"] == "District Office"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_account_locks_after_repeated_failures(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "Demo-DDO-2026"}).status_code == 429


def test_district_cannot_open_individual_records(client):
    signin(client, "ddo@workcheck.demo")
    assert client.get("/api/workers").status_code == 403
    assert client.get("/api/workers/SIM-B").status_code == 403
    overview = client.get("/api/overview").json()
    assert overview["first"] == []
    assert overview["levels"] == {"action": 46, "due": 35, "watch": 46, "clear": 1}
    assert all(row["tracked"] == "<5" or row["tracked"] >= 5 for row in overview["talukas"])
    assert all(row["open"] == "<5" or row["open"] == 0 or row["open"] >= 5 for row in overview["talukas"])

def test_worker_sees_only_own_record(client):
    signin(client, "worker@workcheck.demo")
    assert client.get("/api/workers/SIM-B").status_code == 200
    assert client.get("/api/workers/SIM-A").status_code == 403
    assert client.get("/api/workers").status_code == 403
    assert client.get("/api/overview").status_code == 403


def test_clinician_update_persists_and_changes_queue(client):
    signin(client, "clinic@workcheck.demo")
    workers = client.get("/api/workers").json()
    assert workers["all"] == 128 and workers["workers"][0]["level"] == "action"
    passport = client.get("/api/workers/SIM-G").json()
    assert "Kidney disease" in [c["condition"] for c in passport["open_checks"]]
    result = client.post("/api/workers/SIM-G/conditions", json={"condition": "Kidney disease", "status": "CHECKED_NOTHING_NOTED", "note": "Test"})
    assert result.status_code == 200
    after = client.get("/api/workers/SIM-G").json()
    assert "Kidney disease" not in [c["condition"] for c in after["open_checks"]]
    assert after["updates"][0]["note"] == "Test"
    assert client.post("/api/workers/SIM-G/conditions", json={"condition": "Made up", "status": "CHECK_DUE"}).status_code == 400


def test_worker_report_raises_then_clinic_review_clears(client):
    signin(client, "worker@workcheck.demo")
    client.post("/api/workers/SIM-B/symptoms", json={"symptom": "cough"})
    client.post("/api/auth/logout")
    signin(client, "clinic@workcheck.demo")
    passport = client.get("/api/workers/SIM-B").json()
    assert passport["state"]["level"] == "action" and passport["next"]["cta"] == "Review report"
    report = passport["symptoms"][0]
    assert client.post(f"/api/workers/SIM-B/symptoms/{report['id']}/review").json()["reviewed"] is True
    assert client.get("/api/workers/SIM-B").json()["state"]["level"] != "action"


def test_care_journey_reads_in_order(client):
    signin(client, "clinic@workcheck.demo")
    stuck = client.get("/api/workers/SIM-G").json()["tracker"]
    assert stuck["problem"] == "Legal exam overdue"
    assert [s["state"] for s in stuck["steps"]][:3] == ["done", "done", "problem"]
    refound = client.get("/api/workers/SIM-E").json()["tracker"]
    assert "found again" in refound["summary"]
    assert all(s["state"] in ("done", "skipped") for s in refound["steps"])

def test_symptom_report_saved_and_collapse_is_urgent(client):
    signin(client, "worker@workcheck.demo")
    assert client.post("/api/workers/SIM-B/symptoms", json={"symptom": "cough"}).json()["urgent"] is False
    urgent = client.post("/api/workers/SIM-B/symptoms", json={"symptom": "collapse"}).json()
    assert urgent["urgent"] is True and "108" in urgent["message"]
    assert len(client.get("/api/workers/SIM-B").json()["symptoms"]) == 2


def test_heat_views_match_dataset_summary(client):
    signin(client, "ddo@workcheck.demo")
    year = client.get("/api/heat/year", params={"job_id": "port_yard_kandla"}).json()
    assert year["summer"] == {"9-18": 2.3, "6-15": 3.2} and year["under_half_days"] == 194
    assert len(year["series"]["9-18"]) == 12
    assert client.get("/api/heat/year", params={"job_id": "crane_cab"}).json()["summer"]["9-18"] == 9.0
    assert client.get("/api/heat/year", params={"job_id": "nope"}).status_code == 404
    places = client.get("/api/heat/map").json()
    assert {m["key"] for m in places["modes"]} == {"heavy", "moderate", "light"}
    assert set(places["taluka_location"]) == {"Abdasa", "Anjar", "Bhachau", "Bhuj", "Gandhidham", "Lakhpat", "Mandvi", "Mundra", "Nakhatrana", "Rapar"}

def test_device_requires_key_and_reading_reaches_node_view(client):
    body = {"device_id": "wokwi-1", "ambient_temp_c": 34.8, "relative_humidity_pct": 55, "globe_temp_c": 47, "pm10_0_ug_m3": 150, "uv_index": 9.5}
    assert client.post("/api/v1/telemetry", json=body).status_code == 401
    reply = client.post("/api/v1/telemetry", json=body, headers={"X-API-Key": "demo-device-key"}).json()
    assert reply["jobs"][0]["lamp"] == "RED_FLASH" and reply["jobs"][2]["lamp"] == "GREEN"
    assert {a["code"] for a in reply["alerts"]} == {"DUST_FLAG", "UV_HIGH"}
    assert client.post("/api/v1/telemetry", json={**body, "relative_humidity_pct": 500}, headers={"X-API-Key": "demo-device-key"}).status_code == 422
    assert client.get("/api/node/state").status_code == 401
    signin(client, "site@workcheck.demo")
    state = client.get("/api/node/state").json()
    assert state["wokwi"]["connected"] is True and state["latest"]["device_id"] == "wokwi-1"


def test_replay_uses_model_sun_wbgt(client):
    signin(client, "site@workcheck.demo")
    view = client.post("/api/node/replay", params={"location_id": "kandla_port", "day": "2025-05-19", "hour": 12}).json()
    assert view["wbgt_c"] == 32.5 and view["jobs"][0]["lamp"] == "RED_FLASH" and view["source"] == "model_replay"


def test_weekly_hours_from_checkins(client):
    key = {"X-API-Key": "demo-device-key"}
    base = {"worker_id": "w1", "device_id": "d1", "site_id": "kandla_port"}
    for day in range(11, 16):
        client.post("/api/v1/checkin", json={**base, "event": "in", "at": f"2025-08-{day}T08:00:00+00:00"}, headers=key)
        reply = client.post("/api/v1/checkin", json={**base, "event": "out", "at": f"2025-08-{day}T19:00:00+00:00"}, headers=key).json()
    assert reply["hours_this_week"] == 55.0 and reply["over_55"] is True


def test_export_is_anonymous_and_district_only(client):
    signin(client, "ddo@workcheck.demo")
    text = client.get("/api/export/district.csv").text
    assert "SIM-" not in text and "Fictional" in text
    client.post("/api/auth/logout")
    signin(client, "clinic@workcheck.demo")
    assert client.get("/api/export/district.csv").status_code == 403


def test_heat_and_dust_combined_map(client):
    signin(client, "ddo@workcheck.demo")
    data = client.get("/api/heat/map").json()
    assert {layer["key"] for layer in data["layers"]} == {"compound", "heat", "dust"}
    assert len(data["locations"]) == 12
    for loc in data["locations"]:
        assert len(loc["dust_pm10"]) == 12
        assert len(loc["dust_pm25"]) == 12
        assert len(loc["compound_score"]) == 12
        assert all(0 <= score <= 100 for score in loc["compound_score"])
        assert len(loc["compound_days"]) == 12
    bhuj = next(l for l in data["locations"] if l["location_id"] == "bhuj")
    assert bhuj["dust_pm10"][4] > 0  # May PM10 is positive
    assert bhuj["compound_score"][4] >= 70  # May compound score is elevated


def test_wokwi_stream_telemetry_integration(client):
    packet = {
        "device_id": "wokwi-node-01",
        "site_id": "kandla_port",
        "source": "wokwi_simulated",
        "ambient_temp_c": 36.5,
        "relative_humidity_pct": 45,
        "globe_temp_c": 49.0,
        "pm10_0_ug_m3": 145.0,
        "pm2_5_ug_m3": 62.0,
        "uv_index": 9.2,
        "noise_dba": 84.0,
    }
    res = client.post("/api/v1/telemetry", json=packet, headers={"X-API-Key": "demo-device-key"})
    assert res.status_code == 200
    reply = res.json()
    assert reply["lamp"] in ("RED", "RED_FLASH")
    assert any(a["code"] == "DUST_FLAG" for a in reply["alerts"])
    signin(client, "site@workcheck.demo")
    state = client.get("/api/node/state").json()
    assert state["wokwi"]["connected"] is True
    assert state["wokwi"]["device_id"] == "wokwi-node-01"


def test_health_facilities_distance_and_disease_sorting(client):
    signin(client, "ddo@workcheck.demo")
    res = client.get("/api/facilities", params={"site_id": "little_rann_kutch", "disease": "silicosis"}).json()
    assert len(res["facilities"]) == 12
    top = res["facilities"][0]
    assert "Dhanvantari" in top["facility_name"]
    assert top["has_digital_xray"] is True and top["has_spirometer"] is True
    assert top["disease_match"] is True

    kandla = client.get("/api/facilities", params={"site_id": "kandla_port", "disease": "all"}).json()
    assert "ESIC" in kandla["facilities"][0]["facility_name"]
    assert kandla["facilities"][0]["distance_km"] <= 12.0


def test_facility_referral_routing(client):
    signin(client, "clinic@workcheck.demo")
    res = client.post("/api/facilities/refer", json={"facility_id": "FAC-BHUJ-GK", "disease": "silicosis", "worker_id": "SIM-B"})
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert "GK General Hospital" in res.json()["facility_name"]


def test_worker_symptoms_batch_reporting(client):
    signin(client, "worker@workcheck.demo")
    res = client.post("/api/workers/SIM-B/symptoms/batch", json={"symptoms": ["dark_urine", "cough", "eye_skin"]})
    assert res.status_code == 200
    assert res.json()["saved"] is True and res.json()["count"] == 3


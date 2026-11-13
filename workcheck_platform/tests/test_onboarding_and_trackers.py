"""Company sign-up, invite codes, daily check-ins and the trackers. Run from workcheck_platform: python3 -m pytest tests -q"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import main

HEADERS = {"X-Requested-With": "WorkCheck"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WC_RUNTIME_DB", str(tmp_path / "runtime.db"))
    main.LOGIN_LIMIT.hits.clear()
    from app import security
    security.SIGNUP_LIMIT.hits.clear()
    return TestClient(main.app, headers=HEADERS)


def signin(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def register(client):
    r = client.post("/api/org/register", json={"org_name": "Rann Salt Co", "org_kind": "Salt pan", "site_name": "Pan 7", "location_id": "little_rann_kutch", "admin_name": "Meera S.", "email": "meera@rannsalt.test", "password": "Rann-Salt-2026!"})
    assert r.status_code == 200, r.text
    return r.json()


def test_state_changes_need_the_app_header(tmp_path, monkeypatch):
    monkeypatch.setenv("WC_RUNTIME_DB", str(tmp_path / "runtime.db"))
    bare = TestClient(main.app)
    assert bare.post("/api/auth/login", json={"email": "x@y.z", "password": "p"}).status_code == 403
    assert bare.get("/health").status_code == 200
    headers = bare.get("/").headers
    assert "frame-ancestors 'none'" in headers["content-security-policy"] and headers["x-frame-options"] == "DENY"


def test_company_signup_invite_and_worker_join(client):
    out = register(client)
    assert out["user"]["role"] == "supervisor" and out["user"]["org"]["name"] == "Rann Salt Co"
    assert client.post("/api/org/register", json={"org_name": "Again", "org_kind": "Salt pan", "site_name": "Pan X", "location_id": "bhuj", "admin_name": "A B", "email": "meera@rannsalt.test", "password": "Another-Pass-99"}).status_code == 409
    weak = client.post("/api/org/register", json={"org_name": "Weak", "org_kind": "Salt pan", "site_name": "Pan X", "location_id": "bhuj", "admin_name": "A B", "email": "weak@x.test", "password": "short"})
    assert weak.status_code == 400 and "10 characters" in weak.json()["detail"]
    invite = client.post("/api/org/invites", json={"role": "worker", "site_id": out["site_id"], "job_id": "salt_raking", "label": "Morning gang", "max_uses": 5}).json()
    code = invite["code"]
    assert len(code) == 7 and "-" in code
    preview = client.get(f"/api/join/{code.lower()}").json()
    assert preview["org"] == "Rann Salt Co" and preview["job"] == "Salt-pan worker" and preview["site"] == "Pan 7"
    client.post("/api/auth/logout")
    joined = client.post(f"/api/join/{code}", json={"name": "Bhavesh K.", "identity": "98765 43210", "password": "Bhavesh-Pan-7", "age": 34}).json()
    worker = joined["user"]
    assert worker["role"] == "worker" and worker["worker_id"].startswith("W-") and worker["email"] == "9876543210"
    assert client.get("/api/join/NOPE-00").status_code == 404
    # The worker checks in.
    today = client.get("/api/log/today").json()
    assert today["log"] is None and {p["key"] for p in today["catalogue"]["ppe"]} == {"glasses", "boots", "water", "shade"}
    saved = client.post("/api/log", json={"feeling": 3, "symptoms": ["headache", "dark_urine"], "ppe": {"glasses": False, "boots": True, "water": True, "shade": True, "mask": True}, "water_litres": 2.5, "hours": 9}).json()
    assert saved["urgent"] is False and saved["log"]["ppe_missing"] == ["glasses"] and "mask" not in saved["log"]["ppe"]
    assert saved["history"]["streak"] == 1 and saved["history"]["days"][-1]["tone"] == "due"
    again = client.post("/api/log", json={"feeling": 1, "symptoms": [], "ppe": {"glasses": True}}).json()
    assert again["log"]["feeling"] == 1 and again["history"]["logged"] == 1  # One row per day, updated in place.
    urgent = client.post("/api/log", json={"feeling": 4, "symptoms": ["collapse"], "ppe": {}}).json()
    assert urgent["urgent"] is True and "108" in urgent["message"]
    mine = client.get(f"/api/workers/{worker['worker_id']}").json()
    assert mine["kind"] == "org" and mine["state"]["level"] == "action" and mine["card"]["job"] == "Salt-pan worker"
    assert client.get("/api/workers/SIM-B").status_code == 403
    assert client.get("/api/me/today").json()["advice"]["workload"] == "heavy"
    # The supervisor sees it on the dashboard, with the name.
    client.post("/api/auth/logout")
    signin(client, "meera@rannsalt.test", "Rann-Salt-2026!")
    dash = client.get("/api/dashboard").json()
    assert dash["workers_total"] == 1 and dash["checked_in"] == 1 and dash["unwell"][0]["name"] == "Bhavesh K." and dash["unwell"][0]["urgent"] is True
    assert dash["todo"][0]["tone"] == "action" and "Bhavesh" in dash["todo"][0]["text"]
    org = client.get("/api/org").json()
    assert org["workers"] == 1 and org["invites"][0]["uses"] == 1 and org["people"][1]["role"] == "worker"
    assert client.get("/api/workers").status_code == 403  # A supervisor still cannot open health records.
    assert client.get(f"/api/workers/{worker['worker_id']}").status_code == 403


def test_incidents_training_and_site_checks(client):
    out = register(client)
    inc = client.post("/api/incidents", json={"kind": "heat", "severity": "serious", "what": "Worker felt faint at 2pm.", "action": "Moved to shade.", "site_id": out["site_id"]}).json()
    listing = client.get("/api/incidents").json()
    assert listing["open"] == 1 and listing["incidents"][0]["kind_label"] == "Heat illness" and listing["incidents"][0]["site_name"] == "Pan 7"
    assert client.post(f"/api/incidents/{inc['id']}/close", json={"note": "Break moved earlier."}).json()["ok"] is True
    assert client.get("/api/incidents").json()["open"] == 0
    assert client.post(f"/api/incidents/{inc['id']}/close", json={}).status_code == 404
    code = client.post("/api/org/invites", json={"role": "worker", "site_id": out["site_id"], "job_id": "stone_crushing"}).json()["code"]
    client.post("/api/auth/logout")
    wid = client.post(f"/api/join/{code}", json={"name": "Ramesh T.", "identity": "ramesh@x.test", "password": "Ramesh-Crusher-1"}).json()["user"]["worker_id"]
    client.post("/api/auth/logout")
    signin(client, "meera@rannsalt.test", "Rann-Salt-2026!")
    tr = client.post("/api/training", json={"course": "dust", "done_on": "2025-01-10", "worker_ids": [wid, "SIM-A"]}).json()
    assert tr["saved"] == 1 and tr["valid_until"] == "2026-01-10"
    courses = {c["key"]: c for c in client.get("/api/training").json()["courses"]}
    assert courses["dust"]["expired"] == 1 and courses["heat"]["never"] == 1
    assert client.post("/api/site-checks", json={"site_id": out["site_id"], "item": "shade", "status": "missing", "note": "Tarp torn"}).json()["ok"]
    sites = client.get("/api/site-checks").json()["sites"]
    assert sites[0]["missing"] == 1 and sites[0]["unchecked"] == 7
    dash = client.get("/api/dashboard").json()
    texts = " ".join(t["text"] for t in dash["todo"])
    assert "Shaded rest area is missing at Pan 7" in texts and "training record" in texts


def test_clinician_invite_medical_and_referrals(client):
    out = register(client)
    wcode = client.post("/api/org/invites", json={"role": "worker", "site_id": out["site_id"], "job_id": "cement_yard"}).json()["code"]
    ccode = client.post("/api/org/invites", json={"role": "clinician"}).json()["code"]
    client.post("/api/auth/logout")
    wid = client.post(f"/api/join/{wcode}", json={"name": "Hansa K.", "identity": "hansa@x.test", "password": "Hansa-Cement-22"}).json()["user"]["worker_id"]
    client.post("/api/auth/logout")
    doc = client.post(f"/api/join/{ccode}", json={"name": "Dr Patel", "identity": "doc@x.test", "password": "Clinic-Pass-2026"}).json()["user"]
    assert doc["role"] == "clinician"
    workers = client.get("/api/workers").json()
    assert workers["all"] == 1 and workers["workers"][0]["headline"] == "No check-ins yet"
    assert client.get("/api/workers/SIM-B").status_code == 403  # Demo workers belong to the demo organisation.
    past = (date.today() - timedelta(days=400)).isoformat()
    saved = client.post("/api/medical", json={"worker_id": wid, "check_name": "Lung check", "done_on": past, "result": "follow_up", "note": "Repeat in a year"}).json()
    assert saved["next_due"] < date.today().isoformat()
    med = client.get("/api/medical", params={"worker_id": wid}).json()
    assert med["due"][0]["state"] == "overdue" and med["checks"][0]["result_label"] == "Follow-up needed"
    ref = client.post("/api/referrals", json={"worker_id": wid, "facility_id": "F1", "facility_name": "GK General Hospital", "reason": "Lung check follow-up"}).json()
    assert "Nothing was sent" in ref["message"]
    assert client.post(f"/api/referrals/{ref['id']}", json={"status": "attended", "outcome": "X-ray clear"}).json()["ok"]
    record = client.get(f"/api/workers/{wid}").json()
    assert record["state"]["level"] == "action" and "overdue" in record["state"]["reasons"][0] and record["referrals"][0]["status"] == "attended"
    assert client.get("/api/overview").json()["levels"]["action"] == 1


def test_demo_org_gets_labelled_sample_logs(client):
    signin(client, "site@workcheck.demo", "Demo-Site-2026")
    dash = client.get("/api/dashboard").json()
    assert dash["org"]["demo"] == 1 and dash["workers_total"] == 128 and dash["checked_in"] > 20
    assert dash["incidents"]["open"] == 2 and len(dash["trend"]) == 14
    client.post("/api/auth/logout")
    signin(client, "worker@workcheck.demo", "Demo-Worker-2026")
    today = client.get("/api/log/today").json()
    assert today["history"]["logged"] >= 0 and {p["key"] for p in today["catalogue"]["ppe"]} == {"mask", "ears", "glasses", "boots", "water", "shade"}
    client.post("/api/log", json={"feeling": 2, "symptoms": ["cough"], "ppe": {"mask": False}})
    client.post("/api/auth/logout")
    signin(client, "clinic@workcheck.demo", "Demo-Clinic-2026")
    passport = client.get("/api/workers/SIM-B").json()
    assert passport["symptoms"][0]["text"] == "Cough" and passport["state"]["level"] == "action"


def test_password_change_signs_out_other_devices(client):
    signin(client, "site@workcheck.demo", "Demo-Site-2026")
    bad = client.post("/api/auth/password", json={"current": "wrong", "new": "Something-New-123"})
    assert bad.status_code == 401
    assert client.post("/api/auth/password", json={"current": "Demo-Site-2026", "new": "Demo-Site-2026"}).status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_website_sliders_reach_the_device_and_are_confirmed(client):
    key = {"X-API-Key": "demo-device-key"}
    reading = {"device_id": "wokwi-node-01", "site_id": "kandla_port", "ambient_temp_c": 25, "relative_humidity_pct": 42, "globe_temp_c": 26, "remote_rev": 0}
    first = client.post("/api/v1/telemetry", json=reading, headers=key).json()
    assert first["r_on"] == 0 and first["lamp"]
    assert client.post("/api/node/controls", json={"enabled": True, "ambient_temp_c": 38, "relative_humidity_pct": 40, "globe_temp_c": 52, "pm10_0_ug_m3": 260, "uv_index": 10}).status_code == 401
    signin(client, "site@workcheck.demo", "Demo-Site-2026")
    assert client.post("/api/node/controls", json={"enabled": True, "ambient_temp_c": 99, "relative_humidity_pct": 40, "globe_temp_c": 52, "pm10_0_ug_m3": 260, "uv_index": 10}).status_code == 422
    sent = client.post("/api/node/controls", json={"enabled": True, "ambient_temp_c": 38, "relative_humidity_pct": 40, "globe_temp_c": 52, "pm10_0_ug_m3": 260, "uv_index": 10}).json()
    assert sent["rev"] == 1 and sent["confirmed"] is False and sent["device_online"] is True
    # The device's next post gets the values in the reply, but has not used them yet.
    reply = client.post("/api/v1/telemetry", json=reading, headers=key).json()
    assert (reply["r_on"], reply["r_rev"], reply["r_temp"], reply["r_pm10"]) == (1, 1, 38.0, 260.0)
    assert client.get("/api/node/controls").json()["confirmed"] is False
    # Then it reports with those values and the matching number, and the website shows it as confirmed.
    used = client.post("/api/v1/telemetry", json={**reading, "ambient_temp_c": 38, "relative_humidity_pct": 40, "globe_temp_c": 52, "pm10_0_ug_m3": 260, "uv_index": 10, "remote_rev": 1}, headers=key).json()
    assert used["lamp"] == "RED_FLASH" and "DUST_FLAG" in [a["code"] for a in used["alerts"]]
    state = client.get("/api/node/controls").json()
    assert state["confirmed"] is True and state["values"]["globe_temp_c"] == 52
    # Moving a slider makes a new set; the old confirmation no longer counts.
    moved = client.post("/api/node/controls", json={"enabled": True, "ambient_temp_c": 30, "relative_humidity_pct": 40, "globe_temp_c": 35, "pm10_0_ug_m3": 50, "uv_index": 5}).json()
    assert moved["rev"] == 2 and moved["confirmed"] is False
    off = client.post("/api/node/controls", json={"enabled": False, "ambient_temp_c": 30, "relative_humidity_pct": 40, "globe_temp_c": 35, "pm10_0_ug_m3": 50, "uv_index": 5}).json()
    assert off["enabled"] is False and client.post("/api/v1/telemetry", json=reading, headers=key).json()["r_on"] == 0

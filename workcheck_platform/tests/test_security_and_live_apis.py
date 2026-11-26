"""Security hardening, tenant isolation, dormant dataset exposure, DPDP privacy and live API tests."""
import csv
import io
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import core, live, main, security

HEADERS = {"X-Requested-With": "WorkCheck"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WC_RUNTIME_DB", str(tmp_path / "runtime.db"))
    monkeypatch.delenv("WC_FORWARD_URL", raising=False)
    main.LOGIN_LIMIT.hits.clear()
    security.SIGNUP_LIMIT.hits.clear()
    security.JOIN_LIMIT.hits.clear()
    live.clear_live_caches()
    return TestClient(main.app, headers=HEADERS)


def _register_org(client, org_name, email, password, location="kandla_port"):
    res = client.post(
        "/api/org/register",
        json={
            "org_name": org_name,
            "org_kind": "Port or dock",
            "site_name": f"{org_name} Yard",
            "location_id": location,
            "admin_name": "Admin User",
            "email": email,
            "password": password,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_cross_origin_csrf_rejected(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "ddo@workcheck.demo", "password": "Demo-DDO-2026"},
        headers={"X-Requested-With": "WorkCheck", "Origin": "https://evil.example", "Host": "localhost"},
    )
    assert res.status_code == 403


def test_trusted_proxy_ip_extraction(monkeypatch):
    monkeypatch.setattr(core, "ENV", "production")
    monkeypatch.setattr(core, "TRUSTED_PROXIES", {"127.0.0.1", "10.0.0.1"})

    class _FakeClient:
        def __init__(self, host):
            self.host = host

    class _FakeReq:
        def __init__(self, host, xff):
            self.client = _FakeClient(host)
            self.headers = {"x-forwarded-for": xff} if xff else {}

    # Untrusted peer spoofing X-Forwarded-For must not be trusted.
    assert security.client_ip(_FakeReq("203.0.113.5", "198.51.100.99")) == "203.0.113.5"
    # Trusted proxy strips right-most trusted proxies only.
    assert security.client_ip(_FakeReq("127.0.0.1", "198.51.100.1, 10.0.0.1")) == "198.51.100.1"


def test_cross_tenant_isolation_controls_conditions_symptoms_and_referrals(client):
    # Worker in Org 1 reports a symptom
    assert client.post("/api/auth/login", json={"email": "worker@workcheck.demo", "password": "Demo-Worker-2026"}).status_code == 200
    sym_res = client.post("/api/workers/SIM-B/symptoms", json={"symptom": "cough"})
    assert sym_res.status_code == 200
    client.post("/api/auth/logout")

    assert client.post("/api/auth/login", json={"email": "clinic@workcheck.demo", "password": "Demo-Clinic-2026"}).status_code == 200
    sim_b = client.get("/api/workers/SIM-B").json()
    sym_id = sim_b["symptoms"][0]["id"]
    client.post("/api/auth/logout")

    # Register Org 2 + clinician in Org 2
    _register_org(client, "Org Two Logistics", "sup@orgtwo.test", "Org-Two-Secure-99")
    # Org 2 clinician invite must be locked to max_uses = 1 server-side
    inv_c = client.post("/api/org/invites", json={"role": "clinician", "max_uses": 50}).json()
    assert inv_c["max_uses"] == 1
    assert len(inv_c["code"]) == 9 and "-" in inv_c["code"]
    # Org 2 supervisor cannot hijack Org 1's default device
    assert client.get("/api/node/controls", params={"device_id": "wokwi-node-01"}).status_code in (200, 403)
    # Create control in Org 1 first so device_id belongs to Org 1
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "site@workcheck.demo", "password": "Demo-Site-2026"}).status_code == 200
    assert client.post("/api/node/controls", json={"device_id": "wokwi-node-01", "enabled": True, "ambient_temp_c": 36, "relative_humidity_pct": 40, "globe_temp_c": 48, "pm10_0_ug_m3": 100, "uv_index": 8}).status_code == 200
    client.post("/api/auth/logout")

    # Join as Org 2 clinician
    assert client.post(f"/api/join/{inv_c['code']}", json={"name": "Dr Two", "identity": "doc2@orgtwo.test", "password": "Doc-Two-Secure-99"}).status_code == 200
    # Cross-tenant attacks against Org 1 workers/devices must fail with 403
    assert client.post("/api/workers/SIM-G/conditions", json={"condition": "Kidney disease", "status": "CHECKED_NOTHING_NOTED", "note": "x"}).status_code == 403
    assert client.post(f"/api/workers/SIM-B/symptoms/{sym_id}/review").status_code == 403
    assert client.post("/api/facilities/refer", json={"facility_id": "FAC-BHUJ-GK", "worker_id": "SIM-B", "disease": "silicosis"}).status_code == 403
    assert client.get("/api/node/controls", params={"device_id": "wokwi-node-01"}).status_code == 403
    assert client.post("/api/node/controls", json={"device_id": "wokwi-node-01", "enabled": False, "ambient_temp_c": 30, "relative_humidity_pct": 40, "globe_temp_c": 35, "pm10_0_ug_m3": 40, "uv_index": 3}).status_code == 403
    # Org 2 has isolated readings (never leaks Org 1 telemetry)
    node_org2 = client.get("/api/node/state").json()
    assert node_org2["latest"]["source"] == "model_replay"


def test_unauthenticated_facilities_blocked(client):
    assert client.get("/api/facilities").status_code == 401
    assert client.get("/api/live/environment").status_code == 401
    assert client.get("/api/live/pincode/370001").status_code == 401


def test_production_device_key_fails_closed(client, monkeypatch):
    monkeypatch.setattr(core, "ENV", "production")
    monkeypatch.delenv("WC_DEVICE_KEY", raising=False)
    res = client.post("/api/v1/telemetry", json={"device_id": "wokwi-1", "ambient_temp_c": 35, "relative_humidity_pct": 50}, headers={"X-API-Key": "demo-device-key"})
    assert res.status_code == 503

    monkeypatch.setenv("WC_DEVICE_KEY", "strong-prod-key-xyz")
    res2 = client.post("/api/v1/telemetry", json={"device_id": "wokwi-1", "ambient_temp_c": 35, "relative_humidity_pct": 50}, headers={"X-API-Key": "strong-prod-key-xyz"})
    assert res2.status_code == 200


def test_ssrf_url_validation_blocks_private_and_metadata():
    assert live.safe_forward_url("http://169.254.169.254/latest/meta-data", allow_http_local=True) is None
    assert live.safe_forward_url("http://127.0.0.1:8080/hook", allow_http_local=False) is None
    assert live.safe_forward_url("http://10.0.0.5/hook", allow_http_local=False) is None
    assert live.safe_forward_url("ftp://example.com/file", allow_http_local=True) is None
    assert live.safe_forward_url("https://8.8.8.8/webhook", allow_http_local=False) == "https://8.8.8.8/webhook"


def test_csv_formula_neutralisation(client, monkeypatch):
    assert live.csv_safe("=CMD|' /C calc'!A0") == "'=CMD|' /C calc'!A0"
    assert live.csv_safe("<5") == "<5"
    assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "Demo-DDO-2026"}).status_code == 200
    res = client.get("/api/export/district.csv")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    rows = list(csv.reader(io.StringIO(res.text)))
    assert rows[0][:4] == ["taluka", "tracked", "needs_action", "check_due"]


def test_ddo_dashboard_masks_small_cells(client):
    assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "Demo-DDO-2026"}).status_code == 200
    dash = client.get("/api/dashboard").json()
    assert dash["incidents"]["list"] == []
    assert dash["unwell"] == []
    assert dash["incidents"]["open"] == "<5"


def test_dpdp_privacy_notice_consent_and_personal_export(client):
    notice = client.get("/api/privacy/notice").json()
    assert notice["consent_version"] == core.CONSENT_VERSION
    assert client.post("/api/auth/login", json={"email": "worker@workcheck.demo", "password": "Demo-Worker-2026"}).status_code == 200
    consent = client.post("/api/privacy/consent")
    assert consent.status_code == 200 and consent.json()["consent_version"] == core.CONSENT_VERSION
    export_res = client.get("/api/me/export")
    assert export_res.status_code == 200
    data = json.loads(export_res.text)
    assert "password_hash" not in json.dumps(data)
    assert data["profile"]["worker_id"] == "SIM-B"
    assert "worker_records" in data and "checkins" in data["worker_records"]


def test_evidence_exposes_dormant_reference_tables(client):
    assert client.post("/api/auth/login", json={"email": "ddo@workcheck.demo", "password": "Demo-DDO-2026"}).status_code == 200
    ev = client.get("/api/evidence").json()
    for key in ("cpcb_stations", "nfhs5", "msha_noise", "plfs_hours", "lancet_heat", "district_facts"):
        assert key in ev and len(ev[key]) > 0


def test_live_environment_and_fallback(client, monkeypatch):
    assert client.post("/api/auth/login", json={"email": "site@workcheck.demo", "password": "Demo-Site-2026"}).status_code == 200

    class _FakeResp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    def _fake_get(url, params=None, timeout=8.0):
        count = len(params["latitude"].split(","))
        if "air-quality" in url:
            return _FakeResp([{"current": {"pm10": 112.0, "pm2_5": 44.0, "dust": 68.0, "time": "2026-11-26T12:00"}} for _ in range(count)])
        return _FakeResp([{"current": {"temperature_2m": 38.0, "relative_humidity_2m": 45.0, "shortwave_radiation": 750.0, "wind_speed_10m": 2.0, "uv_index": 8.5, "time": "2026-11-26T12:00"}} for _ in range(count)])

    live_data = live.fetch_live_environment(main.SITE_COORDS, main.compute_wbgt, main.ref, site_id="kandla_port", http_get=_fake_get)
    assert live_data["live"] is True and len(live_data["sites"]) == 1
    assert live_data["sites"][0]["wbgt_shade_c"] is not None and live_data["sites"][0]["wbgt_sun_est_c"] > live_data["sites"][0]["wbgt_shade_c"]

    # Network failure must gracefully fall back to reference climatology instead of throwing 500
    def _failing_get(url, params=None, timeout=8.0):
        raise httpx.ConnectError("offline")

    fb = live.fetch_live_environment(main.SITE_COORDS, main.compute_wbgt, main.ref, site_id="kandla_port", http_get=_failing_get)
    assert fb["live"] is False and fb["sites"][0]["source"] == "reference_fallback"


def test_pincode_validation_and_lookup(client):
    assert client.post("/api/auth/login", json={"email": "clinic@workcheck.demo", "password": "Demo-Clinic-2026"}).status_code == 200
    assert client.get("/api/live/pincode/abc").status_code == 400
    assert client.get("/api/live/pincode/12345").status_code == 400

    class _PinResp:
        def raise_for_status(self):
            return None

        def json(self):
            return [{"Status": "Success", "PostOffice": [{"Name": "Bhuj HO", "BranchType": "Head Post Office", "Block": "Bhuj", "District": "Kachchh", "State": "Gujarat"}]}]

    info = live.fetch_pincode_info("370001", main.load_facilities(), http_get=lambda url, timeout=8.0: _PinResp())
    assert info["in_kachchh"] is True and info["taluka"] == "Bhuj" and len(info["matching_facilities"]) >= 1


def test_pincode_aliases_road_distances_and_auth_options(client):
    # Unauthenticated /api/auth/options returns 200 without raising 401 on boot
    opt_anon = client.get("/api/auth/options")
    assert opt_anon.status_code == 200
    assert opt_anon.json()["authenticated"] is False
    assert opt_anon.json()["user"] is None

    # India Post uses "Rahpar" for Rapar (370165) and "Dayapar" (Lakhpat, 370630)
    class _AliasResp:
        def __init__(self, offices):
            self._offices = offices

        def raise_for_status(self):
            return None

        def json(self):
            return [{"Status": "Success", "PostOffice": self._offices}]

    rapar = live.fetch_pincode_info(
        "370165",
        main.load_facilities(),
        http_get=lambda url, timeout=8.0: _AliasResp([{"Name": "Rapar MDG", "BranchType": "Sub Post Office", "Block": "Rahpar", "District": "Kachchh", "State": "Gujarat"}]),
    )
    assert rapar["matched_taluka"] == "Rapar" and rapar["taluka"] == "Rapar"
    assert any(f["taluka"] == "Rapar" for f in rapar["matching_facilities"])

    dayapar = live.fetch_pincode_info(
        "370630",
        main.load_facilities(),
        http_get=lambda url, timeout=8.0: _AliasResp([{"Name": "Dayapar SO", "BranchType": "Sub Post Office", "Block": "Dayapar", "District": "Kachchh", "State": "Gujarat"}]),
    )
    assert dayapar["matched_taluka"] == "Lakhpat" and dayapar["taluka"] == "Lakhpat"

    # Authenticated session reflects user inside /api/auth/options + facility phone/pincode + expanded evidence + OSRM routing
    assert client.post("/api/auth/login", json={"email": "clinic@workcheck.demo", "password": "Demo-Clinic-2026"}).status_code == 200
    opt_auth = client.get("/api/auth/options")
    assert opt_auth.status_code == 200 and opt_auth.json()["authenticated"] is True
    assert opt_auth.json()["user"]["email"] == "clinic@workcheck.demo"

    facs = client.get("/api/facilities?site_id=little_rann_kutch").json()["facilities"]
    assert all(f.get("pincode") and f.get("phone") and f.get("source") for f in facs)

    ev = client.get("/api/evidence").json()
    for key in ("silica_scenarios", "niosh_noise", "plfs_bands", "lancet_outdoor", "locality_priority"):
        assert key in ev and len(ev[key]) > 0

    class _OsrmResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"code": "Ok", "distances": [[0] + [30900 for _ in facs]], "durations": [[0] + [2160 for _ in facs]]}

    roads = live.fetch_road_distances(
        main.SITE_COORDS["little_rann_kutch"],
        facs,
        main.haversine_km,
        http_get=lambda url, params=None, timeout=10.0: _OsrmResp(),
    )
    first_fid = facs[0]["facility_id"]
    assert roads["live"] is True and roads["routes"][first_fid]["road_km"] == 30.9 and roads["routes"][first_fid]["duration_min"] == 36
    assert client.get("/api/live/road-distances?site_id=nonexistent_site").status_code == 404

    def _osrm_down(url, params=None, timeout=10.0):
        raise httpx.ConnectError("offline")

    roads_fb = live.fetch_road_distances(main.SITE_COORDS["kandla_port"], facs, main.haversine_km, http_get=_osrm_down)
    assert roads_fb["live"] is False and len(roads_fb["routes"]) == len(facs) and roads_fb["routes"][first_fid]["road_km"] is None


"""Cached public API integrations (Open-Meteo weather/air quality, India Post pincode, OSRM road routing) and safety helpers."""
from collections import Counter
import ipaddress
import re
import socket
import time
from typing import Callable, Optional
from urllib.parse import urlparse

import httpx

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
INDIA_POST_PIN_URL = "https://api.postalpincode.in/pincode/{pincode}"
OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving/{coords}"
_USER_AGENT = "WorkCheck-Kachchh/3.1 (SSIP-PS000109)"

_ENV_CACHE: dict = {"ts": 0.0, "sites": None, "fetched_at": None}
_PIN_CACHE: dict = {}
_ROAD_CACHE: dict = {}
_ENV_TTL_SEC = 900
_PIN_TTL_SEC = 86400
_ROAD_TTL_SEC = 21600

# India Post spellings & Kachchh block/headquarter aliases -> canonical facility taluka names.
TALUKA_ALIASES = {
    "rahpar": "Rapar",
    "rapar": "Rapar",
    "chitrod": "Rapar",
    "bhimasar": "Rapar",
    "naliya": "Abdasa",
    "abdasa": "Abdasa",
    "dayapar": "Lakhpat",
    "lakhpat": "Lakhpat",
    "narayan sarovar": "Lakhpat",
    "kandla": "Gandhidham",
    "adipur": "Gandhidham",
    "gandhidham": "Gandhidham",
    "bhuj": "Bhuj",
    "madhapar": "Bhuj",
    "khavda": "Bhuj",
    "mundra": "Mundra",
    "adani port": "Mundra",
    "anjar": "Anjar",
    "mandvi": "Mandvi",
    "nakhatrana": "Nakhatrana",
    "bhachau": "Bhachau",
    "samakhiali": "Bhachau",
}


def clear_live_caches() -> None:
    """Reset in-memory public API caches (used in tests)."""
    _ENV_CACHE["ts"] = 0.0
    _ENV_CACHE["sites"] = None
    _ENV_CACHE["fetched_at"] = None
    _PIN_CACHE.clear()
    _ROAD_CACHE.clear()


def csv_safe(value):
    """Prefix spreadsheet formula trigger characters with an apostrophe to prevent CSV injection."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def safe_forward_url(url: Optional[str], allow_http_local: bool = False) -> Optional[str]:
    """Validate optional webhook forwarding URL against SSRF and insecure schemes."""
    if not url:
        return None
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").strip().lower()
    if parsed.scheme not in ("https", "http") or not host:
        return None
    if parsed.scheme == "http" and not allow_http_local:
        return None
    if host in {"metadata.google.internal", "metadata.goog", "instance-data"}:
        return None

    ips = []
    try:
        ips.append(ipaddress.ip_address(host))
    except ValueError:
        try:
            for info in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM):
                ips.append(ipaddress.ip_address(info[4][0]))
        except OSError:
            return None

    for ip in ips:
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            return None
        if (ip.is_private or ip.is_loopback or ip.is_reserved) and not allow_http_local:
            return None
    return url.strip()


def _http_get_retry(url: str, params: Optional[dict] = None, timeout: float = 8.0, http_get: Optional[Callable] = None):
    """Fetch JSON endpoint with 1 retry on transient network/5xx errors when using real httpx."""
    if http_get is not None:
        return http_get(url, params=params, timeout=timeout) if params is not None else http_get(url, timeout=timeout)

    headers = {"User-Agent": _USER_AGENT}
    last_exc = None
    for attempt in range(2):
        try:
            res = httpx.get(url, params=params, headers=headers, timeout=timeout)
            if res.status_code >= 500 and attempt == 0:
                time.sleep(0.25)
                continue
            return res
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt == 0:
                time.sleep(0.25)
    raise last_exc


def _estimate_sun_globe(temp_c: float, shortwave_wm2: Optional[float], wind_ms: Optional[float]) -> float:
    rad = max(0.0, float(shortwave_wm2 or 0.0))
    wind = max(0.8, float(wind_ms or 1.5))
    rise = min(16.0, (rad * 0.015) / (wind ** 0.35)) if rad > 0 else 0.0
    return round(temp_c + rise, 1)


def _fallback_sites(site_coords: dict, ref_fn: Callable) -> list[dict]:
    with ref_fn() as rc:
        rows = {
            r["location_id"]: dict(r)
            for r in rc.execute(
                """
                SELECT location_id,
                       ROUND(AVG(wbgt_sun_max), 1) AS wbgt_sun_max,
                       ROUND(AVG(pm10_mean), 1) AS pm10_mean,
                       ROUND(AVG(pm25_mean), 1) AS pm25_mean
                FROM location_daily_2025
                WHERE strftime('%m', date) = '05'
                GROUP BY location_id
                """
            )
        }
    out = []
    for sid, meta in site_coords.items():
        r = rows.get(sid, {})
        out.append({
            "site_id": sid,
            "label": meta["label"],
            "taluka": meta["taluka"],
            "lat": meta["lat"],
            "lon": meta["lon"],
            "live": False,
            "source": "reference_fallback",
            "temp_c": None,
            "humidity_pct": None,
            "wind_ms": None,
            "shortwave_wm2": None,
            "uv_index": None,
            "wbgt_shade_c": None,
            "wbgt_sun_est_c": r.get("wbgt_sun_max"),
            "pm10_ug_m3": r.get("pm10_mean"),
            "pm25_ug_m3": r.get("pm25_mean"),
            "dust_ug_m3": None,
            "observed_at": "2025-05 climatology baseline",
        })
    return out


def fetch_live_environment(
    site_coords: dict,
    wbgt_fn: Callable,
    ref_fn: Callable,
    site_id: Optional[str] = None,
    http_get: Optional[Callable] = None,
) -> dict:
    """Return cached or freshly fetched Open-Meteo Forecast + Air Quality readings for Kachchh worksites."""
    if site_id and site_id != "all" and site_id not in site_coords:
        raise KeyError(site_id)

    now_ts = time.time()
    use_cache = http_get is None
    if use_cache and _ENV_CACHE["sites"] is not None and (now_ts - _ENV_CACHE["ts"] < _ENV_TTL_SEC):
        sites_data = _ENV_CACHE["sites"]
        live_flag = bool(sites_data and sites_data[0].get("live"))
        fetched_at = _ENV_CACHE["fetched_at"]
    else:
        ordered = list(site_coords.values())
        lats = ",".join(str(s["lat"]) for s in ordered)
        lons = ",".join(str(s["lon"]) for s in ordered)
        sites_data = None
        live_flag = False
        fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        try:
            w_res = _http_get_retry(
                OPEN_METEO_FORECAST_URL,
                params={
                    "latitude": lats,
                    "longitude": lons,
                    "current": "temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,uv_index",
                    "wind_speed_unit": "ms",
                    "timezone": "Asia/Kolkata",
                },
                timeout=8.0,
                http_get=http_get,
            )
            a_res = _http_get_retry(
                OPEN_METEO_AIR_URL,
                params={
                    "latitude": lats,
                    "longitude": lons,
                    "current": "pm10,pm2_5,dust",
                    "timezone": "Asia/Kolkata",
                },
                timeout=8.0,
                http_get=http_get,
            )
            w_res.raise_for_status()
            a_res.raise_for_status()
            w_raw = w_res.json()
            a_raw = a_res.json()
            w_list = w_raw if isinstance(w_raw, list) else [w_raw]
            a_list = a_raw if isinstance(a_raw, list) else [a_raw]
            built = []
            for idx, meta in enumerate(ordered):
                wc = (w_list[idx] if idx < len(w_list) else {}).get("current", {})
                ac = (a_list[idx] if idx < len(a_list) else {}).get("current", {})
                ta = wc.get("temperature_2m")
                rh = wc.get("relative_humidity_2m")
                rad = wc.get("shortwave_radiation")
                wind = wc.get("wind_speed_10m")
                uv = wc.get("uv_index")
                wbgt_shade = round(wbgt_fn(ta, rh)[0], 1) if (ta is not None and rh is not None) else None
                wbgt_sun = None
                if ta is not None and rh is not None:
                    tg_est = _estimate_sun_globe(ta, rad, wind)
                    wbgt_sun = round(wbgt_fn(ta, rh, tg_est)[0], 1)
                built.append({
                    "site_id": meta["site_id"],
                    "label": meta["label"],
                    "taluka": meta["taluka"],
                    "lat": meta["lat"],
                    "lon": meta["lon"],
                    "live": True,
                    "source": "Open-Meteo Forecast + CAMS Air Quality",
                    "temp_c": ta,
                    "humidity_pct": rh,
                    "wind_ms": wind,
                    "shortwave_wm2": rad,
                    "uv_index": uv,
                    "wbgt_shade_c": wbgt_shade,
                    "wbgt_sun_est_c": wbgt_sun,
                    "pm10_ug_m3": ac.get("pm10"),
                    "pm25_ug_m3": ac.get("pm2_5"),
                    "dust_ug_m3": ac.get("dust"),
                    "observed_at": wc.get("time") or ac.get("time") or fetched_at,
                })
            sites_data = built
            live_flag = True
            if use_cache:
                _ENV_CACHE["ts"] = now_ts
                _ENV_CACHE["sites"] = built
                _ENV_CACHE["fetched_at"] = fetched_at
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            sites_data = _fallback_sites(site_coords, ref_fn)

    if site_id and site_id != "all":
        sites_data = [s for s in sites_data if s["site_id"] == site_id]

    return {
        "live": live_flag,
        "fetched_at": fetched_at,
        "cache_ttl_seconds": _ENV_TTL_SEC,
        "provider": "Open-Meteo Weather Forecast & CAMS Air Quality" if live_flag else "2025 Kachchh Reference Baseline",
        "method_note": "Ambient gridded forecast and CAMS model estimate; not an on-site black-globe hardware sensor.",
        "sites": sites_data,
    }


def _match_taluka(offices: list[dict], talukas: set[str]) -> Optional[str]:
    votes: Counter = Counter()
    for o in offices:
        haystack = f"{o.get('Block') or ''} {o.get('Taluk') or ''} {o.get('Name') or ''}".lower()
        found = None
        for alias, canon in TALUKA_ALIASES.items():
            if alias in haystack and canon in talukas:
                found = canon
                break
        if found is None:
            found = next((t for t in talukas if t.lower() in haystack), None)
        if found:
            weight = 3 if "head" in (o.get("BranchType") or "").lower() or "sub" in (o.get("BranchType") or "").lower() else 1
            votes[found] += weight
    return votes.most_common(1)[0][0] if votes else None


def fetch_pincode_info(pincode: str, facilities: list, http_get: Optional[Callable] = None) -> dict:
    """Resolve an Indian 6-digit pincode via api.postalpincode.in and match local Kachchh facilities."""
    pin = (pincode or "").strip()
    if not re.fullmatch(r"\d{6}", pin):
        raise ValueError("Enter a valid 6-digit Indian pincode.")

    now_ts = time.time()
    use_cache = http_get is None
    if use_cache and pin in _PIN_CACHE and (now_ts - _PIN_CACHE[pin]["ts"] < _PIN_TTL_SEC):
        return _PIN_CACHE[pin]["data"]

    offices = []
    status_label = "fallback"
    live = False
    try:
        res = _http_get_retry(INDIA_POST_PIN_URL.format(pincode=pin), timeout=8.0, http_get=http_get)
        res.raise_for_status()
        body = res.json()
        entry = body[0] if isinstance(body, list) and body else {}
        if entry.get("Status") == "Success" and entry.get("PostOffice"):
            offices = entry["PostOffice"]
            status_label = "ok"
            live = True
        else:
            status_label = "not_found"
            live = True
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        status_label = "unavailable"

    first = offices[0] if offices else {}
    raw_district = (first.get("District") or "").strip()
    district = "Kachchh" if raw_district.lower() in {"kachchh", "kutch"} else raw_district
    block = first.get("Block") or first.get("Taluk") or ""
    state = first.get("State", "")
    in_kachchh = raw_district.lower() in {"kachchh", "kutch"}
    talukas = {f["taluka"] for f in facilities}
    matched_taluka = _match_taluka(offices, talukas)
    matching_facilities = [f for f in facilities if matched_taluka and f["taluka"] == matched_taluka]

    payload = {
        "pincode": pin,
        "live": live,
        "status": status_label,
        "provider": "India Post Pincode Directory (api.postalpincode.in)",
        "district": district,
        "taluka": matched_taluka or block,
        "matched_taluka": matched_taluka,
        "state": state,
        "in_kachchh": in_kachchh,
        "post_offices": [
            {"name": o.get("Name"), "branch_type": o.get("BranchType"), "block": o.get("Block"), "district": o.get("District")}
            for o in offices[:6]
        ],
        "matching_facilities": matching_facilities[:4],
    }
    if use_cache and live:
        if len(_PIN_CACHE) >= 256:
            oldest = min(_PIN_CACHE, key=lambda k: _PIN_CACHE[k]["ts"])
            _PIN_CACHE.pop(oldest, None)
        _PIN_CACHE[pin] = {"ts": now_ts, "data": payload}
    return payload


def fetch_road_distances(
    site: dict,
    facilities: list[dict],
    haversine_fn: Callable,
    http_get: Optional[Callable] = None,
) -> dict:
    """Compute driving road distance (km) & ETA (minutes) from site to all facilities via OSRM Table API."""
    sid = site["site_id"]
    now_ts = time.time()
    use_cache = http_get is None
    if use_cache and sid in _ROAD_CACHE and (now_ts - _ROAD_CACHE[sid]["ts"] < _ROAD_TTL_SEC):
        return _ROAD_CACHE[sid]["data"]

    routes = {}
    live = False
    if facilities:
        coords = f"{site['lon']},{site['lat']};" + ";".join(f"{f['longitude']},{f['latitude']}" for f in facilities)
        url = OSRM_TABLE_URL.format(coords=coords)
        try:
            res = _http_get_retry(url, params={"sources": "0", "annotations": "distance,duration"}, timeout=10.0, http_get=http_get)
            res.raise_for_status()
            body = res.json()
            if body.get("code") == "Ok" and body.get("distances") and body.get("durations"):
                dists = body["distances"][0][1:]
                durs = body["durations"][0][1:]
                for f, d_m, dur_s in zip(facilities, dists, durs):
                    routes[f["facility_id"]] = {
                        "road_km": round(d_m / 1000.0, 1) if d_m is not None else None,
                        "duration_min": max(1, round(dur_s / 60.0)) if dur_s is not None else None,
                        "straight_km": haversine_fn(site["lat"], site["lon"], f["latitude"], f["longitude"]),
                    }
                live = True
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            live = False

    if not routes:
        for f in facilities:
            routes[f["facility_id"]] = {
                "road_km": None,
                "duration_min": None,
                "straight_km": haversine_fn(site["lat"], site["lon"], f["latitude"], f["longitude"]),
            }

    payload = {
        "site_id": sid,
        "live": live,
        "provider": "OSRM OpenStreetMap Driving Engine" if live else "Straight-line Haversine estimate",
        "routes": routes,
    }
    if use_cache and live:
        if len(_ROAD_CACHE) >= 64:
            oldest = min(_ROAD_CACHE, key=lambda k: _ROAD_CACHE[k]["ts"])
            _ROAD_CACHE.pop(oldest, None)
        _ROAD_CACHE[sid] = {"ts": now_ts, "data": payload}
    return payload

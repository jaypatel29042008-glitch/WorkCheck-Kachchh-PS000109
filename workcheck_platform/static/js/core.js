"use strict";
/* Shared helpers: API, routing, app frame, tooltip, toast and dialog. */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (name, size = 20, sw = 1.75) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

const S = { user: null, page: null, cleanup: [], workers: null, wf: { level: "", search: "" }, current: null };
const VIEWS = {};
const LEVELS = {
  action: { label: "Needs action", icon: "alert-triangle", hint: "Missed a check, or a follow-up is open", tile: "rose" },
  due: { label: "Check due", icon: "clock-hour-4", hint: "An alert asked for a check", tile: "amber" },
  watch: { label: "Watching", icon: "eye", hint: "Exposed, but nothing triggered yet", tile: "indigo" },
  clear: { label: "All clear", icon: "circle-check", hint: "Nothing waiting", tile: "green" },
};
/* Pages by role. The second group sits under a quiet label. */
const PAGES = {
  today: ["Today", "home"], dashboard: ["Daily check-ins", "clipboard-check"], workers: ["Workers", "users"], care: ["Medical checks", "stethoscope"], incidents: ["Incidents", "first-aid-kit"],
  compliance: ["Training & site checks", "list-check"], team: ["Team & invites", "user-plus"], facilities: ["Health facilities", "hospital-circle"], heat: ["Heat & Dust map", "map-2"],
  site: ["Site monitor", "device-heart-monitor"], wokwi: ["Wokwi node", "cpu"], evidence: ["Evidence", "book-2"], me: ["My health", "heartbeat"],
};
/* Short names for the phone's bottom bar, where there is room for one word. */
const SHORT = { dashboard: "Check-ins", care: "Medical", compliance: "Site checks", team: "Team", facilities: "Facilities", heat: "Map", site: "Monitor", wokwi: "Wokwi" };
const NAV_FULL = {
  clinician: [["today", "dashboard", "workers", "care", "incidents"], ["facilities", "heat", "site", "wokwi", "evidence"]],
  ddo: [["today", "dashboard"], ["facilities", "heat", "site", "wokwi", "evidence"]],
  supervisor: [["dashboard", "incidents", "compliance", "team"], ["site", "facilities", "heat", "wokwi", "evidence"]],
  worker: [["me", "facilities"], []],
};
const NAV_PREVIEW = {
  clinician: [["today", "workers"], ["facilities", "heat", "site", "wokwi", "evidence"]], ddo: [["today"], ["facilities", "heat", "site", "wokwi", "evidence"]],
  supervisor: [["site"], ["facilities", "heat", "wokwi", "evidence"]], worker: [["me", "facilities"], []],
};
const DEMO_ONLY = ["today", "wokwi"];
const isPreview = () => Boolean(window.WORKCHECK_STATIC_DATA);
const isDemoOrg = () => !S.user || !S.user.org || Boolean(S.user.org.demo);
function navGroups(role) {
  const groups = (isPreview() ? NAV_PREVIEW : NAV_FULL)[role];
  return groups.map((g) => g.filter((k) => isDemoOrg() || !DEMO_ONLY.includes(k)));
}
const NAV = new Proxy({}, { get: (_, role) => navGroups(role).flat().map((k) => [k, PAGES[k][0], PAGES[k][1]]) });
const ROLE_NAMES = { clinician: "Clinic team", ddo: "District office", supervisor: "Site supervisor", worker: "Worker" };

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const READ_ONLY_MESSAGE = "This is a read-only preview, so nothing was saved. Run the full version to try this.";

const _STATIC_CACHE = { env: null, envTs: 0, pins: {}, roads: {} };
const _STATIC_WORKER_OVERRIDES = {};
const _TALUKA_ALIASES = {
  rahpar: "Rapar",
  rapar: "Rapar",
  naliya: "Abdasa",
  abdasa: "Abdasa",
  dayapar: "Lakhpat",
  lakhpat: "Lakhpat",
  adipur: "Gandhidham",
  kandla: "Gandhidham",
  gandhidham: "Gandhidham",
  samakhiali: "Bhachau",
  bhachau: "Bhachau",
  bhuj: "Bhuj",
  mundra: "Mundra",
  anjar: "Anjar",
  mandvi: "Mandvi",
  nakhatrana: "Nakhatrana",
};

function _csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function _sat(t) { return 6.106 * Math.exp((17.27 * t) / (237.3 + t)); }
function _wetBulb(ta, rh) {
  const g = Math.log(Math.max(rh, 1) / 100) + (17.27 * ta) / (237.3 + ta);
  const td = (237.3 * g) / (17.27 - g);
  const ed = _sat(td);
  let lo = td, hi = ta;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const ew = _sat(mid);
    if (1556 * ed - 1.484 * ed * mid - 1556 * ew + 1.484 * ew * mid + 1010 * (ta - mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function _natWetBulb(ta, rh, tg, v = 1.0) {
  const ws = Math.max(v, 0.3), tp = _wetBulb(ta, rh);
  if (tg - ta >= 4) return tp + 0.25 * (tg - ta) + 0.1 / Math.pow(ws, 1.1) - 0.2;
  if (ws > 3) return tp;
  return ta - (0.96 + 0.069 * Math.log10(ws)) * (ta - tp);
}
function _computeWbgt(ta, rh, tg = null) {
  if (tg !== null && tg !== undefined) return [0.7 * _natWetBulb(ta, rh, tg) + 0.2 * tg + 0.1 * ta, "Measured globe, estimated wet bulb"];
  return [0.7 * _natWetBulb(ta, rh, ta) + 0.3 * ta, "No globe: shade estimate"];
}
function _allowedPct(D, wbgt, workload) {
  const rows = (D.heat_rules && D.heat_rules[workload]) || [[27.5, 100], [29, 75], [30.5, 50], [32, 25]];
  for (const [lim, pct] of rows) { if (wbgt <= lim) return pct; }
  return 0;
}
function _staticNodeView(D, p, overrideWbgt = null, methodNote = null) {
  const [rawW, meth] = _computeWbgt(p.ambient_temp_c, p.relative_humidity_pct, p.globe_temp_c);
  const wbgt = Number((overrideWbgt ?? rawW).toFixed(1));
  const lampMap = D.lamp || { "100": "GREEN", "75": "YELLOW", "50": "ORANGE", "25": "RED", "0": "RED_FLASH" };
  const planMap = D.plan || {};
  const specs = [
    ["Heavy work in sun", "Yard loading, salt raking, construction", "heavy", "forklift"],
    ["Moderate work in sun", "Plant walk-around", "moderate", "walk"],
    ["Light work in shade", "Crane or truck cab", "light", "truck"],
  ];
  const [shadeW] = _computeWbgt(p.ambient_temp_c, p.relative_humidity_pct, null);
  const jobs = specs.map(([label, examples, workload, icon]) => {
    const val = workload === "light" ? Number(shadeW.toFixed(1)) : wbgt;
    const pct = _allowedPct(D, val, workload);
    const plan = planMap[String(pct)] || { title: "Check limit", work: Math.round(pct * 0.6), rest: 60 - Math.round(pct * 0.6), text: "" };
    return { label, examples, workload, icon, wbgt_c: val, allowed_work_pct: pct, lamp: lampMap[String(pct)] || "GREEN", ...plan };
  });
  const alerts = [];
  if (p.pm10_0_ug_m3 != null && p.pm10_0_ug_m3 > 100) alerts.push({ code: "DUST_FLAG", icon: "wind", text: "Dust is high. Check water spray and masks. This does not measure silica." });
  if (p.uv_index != null && p.uv_index >= 8) alerts.push({ code: "UV_HIGH", icon: "sun", text: "UV is very high. Use eye protection, a hat and shade breaks." });
  if (p.noise_dba != null && p.noise_dba >= 85) alerts.push({ code: "NOISE_85", icon: "volume", text: "Noise is 85 dBA or more. Use ear protection." });
  const siteMeta = (D.site_coords || []).find((s) => s.site_id === p.site_id);
  return {
    id: Date.now(),
    at: new Date().toISOString(),
    device_id: p.device_id || "preview-node",
    site_id: p.site_id || "kandla_port",
    site_name: (siteMeta && siteMeta.label.split(" (")[0]) || p.site_id || "Kandla Port",
    source: p.source || "browser_simulator",
    ambient_temp_c: p.ambient_temp_c,
    relative_humidity_pct: p.relative_humidity_pct,
    globe_temp_c: p.globe_temp_c ?? null,
    pm10_0_ug_m3: p.pm10_0_ug_m3 ?? null,
    pm2_5_ug_m3: p.pm2_5_ug_m3 ?? null,
    uv_index: p.uv_index ?? null,
    noise_dba: p.noise_dba ?? null,
    wbgt_c: wbgt,
    wbgt_method: methodNote || meth,
    jobs,
    alerts,
  };
}
function _haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dlat = (lat2 - lat1) * rad, dlon = (lon2 - lon1) * rad;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dlon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  // With a server, its answer is final: errors are shown, never replaced by demo data.
  if (!window.WORKCHECK_STATIC_DATA) {
    const init = { credentials: "same-origin", method, headers: { "X-Requested-With": "WorkCheck" } };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
      init.headers["Content-Type"] = "application/json";
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me" && path !== "/api/auth/options") {
      S.user = null;
      renderLogin();
    }
    if (!res.ok) throw new ApiError(res.status, data.detail || "Something went wrong. Please try again.");
    return data;
  }

  // Client-side static handler (powered by reference.db dataset + live CORS public APIs for GitHub Pages)
  if (window.WORKCHECK_STATIC_DATA) {
    const D = window.WORKCHECK_STATIC_DATA;
    const u = new URL(path, window.location.origin);
    const p = u.pathname;

    if (p === "/api/auth/options") {
      let savedUser = null;
      try {
        const raw = localStorage.getItem("wc_static_user");
        if (raw) savedUser = JSON.parse(raw);
      } catch {
        savedUser = null;
      }
      return {
        demo: true,
        env: "preview",
        consent_version: (D.privacy_notice && D.privacy_notice.consent_version) || "dpdp-v1-2026",
        authenticated: Boolean(savedUser),
        user: savedUser,
      };
    }
    if (p === "/api/privacy/notice") {
      return D.privacy_notice || { consent_version: "dpdp-v1-2026", controller: "WorkCheck Kachchh Pilot", rights: [] };
    }
    if (p === "/api/privacy/consent" && method === "POST") {
      return { ok: true, consent_version: "dpdp-v1-2026", consent_at: new Date().toISOString(), preview: true };
    }

    // 1. Auth Login
    if (p === "/api/auth/login" && method === "POST") {
      const { email, password } = options.body || {};
      const found = D.users[email];
      if (found && found.password === password) {
        try { localStorage.setItem("wc_static_user", JSON.stringify(found.user)); } catch { /* ignore */ }
        return found.user;
      }
      throw new ApiError(401, "Check your email and password.");
    }

    // 2. Auth Me
    if (p === "/api/auth/me") {
      try {
        const saved = localStorage.getItem("wc_static_user");
        if (saved) return JSON.parse(saved);
      } catch {
        try { localStorage.removeItem("wc_static_user"); } catch { /* ignore */ }
      }
      throw new ApiError(401, "Please sign in.");
    }

    // 3. Auth Logout
    if (p === "/api/auth/logout") {
      try { localStorage.removeItem("wc_static_user"); } catch { /* ignore */ }
      return { ok: true };
    }

    // 4. Overview, Workers, Heat
    if (p === "/api/overview") return D.overview;
    if (p === "/api/workers") return D.workers;
    if (p === "/api/heat/map") return D.heat_map;
    if (p === "/api/heat/jobs") return D.heat_jobs;
    if (p === "/api/heat/year") {
      const jid = u.searchParams.get("job_id");
      return (D.heat_year && D.heat_year[jid]) || { curve: [] };
    }

    // 5. Node state / day / replay / simulation
    if (p === "/api/node/state") return D.node_state;
    if (p === "/api/node/day") {
      const lid = u.searchParams.get("location_id") || "kandla_port";
      return (D.node_day && D.node_day[lid]) || (D.node_day && D.node_day.kandla_port) || { location_id: lid, day: "2025-05-19", hours: [] };
    }
    if (p === "/api/node/replay") {
      const lid = u.searchParams.get("location_id") || "kandla_port";
      const h = Number(u.searchParams.get("hour") || 12);
      const day = u.searchParams.get("day") || "2025-05-19";
      const dayObj = (D.node_day && D.node_day[lid]) || {};
      const hr = (dayObj.hours || []).find((x) => x.hour === h);
      const base = (D.node_replay && D.node_replay[lid]) || D.node_state.latest;
      if (hr) {
        const simTa = Math.round((27 + Math.max(0, hr.wbgt - 22) * 1.15) * 10) / 10;
        return { ..._staticNodeView(D, { site_id: lid, source: "model_replay", ambient_temp_c: simTa, relative_humidity_pct: 45, pm10_0_ug_m3: base.pm10_0_ug_m3, uv_index: h >= 10 && h <= 16 ? 9 : 2 }, hr.wbgt, "Model estimate for sun"), hour: h, date: day };
      }
      return { ...base, hour: h, date: day };
    }
    if (p === "/api/node/simulate" && method === "POST") {
      const b = options.body || {};
      return _staticNodeView(D, { ...b, source: b.source || "browser_simulator" });
    }

    // 6. Live Open-Meteo Weather & Air Quality (CORS *) + Pincode (CORS *)
    if (p === "/api/live/environment") {
      const sid = u.searchParams.get("site_id");
      const sites = D.site_coords || (D.facilities_default && D.facilities_default.sites) || [];
      const nowMs = Date.now();
      let payload = _STATIC_CACHE.env;
      if (!payload || nowMs - _STATIC_CACHE.envTs > 900000) {
        try {
          const lats = sites.map((s) => s.lat).join(",");
          const lons = sites.map((s) => s.lon).join(",");
          const [wr, ar] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,uv_index&wind_speed_unit=ms&timezone=Asia%2FKolkata`),
            fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm10,pm2_5,dust&timezone=Asia%2FKolkata`),
          ]);
          const wRaw = await wr.json();
          const aRaw = await ar.json();
          const wList = Array.isArray(wRaw) ? wRaw : [wRaw];
          const aList = Array.isArray(aRaw) ? aRaw : [aRaw];
          const built = sites.map((s, idx) => {
            const wc = (wList[idx] && wList[idx].current) || {}, ac = (aList[idx] && aList[idx].current) || {};
            const ta = wc.temperature_2m, rh = wc.relative_humidity_2m, rad = wc.shortwave_radiation || 0, wind = Math.max(0.8, wc.wind_speed_10m || 1.5);
            const tg = ta != null ? ta + (rad > 0 ? Math.min(16, (rad * 0.015) / Math.pow(wind, 0.35)) : 0) : null;
            return {
              site_id: s.site_id, label: s.label, taluka: s.taluka, lat: s.lat, lon: s.lon, live: true,
              source: "Open-Meteo Forecast + CAMS Air Quality",
              temp_c: ta, humidity_pct: rh, wind_ms: wc.wind_speed_10m, shortwave_wm2: rad, uv_index: wc.uv_index,
              wbgt_shade_c: ta != null && rh != null ? Number(_computeWbgt(ta, rh)[0].toFixed(1)) : null,
              wbgt_sun_est_c: ta != null && rh != null ? Number(_computeWbgt(ta, rh, tg)[0].toFixed(1)) : null,
              pm10_ug_m3: ac.pm10, pm25_ug_m3: ac.pm2_5, dust_ug_m3: ac.dust,
              observed_at: wc.time || ac.time || new Date().toISOString(),
            };
          });
          payload = { live: true, fetched_at: new Date().toISOString(), provider: "Open-Meteo Weather Forecast & CAMS Air Quality", method_note: "Ambient gridded forecast and CAMS model estimate; not an on-site black-globe hardware sensor.", sites: built };
          _STATIC_CACHE.env = payload;
          _STATIC_CACHE.envTs = nowMs;
        } catch {
          payload = { live: false, fetched_at: new Date().toISOString(), provider: "2025 Kachchh Reference Baseline", method_note: "Live feed offline; showing saved climatology.", sites: sites.map((s) => ({ ...s, live: false, temp_c: null, humidity_pct: null, wbgt_sun_est_c: null, pm10_ug_m3: null })) };
        }
      }
      if (sid && sid !== "all") return { ...payload, sites: payload.sites.filter((x) => x.site_id === sid) };
      return payload;
    }

    if (p.startsWith("/api/live/pincode/")) {
      const pin = decodeURIComponent(p.split("/").pop() || "").trim();
      if (!/^\d{6}$/.test(pin)) throw new ApiError(400, "Enter a valid 6-digit Indian pincode.");
      if (_STATIC_CACHE.pins[pin]) return _STATIC_CACHE.pins[pin];
      let offices = [], status = "unavailable", live = false;
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        const json = await res.json();
        const entry = Array.isArray(json) ? json[0] : {};
        if (entry && entry.Status === "Success" && Array.isArray(entry.PostOffice)) { offices = entry.PostOffice; status = "ok"; live = true; }
        else { status = "not_found"; live = true; }
      } catch { /* offline fallback */ }
      const first = offices[0] || {};
      const district = first.District || "", rawBlock = first.Block || first.Taluk || "", state = first.State || "";
      const block = rawBlock && rawBlock.toUpperCase() !== "NA" ? rawBlock : "";
      const facs = (D.facilities_default && D.facilities_default.facilities) || [];
      const counts = {};
      for (const o of offices) {
        const hay = `${o.Block || ""} ${o.Taluk || ""} ${o.Name || ""}`.toLowerCase();
        for (const [alias, canon] of Object.entries(_TALUKA_ALIASES)) {
          if (hay.includes(alias)) counts[canon] = (counts[canon] || 0) + 1;
        }
      }
      const matched = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
      const out = {
        pincode: pin, live, status, provider: "India Post Pincode Directory", district, taluka: matched || block, matched_taluka: matched, state,
        in_kachchh: ["kachchh", "kutch"].includes(district.toLowerCase()),
        post_offices: offices.slice(0, 6).map((o) => ({ name: o.Name, branch_type: o.BranchType, block: o.Block, district: o.District })),
        matching_facilities: facs.filter((f) => matched && f.taluka === matched).slice(0, 4),
      };
      if (live) _STATIC_CACHE.pins[pin] = out;
      return out;
    }

    if (p === "/api/live/road-distances") {
      const siteId = u.searchParams.get("site_id") || "little_rann_kutch";
      const cached = _STATIC_CACHE.roads[siteId];
      if (cached && (Date.now() - cached.ts) < 21600000) return cached.data;
      const base = D.facilities_default || { facilities: [], sites: [] };
      const site = (base.sites || []).find((s) => s.site_id === siteId) || base.selected_site || { site_id: siteId, lat: 23.45, lon: 70.85 };
      const facs = base.facilities || [];
      const coords = [[site.lon, site.lat], ...facs.map((f) => [f.longitude, f.latitude])].map(([lo, la]) => `${lo},${la}`).join(";");
      try {
        const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`);
        const json = await res.json();
        const dists = (json && json.distances && json.distances[0]) || [];
        const durs = (json && json.durations && json.durations[0]) || [];
        if (json && json.code === "Ok" && dists.length > facs.length) {
          const routes = {};
          facs.forEach((f, idx) => {
            routes[f.facility_id] = {
              road_km: dists[idx + 1] != null ? Number((dists[idx + 1] / 1000).toFixed(1)) : null,
              duration_min: durs[idx + 1] != null ? Math.max(1, Math.round(durs[idx + 1] / 60)) : null,
              straight_km: _haversineKm(site.lat, site.lon, f.latitude, f.longitude),
            };
          });
          const out = { live: true, provider: "OSRM OpenStreetMap Driving Router", site_id: siteId, routes };
          _STATIC_CACHE.roads[siteId] = { ts: Date.now(), data: out };
          return out;
        }
      } catch { /* offline fallback */ }
      const fallbackRoutes = {};
      facs.forEach((f) => {
        fallbackRoutes[f.facility_id] = { road_km: null, duration_min: null, straight_km: _haversineKm(site.lat, site.lon, f.latitude, f.longitude) };
      });
      return {
        live: false,
        provider: "Straight-line Haversine estimate (OSRM offline)",
        site_id: siteId,
        routes: fallbackRoutes,
      };
    }

    // 7. Facilities with full client-side Haversine + disease sorting
    if (p === "/api/facilities") {
      const siteId = u.searchParams.get("site_id") || "little_rann_kutch";
      const taluka = u.searchParams.get("taluka");
      const disease = u.searchParams.get("disease") || "all";
      const base = JSON.parse(JSON.stringify(D.facilities_default || { facilities: [], sites: [], diseases: [] }));
      const site = (base.sites || []).find((s) => s.site_id === siteId) || base.selected_site || { site_id: siteId, lat: 23.45, lon: 70.85 };
      let list = (base.facilities || []).map((f) => {
        const dist = _haversineKm(site.lat, site.lon, f.latitude, f.longitude);
        const silicoOk = f.has_digital_xray && f.has_spirometer, heatOk = f.emergency_108_base, ckdOk = f.has_biochemical_lab,
          eyeOk = /hospital|medical college|rath/i.test(f.facility_name), noiseOk = f.has_audiometry;
        let diseaseMatch = true, matchLabel = `${f.facility_tier} • ${f.taluka}`;
        if (disease === "silicosis") { diseaseMatch = silicoOk; matchLabel = silicoOk ? "★ Silicosis Ready: Digital X-Ray + Spirometer" : "Partial Diagnostic Facility"; }
        else if (disease === "heatstroke") { diseaseMatch = heatOk; matchLabel = heatOk ? "🚨 108 Base & Rapid Cooling Care" : "No 108 Base Station"; }
        else if (disease === "ckd") { diseaseMatch = ckdOk; matchLabel = ckdOk ? "💧 Biochemical Lab (Creatinine / Urine)" : "No In-House Blood Lab"; }
        else if (disease === "eye") { diseaseMatch = eyeOk; matchLabel = eyeOk ? "👁️ Ophthalmic & Slit-Lamp Protocol" : "General Primary Clinic"; }
        else if (disease === "noise") { diseaseMatch = noiseOk; matchLabel = noiseOk ? "🔊 Audiometric Booth Equipped" : "No Audiometer"; }
        return { ...f, distance_km: dist, disease_match: diseaseMatch, match_label: matchLabel };
      });
      if (taluka && taluka !== "ALL") list = list.filter((f) => f.taluka && f.taluka.toLowerCase() === taluka.toLowerCase());
      list.sort((a, b) => (disease !== "all" && a.disease_match !== b.disease_match ? (a.disease_match ? -1 : 1) : a.distance_km - b.distance_km));
      return { ...base, facilities: list, selected_site: site, active_disease: disease };
    }
    if (p === "/api/facilities/refer" && method === "POST") {
      const facId = (options.body && options.body.facility_id) || "";
      const fac = ((D.facilities_default && D.facilities_default.facilities) || []).find((x) => x.facility_id === facId);
      return { success: true, facility_name: (fac && fac.facility_name) || facId, message: "Preview note only — nothing was saved or sent to the facility." };
    }

    // 8. Worker Details & Ephemeral Preview Updates
    if (p.startsWith("/api/workers/")) {
      const parts = p.split("/");
      const wid = decodeURIComponent(parts[3] || "");
      const getWorkerCopy = () => {
        if (_STATIC_WORKER_OVERRIDES[wid]) return _STATIC_WORKER_OVERRIDES[wid];
        const base = D.worker_details && D.worker_details[wid];
        if (!base) return null;
        _STATIC_WORKER_OVERRIDES[wid] = JSON.parse(JSON.stringify(base));
        return _STATIC_WORKER_OVERRIDES[wid];
      };
      if (parts.length === 4) return getWorkerCopy() || { worker: null };
      if (method === "POST") {
        const wk = getWorkerCopy();
        const body = options.body || {};
        if (parts[4] === "symptoms" && parts[6] === "review" && wk && Array.isArray(wk.symptoms)) {
          const hit = wk.symptoms.find((s) => String(s.id) === String(parts[5]));
          if (hit) hit.reviewed = true;
          return { reviewed: true, preview: true, message: "Marked reviewed in preview session (resets on reload)." };
        }
        const urgent = body.symptom === "collapse" || (Array.isArray(body.symptoms) && body.symptoms.includes("collapse"));
        if (parts[4] === "symptoms" && wk && Array.isArray(wk.symptoms)) {
          const items = Array.isArray(body.symptoms) ? body.symptoms : [body.symptom || body.text || "symptom"];
          items.forEach((txt, idx) => wk.symptoms.unshift({ id: `prev-${Date.now()}-${idx}`, text: String(txt), at: new Date().toISOString().slice(0, 10), urgent: Boolean(urgent), reviewed: false }));
        }
        return { saved: true, preview: true, urgent, message: urgent ? "Emergency 108 instructions opened (read-only preview)." : "Updated in preview session only (resets on reload)." };
      }
      return { worker: null };
    }

    if (p === "/api/me/today") return D.me_today;
    if (p === "/api/me/export") {
      return { exported_at: new Date().toISOString(), preview: true, note: "Sample synthetic account export (no real PII held in preview).", profile: S.user };
    }
    if (p === "/api/evidence") return D.evidence;
    if (p === "/api/storage") return { status: "ready", label: "Static GitHub Pages Preview" };

    if (method !== "GET") throw new ApiError(403, READ_ONLY_MESSAGE);
  }

  throw new ApiError(404, "Endpoint not found");
}

const onCleanup = (fn) => S.cleanup.push(fn);
function runCleanup() { S.cleanup.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d, withYear = true) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const isPhone = () => matchMedia("(max-width: 760px)").matches;

function hash(text) { let h = 0; for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function avatar(c, large = false) {
  return `<span class="av av${hash(c.id) % 6}${large ? " lg" : ""}" aria-hidden="true">${esc(c.initials)}<i>${ic(c.icon, large ? 15 : 12, 2)}</i></span>`;
}
function pill(level, text, small = false) {
  const lv = LEVELS[level];
  return `<span class="pill ${level}${small ? " sm" : ""}">${lv ? ic(lv.icon, small ? 12 : 14, 2.2) : ""}${esc(text || (lv && lv.label) || "")}</span>`;
}
const fictional = (text = "Fictional test workers") => `<span class="pill none" data-tip="All workers are made up for testing. Heat and exposure numbers are model estimates or outside data.">${ic("info-circle", 14, 2)}${esc(text)}</span>`;
function selectBox(id, options, value, label) {
  return `<label class="select"><span class="sr">${esc(label)}</span><select id="${id}">${options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</label>`;
}

/* Tooltip */
function showTip(html, x, y) {
  const el = $("#tip");
  el.innerHTML = html;
  el.hidden = false;
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, x + 14), innerWidth - r.width - 8);
  const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
  el.style.transform = `translate(${left}px, ${top}px)`;
}
const hideTip = () => { $("#tip").hidden = true; };
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (t) showTip(esc(t.dataset.tip), e.clientX, e.clientY);
  else if (!e.target.closest || !e.target.closest("[data-tip-custom]")) hideTip();
});

let toastTimer;
function toast(message, tone = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast ${tone}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

function openModal(html, label = "Dialog") {
  const root = $("#modal-root");
  const previous = document.activeElement;
  root.innerHTML = `<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="icon-btn dialog-x" type="button" aria-label="Close">${ic("x")}</button>${html}</div></div>`;
  const overlay = $(".overlay", root);
  const close = () => {
    document.removeEventListener("keydown", onKey);
    root.innerHTML = "";
    if (previous && previous.focus) previous.focus();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  $(".dialog-x", root).addEventListener("click", close);
  const first = $("select, input, textarea, .dialog a, .dialog button:not(.dialog-x)", root);
  if (first) first.focus();
  return { close, el: $(".dialog", root) };
}

function logoMark(size = 38) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6F7DF8"/><stop offset="1" stop-color="#4656E6"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#lg)"/><path d="M8 21h6l3-8 6 15 3-7h6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const logo = () => `<div class="logo">${logoMark()}<div><b>WorkCheck</b><span>Kachchh</span></div></div>`;

function wireTabs(bar, onSelect) {
  if (!bar) return;
  const btns = $$("button", bar);
  const sync = (activeBtn) => {
    btns.forEach((b) => {
      const on = b === activeBtn;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("on", on);
    });
  };
  sync(btns.find((b) => b.classList.contains("on")) || btns[0]);
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sync(b);
    onSelect(b);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    const next = btns[(idx + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    next.focus();
    sync(next);
    onSelect(next);
  });
}

async function openLegalModal(kind) {
  if (kind === "privacy") {
    const n = await api("/api/privacy/notice").catch(() => ({
      consent_version: "dpdp-v1-2026",
      controller: "WorkCheck Kachchh Pilot",
      purpose: "Track heat/dust risk, symptoms, and safety referrals.",
      data_minimisation: "Not connected to hospital systems or ABHA/e-Shram servers.",
      rights: ["Download your records anytime.", "Request correction from your coordinator."],
    }));
    openModal(`<h2>Privacy &amp; DPDP Act Notice</h2>
      <p class="sub">Version ${esc(n.consent_version)} · ${esc(n.controller || "WorkCheck Kachchh")}</p>
      <p style="margin:12px 0 8px"><b>Purpose:</b> ${esc(n.purpose)}</p>
      <p style="margin:0 0 12px"><b>Data Scope:</b> ${esc(n.data_minimisation)}</p>
      <ul style="margin:0 0 14px 18px;font-size:13.5px;color:var(--ink-2)">${(n.rights || []).map((r) => `<li style="margin-bottom:4px">${esc(r)}</li>`).join("")}</ul>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${S.user && !isPreview() ? `<button type="button" class="btn btn-ink btn-sm" id="priv-consent-btn">Record Consent</button>` : ""}
        ${S.user ? `<button type="button" class="btn btn-ghost btn-sm" id="priv-export-btn">${ic("download", 14, 2)} Export My Data (JSON)</button>` : ""}
      </div>`, "Privacy & DPDP Notice");
    const cBtn = $("#priv-consent-btn");
    if (cBtn) cBtn.addEventListener("click", async () => { await api("/api/privacy/consent", { method: "POST" }); toast("Privacy consent timestamp recorded.", "good"); });
    const eBtn = $("#priv-export-btn");
    if (eBtn) eBtn.addEventListener("click", () => downloadPersonalExport());
  } else if (kind === "terms") {
    openModal(`<h2>Terms &amp; Clinical Disclaimer</h2>
      <p class="sub">Decision-support and occupational exposure prototype</p>
      <p style="margin:12px 0 8px">1. WorkCheck Kachchh is a workplace heat, dust, and follow-up aid. It <b>does not diagnose disease</b> or replace a medical practitioner.</p>
      <p style="margin:0 0 8px">2. District summaries marked as fictional use synthetic worker timelines derived from published Indian, MSHA, ERA5, and CAMS datasets for pilot testing.</p>
      <p style="margin:0 0 8px">3. In any acute heatstroke or medical emergency, call <b>108</b> immediately regardless of sensor readings.</p>
      <p style="margin:0">4. Live Open-Meteo and India Post datasets carry upstream attribution and are cached ambient estimates, not on-site calibrated globe thermometers.</p>`, "Terms & Disclaimer");
  } else {
    openModal(`<h2>Accessibility Statement (WCAG 2.1 AA)</h2>
      <p class="sub">Keyboard navigation, contrast, and low-literacy support</p>
      <ul style="margin:12px 0 0 18px;font-size:13.5px;color:var(--ink-2)">
        <li style="margin-bottom:6px">Skip-to-content link, landmark regions, and Escape-dismissible modal dialogs.</li>
        <li style="margin-bottom:6px">Full keyboard arrow navigation across tab bars and role-based queues.</li>
        <li style="margin-bottom:6px">Trilingual worker interface (ગુજરાતી, हिंदी, English) and 44px mobile touch targets.</li>
        <li>Reduced-motion CSS compliance for animations.</li>
      </ul>`, "Accessibility Statement");
  }
}

async function downloadPersonalExport() {
  try {
    if (isPreview()) {
      const data = await api("/api/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "workcheck_preview_account_export.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("Downloaded preview JSON snapshot.", "good");
    } else {
      window.location.href = "/api/me/export";
    }
  } catch (err) { toast(err.message || "Could not export data.", "action"); }
}

function siteFooterHtml() {
  return `<footer class="site-footer" role="contentinfo">
    <span>WorkCheck Kachchh · Occupational Heat &amp; Health Prototype</span>
    <span class="footer-links">
      <button type="button" data-legal="privacy">DPDP Privacy</button>
      <button type="button" data-legal="terms">Clinical Disclaimer</button>
      <button type="button" data-legal="a11y">Accessibility</button>
      ${S.user ? `<button type="button" data-legal="export">Export My Data</button>` : ""}
      <a href="./architecture.html" target="_blank" rel="noopener">Architecture</a>
    </span>
  </footer>`;
}

function wireSiteFooter(root = document) {
  $$("[data-legal]", root).forEach((el) => el.addEventListener("click", () => {
    if (el.dataset.legal === "export") downloadPersonalExport();
    else openLegalModal(el.dataset.legal);
  }));
}

function renderShell() {
  const [daily, places] = navGroups(S.user.role);
  const initials = S.user.name.replace(".", "").split(" ").map((p) => p[0]).slice(0, 2).join("");
  const all = [...daily, ...places];
  const link = (k) => `<a href="#/${k}" data-nav="${k}" title="${PAGES[k][0]}"${all.indexOf(k) > 3 ? ' class="extra"' : ""}>${ic(PAGES[k][1], 20)}<span class="lbl">${PAGES[k][0]}</span><span class="lbl-s">${SHORT[k] || PAGES[k][0]}</span></a>`;
  const org = S.user.org;
  $("#app").innerHTML = `<div class="frame">
    <aside class="side">
      ${logo()}
      ${org ? `<div class="side-org" data-tip="${org.demo ? "Sample organisation with fictional workers" : "Your organisation"}">${ic("building", 15, 2)}<span>${esc(org.name)}</span>${org.demo ? `<em>Sample</em>` : ""}</div>` : ""}
      <nav aria-label="Main">${daily.map(link).join("")}${places.length ? `<span class="nav-label">Places and evidence</span>${places.map(link).join("")}` : ""}${all.length > 4 ? `<button type="button" class="nav-more" id="nav-more">${ic("list-check", 20)}<span>More</span></button>` : ""}</nav>
      <div class="side-user">
        <span class="av av2" aria-hidden="true">${esc(initials)}</span>
        <div class="side-user-text"><b>${esc(S.user.name)}</b><span>${ROLE_NAMES[S.user.role]}</span></div>
        <button class="icon-btn" id="sign-out" type="button" aria-label="Sign out" data-tip="Sign out">${ic("logout", 18)}</button>
      </div>
    </aside>
    <main class="main" id="main" tabindex="-1"><div id="view"></div>${siteFooterHtml()}</main>
  </div>`;
  $("#sign-out").addEventListener("click", signOut);
  wireSiteFooter($("#app"));
  const more = $("#nav-more");
  if (more) more.addEventListener("click", () => {
    const m = openModal(`<h2>All pages</h2><div class="more-list">${all.map((k) => `<a href="#/${k}">${ic(PAGES[k][1], 20)}<span>${PAGES[k][0]}</span>${ic("chevron-right", 16)}</a>`).join("")}</div>`, "All pages");
    $$("a", m.el).forEach((a) => a.addEventListener("click", () => m.close()));
  });
}

async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => { });
  runCleanup();
  S.user = null; S.page = null; S.workers = null; S.current = null; S.wf = { level: "", search: "" };
  location.hash = "";
  renderLogin();
}

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayName(iso) { const [y, m, d] = iso.split("-").map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; }
function who(w, extra = "") { return `<span class="who">${avatar(w)}<span><b>${esc(w.name)}</b><small>${esc(w.job || "")}${extra}</small></span></span>`; }
function formError(root, err) { const box = $(".form-error", root); if (box) { box.textContent = err.message || String(err); box.hidden = false; } }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast("Copied.", "good"); } catch { toast(text); } }

const skeleton = () => `<div class="skel-title"></div><div class="skel-grid"><div></div><div></div><div></div><div></div></div><div class="skel-block"></div>`;

async function route() {
  $("#modal-root").innerHTML = "";  // A dialog never outlives the page it was opened on.
  const [first = "", code] = location.hash.replace(/^#\/?/, "").split("/");
  if (!S.user && first === "setup" && window.renderSetup) return renderSetup();
  if (!S.user && first === "join" && window.renderJoin) return renderJoin(code);
  if (!S.user) return renderLogin();
  const [page = "", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const allowed = NAV[S.user.role].map((n) => n[0]);
  if (!allowed.includes(page)) { location.replace(`#/${allowed[0]}`); return; }
  if (S.user.role === "worker") {
    if (!$(".me")) $("#app").innerHTML = `<main class="me" id="main" tabindex="-1">${skeleton()}</main>`;
    return VIEWS.me();
  }
  if (!$("#view")) { renderShell(); S.page = null; }
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (S.page !== page) {
    runCleanup();
    S.page = page;
    $("#main").scrollTop = 0;
    $("#main").classList.toggle("flush", page === "workers");
    $("#view").innerHTML = skeleton();
  }
  try {
    await VIEWS[page](arg);
  } catch (err) {
    if (err.status === 401) return;
    console.error(err);
    $("#view").innerHTML = `<div class="empty card">${ic("alert-triangle", 28)}<h2>This page could not open</h2><p>${esc(err.message)}</p><button class="btn btn-ink" type="button" id="retry">Try again</button></div>`;
    $("#retry").addEventListener("click", route);
  }
}
addEventListener("hashchange", route);

function renderFacilityCardsHtml(facilities, options = {}) {
  const {
    compact = false,
    routeBtnClass = "fac-route-btn",
    emptyMsg = "No health facilities match this criteria.",
  } = options;
  if (!facilities || !facilities.length) {
    return `<div class="empty small" style="grid-column: 1 / -1">${ic("hospital-circle", 24)}<p>${esc(emptyMsg)}</p></div>`;
  }
  return facilities.map((f) => {
    const tierClass = String(f.facility_tier || "clinic").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const telHref = f.phone ? String(f.phone).replace(/[^+\d]/g, "") : "";
    return `
      <div class="facility-card${f.disease_match ? " matched" : ""}" data-facility-id="${esc(f.facility_id)}">
        <div class="fac-card-top">
          <div>
            <span class="tier-badge ${tierClass}">${esc(f.facility_tier)}</span>
            <h3 class="fac-name">${esc(f.facility_name)}</h3>
            <span class="fac-taluka">Taluka: <b>${esc(f.taluka)}</b> &bull; <span class="dist-badge">about ${f.distance_km} km, straight line</span><span class="road-badge" data-road-fac="${esc(f.facility_id)}"></span></span>
          </div>
          <span class="round xs bg-indigo t-indigo">${ic("hospital-circle", 18, 2)}</span>
        </div>

        ${(f.address_note || f.pincode || f.phone) ? `<div class="fac-meta">
          ${f.address_note ? `<span>${esc(f.address_note)}${f.pincode ? ` (${esc(f.pincode)})` : ""}</span>` : ""}
          ${f.phone ? `<a class="fac-phone" href="tel:${esc(telHref)}" title="Call ${esc(f.facility_name)}">${ic("phone", 12, 2)} ${esc(f.phone)}</a>` : ""}
        </div>` : ""}

        ${compact ? "" : `<div class="fac-capabilities">
          <span class="${f.has_digital_xray ? "yes" : "no"}">&bull; Digital X-Ray: <b>${f.has_digital_xray ? "YES" : "NO"}</b></span>
          <span class="${f.has_spirometer ? "yes" : "no"}">&bull; Spirometer: <b>${f.has_spirometer ? "YES" : "NO"}</b></span>
          <span class="${f.has_biochemical_lab ? "yes" : "no"}">&bull; Blood Lab: <b>${f.has_biochemical_lab ? "YES" : "NO"}</b></span>
          <span class="${f.emergency_108_base ? "yes alert-108" : "no"}">&bull; 108 Base: <b>${f.emergency_108_base ? "YES" : "NO"}</b></span>
        </div>`}

        ${!compact && f.match_label ? `<div class="fac-match-pill">${esc(f.match_label)}</div>` : ""}

        <div class="fac-actions">
          <button type="button" class="btn btn-ghost btn-sm ${esc(routeBtnClass)}" data-fac-id="${esc(f.facility_id)}" data-fac="${esc(f.facility_id)}" data-fac-name="${esc(f.facility_name)}" data-name="${esc(f.facility_name)}">
            ${ic("route", 14, 2)} Note referral
          </button>
          ${!compact && f.emergency_108_base ? `<a class="btn btn-danger btn-sm" href="tel:108" title="Call Emergency 108">${ic("phone", 13, 2)} 108</a>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function attachRoadDistances(container, siteId) {
  if (!container || !siteId) return;
  try {
    const res = await api(`/api/live/road-distances?site_id=${encodeURIComponent(siteId)}`);
    if (!container.isConnected || !res || !res.live || !res.routes || typeof res.routes !== "object") return;
    Object.entries(res.routes).forEach(([facId, rt]) => {
      if (!rt || rt.road_km == null) return;
      const el = container.querySelector(`[data-road-fac="${CSS.escape(facId)}"]`);
      if (el) el.textContent = `· ~${rt.road_km} km by road (${rt.duration_min ?? "?"} min, OSRM)`;
    });
  } catch { /* keep straight-line Haversine distance when OSRM is unavailable */ }
}

async function boot() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => { });
  }
  try {
    const opts = await api("/api/auth/options");
    if (opts && Object.prototype.hasOwnProperty.call(opts, "authenticated")) {
      S.user = opts.authenticated ? opts.user : null;
    } else {
      S.user = await api("/api/auth/me");
    }
  } catch {
    S.user = null;
  }
  route();
}

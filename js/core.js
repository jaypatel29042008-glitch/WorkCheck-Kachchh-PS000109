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
const DEMO_ONLY = ["today", "wokwi"];
const isPreview = () => Boolean(window.WORKCHECK_STATIC_DATA);
const isDemoOrg = () => !S.user || !S.user.org || Boolean(S.user.org.demo);
function navGroups(role) {
  const groups = NAV_FULL[role] || NAV_FULL.worker;
  return groups.map((g) => g.filter((k) => isDemoOrg() || !DEMO_ONLY.includes(k)));
}
const NAV = new Proxy({}, { get: (_, role) => navGroups(role).flat().map((k) => [k, PAGES[k][0], PAGES[k][1]]) });
const ROLE_NAMES = { clinician: "Clinic team", ddo: "District office", supervisor: "Site supervisor", worker: "Worker" };

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const READ_ONLY_MESSAGE = "This is a read-only preview, so nothing was saved. Run the full version to try this.";

const _STATIC_CACHE = { env: null, envTs: 0, pins: {}, roads: {} };
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

  // Interactive client-side demo runtime for static GitHub Pages (localStorage + reference.db + live CORS public APIs)
  if (window.WORKCHECK_STATIC_DATA && window.workcheckDemoApi) {
    try {
      return await window.workcheckDemoApi(path, method, options, {
        ApiError,
        computeWbgt: _computeWbgt,
        haversineKm: _haversineKm,
        nodeView: _staticNodeView,
        cache: _STATIC_CACHE,
        talukaAliases: _TALUKA_ALIASES,
      });
    } catch (err) {
      if (err && err.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me" && path !== "/api/auth/options") {
        S.user = null;
        renderLogin();
      }
      throw err;
    }
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
        ${S.user ? `<button type="button" class="btn btn-ink btn-sm" id="priv-consent-btn">Record Consent</button>` : ""}
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

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
    if (res.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") {
      S.user = null;
      renderLogin();
    }
    if (!res.ok) throw new ApiError(res.status, data.detail || "Something went wrong. Please try again.");
    return data;
  }

  // Client-side static handler (powered by reference.db dataset for GitHub Pages)
  if (window.WORKCHECK_STATIC_DATA) {
    const D = window.WORKCHECK_STATIC_DATA;

    // The preview has no server, so it must not claim that anything was saved.
    if (method !== "GET" && path !== "/api/auth/login" && path !== "/api/auth/logout") {
      throw new ApiError(403, READ_ONLY_MESSAGE);
    }

    // 1. Auth Login
    if (path === "/api/auth/login" && method === "POST") {
      const { email, password } = options.body || {};
      const found = D.users[email];
      if (found && found.password === password) {
        localStorage.setItem("wc_static_user", JSON.stringify(found.user));
        return found.user;
      }
      throw new ApiError(401, "Check your email and password.");
    }

    // 2. Auth Me
    if (path === "/api/auth/me") {
      const saved = localStorage.getItem("wc_static_user");
      if (saved) return JSON.parse(saved);
      throw new ApiError(401, "Please sign in.");
    }

    // 3. Auth Logout
    if (path === "/api/auth/logout") {
      localStorage.removeItem("wc_static_user");
      return { ok: true };
    }

    // 4. Overview
    if (path === "/api/overview") return D.overview;

    // 5. Workers list
    if (path === "/api/workers") return D.workers;

    // 6. Heat map
    if (path === "/api/heat/map") return D.heat_map;

    // 7. Heat jobs
    if (path === "/api/heat/jobs") return D.heat_jobs;

    // 8. Heat year
    if (path.startsWith("/api/heat/year")) {
      const jid = new URL(path, window.location.origin).searchParams.get("job_id");
      return (D.heat_year && D.heat_year[jid]) || { curve: [] };
    }

    // 9. Node state
    if (path === "/api/node/state") return D.node_state;

    // 10. Node day
    if (path.startsWith("/api/node/day")) {
      const lid = new URL(path, window.location.origin).searchParams.get("location_id") || "kandla_port";
      return (D.node_day && D.node_day[lid]) || { points: [] };
    }

    // 11. Node replay
    if (path.startsWith("/api/node/replay")) {
      const lid = new URL(path, window.location.origin).searchParams.get("location_id") || "kandla_port";
      return (D.node_replay && D.node_replay[lid]) || { points: [] };
    }

    // 12. Facilities
    if (path.startsWith("/api/facilities")) {
      const u = new URL(path, window.location.origin);
      const taluka = u.searchParams.get("taluka");
      const base = JSON.parse(JSON.stringify(D.facilities_default || { facilities: [] }));
      if (taluka && taluka !== "ALL" && base.facilities) {
        base.facilities = base.facilities.filter(f => f.taluka && f.taluka.toUpperCase() === taluka.toUpperCase());
      }
      return base;
    }

    // 14. Worker Details & actions
    if (path.startsWith("/api/workers/")) {
      const parts = path.split("/");
      const wid = parts[3];
      if (parts.length === 4) {
        return (D.worker_details && D.worker_details[wid]) || { worker: null };
      }
      return { worker: null };
    }

    // 15. Worker Self Today
    if (path === "/api/me/today") return D.me_today;

    // 16. Evidence
    if (path === "/api/evidence") return D.evidence;

    // 17. Storage
    if (path === "/api/storage") return { status: "ready", label: "Static GitHub Pages Preview" };

    // 18. Simulate
    if (path === "/api/node/simulate") {
      return { points: (D.node_day && D.node_day["kandla_port"])?.points || [] };
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
    <main class="main" id="main"><div id="view"></div></main>
  </div>`;
  $("#sign-out").addEventListener("click", signOut);
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
    if (!$(".me")) $("#app").innerHTML = `<div class="me">${skeleton()}</div>`;
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

async function boot() {
  try { S.user = await api("/api/auth/me"); } catch { S.user = null; }
  route();
}

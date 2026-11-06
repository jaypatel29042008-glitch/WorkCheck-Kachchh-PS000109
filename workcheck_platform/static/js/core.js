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
const NAV = {
  clinician: [["today", "Today", "home"], ["workers", "Workers", "users"], ["facilities", "Health facilities", "hospital-circle"], ["heat", "Heat & Dust map", "map-2"], ["site", "Site monitor", "device-heart-monitor"], ["wokwi", "Wokwi node", "cpu"], ["evidence", "Evidence", "book-2"]],
  ddo: [["today", "Today", "home"], ["facilities", "Health facilities", "hospital-circle"], ["heat", "Heat & Dust map", "map-2"], ["site", "Site monitor", "device-heart-monitor"], ["wokwi", "Wokwi node", "cpu"], ["evidence", "Evidence", "book-2"]],
  supervisor: [["site", "Site monitor", "device-heart-monitor"], ["facilities", "Health facilities", "hospital-circle"], ["heat", "Heat & Dust map", "map-2"], ["wokwi", "Wokwi node", "cpu"], ["evidence", "Evidence", "book-2"]],
  worker: [["me", "Health pass & Symptoms", "heartbeat"], ["facilities", "Nearest hospitals", "hospital-circle"]],
};
const ROLE_NAMES = { clinician: "Clinic team", ddo: "District office", supervisor: "Site supervisor", worker: "Worker" };

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, options = {}) {
  const init = { credentials: "same-origin", method: options.method || "GET", headers: {} };
  if (options.body !== undefined) { init.body = JSON.stringify(options.body); init.headers["Content-Type"] = "application/json"; }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me") { S.user = null; renderLogin(); }
  if (!res.ok) throw new ApiError(res.status, data.detail || "Something went wrong. Please try again.");
  return data;
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
  const nav = NAV[S.user.role];
  const initials = S.user.name.replace(".", "").split(" ").map((p) => p[0]).slice(0, 2).join("");
  $("#app").innerHTML = `<div class="frame">
    <aside class="side">
      ${logo()}
      <nav aria-label="Main">${nav.map(([k, t, i]) => `<a href="#/${k}" data-nav="${k}" data-tip-rail="${t}">${ic(i, 20)}<span>${t}</span></a>`).join("")}</nav>
      <div class="side-user">
        <span class="av av2" aria-hidden="true">${esc(initials)}</span>
        <div class="side-user-text"><b>${esc(S.user.name)}</b><span>${ROLE_NAMES[S.user.role]}</span></div>
        <button class="icon-btn" id="sign-out" type="button" aria-label="Sign out" data-tip="Sign out">${ic("logout", 18)}</button>
      </div>
    </aside>
    <main class="main" id="main"><div id="view"></div></main>
  </div>`;
  $("#sign-out").addEventListener("click", signOut);
}

async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => { });
  runCleanup();
  S.user = null; S.page = null; S.workers = null; S.current = null; S.wf = { level: "", search: "" };
  location.hash = "";
  renderLogin();
}

const skeleton = () => `<div class="skel-title"></div><div class="skel-grid"><div></div><div></div><div></div><div></div></div><div class="skel-block"></div>`;

async function route() {
  if (!S.user) return renderLogin();
  const [page = "", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const allowed = NAV[S.user.role].map((n) => n[0]);
  if (!allowed.includes(page)) { location.replace(`#/${allowed[0]}`); return; }
  if (S.user.role === "worker") return VIEWS.me();
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
    $("#view").innerHTML = `<div class="empty card">${ic("alert-triangle", 28)}<h2>This page could not open</h2><p>${esc(err.message)}</p><button class="btn btn-ink" type="button" onclick="route()">Try again</button></div>`;
  }
}
addEventListener("hashchange", route);

async function boot() {
  try { S.user = await api("/api/auth/me"); } catch { S.user = null; }
  route();
}

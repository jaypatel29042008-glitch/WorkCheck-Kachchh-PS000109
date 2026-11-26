"use strict";
/* Workers: list on the left, one person on the right. */
VIEWS.workers = async (id) => {
  if (!$("#wlist")) {
    $("#view").innerHTML = `<div class="md">
      <section class="md-list" aria-label="Workers">
        <div class="md-list-top">
          <div class="md-title"><h1>Workers</h1>${isDemoOrg() ? fictional("Fictional") : ""}</div>
          <label class="input search">${ic("search", 18)}<span class="sr">Search workers</span><input id="wsearch" type="search" placeholder="Search name, job or place" value="${esc(S.wf.search)}"></label>
          <div class="filters" id="wfilters"></div>
        </div>
        <div class="wlist" id="wlist"></div>
      </section>
      <section class="md-detail" id="wdetail" aria-live="polite"></section>
    </div>`;
    let timer;
    $("#wsearch").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { S.wf.search = e.target.value; renderWorkerList(); }, 120); });
    $("#wfilters").addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      S.wf.level = b.dataset.f;
      renderWorkerList();
      if (!isPhone()) { const first = filteredWorkers()[0]; if (first) location.hash = `#/workers/${first.id}`; }
    });
    await loadWorkers();
  }
  const wrap = $(".md");
  if (!id) {
    wrap.classList.remove("has-detail");
    if (!isPhone()) { const first = filteredWorkers()[0] || S.workers[0]; if (first) { location.replace(`#/workers/${first.id}`); return; } }
    return;
  }
  wrap.classList.add("has-detail");
  $$(".wrow").forEach((a) => { if (a.dataset.id === id) { a.setAttribute("aria-current", "true"); } else a.removeAttribute("aria-current"); });
  const row = $(`.wrow[data-id="${CSS.escape(id)}"]`);
  if (row) row.scrollIntoView({ block: "nearest" });
  await openWorker(id);
};

async function loadWorkers() {
  const data = await api("/api/workers");
  if (S.page !== "workers" || !$("#wlist")) return;
  S.workers = data.workers;
  renderWorkerList();
}

function workerMatches(w) {
  const q = S.wf.search.trim().toLowerCase();
  return !q || `${w.id} ${w.name} ${w.job} ${w.place} ${w.taluka} ${w.employer}`.toLowerCase().includes(q);
}
const filteredWorkers = () => S.workers.filter((w) => workerMatches(w) && (!S.wf.level || w.level === S.wf.level));

function renderWorkerList() {
  const pool = S.workers.filter(workerMatches);
  const counts = { "": pool.length };
  Object.keys(LEVELS).forEach((k) => { counts[k] = pool.filter((w) => w.level === k).length; });
  const names = { "": "All", action: "Action", due: "Due", watch: "Watch", clear: "Clear" };
  $("#wfilters").innerHTML = Object.entries(names).map(([k, t]) => `<button type="button" class="fpill${S.wf.level === k ? " on" : ""}" data-f="${k}" aria-pressed="${S.wf.level === k}">${t} <span>${counts[k]}</span></button>`).join("");
  const shown = filteredWorkers();
  const current = location.hash.split("/")[2];
  const row = (w) => `<a class="wrow" href="#/workers/${esc(w.id)}" data-id="${esc(w.id)}"${w.id === current ? ' aria-current="true"' : ""}>
    ${avatar(w)}
    <span class="wrow-main"><b>${esc(w.name)}</b><small>${esc(w.job)} · ${esc(w.place)}</small><span class="why t-${w.level}">${w.urgent ? ic("alert-triangle", 13, 2.2) : ""}${esc(w.headline)}${w.more ? ` <em>+${w.more}</em>` : ""}</span></span>
  </a>`;
  let html = "";
  if (!shown.length) html = `<div class="empty small">${ic("search", 22)}<p>No workers match this search.</p></div>`;
  else if (S.wf.level) html = shown.map(row).join("");
  else Object.entries(LEVELS).forEach(([k, l]) => {
    const group = shown.filter((w) => w.level === k);
    if (group.length) html += `<div class="wgroup"><span>${l.label}</span><span>${group.length}</span></div>${group.map(row).join("")}`;
  });
  $("#wlist").innerHTML = html;
}

async function openWorker(id) {
  const box = $("#wdetail");
  if (!S.current || S.current.card.id !== id) box.innerHTML = `<div class="skel-block tall"></div>`;
  const p = await api(`/api/workers/${encodeURIComponent(id)}`);
  if (location.hash.split("/")[2] !== id || !$("#wdetail")) return;
  S.current = p;
  renderWorker(p);
  box.scrollTop = 0;
}

const EXP_TONE = { high: "action", moderate: "due", ok: "clear", none: "none" };

function renderWorker(p) {
  if (p.kind === "org") return renderOrgWorker(p);
  const c = p.card;
  const reports = p.symptoms.filter((s) => !s.reviewed);
  const nextIcon = p.state.level === "action" ? "alert-triangle" : p.state.level === "due" ? "calendar-check" : p.state.level === "watch" ? "eye" : "circle-check";
  const box = $("#wdetail");
  box.innerHTML = `<div class="detail">
    <a class="back" href="#/workers">${ic("chevron-left", 18, 2)}All workers</a>
    <header class="w-head card">
      ${avatar(c, true)}
      <div class="w-head-main">
        <div class="w-name"><h2>${esc(c.name)}</h2>${pill(p.state.level)}</div>
        <p class="sub">${esc(c.job)} · ${esc(c.place)} · Age ${esc(c.age)} · ${esc(c.employer)}</p>
        <p class="w-tags"><span class="tag">${esc(c.id)}</span>${p.legal_rule ? `<span class="tag" data-tip="${esc(p.legal_rule)}">${ic("scale-outline", 12, 2)}Yearly legal exam applies</span>` : ""}</p>
      </div>
      <button class="btn btn-ghost" id="w-qr" type="button">${ic("qrcode", 18)}QR pass</button>
      <div class="pass-meta-grid" style="margin-top:14px;width:100%;grid-column:1/-1">
        <div class="meta-item">
          <span class="meta-label">Age:</span>
          <span>${esc(c.age)} yrs</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Assigned Worksite:</span>
          <span class="t-indigo">${esc(c.place)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Cumulative Silica Est. Range:</span>
          <span class="t-amber">${esc(p.silica_range)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Safe Heat Hours (Apr–Oct, model):</span>
          <span class="t-rose">${esc(p.safe_heat_hours)}</span>
        </div>
      </div>
    </header>

    <section class="next ${p.state.level}">
      <span class="round">${ic(nextIcon, 22, 2)}</span>
      <div><h3>${esc(p.next.title)}</h3><p>${esc(p.next.body)}</p></div>
      ${p.next.cta ? `<button class="btn btn-ink" id="w-cta" type="button">${esc(p.next.cta)}</button>` : ""}
    </section>

    ${reports.length ? `<section class="card" id="w-reports"><div class="card-head"><h2>Reported by the worker</h2></div>${reports.map((r) => `<div class="report"><span class="round sm bg-${r.urgent ? "action t-action" : "due t-due"}">${ic(r.urgent ? "alert-triangle" : "mood-sick", 16, 2)}</span><div><b>${esc(r.text)}</b><small>${fmtDate(r.at)}</small></div><button class="btn btn-ghost btn-sm" data-review="${r.id}" type="button">Mark reviewed</button></div>`).join("")}</section>` : ""}

    <section class="card" id="w-log" hidden></section>

    <section class="card">
      <div class="card-head"><h2>What this job exposes them to</h2></div>
      <div class="exp-grid">${p.exposure.map((m) => {
        const tone = EXP_TONE[m.level];
        return `<div class="exp"><div class="exp-top"><span class="round xs bg-${tone} t-${tone}">${ic(m.icon, 15, 2)}</span>${esc(m.label)}</div>
          <div class="exp-val">${esc(m.value)}</div><div class="exp-unit">${esc(m.unit || " ")}</div>
          ${m.series.length ? spark(m.series, tone, m.months, m.series_unit) : `<div class="spark-empty"></div>`}
          <span class="pill sm ${tone}" data-tip="${esc(m.caption)}">${esc(m.chip)}</span></div>`;
      }).join("")}</div>
      <p class="fine">${esc(p.exposure.map((m) => `${m.label}: ${m.caption}.`).join(" "))}</p>
    </section>

    <div class="two">
      <section class="card">
        <div class="card-head"><h2>Checks to do</h2><span class="sub">${p.open_checks.length} open</span></div>
        ${p.open_checks.length ? `<div class="todo">${p.open_checks.map((k) => `<div class="todo-row"><span class="round sm bg-${k.tone} t-${k.tone}">${ic(k.icon, 16, 2)}</span><div><b>${esc(k.check)}</b><small class="t-${k.tone}">${esc(k.text)}</small></div><button class="btn btn-ghost btn-sm" data-record="${esc(k.condition)}" type="button">Record</button></div>`).join("")}</div>` : `<div class="empty small">${ic("circle-check", 24)}<p>Nothing is waiting.</p></div>`}
        ${p.other_checks.length ? `<details class="more"><summary>Other checks (${p.other_checks.length})${ic("chevron-down", 16, 2)}</summary>${p.other_checks.map((k) => `<div class="other-row"><span>${esc(k.check)}</span>${pill(k.tone === "watch" ? "watch" : "clear", k.text, true)}</div>`).join("")}</details>` : ""}
      </section>
      <section class="card">
        <div class="card-head"><h2>Body map</h2><span class="sub">Follow-up, not a diagnosis</span></div>
        <div class="bodywrap">${bodyMap(p.areas)}<div class="body-list">${p.areas.map((a) => `<div class="body-row" data-area="${a.key}" tabindex="0"><i style="background:${TONE_MARK[a.tone]}"></i><span>${esc(a.label)}</span><small class="t-${a.tone}">${esc(shortStatus(a))}</small></div>`).join("")}</div></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>Care journey</h2><span class="sub${p.tracker.problem ? " t-action" : ""}">${esc(p.tracker.summary)}</span></div>
      ${journey(p.tracker)}
    </section>

    <!-- Nearest Hospital Connector for this worker's site, sorted by diseases -->
    <section class="card facilities-connector-card" id="w-fac-card">
      <div class="facilities-header">
        <div>
          <h2>Nearest Healthcare Facilities &bull; ${esc(c.place)}</h2>
          <p class="sub">Sample list for testing. Confirm services with each facility.</p>
        </div>
      </div>
      <div class="disease-sorter-toolbar">
        <span class="sorter-label">Sort by Disease:</span>
        <div class="disease-pills" id="w-disease-pills">
          <button type="button" class="pill-btn on" data-d="all">${ic("map-pin", 13, 2)} All (Nearest)</button>
          <button type="button" class="pill-btn" data-d="silicosis">${ic("lungs", 13, 2)} Silicosis (X-Ray + Spiro)</button>
          <button type="button" class="pill-btn" data-d="heatstroke">${ic("ambulance", 13, 2)} Heatstroke (108 Base)</button>
          <button type="button" class="pill-btn" data-d="ckd">${ic("droplet", 13, 2)} Kidney / CKDu</button>
          <button type="button" class="pill-btn" data-d="eye">${ic("eye", 13, 2)} UV Eye Clinic</button>
        </div>
      </div>
      <div class="facilities-grid" id="w-fac-grid">
        <div class="skel-block" style="grid-column: 1 / -1; height: 120px"></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Where they worked in 2025</h2>${p.places.length > 1 ? `<span class="sub">Moved ${p.places.length - 1} ${p.places.length === 2 ? "time" : "times"}. The record followed them.</span>` : ""}</div>
      ${yearBar(p.places)}
    </section>

    <details class="card history"><summary><h2>Full history</h2><span class="sub">${p.history.length + p.updates.length} events ${ic("chevron-down", 16, 2)}</span></summary>
      <ol class="timeline">${p.updates.map((u) => `<li class="clear"><time>${fmtDate(u.at)}</time><span>${esc(u.text)}${u.note ? `. ${esc(u.note)}` : ""}</span></li>`).join("")}${[...p.history].reverse().map((h) => `<li class="${h.tone}"><time>${fmtDate(h.date)}</time><span>${esc(h.text)}</span></li>`).join("")}</ol>
    </details>
    <p class="fine center">${ic("shield-lock", 14)} This record has been opened ${p.times_opened} ${p.times_opened === 1 ? "time" : "times"}. Every opening is logged. ${esc(p.label)}</p>
  </div>`;
  mountSparks(box);
  wireBody(box);
  api(`/api/log/history/${encodeURIComponent(c.id)}?days=35`).then((h) => {
    const host = $("#w-log", box);
    if (!host || !h.logged) return;
    host.innerHTML = calendarCard(h, "en", "Daily check-ins");
    host.hidden = false;
  }).catch(() => { });
  $("#w-qr").addEventListener("click", () => openPass(c));
  const cta = $("#w-cta");
  if (cta) cta.addEventListener("click", () => {
    if (p.next.cta === "Review report") $("#w-reports").scrollIntoView({ behavior: "smooth", block: "center" });
    else openRecord(p);
  });
  $$("[data-record]", box).forEach((b) => b.addEventListener("click", () => openRecord(p, b.dataset.record)));
  $$("[data-review]", box).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await api(`/api/workers/${encodeURIComponent(c.id)}/symptoms/${b.dataset.review}/review`, { method: "POST" });
      toast("Marked as reviewed.", "good");
      await loadWorkers();
      await openWorker(c.id);
    } catch (err) {
      b.disabled = false;
      toast(err.message || "Could not mark reviewed.", "action");
    }
  }));

  const loadWorkerFacilities = async (disease = "all") => {
    const locId = c.location_id || "little_rann_kutch";
    const facRes = await api(`/api/facilities?site_id=${encodeURIComponent(locId)}&disease=${encodeURIComponent(disease)}`);
    const grid = $("#w-fac-grid", box);
    if (!grid) return;
    grid.innerHTML = renderFacilityCardsHtml(facRes.facilities, { routeBtnClass: "w-refer-btn" });
    attachRoadDistances(grid, locId);

    $$(".w-refer-btn", grid).forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const rep = await api("/api/facilities/refer", {
            method: "POST",
            body: { worker_id: c.id, facility_id: btn.dataset.facId, disease }
          });
          btn.innerHTML = `${ic("circle-check", 14, 2)} Referral Noted`;
          btn.classList.add("btn-ink");
          toast(rep.message || `Referral to ${btn.dataset.facName} noted.`, "good");
        } catch (e) {
          toast(e.message || "Could not note the referral.", "action");
        }
      });
    });
  };

  loadWorkerFacilities("all");
  $$("#w-disease-pills .pill-btn", box).forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#w-disease-pills .pill-btn", box).forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      loadWorkerFacilities(btn.dataset.d);
    });
  });
}

function shortStatus(a) {
  return { action: a.text, due: a.text, watch: "Watching", clear: "Up to date", none: "No check" }[a.tone] || "";
}

function bodyMap(areas) {
  const tone = Object.fromEntries(areas.map((a) => [a.key, a.tone]));
  const fill = (k) => TONE_MARK[tone[k]];
  const cls = (k) => `part${tone[k] === "action" ? " pulse" : ""}`;
  const skin = "#E4E7F7";
  return `<svg class="body" viewBox="0 0 220 390" role="img" aria-label="${esc(areas.map((a) => `${a.label}: ${shortStatus(a)}`).join(". "))}">
    <g class="${cls("heat")}" data-area="heat"><ellipse cx="110" cy="196" rx="104" ry="190" fill="${fill("heat")}" opacity=".16"/><ellipse cx="110" cy="196" rx="104" ry="190" fill="none" stroke="${fill("heat")}" stroke-width="1.5" stroke-dasharray="4 7" opacity=".7"/></g>
    <circle cx="110" cy="48" r="29" fill="${skin}"/><rect x="99" y="72" width="22" height="22" fill="${skin}"/>
    <rect x="66" y="90" width="88" height="134" rx="34" fill="${skin}"/>
    <path d="M74 106C56 122 47 164 43 216M146 106C164 122 173 164 177 216" fill="none" stroke="${skin}" stroke-width="22" stroke-linecap="round"/>
    <path d="M90 214L85 362M130 214L135 362" fill="none" stroke="${skin}" stroke-width="29" stroke-linecap="round"/>
    <g class="${cls("eyes")}" data-area="eyes" fill="${fill("eyes")}"><circle cx="99" cy="46" r="5"/><circle cx="121" cy="46" r="5"/></g>
    <g class="${cls("ears")}" data-area="ears" fill="${fill("ears")}"><ellipse cx="80" cy="50" rx="5.5" ry="10"/><ellipse cx="140" cy="50" rx="5.5" ry="10"/></g>
    <g class="${cls("lungs")}" data-area="lungs" fill="${fill("lungs")}"><path d="M105 106C92 98 76 110 76 140C76 160 90 164 105 152Z"/><path d="M115 106C128 98 144 110 144 140C144 160 130 164 115 152Z"/></g>
    <g class="${cls("heart")}" data-area="heart"><path d="M112 146C100 136 96 130 96 124C96 117 105 114 112 121C119 114 128 117 128 124C128 130 124 136 112 146Z" fill="${fill("heart")}" stroke="${skin}" stroke-width="2.5"/></g>
    <g class="${cls("kidneys")}" data-area="kidneys" fill="${fill("kidneys")}"><ellipse cx="88" cy="184" rx="9" ry="13" transform="rotate(10 88 184)"/><ellipse cx="132" cy="184" rx="9" ry="13" transform="rotate(-10 132 184)"/></g>
    <g class="${cls("back")}" data-area="back" fill="${fill("back")}"><rect x="105" y="166" width="10" height="7" rx="3"/><rect x="105" y="177" width="10" height="7" rx="3"/><rect x="105" y="188" width="10" height="7" rx="3"/><rect x="105" y="199" width="10" height="7" rx="3"/><circle cx="87" cy="290" r="8"/><circle cx="133" cy="290" r="8"/></g>
  </svg>`;
}
function wireBody(root) {
  const svg = $(".body", root);
  if (!svg) return;
  const set = (area) => {
    $$(".part", svg).forEach((g) => g.classList.toggle("dim", Boolean(area) && g.dataset.area !== area));
    $$(".body-row", root).forEach((r) => r.classList.toggle("on", r.dataset.area === area));
  };
  $$(".body-row", root).forEach((r) => {
    r.addEventListener("mouseenter", () => set(r.dataset.area));
    r.addEventListener("focus", () => set(r.dataset.area));
    r.addEventListener("mouseleave", () => set(null));
    r.addEventListener("blur", () => set(null));
  });
  $$(".part", svg).forEach((g) => {
    g.addEventListener("mouseenter", () => { if (g.dataset.area !== "heat") set(g.dataset.area); });
    g.addEventListener("mouseleave", () => set(null));
  });
}

function journey(t) {
  const icons = { done: "check", problem: "alert-triangle", current: "circle-dashed", skipped: "circle-dashed", todo: "" };
  return `<ol class="journey" style="--n:${t.steps.length}">${t.steps.map((s) => `<li class="${s.state}"><span class="node">${icons[s.state] ? ic(icons[s.state], 16, 2.4) : ""}</span><b>${esc(s.label)}</b><small>${s.date ? fmtDate(s.date) : s.state === "problem" ? "Not recorded" : s.state === "current" ? "Waiting" : ""}</small></li>`).join("")}</ol>`;
}

function yearBar(places) {
  const start = Date.UTC(2025, 0, 1), span = Date.UTC(2026, 0, 1) - start;
  const tints = ["#DDE1FC", "#C4CBFA", "#EAD9F7"];
  const segs = places.map((p, i) => {
    const a = Math.max(Date.parse(p.start), start), b = Math.min(Date.parse(p.end) + 864e5, start + span);
    const left = ((a - start) / span) * 100, width = ((b - a) / span) * 100;
    const dates = `${fmtDate(p.start, false)} to ${fmtDate(p.end, false)}`;
    return `<div class="seg" style="left:${left}%;width:${width}%;background:${tints[i % 3]}" data-tip="${esc(`${p.job}, ${p.place}. ${dates}`)}">${ic(p.icon, 16, 2)}${width > 26 ? `<span>${esc(p.job)} · ${esc(p.place)}</span>` : ""}</div>`;
  }).join("");
  return `<div class="yearbar">${segs}</div><div class="year-months">${MONTHS.map((m) => `<span>${m}</span>`).join("")}</div>`;
}

function openPass(c) {
  const qr = qrcode(0, "M");
  qr.addData(`${location.origin}${location.pathname}#/workers/${c.id}`);
  qr.make();
  openModal(`<div class="pass"><h2>${esc(c.name)}'s QR pass</h2><p class="sub">Scan at a clinic or a new job. It opens this record only after sign-in and holds no health data.</p><div class="qr">${qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true })}</div><p class="tag">${esc(c.id)}</p></div>`, "QR pass");
}

function openRecord(p, condition) {
  const c = p.card;
  const groups = [["Waiting", p.open_checks], ["Already checked", p.other_checks]].filter(([, list]) => list.length);
  const options = groups.map(([name, list]) => `<optgroup label="${name}">${list.map((k) => `<option value="${esc(k.condition)}"${k.condition === condition ? " selected" : ""}>${esc(k.check)}</option>`).join("")}</optgroup>`).join("");
  const outcomes = [["CHECKED_NOTHING_NOTED", "Nothing noted", "circle-check"], ["CHECKED_FOLLOW_UP_OPEN", "Follow-up needed", "calendar-event"], ["CHECKED_FOLLOW_UP_DONE", "Follow-up done", "clipboard-check"], ["CHECK_DUE", "Still due", "clock-hour-4"], ["CHECK_MISSED", "Missed", "circle-x"]];
  const m = openModal(`<h2>Record a check</h2><p class="sub">For ${esc(c.name)}. Saved to the platform database and shown in their history.</p>
    <form id="rec-form">
      <label class="field"><span>Which check?</span><span class="select wide"><select id="rec-cond">${options}</select>${ic("chevron-down", 16, 2)}</span></label>
      <fieldset class="field"><legend>What happened?</legend><div class="choices">${outcomes.map(([v, t, i], k) => `<label class="choice"><input type="radio" name="rec-out" value="${v}"${k === 0 ? " checked" : ""}><span>${ic(i, 18, 2)}${t}</span></label>`).join("")}</div></fieldset>
      <label class="field"><span>Note (optional)</span><textarea id="rec-note" rows="2" maxlength="300" placeholder="Short note for the record"></textarea></label>
      <p class="form-error" id="rec-err" role="alert" hidden></p>
      <button class="btn btn-ink btn-full" type="submit">Save</button>
    </form>`, "Record a check");
  $("#rec-form", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/workers/${encodeURIComponent(c.id)}/conditions`, { method: "POST", body: { condition: $("#rec-cond", m.el).value, status: $("input[name=rec-out]:checked", m.el).value, note: $("#rec-note", m.el).value } });
      m.close();
      toast(`Saved. ${c.name.split(" ")[0]}'s list is updated.`, "good");
      await loadWorkers();
      await openWorker(c.id);
    } catch (err) {
      const box = $("#rec-err", m.el); box.textContent = err.message; box.hidden = false;
    }
  });
}


/* A worker who joined with an invite: what they told us, and what the team recorded. */
function renderOrgWorker(p) {
  const c = p.card;
  const reports = (p.symptoms || []).filter((s) => !s.reviewed);
  const box = $("#wdetail");
  const nextIcon = p.state.level === "action" ? "alert-triangle" : p.state.level === "due" ? "calendar-check" : "eye";
  const again = async () => { await loadWorkers(); await openWorker(c.id); };
  box.innerHTML = `<div class="detail">
    <a class="back" href="#/workers">${ic("chevron-left", 18, 2)}All workers</a>
    <header class="w-head card">
      ${avatar(c, true)}
      <div class="w-head-main">
        <div class="w-name"><h2>${esc(c.name)}</h2>${pill(p.state.level)}</div>
        <p class="sub">${esc(c.job)} · ${esc(c.place)}${c.age ? ` · Age ${esc(c.age)}` : ""}</p>
        <p class="w-tags"><span class="tag">${esc(c.id)}</span><span class="tag">Joined ${fmtDate(p.joined)}</span>${p.checkin_hours_week ? `<span class="tag">${p.checkin_hours_week}h gate hours this week</span>` : ""}</p>
      </div>
      <button class="btn btn-ghost" id="w-med" type="button">${ic("plus", 18)}Record a check</button>
    </header>

    <section class="next ${p.state.level}">
      <span class="round">${ic(nextIcon, 22, 2)}</span>
      <div><h3>${esc(p.next.title)}</h3><p>${esc(p.next.body)}</p></div>
    </section>

    ${reports.length ? `<section class="card" id="w-reports"><div class="card-head"><h2>Reported by the worker</h2></div>${reports.map((r) => `<div class="report"><span class="round sm bg-${r.urgent ? "action t-action" : "due t-due"}">${ic(r.urgent ? "alert-triangle" : "mood-sick", 16, 2)}</span><div><b>${esc(r.text)}</b><small>${fmtDate(r.at)}</small></div><button class="btn btn-ghost btn-sm" data-review="${r.id}" type="button">Mark reviewed</button></div>`).join("")}</section>` : ""}

    <div class="two">
      <section class="card">${p.log.logged ? calendarCard(p.log, "en", "Daily check-ins") : `<div class="card-head"><h2>Daily check-ins</h2></div><div class="empty small">${ic("clipboard-check", 24)}<p>${esc(c.name.split(" ")[0])} has not checked in yet.</p></div>`}</section>
      <section class="card"><div class="card-head"><h2>What this job exposes them to</h2></div>
        <div class="exp-grid two-up">${p.exposure.map((m) => { const tone = EXP_TONE[m.level]; return `<div class="exp"><div class="exp-top"><span class="round xs bg-${tone} t-${tone}">${ic(m.icon, 15, 2)}</span>${esc(m.label)}</div><div class="exp-val">${esc(m.value)}</div><div class="exp-unit">${esc(m.unit || " ")}</div><span class="pill sm ${tone}" data-tip="${esc(m.caption)}">${esc(m.chip)}</span></div>`; }).join("")}</div>
        <p class="fine">${esc(p.exposure.map((m) => `${m.label}: ${m.caption}.`).join(" "))}</p></section>
    </div>

    <div class="two">
      <section class="card"><div class="card-head"><h2>Medical checks</h2><span class="sub">${p.medical.length} recorded</span></div>
        ${p.medical.length ? `<div class="todo">${p.medical.map((k) => `<div class="todo-row"><span class="round sm bg-${k.tone} t-${k.tone}">${ic("stethoscope", 16, 2)}</span><div><b>${esc(k.check_name)}</b><small>${fmtDate(k.done_on)} · ${esc(k.result_label)}${k.next_due ? ` · next ${fmtDate(k.next_due)}` : ""}${k.note ? ` · ${esc(k.note)}` : ""}</small></div></div>`).join("")}</div>` : `<div class="empty small">${ic("stethoscope", 24)}<p>No checks recorded yet.</p></div>`}</section>
      <section class="card"><div class="card-head"><h2>Referrals and training</h2></div>
        ${p.referrals.length || p.trainings.length ? `<div class="todo">${p.referrals.map((r) => `<div class="todo-row"><span class="round sm bg-indigo">${ic("route", 16, 2)}</span><div><b>${esc(r.facility_name)}</b><small>${fmtDate(r.at)} · ${esc(r.reason)} · ${esc((REF_STATUS[r.status] || [r.status])[0])}${r.outcome ? ` · ${esc(r.outcome)}` : ""}</small></div></div>`).join("")}${p.trainings.map((x) => `<div class="todo-row"><span class="round sm bg-clear t-clear">${ic("certificate", 16, 2)}</span><div><b>${esc(x.course_label)}</b><small>${fmtDate(x.done_on)} · valid until ${fmtDate(x.valid_until)}</small></div></div>`).join("")}</div>` : `<div class="empty small">${ic("route", 24)}<p>Nothing recorded yet.</p></div>`}</section>
    </div>

    <section class="card facilities-connector-card"><div class="facilities-header"><div><h2>Nearest health facilities</h2><p class="sub">Sample list. Confirm services with each facility before sending anyone.</p></div></div><div class="facilities-grid" id="w-fac-grid"><div class="skel-block" style="grid-column:1/-1;height:120px"></div></div></section>
    <p class="fine center">${ic("shield-lock", 14)} Every opening of this record is logged. ${esc(p.label)}</p>
  </div>`;
  $("#w-med").addEventListener("click", async () => {
    const data = await api("/api/medical");
    openMedicalForm([c], data.catalogue, c.id, again);
  });
  $$("[data-review]", box).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await api(`/api/workers/${encodeURIComponent(c.id)}/symptoms/${b.dataset.review}/review`, { method: "POST" });
      toast("Marked as reviewed.", "good");
      await again();
    } catch (err) {
      b.disabled = false;
      toast(err.message || "Could not mark reviewed.", "action");
    }
  }));
  api(`/api/facilities?site_id=${encodeURIComponent(c.location_id)}&disease=all`).then((res) => {
    const grid = $("#w-fac-grid", box);
    if (!grid) return;
    grid.innerHTML = renderFacilityCardsHtml(res.facilities.slice(0, 6), { compact: true });
    attachRoadDistances(grid, c.location_id);
    $$("[data-fac]", grid).forEach((b) => b.addEventListener("click", () => {
      const m = openModal(`<h2>Note a referral</h2><p class="sub">To ${esc(b.dataset.name)}. Nothing is sent to the facility; this is your own record.</p><form id="rf"><label class="field"><span>Why are they going?</span><textarea id="rf-why" rows="2" maxlength="200" required placeholder="For example: chest X-ray after a long cough."></textarea></label><p class="form-error" role="alert" hidden></p><button class="btn btn-ink btn-full" type="submit">Save</button></form>`, "Note a referral");
      $("#rf", m.el).addEventListener("submit", async (e) => {
        e.preventDefault();
        try { const res = await api("/api/referrals", { method: "POST", body: { worker_id: c.id, facility_id: b.dataset.fac, facility_name: b.dataset.name, reason: $("#rf-why", m.el).value.trim() } }); m.close(); toast(res.message, "good"); again(); } catch (err) { formError(m.el, err.status === 422 ? new Error("Write a few words about why.") : err); }
      });
    }));
  }).catch(() => { });
}

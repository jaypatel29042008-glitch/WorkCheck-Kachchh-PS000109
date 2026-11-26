"use strict";
/* Trackers the team fills in: incidents, medical checks and referrals, training and site checks. */
const workerOptions = (workers, chosen) => workers.map((w) => `<option value="${esc(w.id)}"${w.id === chosen ? " selected" : ""}>${esc(w.name)}${w.job ? ` · ${esc(w.job)}` : ""}</option>`).join("");
const radioChoices = (name, items, chosen) => `<div class="choices">${items.map(([v, label, icon], i) => `<label class="choice"><input type="radio" name="${name}" value="${esc(v)}"${(chosen ? v === chosen : i === 0) ? " checked" : ""}><span>${icon ? ic(icon, 18, 2) : ""}${esc(label)}</span></label>`).join("")}</div>`;

/* ---------------- Incidents ---------------- */
function openIncidentForm(data, onSaved, asWorker = false) {
  const cat = data.catalogue;
  const m = openModal(`<h2>Report an incident</h2><p class="sub">An injury, a near miss, or anything unsafe. Write it the way you would tell a colleague.</p>
    <form id="inc-form">
      <fieldset class="field"><legend>What kind?</legend>${radioChoices("inc-kind", cat.incident_kinds.map((k) => [k.key, k.label, k.icon]))}</fieldset>
      <fieldset class="field"><legend>How serious?</legend>${radioChoices("inc-sev", cat.severities.map((s) => [s.key, s.label]))}</fieldset>
      <label class="field"><span>What happened?</span><textarea id="inc-what" rows="3" maxlength="400" placeholder="For example: a worker felt faint at 2pm on the pan and rested in shade." required></textarea></label>
      ${asWorker ? "" : `<label class="field"><span>What was done about it? (optional)</span><textarea id="inc-action" rows="2" maxlength="300" placeholder="For example: moved the break earlier."></textarea></label>
      <div class="form-two">${data.sites && data.sites.length ? `<label class="field"><span>Site</span><span class="select wide"><select id="inc-site">${data.sites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>` : ""}
      ${data.workers && data.workers.length ? `<label class="field"><span>Worker involved (optional)</span><span class="select wide"><select id="inc-worker"><option value="">No one named</option>${workerOptions(data.workers)}</select>${ic("chevron-down", 16, 2)}</span></label>` : ""}</div>`}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-ink btn-full" type="submit">Save report</button>
    </form>`, "Report an incident");
  $("#inc-form", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const what = $("#inc-what", m.el).value.trim();
    if (what.length < 3) return formError(m.el, new Error("Write a few words about what happened."));
    try {
      const site = $("#inc-site", m.el), worker = $("#inc-worker", m.el), action = $("#inc-action", m.el);
      const res = await api("/api/incidents", { method: "POST", body: { kind: $("input[name=inc-kind]:checked", m.el).value, severity: $("input[name=inc-sev]:checked", m.el).value, what, action: action ? action.value : "", site_id: site ? Number(site.value) : null, worker_id: worker && worker.value ? worker.value : null } });
      m.close();
      toast(res.message, "good");
      if (onSaved) onSaved();
    } catch (err) { formError(m.el, err); }
  });
}

VIEWS.incidents = async () => {
  const data = await api("/api/incidents");
  if (S.page !== "incidents") return;
  const show = S.incFilter || "open";
  const list = data.incidents.filter((i) => (show === "all" ? true : i.status === show));
  const closed = data.incidents.length - data.open;
  $("#view").innerHTML = `<header class="page-head"><div><h1>Incidents</h1><p class="lead">${data.open ? `<b>${plural(data.open, "incident")}</b> still open. Close each one once something has been done about it.` : "Nothing is open. Report injuries and near misses here so patterns show up early."}</p></div>
      <div class="head-actions"><button class="btn btn-ink" id="inc-new" type="button">${ic("plus", 18, 2)}Report an incident</button></div></header>
    <div class="filters page-filters">${[["open", "Open", data.open], ["closed", "Closed", closed], ["all", "All", data.incidents.length]].map(([k, t, n]) => `<button type="button" class="fpill${show === k ? " on" : ""}" data-f="${k}" aria-pressed="${show === k}">${t} <span>${n}</span></button>`).join("")}</div>
    ${list.length ? `<div class="inc-list">${list.map((i) => `<article class="card inc">
        <span class="round bg-${i.tone} t-${i.tone}">${ic(i.icon, 19, 2)}</span>
        <div class="inc-main"><div class="inc-top"><h3>${esc(i.kind_label)}</h3>${i.status === "closed" ? pill("clear", "Closed", true) : `<span class="pill sm ${i.tone}">${esc(i.severity_label)}</span>`}</div>
          <p>${esc(i.what)}</p>
          ${i.action ? `<p class="inc-done"><b>Done:</b> ${esc(i.action)}</p>` : ""}${i.closed_note ? `<p class="inc-done"><b>Closing note:</b> ${esc(i.closed_note)}</p>` : ""}
          <small>${fmtDate(i.at)}${i.site_name ? ` · ${esc(i.site_name)}` : ""}${i.worker_name ? ` · ${esc(i.worker_name)}` : ""}</small></div>
        ${i.status === "open" ? `<button class="btn btn-ghost btn-sm" type="button" data-close="${i.id}">Close</button>` : ""}
      </article>`).join("")}</div>` : `<div class="card empty">${ic("circle-check", 28)}<h2>${show === "open" ? "No open incidents" : "Nothing here yet"}</h2><p>${show === "open" ? "When something happens, report it here." : "Reports will be listed here."}</p></div>`}`;
  $("#inc-new").addEventListener("click", () => openIncidentForm(data, () => VIEWS.incidents()));
  $$("[data-f]").forEach((b) => b.addEventListener("click", () => { S.incFilter = b.dataset.f; VIEWS.incidents(); }));
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => {
    const m = openModal(`<h2>Close this incident</h2><p class="sub">Say what was done so it does not happen again.</p><form id="close-form"><label class="field"><span>What was done?</span><textarea id="close-note" rows="3" maxlength="300" placeholder="For example: fixed the water spray and checked it ran all shift."></textarea></label><p class="form-error" role="alert" hidden></p><button class="btn btn-ink btn-full" type="submit">Close incident</button></form>`, "Close incident");
    $("#close-form", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/incidents/${b.dataset.close}/close`, { method: "POST", body: { note: $("#close-note", m.el).value } }); m.close(); toast("Incident closed.", "good"); VIEWS.incidents(); } catch (err) { formError(m.el, err); }
    });
  }));
};

/* ---------------- Medical checks and referrals ---------------- */
function openMedicalForm(workers, cat, chosen, onSaved) {
  const m = openModal(`<h2>Record a medical check</h2><p class="sub">The next due date is worked out for you. Change it if the doctor said otherwise.</p>
    <form id="med-form">
      <label class="field"><span>Worker</span><span class="select wide"><select id="med-worker">${workerOptions(workers, chosen)}</select>${ic("chevron-down", 16, 2)}</span></label>
      <div class="form-two"><label class="field"><span>Which check?</span><span class="select wide"><select id="med-check">${cat.medical.map((c) => `<option value="${esc(c.name)}" data-months="${c.months}">${esc(c.name)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
      <label class="field"><span>Date of the check</span><span class="input"><input id="med-date" type="date" value="${todayIso()}" max="${todayIso()}" required></span></label></div>
      <fieldset class="field"><legend>Result</legend>${radioChoices("med-result", cat.results.map((r) => [r.key, r.label]))}</fieldset>
      <label class="field"><span>Next check due</span><span class="input"><input id="med-next" type="date"></span></label>
      <label class="field"><span>Note (optional)</span><textarea id="med-note" rows="2" maxlength="300"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-ink btn-full" type="submit">Save</button>
    </form>`, "Record a medical check");
  const setNext = () => {
    const months = Number($("#med-check", m.el).selectedOptions[0].dataset.months);
    const d = new Date($("#med-date", m.el).value || todayIso());
    d.setMonth(d.getMonth() + months);
    $("#med-next", m.el).value = d.toISOString().slice(0, 10);
  };
  setNext();
  $("#med-check", m.el).addEventListener("change", setNext);
  $("#med-date", m.el).addEventListener("change", setNext);
  $("#med-form", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await api("/api/medical", { method: "POST", body: { worker_id: $("#med-worker", m.el).value, check_name: $("#med-check", m.el).value, done_on: $("#med-date", m.el).value, result: $("input[name=med-result]:checked", m.el).value, next_due: $("#med-next", m.el).value || null, note: $("#med-note", m.el).value } });
      m.close();
      toast(`Saved. Next due ${fmtDate(res.next_due)}.`, "good");
      if (onSaved) onSaved();
    } catch (err) { formError(m.el, err); }
  });
}

const REF_STATUS = { sent: ["Told to go", "due"], attended: ["Went", "watch"], closed: ["Closed", "clear"] };
function dueText(x) { return x.days < 0 ? `${plural(-x.days, "day")} overdue` : x.days === 0 ? "Due today" : `Due in ${plural(x.days, "day")}`; }

VIEWS.care = async () => {
  const [data, all] = await Promise.all([api("/api/medical"), api("/api/workers")]);
  if (S.page !== "care") return;
  const overdue = data.due.filter((d) => d.state === "overdue"), soon = data.due.filter((d) => d.state === "soon");
  const openRefs = data.referrals.filter((r) => r.status !== "closed");
  const row = (x) => `<a class="person" href="#/workers/${esc(x.id)}">${avatar(x)}<span class="person-main"><b>${esc(x.name)}</b><small>${esc(x.check)}</small><span class="why t-${x.state === "overdue" ? "action" : "due"}">${dueText(x)}</span></span><button class="btn btn-ghost btn-sm" type="button" data-rec="${esc(x.id)}">Record</button></a>`;
  $("#view").innerHTML = `<header class="page-head"><div><h1>Medical checks</h1><p class="lead">${overdue.length ? `<b>${plural(overdue.length, "check")}</b> ${overdue.length === 1 ? "is" : "are"} overdue` : "No checks are overdue"}${soon.length ? ` and <b>${soon.length}</b> ${soon.length === 1 ? "is" : "are"} due within 30 days` : ""}.</p></div>
      <div class="head-actions">${isDemoOrg() ? fictional("Fictional sample entries") : ""}<button class="btn btn-ink" id="med-new" type="button">${ic("plus", 18, 2)}Record a check</button></div></header>
    <div class="rail-grid">
      <div class="col">
        <section class="card"><div class="card-head"><h2>Overdue</h2><span class="sub">${overdue.length}</span></div>${overdue.length ? `<div class="people">${overdue.map(row).join("")}</div>` : `<div class="empty small">${ic("circle-check", 24)}<p>Nothing is overdue.</p></div>`}</section>
        <section class="card"><div class="card-head"><h2>Due in the next 30 days</h2><span class="sub">${soon.length}</span></div>${soon.length ? `<div class="people">${soon.map(row).join("")}</div>` : `<div class="empty small">${ic("calendar-check", 24)}<p>Nothing is due soon.</p></div>`}</section>
      </div>
      <aside class="col">
        <section class="card"><div class="card-head"><div><h2>Referrals</h2><p class="sub">People you told to go to a facility. Mark what happened.</p></div></div>
          ${openRefs.length ? `<div class="todo">${openRefs.map((r) => `<div class="todo-row"><span class="round sm bg-${REF_STATUS[r.status][1]} t-${REF_STATUS[r.status][1]}">${ic("route", 16, 2)}</span><div><b>${esc(r.worker_name || r.worker_id)}</b><small>${esc(r.facility_name)} · ${fmtDate(r.at, false)}</small></div><button class="btn btn-ghost btn-sm" type="button" data-ref="${r.id}" data-status="${r.status}">${r.status === "sent" ? "They went" : "Close"}</button></div>`).join("")}</div>` : `<div class="empty small">${ic("route", 24)}<p>No open referrals. Note one from a worker's record.</p></div>`}</section>
        ${data.never_checked ? `<section class="card legal"><div><span class="round bg-none t-none">${ic("users", 20, 2)}</span></div><div><h2>No check recorded</h2><p class="sub"><b>${data.never_checked}</b> ${data.never_checked === 1 ? "worker has" : "workers have"} no medical check recorded here yet.</p></div></section>` : ""}
      </aside>
    </div>`;
  const again = () => VIEWS.care();
  $("#med-new").addEventListener("click", () => openMedicalForm(all.workers, data.catalogue, null, again));
  $$("[data-rec]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); openMedicalForm(all.workers, data.catalogue, b.dataset.rec, again); }));
  $$("[data-ref]").forEach((b) => b.addEventListener("click", () => {
    const next = b.dataset.status === "sent" ? "attended" : "closed";
    const m = openModal(`<h2>${next === "attended" ? "They went to the facility" : "Close this referral"}</h2><form id="ref-form"><label class="field"><span>What was the outcome? (optional)</span><textarea id="ref-out" rows="3" maxlength="300" placeholder="For example: X-ray clear, come back in a year."></textarea></label><p class="form-error" role="alert" hidden></p><button class="btn btn-ink btn-full" type="submit">Save</button></form>`, "Update referral");
    $("#ref-form", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/referrals/${b.dataset.ref}`, { method: "POST", body: { status: next, outcome: $("#ref-out", m.el).value } }); m.close(); toast("Saved.", "good"); again(); } catch (err) { formError(m.el, err); }
    });
  }));
};

/* ---------------- Training and site checks ---------------- */
function openTrainingForm(data, course, onSaved) {
  const c = data.courses.find((x) => x.key === course) || data.courses[0];
  const m = openModal(`<h2>Record training</h2><p class="sub">Tick everyone who attended. It stays valid for the time shown.</p>
    <form id="tr-form">
      <div class="form-two"><label class="field"><span>Course</span><span class="select wide"><select id="tr-course">${data.catalogue.courses.map((x) => `<option value="${x.key}"${x.key === c.key ? " selected" : ""}>${esc(x.label)} (valid ${x.months} months)</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
      <label class="field"><span>Date</span><span class="input"><input id="tr-date" type="date" value="${todayIso()}" max="${todayIso()}" required></span></label></div>
      <div class="field"><span>Who attended? <button type="button" class="link-btn" id="tr-all">Tick everyone</button></span>
        <div class="ticks">${data.workers.map((w) => `<label><input type="checkbox" value="${esc(w.id)}"><span>${esc(w.name)}<small>${esc(w.job)}</small></span></label>`).join("") || `<p class="sub">No workers have joined yet.</p>`}</div></div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-ink btn-full" type="submit">Save</button>
    </form>`, "Record training");
  $("#tr-all", m.el).addEventListener("click", () => { const boxes = $$(".ticks input", m.el), on = boxes.some((b) => !b.checked); boxes.forEach((b) => { b.checked = on; }); });
  $("#tr-form", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = $$(".ticks input:checked", m.el).map((b) => b.value);
    if (!ids.length) return formError(m.el, new Error("Tick at least one person."));
    try {
      const res = await api("/api/training", { method: "POST", body: { course: $("#tr-course", m.el).value, done_on: $("#tr-date", m.el).value, worker_ids: ids } });
      m.close();
      toast(`Saved for ${plural(res.saved, "person", "people")}. Valid until ${fmtDate(res.valid_until)}.`, "good");
      onSaved();
    } catch (err) { formError(m.el, err); }
  });
}

const ITEM_STATE = { ok: ["In place", "clear"], missing: ["Missing", "action"], na: ["Not needed", "none"], unknown: ["Not checked", "none"], stale: ["Check again", "due"] };

VIEWS.compliance = async () => {
  const [tr, sc] = await Promise.all([api("/api/training"), api("/api/site-checks")]);
  if (S.page !== "compliance") return;
  const canEdit = S.user.role === "supervisor";
  const missing = sc.sites.reduce((n, s) => n + s.missing, 0);
  $("#view").innerHTML = `<header class="page-head"><div><h1>Training &amp; site checks</h1><p class="lead">${missing ? `<b>${plural(missing, "site item")}</b> ${missing === 1 ? "is" : "are"} missing.` : "No site items are marked missing."} Go through the list once a month.</p></div>
      <div class="head-actions">${isDemoOrg() ? fictional("Fictional sample entries") : ""}</div></header>
    <div class="two wide-left compliance">
      <div class="col">${sc.sites.map((s) => `<section class="card"><div class="card-head"><div><h2>${esc(s.name)}</h2><p class="sub">Is each of these in place today?</p></div><span class="pill sm ${s.missing ? "action" : s.unchecked ? "none" : "clear"}">${s.missing ? `${s.missing} missing` : s.unchecked ? `${s.unchecked} to check` : "All in place"}</span></div>
          <div class="checklist">${s.items.map((i) => `<div class="check-row ${i.status}"><span class="round sm bg-${ITEM_STATE[i.status][1]} t-${ITEM_STATE[i.status][1]}">${ic(i.icon, 16, 2)}</span><div><b>${esc(i.label)}</b><small class="t-${ITEM_STATE[i.status][1]}">${ITEM_STATE[i.status][0]}${i.checked_on ? ` · checked ${fmtDate(i.checked_on, false)}` : ""}</small></div>
            ${canEdit ? `<div class="yn"><button type="button" class="${i.status === "ok" ? "on yes" : ""}" data-site="${s.id}" data-item="${i.key}" data-v="ok">Yes</button><button type="button" class="${i.status === "missing" ? "on no" : ""}" data-site="${s.id}" data-item="${i.key}" data-v="missing">No</button></div>` : ""}</div>`).join("")}</div></section>`).join("") || `<section class="card empty">${ic("map-pin", 28)}<h2>No sites yet</h2><p>Add a site on the Team page.</p></section>`}</div>
      <div class="col"><section class="card"><div class="card-head"><div><h2>Training</h2><p class="sub">How many of ${tr.workers.length} workers hold each course.</p></div>${canEdit ? `<button class="btn btn-ghost btn-sm" type="button" id="tr-new">${ic("plus", 14, 2)}Record</button>` : ""}</div>
        <div class="courses">${tr.courses.map((c) => `<div class="course"><div class="course-top"><b>${esc(c.label)}</b><span>${c.done} of ${c.total}</span></div>
          <div class="bar"><i style="width:${c.total ? (c.done / c.total) * 100 : 0}%"></i></div>
          <small>${[c.expired ? `<span class="t-action">${c.expired} run out</span>` : "", c.expiring ? `<span class="t-due">${c.expiring} run out within 30 days</span>` : "", c.never ? `${c.never} never trained` : ""].filter(Boolean).join(" · ") || "Everyone is covered"}</small></div>`).join("")}</div></section></div>
    </div>`;
  const again = () => VIEWS.compliance();
  const btn = $("#tr-new");
  if (btn) btn.addEventListener("click", () => openTrainingForm(tr, null, again));
  $$("[data-item]").forEach((b) => b.addEventListener("click", async () => {
    try { await api("/api/site-checks", { method: "POST", body: { site_id: Number(b.dataset.site), item: b.dataset.item, status: b.dataset.v } }); again(); } catch (err) { toast(err.message, "action"); }
  }));
};

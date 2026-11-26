"use strict";
/* Team and invites: sites, people, and the codes that let workers and staff join. */
const joinLink = (code) => `${location.origin}${location.pathname}#/join/${code}`;

function showInvite(code, label) {
  const qr = qrcode(0, "M");
  qr.addData(joinLink(code));
  qr.make();
  const m = openModal(`<div class="invite-show"><h2>Share this code</h2><p class="sub">${esc(label)} Read it out, write it on the board, or let people scan it.</p>
    <div class="invite-code" aria-label="Invite code">${esc(code)}</div>
    <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true })}</div>
    <div class="invite-actions"><button class="btn btn-ghost" type="button" id="cp-code">${ic("copy", 16, 2)}Copy code</button><button class="btn btn-ghost" type="button" id="cp-link">${ic("link", 16, 2)}Copy link</button></div>
    <p class="fine">They open WorkCheck, choose "Join with a code" and type it in.</p></div>`, "Invite code");
  $("#cp-code", m.el).addEventListener("click", () => copyText(code));
  $("#cp-link", m.el).addEventListener("click", () => copyText(joinLink(code)));
}

function openInviteForm(data, onSaved) {
  const roles = [["worker", "Workers", "helmet"], ["clinician", "Clinic staff", "stethoscope"], ["supervisor", "Another supervisor", "user-check"]];
  const m = openModal(`<h2>Invite people</h2><p class="sub">You get a short code. Anyone with the code can join, so share it only with your team.</p>
    <form id="inv-form">
      <fieldset class="field"><legend>Who is it for?</legend>${radioChoices("inv-role", roles)}</fieldset>
      <div id="inv-worker"><div class="form-two">
        <label class="field"><span>Their job</span><span class="select wide"><select id="inv-job">${data.jobs.map((j) => `<option value="${j.id}">${esc(j.label)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
        <label class="field"><span>How many people?</span><span class="input"><input id="inv-uses" type="number" inputmode="numeric" min="1" max="500" value="20"></span></label></div></div>
      <label class="field"><span>Site</span><span class="select wide"><select id="inv-site">${data.sites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-ink btn-full" type="submit">Make the code</button>
    </form>`, "Invite people");
  const sync = () => { $("#inv-worker", m.el).hidden = $("input[name=inv-role]:checked", m.el).value !== "worker"; };
  $$("input[name=inv-role]", m.el).forEach((r) => r.addEventListener("change", sync));
  sync();
  $("#inv-form", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = $("input[name=inv-role]:checked", m.el).value;
    try {
      const res = await api("/api/org/invites", { method: "POST", body: { role, site_id: Number($("#inv-site", m.el).value), job_id: role === "worker" ? $("#inv-job", m.el).value : null, max_uses: role === "worker" ? Number($("#inv-uses", m.el).value) || 1 : 1 } });
      m.close();
      onSaved();
      showInvite(res.code, `Valid for ${res.expires_in_days} days.`);
    } catch (err) { formError(m.el, err); }
  });
}

VIEWS.team = async () => {
  const data = await api("/api/org");
  if (S.page !== "team") return;
  const welcome = S.welcome;
  S.welcome = false;
  const again = () => VIEWS.team();
  const workers = data.people.filter((p) => p.role === "worker"), staff = data.people.filter((p) => p.role !== "worker");
  $("#view").innerHTML = `<header class="page-head"><div><h1>${esc(data.org.name)}</h1><p class="lead">${esc(data.org.kind)} · ${plural(data.sites.length, "site")} · ${plural(data.workers, "worker")}</p></div>
      <div class="head-actions"><button class="btn btn-ink" id="inv-new" type="button">${ic("user-plus", 18, 2)}Invite people</button></div></header>
    ${welcome ? `<section class="next watch welcome"><span class="round">${ic("sparkles", 22, 2)}</span><div><h3>Your workplace is ready</h3><p>Next, invite your workers. They join with a short code and check in each morning.</p></div><button class="btn btn-ink" type="button" id="inv-first">Invite workers</button></section>` : ""}
    <div class="rail-grid">
      <div class="col">
        <section class="card"><div class="card-head"><div><h2>Invite codes</h2><p class="sub">Codes that still work. Cancel one if it was shared by mistake.</p></div></div>
          ${data.invites.length ? `<div class="todo">${data.invites.map((i) => `<div class="todo-row"><span class="round sm bg-indigo">${ic("ticket", 16, 2)}</span><div><b class="mono">${esc(i.code)}</b><small>${esc(i.role_name)}${i.job ? ` · ${esc(i.job)}` : ""}${i.site ? ` · ${esc(i.site)}` : ""} · used ${i.uses} of ${i.max_uses}</small></div><span class="row-actions"><button class="btn btn-ghost btn-sm" type="button" data-show="${esc(i.code)}">Show</button><button class="icon-btn" type="button" data-cancel="${esc(i.code)}" aria-label="Cancel code ${esc(i.code)}" data-tip="Cancel this code">${ic("trash", 16)}</button></span></div>`).join("")}</div>` : `<div class="empty small">${ic("ticket", 24)}<p>No codes yet. Use "Invite people" to make one.</p></div>`}</section>
        <section class="card"><div class="card-head"><h2>Workers</h2><span class="sub">${workers.length} joined</span></div>
          ${workers.length ? `<div class="team-list">${workers.map((p) => `<div class="team-row"><span class="av av${hash(String(p.id)) % 6}" aria-hidden="true">${esc(p.display_name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase())}</span><div><b>${esc(p.display_name)}</b><small>${p.site ? esc(p.site) : "No site"} · joined ${fmtDate(p.created_at, false)}</small></div></div>`).join("")}</div>` : `<div class="empty small">${ic("users", 24)}<p>${data.org.demo ? "The sample workers are fictional test records, so they are not listed as accounts." : "No one has joined yet."}</p></div>`}</section>
      </div>
      <aside class="col">
        <section class="card"><div class="card-head"><h2>Sites</h2><button class="btn btn-ghost btn-sm" type="button" id="site-new">${ic("plus", 14, 2)}Add</button></div>
          <div class="todo">${data.sites.map((s) => `<div class="todo-row"><span class="round sm bg-indigo">${ic("map-pin", 16, 2)}</span><div><b>${esc(s.name)}</b><small>Near ${esc(data.places[s.location_id] || s.location_id)}</small></div></div>`).join("")}</div></section>
        <section class="card"><div class="card-head"><h2>Staff</h2></div>
          <div class="team-list">${staff.map((p) => `<div class="team-row"><span class="av av${hash(String(p.id)) % 6}" aria-hidden="true">${esc(p.display_name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase())}</span><div><b>${esc(p.display_name)}</b><small>${esc(p.role_name)}</small></div></div>`).join("")}</div></section>
        <section class="card"><div class="card-head"><h2>Your password</h2></div><p class="sub">Changing it signs you out on every other device.</p><button class="btn btn-ghost btn-sm pw-btn" type="button" id="pw-change">${ic("key", 14, 2)}Change password</button></section>
      </aside>
    </div>`;
  const invite = () => openInviteForm(data, again);
  $("#inv-new").addEventListener("click", invite);
  if ($("#inv-first")) $("#inv-first").addEventListener("click", invite);
  $$("[data-show]").forEach((b) => b.addEventListener("click", () => showInvite(b.dataset.show, "")));
  $$("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/api/org/invites/${encodeURIComponent(b.dataset.cancel)}`, { method: "DELETE" }); toast("Code cancelled."); again(); } catch (err) { toast(err.message, "action"); }
  }));
  $("#site-new").addEventListener("click", () => {
    const m = openModal(`<h2>Add a site</h2><form id="site-form"><label class="field"><span>What do people call it?</span><span class="input">${ic("map-pin", 18)}<input id="site-name" required maxlength="80" placeholder="For example, Yard B"></span></label>
      <label class="field"><span>Nearest place in Kachchh</span><span class="select wide"><select id="site-place">${Object.entries(data.places).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
      <p class="form-error" role="alert" hidden></p><button class="btn btn-ink btn-full" type="submit">Add site</button></form>`, "Add a site");
    $("#site-form", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/org/sites", { method: "POST", body: { name: $("#site-name", m.el).value.trim(), location_id: $("#site-place", m.el).value } }); m.close(); toast("Site added.", "good"); again(); } catch (err) { formError(m.el, err.status === 422 ? new Error("Enter a name for the site.") : err); }
    });
  });
  $("#pw-change").addEventListener("click", () => {
    const m = openModal(`<h2>Change password</h2><form id="pw-form"><label class="field"><span>Current password</span><span class="input">${ic("lock", 18)}<input id="pw-old" type="password" autocomplete="current-password" required></span></label>${pwField("pw-new", "New password")}<p class="form-error" role="alert" hidden></p><button class="btn btn-ink btn-full" type="submit">Change password</button></form>`, "Change password");
    wirePassword(m.el, "pw-new");
    $("#pw-form", m.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const res = await api("/api/auth/password", { method: "POST", body: { current: $("#pw-old", m.el).value, new: $("#pw-new", m.el).value } }); m.close(); toast(res.message, "good"); } catch (err) { formError(m.el, err); }
    });
  });
};

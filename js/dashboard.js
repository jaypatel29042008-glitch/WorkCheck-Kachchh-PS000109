"use strict";
/* Daily check-ins: one page that says how people are today and what needs doing, in plain words. */
const FEEL_FILL = { 1: "#34C48B", 2: "#8E99F7", 3: "#F5A524", 4: "#E5484D" };

function feelingBar(d) {
  const total = d.checked_in;
  if (!total) return `<div class="empty small">${ic("clipboard-check", 24)}<p>No one has checked in yet today.</p></div>`;
  const parts = [1, 2, 3, 4].filter((k) => d.feelings[k]);
  return `<div class="feelbar" role="img" aria-label="${esc(parts.map((k) => `${d.feeling_labels[k]}: ${d.feelings[k]}`).join(", "))}">${parts.map((k) => `<i style="flex:${d.feelings[k]};background:${FEEL_FILL[k]}" data-tip="${esc(`${d.feeling_labels[k]}: ${d.feelings[k]} of ${total}`)}"></i>`).join("")}</div>
    <div class="feelkey">${[1, 2, 3, 4].map((k) => `<div><span><i style="background:${FEEL_FILL[k]}"></i>${esc(d.feeling_labels[k])}</span><b>${d.feelings[k]}</b></div>`).join("")}</div>`;
}

/* Two weeks of check-ins as thin bars. The amber cap is the people who said they were not well. */
function trendBars(trend) {
  const max = Math.max(1, ...trend.map((t) => t.checked_in));
  const W = 560, H = 120, gap = 10, bw = (W - gap * (trend.length - 1)) / trend.length, base = H - 22;
  const bars = trend.map((t, i) => {
    const x = i * (bw + gap), h = (t.checked_in / max) * (base - 6), hu = (t.unwell / max) * (base - 6);
    const tip = `${dayName(t.day)} ${fmtDate(t.day, false)}: ${t.checked_in} checked in, ${t.unwell} not well`;
    return `<g data-tip="${esc(tip)}"><rect x="${num(x)}" y="0" width="${num(bw)}" height="${H}" fill="transparent"/>
      ${t.checked_in ? `<rect x="${num(x)}" y="${num(base - h)}" width="${num(bw)}" height="${num(h)}" rx="4" fill="#C9CFFA"/>` : `<rect x="${num(x)}" y="${base - 2}" width="${num(bw)}" height="2" rx="1" fill="#DFE2EE"/>`}
      ${t.unwell ? `<rect x="${num(x)}" y="${num(base - hu)}" width="${num(bw)}" height="${num(hu)}" rx="4" fill="#F5A524"/>` : ""}
      <text x="${num(x + bw / 2)}" y="${H - 5}" text-anchor="middle" class="axis">${i % 2 === 0 || i === trend.length - 1 ? Number(t.day.slice(8)) : ""}</text></g>`;
  }).join("");
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Check-ins over the last 14 days">${bars}</svg>${legend([["Checked in", "#C9CFFA"], ["Said they were not well", "#F5A524"]])}`;
}

function startChecklist(d) {
  const site = d.sites[0];
  const steps = [
    ["Create your workplace", true, null],
    ["Invite your workers", d.workers_total > 0, "#/team"],
    ["Get the first check-in", d.trend.some((t) => t.checked_in > 0), "#/team"],
    ["Check what is on site", Boolean(site) && site.unchecked < site.items.length, "#/compliance"],
  ];
  const done = steps.filter((s) => s[1]).length;
  if (done === steps.length) return "";
  const next = steps.findIndex((s) => !s[1]);
  return `<section class="card start"><div class="card-head"><div><h2>Getting started</h2><p class="sub">${done} of ${steps.length} done</p></div><div class="start-bar"><i style="width:${(done / steps.length) * 100}%"></i></div></div>
    <ol class="start-list">${steps.map(([text, ok, href], i) => `<li class="${ok ? "done" : i === next ? "on" : ""}"><span>${ok ? ic("check", 14, 2.6) : i + 1}</span><b>${text}</b>${!ok && i === next && href ? `<a class="btn btn-ink btn-sm" href="${href}">Do this now ${ic("arrow-right", 14, 2)}</a>` : ""}</li>`).join("")}</ol></section>`;
}

VIEWS.dashboard = async () => {
  const d = await api("/api/dashboard");
  if (S.page !== "dashboard") return;
  const staff = S.user.role !== "ddo";
  const demo = Boolean(d.org.demo);
  const rate = d.workers_total ? Math.round((d.checked_in / d.workers_total) * 100) : 0;
  const tiles = [
    ["indigo", "clipboard-check", "Checked in today", `${d.checked_in}`, `of ${d.workers_total} workers (${rate}%)`, "watch"],
    ["amber", "mood-sad", "Not well today", `${d.unwell_count}`, d.unwell_count ? "Said so in their check-in" : "No one said they were unwell", "due"],
    ["rose", "first-aid-kit", "Open incidents", `${d.incidents.open}`, d.incidents.open ? "Waiting to be closed" : "Nothing open", "action"],
    ["green", "stethoscope", "Medical checks overdue", `${d.medical.overdue}`, d.medical.soon ? `${d.medical.soon} more due within 30 days` : "None due in the next 30 days", "clear"],
  ];
  const lead = d.workers_total
    ? `<b>${d.checked_in} of ${d.workers_total}</b> workers have checked in today${d.unwell_count ? `, and <b>${d.unwell_count}</b> said they are not well` : ""}.`
    : "No workers have joined yet. Invite them to start seeing check-ins here.";
  $("#view").innerHTML = `<header class="page-head"><div><h1>${staff && !S.user.org.demo ? `${greeting()}, ${esc(S.user.name.split(" ")[0])}` : "Daily check-ins"}</h1><p class="lead">${lead}</p></div>
      <div class="head-actions">${demo ? `<span class="pill none" data-tip="These check-ins, incidents and training records are made up so the page has something to show.">${ic("info-circle", 14, 2)}Fictional sample entries</span>` : ""}${!staff ? `<span class="pill none" data-tip="The district office sees counts only, never names.">Totals only</span>` : ""}</div></header>
    ${!demo && staff ? startChecklist(d) : ""}
    <section class="card needs"><div class="card-head"><h2>What needs you today</h2><span class="sub">${fmtDate(d.day)}</span></div>
      <div class="needs-list">${d.todo.map((t) => `<${t.href && staff ? `a href="${t.href}"` : "div"} class="need ${t.tone}"><i></i><span>${esc(t.text)}</span>${t.href && staff && t.href !== "#/dashboard" ? ic("chevron-right", 18) : ""}</${t.href && staff ? "a" : "div"}>`).join("")}</div></section>
    <div class="tiles4 dash-tiles">${tiles.map(([tone, icon, label, n, hint, t]) => `<div class="tile ${tone} still"><span class="round t-${t}">${ic(icon, 19, 2)}</span><span class="tile-label">${label}</span><span class="tile-n">${n}</span><span class="tile-hint">${esc(hint)}</span></div>`).join("")}</div>
    <div class="rail-grid">
      <div class="col">
        <section class="card"><div class="card-head"><div><h2>How people feel today</h2><p class="sub">From this morning's check-ins.</p></div></div>${feelingBar(d)}</section>
        ${staff ? `<section class="card"><div class="card-head"><h2>Not well today</h2><span class="sub">${d.unwell.length ? plural(d.unwell.length, "person", "people") : ""}</span></div>
          ${d.unwell.length ? `<div class="people">${d.unwell.map((u) => `<${S.user.role === "clinician" ? `a href="#/workers/${esc(u.worker_id)}"` : "div"} class="person">${avatar({ id: u.worker_id, initials: u.initials, icon: u.icon })}<span class="person-main"><b>${esc(u.name)}</b><small>${esc(u.job)}</small><span class="why t-${u.tone}">${u.urgent ? ic("alert-triangle", 13, 2.2) : ""}${esc(u.feeling_label)}${u.symptoms.length ? `: ${esc(u.symptoms.join(", ").toLowerCase())}` : ""}</span></span>${S.user.role === "clinician" ? ic("chevron-right", 18) : ""}</${S.user.role === "clinician" ? "a" : "div"}>`).join("")}</div>` : `<div class="empty small">${ic("circle-check", 24)}<p>No one said they were unwell today.</p></div>`}</section>` : ""}
        <section class="card"><div class="card-head"><div><h2>Last 14 days</h2><p class="sub">How many people checked in each day.</p></div></div>${trendBars(d.trend)}</section>
      </div>
      <aside class="col">
        <section class="card"><div class="card-head"><div><h2>Safety gear today</h2><p class="sub">Who said they went without.</p></div></div>
          ${d.ppe.length ? `<div class="gear">${d.ppe.map((g) => `<div class="gear-row"${g.names && g.names.length ? ` data-tip="${esc(g.names.join(", "))}"` : ""}><span class="round xs bg-${g.missing ? "due t-due" : "clear t-clear"}">${ic(g.icon, 14, 2)}</span><span>${esc(g.label)}</span><b class="${g.missing ? "t-due" : "t-clear"}">${g.missing ? `${g.missing} without` : "All had it"}</b></div>`).join("")}</div>` : `<div class="empty small">${ic("helmet", 24)}<p>Shows up after the first check-ins.</p></div>`}</section>
        <section class="card"><div class="card-head"><h2>On site</h2>${staff ? `<a class="link" href="#/compliance">Open ${ic("arrow-right", 15, 2)}</a>` : ""}</div>
          ${d.sites.map((s) => `<div class="site-sum"><b>${esc(s.name)}</b><span class="${s.missing ? "t-due" : s.unchecked ? "t-none" : "t-clear"}">${s.missing ? `${plural(s.missing, "item")} missing` : s.unchecked ? `${plural(s.unchecked, "item")} not checked` : "Everything in place"}</span></div>`).join("") || `<div class="empty small"><p>No sites yet.</p></div>`}
          <div class="site-sum"><b>Training</b><span class="${d.training.expired ? "t-due" : "t-none"}">${d.training.expired ? `${plural(d.training.expired, "record")} run out` : d.training.never ? `${plural(d.training.never, "worker")} with none recorded` : "Up to date"}</span></div></section>
        ${staff && d.incidents.list.length ? `<section class="card"><div class="card-head"><h2>Open incidents</h2><a class="link" href="#/incidents">See all ${ic("arrow-right", 15, 2)}</a></div>
          <div class="todo">${d.incidents.list.map((i) => `<div class="todo-row"><span class="round sm bg-${i.tone} t-${i.tone}">${ic(i.icon, 16, 2)}</span><div><b>${esc(i.kind_label)}</b><small>${fmtDate(i.at, false)} · ${esc(i.what.slice(0, 70))}${i.what.length > 70 ? "…" : ""}</small></div></div>`).join("")}</div></section>` : ""}
      </aside>
    </div>`;
};

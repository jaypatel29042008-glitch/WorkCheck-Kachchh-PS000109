"use strict";
function levelTiles(o, linked) {
  return `<div class="tiles4">${Object.entries(LEVELS).map(([k, l]) => {
    const inner = `<span class="round t-${k}">${ic(l.icon, 19, 2)}</span><span class="tile-label">${l.label}</span><span class="tile-n">${o.levels[k]}</span><span class="tile-hint">${l.hint}</span>`;
    return linked ? `<a class="tile ${l.tile}" href="#/workers" data-level="${k}">${inner}</a>` : `<div class="tile ${l.tile} still">${inner}</div>`;
  }).join("")}</div>`;
}

function trackerCard(o, title) {
  return `<section class="card"><div class="card-head"><div><h2>${title}</h2><p class="sub">How much of each kind of check is done, by part of the body.</p></div></div>
    <div class="tracker">
      <div class="tr-head"><span>Check</span><span>Share</span><span>Done</span><span>Missed or open</span><span>Due</span></div>
      ${o.checks.map((c) => `<div class="tr-row">
        <span class="tr-name"><span class="round sm bg-indigo">${ic(c.icon, 16, 2)}</span>${esc(c.label)}</span>
        <span>${ring(c.done, c.done + c.missed + c.due, 40)}</span>
        <span class="tr-num">${c.done}</span>
        <span>${c.missed ? pill("action", String(c.missed), true) : `<span class="tr-zero">0</span>`}</span>
        <span>${c.due ? pill("due", String(c.due), true) : `<span class="tr-zero">0</span>`}</span>
      </div>`).join("")}
    </div></section>`;
}

function siteMiniCard(node) {
  const r = node.latest, heavy = r.jobs[0], cab = r.jobs[2];
  return `<section class="card site-mini"><div class="card-head"><h2>Site right now</h2><span class="pill none sm">${esc(sourceLabel(r.source))}</span></div>
    <div class="site-mini-gauge">${gauge(r.wbgt_c, 240)}<div class="site-mini-num"><b>${r.wbgt_c}°C</b><span>Heat index at ${esc(r.site_name)}</span></div></div>
    <p class="site-mini-title">${lamp(heavy.lamp)}Heavy outdoor work: ${esc(heavy.title.toLowerCase())}</p>
    <p class="sub">${lamp(cab.lamp)}Shaded cabs: ${esc(cab.title.toLowerCase())}</p>
    <a class="link" href="#/site">Open site monitor ${ic("arrow-right", 16, 2)}</a></section>`;
}

VIEWS.today = async () => {
  const [o, node, jobs] = await Promise.all([api("/api/overview"), api("/api/node/state"), api("/api/heat/jobs")]);
  if (S.page !== "today") return;
  const open = o.levels.action + o.levels.due;
  if (S.user.role === "ddo") return renderDistrict(o, node, jobs);
  $("#view").innerHTML = `<header class="page-head"><div><h1>${greeting()}, ${esc(S.user.name)}</h1><p class="lead"><b>${o.levels.action} workers</b> need action and <b>${o.levels.due}</b> have a check due. Start with the "See first" list.</p></div>${fictional("Fictional test workers, 2025")}</header>
    <div class="rail-grid">
      <div class="col">
        ${levelTiles(o, true)}
        <section class="card" id="year-card"></section>
        ${trackerCard(o, "Check tracker")}
      </div>
      <aside class="col">
        <section class="card"><div class="card-head"><h2>See first</h2><span class="sub">${open} waiting</span></div>
          <div class="people">${o.first.map((c) => `<a class="person" href="#/workers/${esc(c.id)}">${avatar(c)}<span class="person-main"><b>${esc(c.name)}</b><small>${esc(c.job)}</small><span class="why t-${c.level}">${esc(c.headline)}${c.more ? ` <em>+${c.more}</em>` : ""}</span></span>${ic("chevron-right", 18)}</a>`).join("")}</div>
          <a class="link" href="#/workers">See all workers ${ic("arrow-right", 16, 2)}</a></section>
        ${siteMiniCard(node)}
        <section class="card legal"><div>${ring(o.legal.done, o.legal.total, 64, "#12A0A4")}</div><div><h2>Yearly legal exams</h2><p class="sub"><b>${o.legal.done} of ${o.legal.total}</b> workers under a yearly exam rule were seen. In Gujarat factories and construction, it is due within 120 days of 1 January.</p></div></section>
      </aside>
    </div>`;
  $$("[data-level]").forEach((a) => a.addEventListener("click", () => { S.wf.level = a.dataset.level; S.workers = null; }));
  await mountYearChart($("#year-card"), jobs.jobs);
};

async function renderDistrict(o, node, jobs) {
  const map = await loadMap();
  if (S.page !== "today") return;
  const bands = ["#EEF0F8", "#D6DBFB", "#AEB7F8", "#7E8CF4", "#4656E6"];
  const byName = Object.fromEntries(o.talukas.map((t) => [t.taluka, t]));
  $("#view").innerHTML = `<header class="page-head"><div><h1>${greeting()}, ${esc(S.user.name)}</h1><p class="lead"><b>${o.levels.action + o.levels.due} of ${o.total}</b> test workers have follow-up waiting. You see totals only, no names.</p></div>
      <div class="head-actions">${fictional()}<a class="btn btn-ink" href="/api/export/district.csv">${ic("download", 18, 2)}Export</a></div></header>
    <div class="rail-grid">
      <div class="col">
        ${levelTiles(o, false)}
        <section class="card"><div class="card-head"><div><h2>Where follow-up is waiting</h2><p class="sub">Open follow-ups by taluka. Test workers are placed in only 5 talukas.</p></div></div>
          <div id="ddo-map" class="map-wrap">${mapSvg(map, { pins: [] })}</div>
          ${legend([["None", bands[0]], ["1 to 4", bands[1]], ["5 to 9", bands[2]], ["10 to 19", bands[3]], ["20 or more", bands[4]]])}
          <p class="fine">${esc(map.credit)}</p></section>
        <section class="card" id="year-card"></section>
      </div>
      <aside class="col">
        <section class="card"><div class="card-head"><h2>By taluka</h2><span class="pill none sm" data-tip="Counts under 5 are hidden so no person can be identified.">Under 5 hidden</span></div>
          <div class="tal-list">${o.talukas.map((t) => `<div class="tal-row"><span>${esc(t.taluka)}</span><b>${esc(t.open)}</b><small>of ${esc(t.tracked)} tracked</small></div>`).join("")}</div></section>
        ${siteMiniCard(node)}
      </aside>
    </div>
    <div class="section-gap">${trackerCard(o, "Check tracker")}</div>`;
  $$("#ddo-map .tal").forEach((p) => {
    const t = byName[p.dataset.name];
    p.style.fill = bands[t ? t.band : 0];
    p.addEventListener("mousemove", (e) => showTip(`<div class="tip-title">${esc(p.dataset.name)}</div>${t ? `${esc(t.open)} open of ${esc(t.tracked)} tracked` : "No test workers here"}`, e.clientX, e.clientY));
    p.addEventListener("mouseleave", hideTip);
    p.setAttribute("data-tip-custom", "1");
  });
  await mountYearChart($("#year-card"), jobs.jobs);
}

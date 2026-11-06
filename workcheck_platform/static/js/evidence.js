"use strict";
/* Evidence: why this matters, how to read the numbers, and when an alert fires. */
const HARM = [
  { match: "Workers' families", big: "238", title: "silicosis deaths in a compensation order", tone: "rose" },
  { match: "Silicosis cases identified", big: "182", title: "silicosis cases, 80 of them deaths", tone: "amber" },
  { match: "Heatstroke deaths", big: "84+", title: "heatstroke deaths, 10 in Gujarat", tone: "indigo" },
  { match: "Salt-pan workers exceeding", big: "87.5%", title: "of salt-pan workers over the heat limit", tone: "green" },
];
const CLASSES = {
  OFFICIAL: ["Official", "Government records and published rules", "#4656E6"],
  PUBLIC_MEASURED: ["Measured elsewhere", "Real measurements from other places or studies", "#12A0A4"],
  MODEL: ["Model", "Weather and air estimates, not sensors on site", "#8E99F7"],
  DERIVED: ["Worked out", "Calculated by us from the data above", "#A78BDA"],
  RULE: ["Rule", "Heat and work limits from published tables", "#5A6075"],
  ASSUMPTION: ["Assumption", "A stated guess that a real pilot must check", "#F5A524"],
  FICTIONAL: ["Fictional", "Made-up test workers and their events", "#E5484D"],
};
const ALERT_ICONS = { "Noise dose": "volume", "UV dose": "sun", Hydration: "droplet", "Work hours": "clock-hour-9", "Combined workload": "activity" };
const ALERT_STATUS = {
  "RULE and placeholder": ["Limit is real, trigger is a placeholder", "due"],
  Placeholder: ["Placeholder until a doctor reviews", "due"],
  "Evidence and placeholder": ["Evidence-based, trigger is a placeholder", "due"],
  "Untested proposal": ["Untested idea", "none"],
  OFFICIAL: ["WHO / ICNIRP standard", "clear"],
  "Published standard": ["WHO / ICNIRP standard", "clear"]
};

VIEWS.evidence = async () => {
  const [e, store] = await Promise.all([api("/api/evidence"), api("/api/storage")]);
  if (S.page !== "evidence") return;
  const counts = {};
  e.dictionary.forEach((d) => { counts[d.data_class] = (counts[d.data_class] || 0) + 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const silica = e.silica.filter((s) => s.samples >= 30);
  const xMax = 110;
  const pos = (v) => `${Math.min(100, (v / xMax) * 100)}%`;
  $("#view").innerHTML = `<header class="page-head"><div><h1>Evidence</h1><p class="lead">Real harm comes from published sources. Everything else in this tool is labelled for what it is.</p></div></header>
    <div class="tiles4 harm">${HARM.map((h) => {
      const row = e.evidence.find((x) => x.finding.startsWith(h.match));
      return `<a class="tile ${h.tone}" href="${esc(row.source)}" target="_blank" rel="noopener"><span class="tile-n big">${h.big}</span><span class="tile-label">${esc(h.title)}</span><span class="tile-hint">${esc(row.context)} ${ic("external-link", 12, 2)}</span></a>`;
    }).join("")}</div>
    <div class="two">
      <section class="card"><div class="card-head"><div><h2>How to read our numbers</h2><p class="sub">Every one of the ${total} data tables carries one of these labels.</p></div></div>
        <div class="classbar" role="img" aria-label="Data tables by type">${Object.entries(CLASSES).filter(([k]) => counts[k]).map(([k, [n, , c]]) => `<i style="flex:${counts[k]};background:${c}" data-tip="${esc(n)}: ${counts[k]} tables"></i>`).join("")}</div>
        <div class="classes">${Object.entries(CLASSES).filter(([k]) => counts[k]).map(([k, [n, d, c]]) => `<div class="class-row"><i style="background:${c}"></i><div><b>${n}</b><small>${d}</small></div><span>${counts[k]}</span></div>`).join("")}</div>
      </section>
      <section class="card"><div class="card-head"><div><h2>How dusty is each industry?</h2><p class="sub">Respirable silica in US mine samples, middle half to high end. Worked out from dust samples, not measured in Kachchh.</p></div></div>
        <div class="dumbbells">${silica.map((s) => `<div class="db" data-tip="${esc(s.commodity_group)}: typical ${s.derived_silica_p50_ug_m3}, high end ${s.derived_silica_p90_ug_m3} µg/m³, ${s.samples.toLocaleString()} samples. ${s.pct_over_50_ug_m3}% over 50."><span class="db-name">${esc(s.commodity_group)}</span><span class="db-track"><u style="left:${pos(50)}"></u><i style="left:${pos(s.derived_silica_p50_ug_m3)};width:calc(${pos(s.derived_silica_p90_ug_m3)} - ${pos(s.derived_silica_p50_ug_m3)})"></i><b style="left:${pos(s.derived_silica_p50_ug_m3)}"></b><b class="hi" style="left:${pos(s.derived_silica_p90_ug_m3)}"></b></span><span class="db-val">${Math.round(s.derived_silica_p90_ug_m3)}</span></div>`).join("")}</div>
        ${legend([["Typical (middle sample)", "#AEB7F8"], ["High end (top 10%), number shown in µg/m³", "#4656E6"], ["50 µg/m³ US limit", "#E5A3AF"]])}
      </section>
    </div>
    <section class="card"><div class="card-head"><div><h2>When an alert fires</h2><p class="sub">An alert asks for a check. It never says someone is ill.</p></div></div>
      <div class="rules">
        <div class="rule"><span class="round sm bg-indigo">${ic("temperature-sun", 17, 2)}</span><h3>Heat</h3><p><b>When:</b> the heat index passes the limit for that job's workload.</p><p><b>Then:</b> the lamp changes and the work and rest plan updates.</p><span class="pill clear sm">Published work-rest table</span></div>
        <div class="rule"><span class="round sm bg-indigo">${ic("wind", 17, 2)}</span><h3>Dust</h3><p><b>When:</b> PM10 goes above 100 µg/m³.</p><p><b>Then:</b> check water spray and masks. This sensor does not measure silica.</p><span class="pill due sm">Placeholder level</span></div>
        ${e.parameters.map((r) => {
          const [text, tone] = ALERT_STATUS[r.basis_type] || [r.basis_type, "none"];
          return `<div class="rule"><span class="round sm bg-indigo">${ic(ALERT_ICONS[r.parameter] || "activity", 17, 2)}</span><h3>${esc(r.parameter)}</h3><p><b>When:</b> ${esc(r.trigger)}.</p><p><b>Then:</b> ${esc(r.action)}.</p><span class="pill ${tone} sm" data-tip="${esc(r.limits || "")}">${esc(text)}</span></div>`;
        }).join("")}
      </div>
    </section>
    <details class="card history"><summary><h2>All published findings</h2><span class="sub">${e.evidence.length} findings ${ic("chevron-down", 16, 2)}</span></summary>
      <div class="ev-list">${e.evidence.map((x) => `<a href="${esc(x.source)}" target="_blank" rel="noopener"><span><b>${esc(x.value)}</b><small>${esc(x.finding)}. ${esc(x.context)}.</small></span>${ic("external-link", 15, 2)}</a>`).join("")}</div></details>
    <details class="card history"><summary><h2>Public data sources</h2><span class="sub">${e.sources.length} sources ${ic("chevron-down", 16, 2)}</span></summary>
      <div class="ev-list">${e.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span><b>${esc(x.source)}</b><small>${esc(x.coverage)}. Limit: ${esc(x.limit_for_kachchh)}.</small></span>${ic("external-link", 15, 2)}</a>`).join("")}</div></details>
    <section class="storage">${ic("database", 18)}<span><b>Where data is kept:</b> ${store.reference_tables} read-only reference tables, plus a separate database for what people add: accounts (${store.runtime.users}), sensor readings (${store.runtime.readings}), check results (${store.runtime.condition_updates}), symptom reports (${store.runtime.symptom_reports}) and logged actions (${store.runtime.access_log}).</span></section>`;
};

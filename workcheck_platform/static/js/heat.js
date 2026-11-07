"use strict";
/* Heat & Dust Multi-Hazard Map: Shaded talukas by Compound Double-Hazard, Heat Stress (WBGT), and Dust (PM10). */
VIEWS.heat = async () => {
  const [map, data, jobs] = await Promise.all([loadMap(), api("/api/heat/map"), api("/api/heat/jobs")]);
  if (S.page !== "heat") return;

  const byLoc = Object.fromEntries(data.locations.map((l) => [l.location_id, l]));
  const getTalLoc = (taluka) => byLoc[data.taluka_location[taluka]] || data.locations[0];

  const hoursFor = (taluka, mode, month) => getTalLoc(taluka).months[mode][month];
  const pm10For = (taluka, month) => (getTalLoc(taluka).dust_pm10 || [])[month] || 0;
  const pm25For = (taluka, month) => (getTalLoc(taluka).dust_pm25 || [])[month] || 0;
  const dustDaysFor = (taluka, month) => (getTalLoc(taluka).dust_days || [])[month] || 0;
  const wbgtFor = (taluka, month) => (getTalLoc(taluka).max_wbgt || [])[month] || 0;
  const compoundFor = (taluka, month) => (getTalLoc(taluka).compound_score || [])[month] || 0;
  const compoundDaysFor = (taluka, month) => (getTalLoc(taluka).compound_days || [])[month] || 0;

  const state = { layer: "compound", mode: "heavy", month: 4, timer: null };
  const maxJob = 9;

  const RAMPS = {
    compound: {
      left: "Low risk (0)",
      right: "Severe double-hazard (100)",
      grad: "linear-gradient(90deg,rgb(240,253,244),rgb(254,240,138),rgb(251,146,60),rgb(225,29,72),rgb(107,33,168))",
    },
    heat: {
      left: "0 safe hours (Extreme)",
      right: "9 safe hours (Mild)",
      grad: "linear-gradient(90deg,rgb(196,48,82),rgb(229,90,104),rgb(244,133,118),rgb(251,196,176),rgb(255,241,234))",
    },
    dust: {
      left: "Clean (<20 µg/m³)",
      right: ">100 µg/m³ (NAAQS limit)",
      grad: "linear-gradient(90deg,rgb(240,253,244),rgb(254,240,138),rgb(251,146,60),rgb(225,29,72),rgb(107,33,168))",
    },
  };

  $("#view").innerHTML = `
    <header class="page-head">
      <div>
        <h1>Heat &amp; Dust Multi-Hazard Map</h1>
        <p class="lead" id="heat-lead"></p>
      </div>
      <span class="pill none" data-tip="${esc(data.label)}">${ic("info-circle", 14, 2)}ERA5 Heat + CAMS Dust (2025)</span>
    </header>
    <section class="card map-card">
      <div class="map-controls">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="seg" id="layer-seg">
            <button type="button" data-layer="compound" class="on">${ic("flame", 14, 2)}Compound (Heat + Dust)</button>
            <button type="button" data-layer="heat">${ic("sun", 14, 2)}Heat stress</button>
            <button type="button" data-layer="dust">${ic("wind", 14, 2)}Dust (PM10)</button>
          </div>
          <div class="seg" id="mode-seg">
            ${data.modes.map((m) => `<button type="button" data-mode="${m.key}"${m.key === state.mode ? ' class="on"' : ""}>${esc(m.label)}</button>`).join("")}
          </div>
        </div>
        <div class="months">
          <button class="icon-btn play" id="heat-play" type="button" aria-label="Play through the year">${ic("player-play", 16, 2)}</button>
          ${MONTHS.map((m, i) => `<button type="button" data-month="${i}"${i === state.month ? ' class="on"' : ""}>${m}</button>`).join("")}
        </div>
      </div>
      <div class="map-body">
        <div>
          <div class="map-wrap" id="heat-map">${mapSvg(map, { pins: [["kandla_port", "Kandla Port", 12, 22], ["mundra_port", "Mundra Port", 12, -6], ["little_rann_kutch", "Little Rann", -44, 26]] })}</div>
          <div class="ramp" id="heat-ramp">
            <span id="ramp-left"></span>
            <i id="ramp-grad"></i>
            <span id="ramp-right"></span>
          </div>
          <p class="fine">${esc(map.credit)} Modeled across all 10 Kachchh talukas for 9am–6pm shift. Heat = Open-Meteo ERA5; Dust = CAMS aerosols.</p>
        </div>
        <div class="rank" id="heat-rank"></div>
      </div>
    </section>
    <div class="two wide-left">
      <section class="card" id="year-card"></section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Who loses the most hours</h2>
            <p class="sub">Average safe hours a shift, April to October.</p>
          </div>
        </div>
        <div class="jobbars">
          ${jobs.jobs.map((j) => `
            <div class="jobbar">
              <span class="round xs bg-indigo">${ic(j.icon, 15, 2)}</span>
              <div class="jobbar-main">
                <div class="jobbar-top">
                  <span>${esc(j.label)}<small> ${esc(j.place)}</small></span>
                  <b>${j.allowed_h_apr_oct.toFixed(1)} h</b>
                </div>
                <div class="bar"><i style="width:${(j.allowed_h_apr_oct / maxJob) * 100}%"></i></div>
              </div>
            </div>`).join("")}
        </div>
      </section>
    </div>`;

  const getTalukaStats = (talName) => ({
    name: talName,
    h: hoursFor(talName, state.mode, state.month),
    pm10: pm10For(talName, state.month),
    pm25: pm25For(talName, state.month),
    dustDays: dustDaysFor(talName, state.month),
    score: compoundFor(talName, state.month),
    cDays: compoundDaysFor(talName, state.month),
    wbgt: wbgtFor(talName, state.month),
  });

  const paint = () => {
    const rampCfg = RAMPS[state.layer];
    $("#ramp-left").textContent = rampCfg.left;
    $("#ramp-right").textContent = rampCfg.right;
    $("#ramp-grad").style.background = rampCfg.grad;

    const rows = map.talukas.map((t) => getTalukaStats(t.name));

    // Sort according to active layer
    if (state.layer === "compound") {
      rows.sort((a, b) => b.score - a.score);
    } else if (state.layer === "heat") {
      rows.sort((a, b) => a.h - b.h); // lowest safe hours first
    } else {
      rows.sort((a, b) => b.pm10 - a.pm10); // highest dust first
    }

    const hs = rows.map((r) => r.h);
    const pm10s = rows.map((r) => r.pm10);
    const scores = rows.map((r) => r.score);
    const minH = Math.min(...hs).toFixed(1), maxH = Math.max(...hs).toFixed(1);
    const minPm = Math.min(...pm10s).toFixed(0), maxPm = Math.max(...pm10s).toFixed(0);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const totalCompoundDays = rows.reduce((acc, r) => acc + r.cDays, 0);

    const modeName = data.modes.find((m) => m.key === state.mode).label.toLowerCase();

    if (state.layer === "compound") {
      const riskWord = avgScore >= 75 ? "Severe" : avgScore >= 50 ? "High" : avgScore >= 25 ? "Moderate" : "Low";
      $("#heat-lead").innerHTML = `In <b>${MONTHS[state.month]}</b>, Compound Double-Hazard is <b>${riskWord}</b> across Kachchh (test score <b>${avgScore}/100</b>, not yet validated). Heavy work safe hours: <b>${minH}–${maxH} h/shift</b>; ambient PM10: <b>${minPm}–${maxPm} µg/m³</b>${totalCompoundDays > 0 ? ` with <b>${totalCompoundDays} compound double-hazard days</b>` : ""}.`;
    } else if (state.layer === "heat") {
      $("#heat-lead").innerHTML = minH === maxH
        ? `In <b>${MONTHS[state.month]}</b>, ${esc(modeName)} has <b>${minH} safe hours</b> of a 9-hour shift across Kachchh.`
        : `In <b>${MONTHS[state.month]}</b>, ${esc(modeName)} has only <b>${minH} to ${maxH} safe hours</b> of a 9-hour shift across Kachchh.`;
    } else {
      $("#heat-lead").innerHTML = `In <b>${MONTHS[state.month]}</b>, ambient PM10 averages <b>${minPm} to ${maxPm} µg/m³</b> across Kachchh talukas (India 24-hour NAAQS daily limit: 100 µg/m³).`;
    }

    // Color talukas
    $$("#heat-map .tal").forEach((p) => {
      const stats = getTalukaStats(p.dataset.name);
      if (state.layer === "compound") {
        p.style.fill = compoundColor(stats.score);
      } else if (state.layer === "heat") {
        p.style.fill = heatColor(stats.h);
      } else {
        p.style.fill = dustColor(stats.pm10);
      }
    });

    // Rank list on sidebar
    const rankTitle = state.layer === "compound"
      ? "Compound Double-Hazard"
      : state.layer === "heat"
      ? "Fewest Safe Hours"
      : "Highest Dust (PM10)";

    $("#heat-rank").innerHTML = `
      <h2>${MONTHS[state.month]} &ndash; ${rankTitle}</h2>
      ${
        rows.map((r) => {
          let barW = 0, barColor = "", valText = "", subText = "";
          if (state.layer === "compound") {
            barW = Math.max(8, r.score);
            barColor = compoundColor(r.score);
            valText = `${r.score}<small>/100</small>`;
            subText = `☀️ ${r.h.toFixed(1)}h &bull; 💨 ${r.pm10.toFixed(0)}µg`;
          } else if (state.layer === "heat") {
            barW = Math.max(5, (r.h / 9) * 100);
            barColor = heatColor(Math.min(r.h, 6.5));
            valText = `${r.h.toFixed(1)}<small>h</small>`;
            subText = `Max WBGT: ${r.wbgt.toFixed(1)}°C`;
          } else {
            barW = Math.max(8, Math.min(100, (r.pm10 / 120) * 100));
            barColor = dustColor(r.pm10);
            valText = `${r.pm10.toFixed(0)}<small>µg</small>`;
            subText = `PM2.5: ${r.pm25.toFixed(0)}µg`;
          }
          return `
          <div class="rank-row" data-name="${esc(r.name)}" style="cursor:pointer">
            <div>
              <span>${esc(r.name)}</span>
              <small style="display:block;font-size:10.5px;color:var(--ink-3);font-weight:normal">${subText}</small>
            </div>
            <div class="bar"><i style="width:${barW}%;background:${barColor}"></i></div>
            <b style="font-size:12px">${valText}</b>
          </div>`;
        }).join("")
  } `;

    $$("#heat-rank .rank-row").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        const p = $(`#heat-map .tal[data-name="${row.dataset.name}"]`);
        if (p) p.classList.add("hot");
      });
      row.addEventListener("mouseleave", () => $$("#heat-map .tal.hot").forEach((p) => p.classList.remove("hot")));
    });

    $$(".months [data-month]").forEach((b) => b.classList.toggle("on", Number(b.dataset.month) === state.month));
    $$("#layer-seg button").forEach((b) => b.classList.toggle("on", b.dataset.layer === state.layer));
    $$("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
  };

  const stop = () => {
    clearInterval(state.timer);
    state.timer = null;
    const b = $("#heat-play");
    if (b) b.innerHTML = ic("player-play", 16, 2);
  };
  onCleanup(stop);

  $("#heat-play").addEventListener("click", () => {
    if (state.timer) return stop();
    $("#heat-play").innerHTML = ic("player-pause", 16, 2);
    state.timer = setInterval(() => {
      state.month = (state.month + 1) % 12;
      paint();
    }, 1000);
  });

  $(".months").addEventListener("click", (e) => {
    const b = e.target.closest("[data-month]");
    if (b) {
      stop();
      state.month = Number(b.dataset.month);
      paint();
    }
  });

  $("#layer-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-layer]");
    if (b) {
      state.layer = b.dataset.layer;
      $("#mode-seg").style.display = state.layer === "dust" ? "none" : "";
      paint();
    }
  });

  $("#mode-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) {
      state.mode = b.dataset.mode;
      paint();
    }
  });

  // Dynamic rich tooltip on map
  $$("#heat-map .tal").forEach((p) => {
    p.setAttribute("data-tip-custom", "1");
    p.addEventListener("mousemove", (e) => {
      const stats = getTalukaStats(p.dataset.name);
      const loc = getTalLoc(p.dataset.name);
      const pop = data.population[p.dataset.name] ? `${ (data.population[p.dataset.name] / 1000).toFixed(0) }k pop` : "";
      const cLabel = stats.score >= 75 ? "Severe Hazard" : stats.score >= 50 ? "High Risk" : stats.score >= 25 ? "Moderate Risk" : "Low Risk";
      showTip(`
        <div class="tip-title">${esc(p.dataset.name)} <small style="font-weight:normal;opacity:0.8">(${esc(loc.label)}${pop ? ` &bull; ${pop}` : ""})</small></div>
      <div style="margin-top:5px;font-size:12px;line-height:1.4">
        <div>☀️ Safe hours: <b>${stats.h.toFixed(1)} h</b>/9h &bull; Peak WBGT: <b>${stats.wbgt.toFixed(1)} °C</b></div>
        <div>💨 Ambient Dust: <b>${stats.pm10.toFixed(0)} µg/m³</b> PM10 &bull; <b>${stats.pm25.toFixed(0)} µg/m³</b> PM2.5</div>
        <div>⚠️ Compound Index: <b>${stats.score}/100</b> (${cLabel})</div>
        ${stats.cDays > 0 ? `<div style="color:#e11d48;font-weight:600;margin-top:2px">🚨 ${stats.cDays} compound double-hazard days this month</div>` : ""}
        ${stats.dustDays > 0 ? `<div style="color:#d97706;font-size:11.5px">⚠️ ${stats.dustDays} days exceeded NAAQS 100 µg/m³ limit</div>` : ""}
      </div>`, e.clientX, e.clientY);
    });
    p.addEventListener("mouseleave", hideTip);
  });

  paint();
  await mountYearChart($("#year-card"), jobs.jobs);
};
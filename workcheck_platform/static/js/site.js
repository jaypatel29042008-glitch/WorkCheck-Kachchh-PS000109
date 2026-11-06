"use strict";
/* Site monitor: what the sensor node says now, what to do, and three ways to test it. */
const SOURCE_NAMES = { model_replay: "Model replay", browser_simulator: "Test sliders", wokwi_simulated: "Wokwi simulator", device: "Device" };
const sourceLabel = (s) => SOURCE_NAMES[s] || s;
const REPLAY_PLACES = [["kandla_port", "Kandla Port"], ["mundra_port", "Mundra Port"], ["little_rann_kutch", "Little Rann"], ["abdasa_cement", "Abdasa"], ["bhuj", "Bhuj"]];
const WOKWI_URL = "https://wokwi.com/projects/479831190538594305";
const PRESETS = {
  "Cool morning": { ambient_temp_c: 26, relative_humidity_pct: 60, globe_temp_c: 30, pm10_0_ug_m3: 40, uv_index: 2, noise_dba: 70 },
  "Hot afternoon": { ambient_temp_c: 34, relative_humidity_pct: 45, globe_temp_c: 44, pm10_0_ug_m3: 90, uv_index: 9, noise_dba: 78 },
  "Dusty, loud yard": { ambient_temp_c: 31, relative_humidity_pct: 50, globe_temp_c: 38, pm10_0_ug_m3: 260, uv_index: 7, noise_dba: 92 },
};
const SLIDERS = [["ambient_temp_c", "Air temperature", 20, 50, 1, "°C"], ["relative_humidity_pct", "Humidity", 5, 100, 1, "%"], ["globe_temp_c", "Globe temperature", 20, 70, 1, "°C"], ["pm10_0_ug_m3", "Dust (PM10)", 0, 500, 5, "µg/m³"], ["uv_index", "UV index", 0, 14, 0.5, ""], ["noise_dba", "Noise", 40, 120, 1, "dBA"]];

function renderLive(r, stamp) {
  const main = r.jobs[0];
  const value = (v, unit, digits = 0) => (v === null || v === undefined ? `<b>Not measured</b>` : `<b>${Number(v).toFixed(digits)}<small>${unit}</small></b>`);
  $("#site-live").innerHTML = `
    <div class="site-top">
      <section class="card gauge-card">
        <div class="card-head"><div><h2>${esc(r.site_name)}</h2><p class="sub">${esc(stamp || "Latest reading")}</p></div><span class="pill none sm" data-tip="${esc(r.wbgt_method)}">${esc(sourceLabel(r.source))}</span></div>
        <div class="gauge-box">${gauge(r.wbgt_c, 340)}<div class="gauge-num"><b>${r.wbgt_c}°</b><span>Heat index (WBGT)</span></div></div>
        <div class="big-call">${lamp(main.lamp)}<div><small class="kicker">${esc(main.label)}</small><h3>${esc(main.title)}</h3><p>${esc(main.text)}</p></div></div>
      </section>
      <section class="col">
        <div class="section-title"><h2>Same weather, different limit</h2><p class="sub">Each hour of work, by type of job.</p></div>
        ${r.jobs.map((j) => `<div class="card job-lamp"><div class="job-lamp-top"><span class="round sm bg-indigo">${ic(j.icon, 17, 2)}</span><div class="job-lamp-name"><b>${esc(j.label)}</b><small>${esc(j.examples)}</small></div><div class="job-lamp-call">${lamp(j.lamp)}<b>${esc(j.title)}</b></div></div>${restBar(j.work, j.rest)}</div>`).join("")}
      </section>
    </div>
    ${r.alerts.length ? `<div class="alerts">${r.alerts.map((a) => `<div class="alert">${ic(a.icon, 18, 2)}${esc(a.text)}</div>`).join("")}</div>` : ""}
    <div class="sensors">
      <div class="sensor">${ic("temperature", 20)}<span>Air</span>${value(r.ambient_temp_c, "°C", 1)}</div>
      <div class="sensor">${ic("droplets", 20)}<span>Humidity</span>${value(r.relative_humidity_pct, "%")}</div>
      <div class="sensor">${ic("wind", 20)}<span>Dust (PM10)</span>${value(r.pm10_0_ug_m3, "µg/m³")}</div>
      <div class="sensor">${ic("sun", 20)}<span>UV index</span>${value(r.uv_index, "", 1)}</div>
      <div class="sensor">${ic("volume", 20)}<span>Noise</span>${value(r.noise_dba, "dBA")}</div>
    </div>`;
}

VIEWS.site = async () => {
  const state = await api("/api/node/state");
  if (S.page !== "site") return;
  S.lastReading = state.latest.id;
  $("#view").innerHTML = `<header class="page-head"><div><h1>Site monitor</h1><p class="lead">What the sensor node reads, and what workers should do this hour.</p></div></header>
    <div id="site-live"></div>
    <section class="card test-card">
      <div class="card-head"><div><h2>Test it yourself</h2><p class="sub">Every reading is saved in the database and labelled with where it came from.</p></div>
        <div class="seg" role="tablist" id="test-tabs"><button type="button" data-tab="replay" class="on">Replay a real day</button><button type="button" data-tab="sliders">Move the sliders</button><button type="button" data-tab="wokwi">Wokwi device</button></div></div>
      <div id="test-panel"></div>
    </section>`;
  renderLive(state.latest);
  const tabs = { replay: tabReplay, sliders: tabSliders, wokwi: tabWokwi };
  let stopTab = () => { };
  const open = async (key) => {
    stopTab();
    $$("#test-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === key));
    stopTab = (await tabs[key]($("#test-panel"))) || (() => { });
  };
  $("#test-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) open(b.dataset.tab); });
  onCleanup(() => stopTab());
  await open("replay");
  // A connected device should appear without pressing anything.
  const poll = setInterval(async () => {
    if (S.page !== "site" || S.replaying) return;
    const next = await api("/api/node/state").catch(() => null);
    if (next && next.latest.id !== S.lastReading) { S.lastReading = next.latest.id; renderLive(next.latest); }
    S.wokwi = next && next.wokwi;
    const dot = $("#wokwi-status");
    if (dot && S.wokwi) dot.innerHTML = wokwiStatus(S.wokwi);
  }, 5000);
  onCleanup(() => clearInterval(poll));
};

async function tabReplay(panel) {
  panel.innerHTML = `<div class="replay-bar">
      ${selectBox("rp-place", REPLAY_PLACES, "kandla_port", "Place")}
      <label class="select"><span class="sr">Date</span><input type="date" id="rp-day" min="2025-01-01" max="2025-12-31" value="2025-05-19"></label>
      <button class="btn btn-ink" id="rp-play" type="button">${ic("player-play", 16, 2)}Play the day</button>
      <span class="sub" id="rp-now"></span>
    </div>
    <div id="rp-chart" class="chart"></div>
    <p class="fine">Model estimate of heat in full sun for that place and date in 2025. Not a measurement. Tap the curve to jump to an hour.</p>`;
  let data = null, timer = null, hour = 12;
  const labels = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? `${h}:00` : ""));
  const stop = () => { clearInterval(timer); timer = null; S.replaying = false; const b = $("#rp-play"); if (b) b.innerHTML = `${ic("player-play", 16, 2)}Play the day`; };
  const show = async (h) => {
    hour = h;
    const r = await api(`/api/node/replay?location_id=${$("#rp-place").value}&day=${$("#rp-day").value}&hour=${h}`, { method: "POST" });
    S.lastReading = r.id;
    const stamp = `Model replay, ${fmtDate(r.date)}, ${String(h).padStart(2, "0")}:00`;
    renderLive(r, stamp);
    $("#rp-now").textContent = `${String(h).padStart(2, "0")}:00, heat index ${r.wbgt_c}°C`;
    draw();
  };
  const draw = () => {
    const host = $("#rp-chart");
    if (!host || !data) return;
    lineChart(host, {
      labels, height: 190, yMin: 15, yMax: 40, yTicks: [20, 25, 30, 35, 40], unit: "°C", aria: "Heat index by hour",
      tipTitle: (i) => `${String(i).padStart(2, "0")}:00`,
      series: [{ name: "Heat index", values: data.hours.map((d) => d.wbgt), color: "#4656E6" }],
      onClick: (i) => { stop(); show(i); },
      after: (root, x, y) => {
        const svg = $("svg", root);
        svg.insertAdjacentHTML("beforeend", `<circle cx="${x(hour)}" cy="${y(data.hours[hour].wbgt)}" r="6.5" fill="#fff" stroke="#14182B" stroke-width="3" pointer-events="none"/>`);
      },
    });
  };
  const load = async () => {
    data = await api(`/api/node/day?location_id=${$("#rp-place").value}&day=${$("#rp-day").value}`);
    draw();
  };
  $("#rp-place").addEventListener("change", async () => { stop(); await load(); show(hour); });
  $("#rp-day").addEventListener("change", async () => { stop(); await load(); show(hour); });
  $("#rp-play").addEventListener("click", () => {
    if (timer) return stop();
    S.replaying = true;
    $("#rp-play").innerHTML = `${ic("player-pause", 16, 2)}Pause`;
    let h = hour >= 23 ? 0 : hour;
    show(h);
    timer = setInterval(() => { h += 1; if (h > 23) return stop(); show(h); }, 1100);
  });
  await load();
  return stop;
}

function tabSliders(panel) {
  const values = { ...PRESETS["Hot afternoon"] };
  panel.innerHTML = `<div class="presets">${Object.keys(PRESETS).map((k) => `<button type="button" class="fpill${k === "Hot afternoon" ? " on" : ""}" data-p="${k}">${k}</button>`).join("")}</div>
    <div class="sliders">${SLIDERS.map(([k, t, min, max, step, u]) => `<label class="slider"><span>${t}<b id="v-${k}"></b></span><input type="range" id="s-${k}" min="${min}" max="${max}" step="${step}"></label>`).join("")}</div>
    <p class="fine">Test values typed in by you. Saved with the label "Test sliders".</p>`;
  let timer;
  const sync = () => SLIDERS.forEach(([k, , , , , u]) => { $(`#s-${k}`).value = values[k]; $(`#v-${k}`).textContent = `${values[k]} ${u}`; });
  const send = async () => {
    const r = await api("/api/node/simulate", { method: "POST", body: { ...values, device_id: "browser-node", site_id: "kandla_port" } });
    S.lastReading = r.id;
    renderLive(r, "Test values from the sliders");
  };
  SLIDERS.forEach(([k]) => $(`#s-${k}`).addEventListener("input", (e) => {
    values[k] = Number(e.target.value);
    sync();
    $$(".presets .fpill").forEach((b) => b.classList.remove("on"));
    clearTimeout(timer);
    timer = setTimeout(send, 300);
  }));
  $$(".presets .fpill", panel).forEach((b) => b.addEventListener("click", () => {
    Object.assign(values, PRESETS[b.dataset.p]);
    $$(".presets .fpill").forEach((x) => x.classList.toggle("on", x === b));
    sync(); send();
  }));
  sync();
  send();
  return () => clearTimeout(timer);
}

function wokwiStatus(w) {
  if (w && w.connected) return `<span class="pill clear">${ic("wifi", 14, 2)}Connected, last reading ${w.last_seen_seconds}s ago</span>`;
  if (w && w.last_seen_seconds !== null && w.last_seen_seconds !== undefined) return `<span class="pill due">${ic("wifi-off", 14, 2)}Last reading ${Math.round(w.last_seen_seconds / 60)} min ago</span>`;
  return `<span class="pill none">${ic("wifi-off", 14, 2)}Waiting for a device</span>`;
}

let wokwiStreamTimer = null;

async function sendWokwiSimulatedPacket() {
  const tAir = 35.0 + Math.sin(Date.now() / 15000) * 2.5 + (Math.random() - 0.5) * 0.4;
  const rh = Math.max(25, Math.min(75, 45.0 - (tAir - 35) * 1.5 + (Math.random() - 0.5) * 2));
  const tGlobe = tAir + 12.0 + Math.cos(Date.now() / 20000) * 2.0 + (Math.random() - 0.5) * 0.5;
  const pm10 = Math.max(60, 135.0 + Math.sin(Date.now() / 10000) * 35.0 + (Math.random() - 0.5) * 8);
  const pm25 = pm10 * 0.42;
  const uv = Math.max(1, 8.8 + (Math.random() - 0.5) * 0.6);
  const noise = Math.max(65, 82.0 + Math.sin(Date.now() / 8000) * 7.0 + (Math.random() - 0.5) * 3);

  const payload = {
    device_id: "wokwi-node-01",
    site_id: "kandla_port",
    source: "wokwi_simulated",
    ambient_temp_c: Math.round(tAir * 10) / 10,
    relative_humidity_pct: Math.round(rh),
    globe_temp_c: Math.round(tGlobe * 10) / 10,
    pm10_0_ug_m3: Math.round(pm10 * 10) / 10,
    pm2_5_ug_m3: Math.round(pm25 * 10) / 10,
    uv_index: Math.round(uv * 10) / 10,
    noise_dba: Math.round(noise * 10) / 10,
  };

  const res = await fetch("/api/v1/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "demo-device-key" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const next = await api("/api/node/state").catch(() => null);
    if (next) {
      S.lastReading = next.latest.id;
      renderLive(next.latest);
      const dot = $("#wokwi-status");
      if (dot && next.wokwi) dot.innerHTML = wokwiStatus(next.wokwi);
    }
  }
}

async function tabWokwi(panel) {
  const state = await api("/api/node/state");
  if (!panel.isConnected) return;

  panel.innerHTML = `<div class="wokwi">
    <div class="wokwi-side">
      <div id="wokwi-status">${wokwiStatus(state.wokwi)}</div>
      <p class="sub">The site node simulation runs on an ESP32 with air temp, humidity, black globe, dust (PM10/2.5), noise, and UV sensors, driving an OLED display and alert lamp.</p>
      <div style="display:flex;flex-direction:column;gap:8px;width:100%">
        <a class="btn btn-ink" href="#/wokwi" style="justify-content:center">${ic("cpu", 16, 2)} Open Wokwi Node Studio</a>
        <button class="btn btn-ghost" id="btn-stream-wokwi" type="button" style="justify-content:center">
          ${wokwiStreamTimer ? `${ic("player-stop", 16, 2)} Stop Live Stream` : `${ic("player-play", 16, 2)} Quick Stream to Monitor`}
        </button>
      </div>
    </div>
    <ol class="steps">
      <li>
        <b>Interactive Wokwi Node Studio (New Dedicated Tab)</b>
        <span>Open the <b>Wokwi Node</b> tab in the top navigation to explore the windowed circuit simulator, trigger hazard scenarios, and review the 9-part hardware engineering breakdown.</span>
      </li>
      <li>
        <b>Quick Stream to this Site Monitor</b>
        <span>Click <b>"Quick Stream to Monitor"</b> above to stream simulated packets and watch the WBGT dial, dust alarm, and supervisor rest directives update in real time.</span>
      </li>
      <li>
        <b>Connect Online Wokwi via Public Tunnel</b>
        <span>Run <code>npx localtunnel --port 8090</code> in terminal, paste the public URL into <code>wokwi/sketch.ino</code>, and run the simulation directly in Wokwi.</span>
      </li>
    </ol>
  </div>`;

  const btnStream = $("#btn-stream-wokwi");
  if (btnStream) {
    btnStream.addEventListener("click", async () => {
      if (wokwiStreamTimer) {
        clearInterval(wokwiStreamTimer);
        wokwiStreamTimer = null;
        btnStream.innerHTML = `${ic("player-play", 16, 2)} Quick Stream to Monitor`;
        toast("Simulated stream stopped.");
      } else {
        toast("Streaming simulated Wokwi ESP32 telemetry...");
        await sendWokwiSimulatedPacket();
        btnStream.innerHTML = `${ic("player-stop", 16, 2)} Stop Live Stream`;
        wokwiStreamTimer = setInterval(sendWokwiSimulatedPacket, 3000);
      }
    });
  }

  return () => {
    if (wokwiStreamTimer) {
      clearInterval(wokwiStreamTimer);
      wokwiStreamTimer = null;
    }
  };
}

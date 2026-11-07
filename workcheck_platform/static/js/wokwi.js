"use strict";
/* Wokwi Hardware Node View: Windowed HTML simulator, live sensor telemetry, and hardware breakdown. */

let wkStreamTimer = null;
const WOKWI_PROJECT_URL = "https://wokwi.com/projects/479831190538594305";

// Hardware Parts Specification: Pin assignments, purpose, and physical collection mechanism
const WOKWI_PARTS = [
  {
    name: "ESP32 DevKit-C v4",
    tag: "Core Controller",
    pin: "Central Processor",
    icon: "cpu",
    tone: "indigo",
    use: "Orchestrates the entire site node: samples all environmental sensors every 2 seconds, computes running 1-minute averages, calculates local thermal metrics, drives the on-site OLED display, flashes the warning strobe, and securely transmits JSON telemetry over WiFi to the district platform.",
    how: "32-bit dual-core Xtensa LX6 microprocessor running at 240 MHz. Reads digital serial buses (I2C for OLED, OneWire for globe probe, single-bus for DHT22) and analog voltages through internal 12-bit Successive Approximation Register (SAR) ADCs. Built-in flash memory (LittleFS) buffers readings locally if site cellular/WiFi connectivity drops.",
  },
  {
    name: "DHT22 / AM2302",
    tag: "Air Temp & Humidity",
    pin: "GPIO 14 (Digital 1-Wire)",
    icon: "temperature-sun",
    tone: "amber",
    use: "Measures ambient dry-bulb air temperature and relative humidity. These two values are essential to estimate the natural wet-bulb temperature (the cooling effect of evaporating sweat) used in the international Wet Bulb Globe Temperature (WBGT) heat-stress index.",
    how: "Contains a capacitive humidity sensing element and a high-precision Negative Temperature Coefficient (NTC) thermistor. Humidity is captured because a moisture-absorbing polymer dielectric changes electrical capacitance as water vapor increases in the air. An onboard 8-bit chip converts these physical signals into a calibrated 40-bit digital data frame transmitted to the ESP32 every 2 seconds.",
  },
  {
    name: "DS18B20 in 150mm Matte Globe",
    tag: "Black Globe Temperature",
    pin: "GPIO 4 (OneWire + 4.7kΩ)",
    icon: "sun",
    tone: "rose",
    use: "Measures radiant solar heat (Tg). Standard thermometers only measure air in the shade, underestimating direct sun exposure by 3 to 6 °C. The black globe reflects how sun rays and radiating hot tarmac or salt flats heat the human body.",
    how: "Mounted at the exact center of a 150mm hollow copper sphere painted matte black (emissivity 0.95). The dark sphere absorbs solar radiation until radiant heat intake equals convective air cooling. The internal silicon bandgap temperature sensor measures this thermal equilibrium with 12-bit digital resolution (0.0625 °C precision) over a single data wire.",
  },
  {
    name: "Dust Sensor Stand-in (Potentiometer 1)",
    tag: "Respirable Dust (PM10 & PM2.5)",
    pin: "GPIO 34 (ADC1 Channel 6)",
    icon: "wind",
    tone: "rose",
    use: "Monitors respirable particulate matter (PM10 and PM2.5) from salt pan raking, cement bagging, quarrying, and dry dock loading. Exceeding 100 µg/m³ triggers water-spraying advisories and personal mask enforcement.",
    how: "In field hardware (PMS5003), a laser diode shines across an airflow channel, and a photodetector measures light scattering pulses (Mie scattering) to count microscopic particles per liter. In the Wokwi simulation, a 10kΩ potentiometer acts as a calibrated analog voltage stand-in: turning the knob delivers 0 to 3.3V, which the ESP32 digitizes into 0 to 4095 ADC counts and scales linearly to 0–500 µg/m³.",
  },
  {
    name: "Industrial Noise Stand-in (Potentiometer 2)",
    tag: "Acoustic Pressure (dBA)",
    pin: "GPIO 35 (ADC1 Channel 7)",
    icon: "volume",
    tone: "indigo",
    use: "Continuously tracks industrial yard noise from heavy forklifts, ship unloading cranes, and diesel generators to prevent Noise-Induced Hearing Loss (NIHL). Repeated shifts exceeding 85 dBA trigger an automated referral for an audiometry test.",
    how: "In field hardware, an omnidirectional MEMS acoustic transducer (INMP441) samples sound pressure waves at 44.1 kHz, applying A-weighting decibel filters. In Wokwi, a second potentiometer simulates noise levels from 45 dBA (quiet yard) to 105 dBA (diesel generator room) with running daily dosage calculation (3 dB exchange rate).",
  },
  {
    name: "Solar UV Module Stand-in (LDR Sensor)",
    tag: "Erythemal UV Index",
    pin: "GPIO 32 (ADC1 Channel 4)",
    icon: "sun-high",
    tone: "amber",
    use: "Tracks solar ultraviolet erythemal intensity (UV index 0 to 14) on open worksites. High UV causes acute skin erythema (sunburn) and corneal photokeratitis (salt-eye) in Kachchh salt pans.",
    how: "In field hardware, a semiconductor GaN photodiode detects UV photons (240–370 nm). In Wokwi, a cadmium-sulfide (CdS) photoresistor's electrical resistance drops sharply under bright illumination, changing the voltage drop across a 10kΩ divider circuit, which the ESP32 ADC digitizes into UV index units.",
  },
  {
    name: "SSD1306 0.96\" OLED Display",
    tag: "Local Worksite Screen",
    pin: "GPIO 21 (SDA), GPIO 22 (SCL)",
    icon: "device-heart-monitor",
    tone: "green",
    use: "Provides immediate, on-site visual feedback to site supervisors and field laborers without needing a smartphone, app, or internet connection.",
    how: "Features 128x64 self-illuminating monochrome organic LED pixels connected via high-speed I2C serial bus (address 0x3C). The ESP32 screen buffer renders real-time air temperature, black globe temperature, calculated WBGT, PM10 concentration, and the current work-rest safety status.",
  },
  {
    name: "High-Alert Red LED Strobe Lamp",
    tag: "Visual Warning Beacon",
    pin: "GPIO 26 (Current-limited 220Ω)",
    icon: "alert-triangle",
    tone: "rose",
    use: "Serves as an eye-level physical beacon across noisy, dusty yards. When heat or dust crosses safe limits, the flashing red strobe instructs all workers to halt heavy labor and take shade.",
    how: "Driven directly by an ESP32 digital output pin through a 220-ohm current-limiting resistor. Pulled HIGH continuously during caution states, or pulsed rapidly in software (flash animation) when the platform returns RED_FLASH (WBGT ≥ 27.5 °C for heavy work or PM10 > 100 µg/m³).",
  },
  {
    name: "Piezoelectric Audible Warning Buzzer",
    tag: "Audible Alarm Siren",
    pin: "GPIO 27 (PWM Tone Generator)",
    icon: "volume",
    tone: "rose",
    use: "Provides an audible siren for urgent alerts: when a worker collapses, when a heat emergency occurs, or when a sudden dust storm sweeps the site.",
    how: "Utilizes a piezoelectric ceramic disc enclosed in an acoustic resonance chamber. The ESP32 hardware timer drives the pin with an 1.8 kHz square-wave pulse-width modulation (PWM) signal, vibrating the piezo diaphragm to produce an 85 dB audible alert tone.",
  },
];

VIEWS.wokwi = async () => {
  const [state, jobs] = await Promise.all([api("/api/node/state"), api("/api/heat/jobs")]);
  if (S.page !== "wokwi") return;

  const initialConnected = state.wokwi && state.wokwi.connected;
  let activeScenario = "normal";

  $("#view").innerHTML = `
    <header class="page-head">
      <div>
        <h1>Wokwi ESP32 Test Node</h1>
        <p class="lead">Test version of the site node, simulated in Wokwi. No device is on a real site yet.</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span id="wk-status-pill" class="pill ${initialConnected ? "clear" : "none"} sm">
          ${ic(initialConnected ? "wifi" : "wifi-off", 14, 2)}
          ${initialConnected ? "Simulator sending" : "Waiting for test readings"}
        </span>
        <a href="${WOKWI_PROJECT_URL}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
          Open in Wokwi ${ic("external-link", 14, 2)}
        </a>
      </div>
    </header>

    <!-- Windowed Interactive Simulation -->
    <section class="card" style="padding:0;overflow:hidden;margin-bottom:24px;">
      <div class="card-head" style="padding:16px 20px;border-bottom:1px solid var(--line);background:var(--card-bg);margin-bottom:0;">
        <div>
          <h2>Interactive Circuit Simulator (Windowed View)</h2>
          <p class="sub">Complete ESP32 hardware circuit with DHT22, DS18B20 black globe, dust &amp; noise potentiometers, UV sensor, OLED, and alert lamp.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-ink btn-sm" id="wk-toggle-stream">
            ${wkStreamTimer ? `${ic("player-pause", 14, 2)} Pause Stream` : `${ic("player-play", 14, 2)} Start Live Feed`}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" id="wk-btn-expand">
            ${ic("external-link", 14, 2)} Pop Out Wokwi
          </button>
        </div>
      </div>
      <div style="position:relative;width:100%;height:540px;background:#181824;">
        <iframe
          id="wk-iframe"
          src="${WOKWI_PROJECT_URL}?view=diagram"
          width="100%"
          height="100%"
          style="border:0;display:block;"
          allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
        </iframe>
      </div>
    </section>

    <!-- Live Telemetry Console & Scenario Injector -->
    <div class="two" style="margin-bottom:24px;">
      <!-- Real-Time Sensor Telemetry Meters -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Live Sensor Telemetry</h2>
            <p class="sub">Continuous packet acquisition from ESP32 site node.</p>
          </div>
          <span class="pill none sm" id="wk-last-time">Updated live</span>
        </div>
        <div class="tiles4" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;">
          <div class="tile still">
            <span class="round sm bg-amber t-amber">${ic("temperature-sun", 16, 2)}</span>
            <span class="tile-label">Air Temp / RH</span>
            <b class="tile-n" id="wk-val-air" style="font-size:20px;">--</b>
            <span class="tile-hint" id="wk-hint-air">DHT22 Digital</span>
          </div>
          <div class="tile still">
            <span class="round sm bg-rose t-rose">${ic("sun", 16, 2)}</span>
            <span class="tile-label">Globe Temp / WBGT</span>
            <b class="tile-n" id="wk-val-wbgt" style="font-size:20px;">--</b>
            <span class="tile-hint" id="wk-hint-wbgt">DS18B20 OneWire</span>
          </div>
          <div class="tile still">
            <span class="round sm bg-rose t-rose">${ic("wind", 16, 2)}</span>
            <span class="tile-label">Dust (PM10 / PM2.5)</span>
            <b class="tile-n" id="wk-val-dust" style="font-size:20px;">--</b>
            <span class="tile-hint">ADC1_6 (0–500 µg/m³)</span>
          </div>
          <div class="tile still">
            <span class="round sm bg-indigo t-indigo">${ic("volume", 16, 2)}</span>
            <span class="tile-label">Noise &bull; UV Index</span>
            <b class="tile-n" id="wk-val-noise" style="font-size:20px;">--</b>
            <span class="tile-hint">Acoustic &amp; UV Sensors</span>
          </div>
        </div>

        <div style="padding:14px;background:var(--app);border-radius:12px;border:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <b style="font-size:13px;">Platform Directive</b>
            <span id="wk-lamp-badge" class="pill clear sm">Normal shift</span>
          </div>
          <p id="wk-action-text" style="font-size:12.5px;color:var(--ink-2);margin:0;line-height:1.4;">
            Connecting to site node... Waiting for sensor packets.
          </p>
        </div>
      </section>

      <!-- Scenario Injector -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Test Hazard Scenarios</h2>
            <p class="sub">Simulate worksite conditions and observe platform rules engine response.</p>
          </div>
        </div>
        <p style="font-size:12.5px;color:var(--ink-2);margin-bottom:14px;line-height:1.4;">
          Click a scenario to immediately inject corresponding sensor voltages into the platform without waiting:
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="btn btn-ghost" data-scenario="normal" style="justify-content:flex-start;text-align:left;padding:10px 14px;">
            <span class="round xs bg-green" style="margin-right:10px;">${ic("check", 14, 2)}</span>
            <div>
              <b style="display:block;font-size:13px;">Normal Working Shift</b>
              <small style="color:var(--ink-3);">Air: 28°C &bull; WBGT: 24.5°C &bull; PM10: 35 µg/m³ &bull; Low heat and dust</small>
            </div>
          </button>
          <button type="button" class="btn btn-ghost" data-scenario="heat" style="justify-content:flex-start;text-align:left;padding:10px 14px;">
            <span class="round xs bg-amber" style="margin-right:10px;">${ic("sun", 14, 2)}</span>
            <div>
              <b style="display:block;font-size:13px;">Peak Heat Stress Alert</b>
              <small style="color:var(--ink-3);">Air: 38°C &bull; Globe: 51°C &bull; WBGT: 33.1°C &bull; Mandatory 45m rest/hour</small>
            </div>
          </button>
          <button type="button" class="btn btn-ghost" data-scenario="dust" style="justify-content:flex-start;text-align:left;padding:10px 14px;">
            <span class="round xs bg-rose" style="margin-right:10px;">${ic("wind", 14, 2)}</span>
            <div>
              <b style="display:block;font-size:13px;">Concrete / Quarry Dust Spike</b>
              <small style="color:var(--ink-3);">PM10: 275 µg/m³ &bull; PM2.5: 120 µg/m³ &bull; Water spray &amp; N95 mask alert</small>
            </div>
          </button>
          <button type="button" class="btn btn-ghost" data-scenario="compound" style="justify-content:flex-start;text-align:left;padding:10px 14px;">
            <span class="round xs bg-rose" style="margin-right:10px;">${ic("flame", 14, 2)}</span>
            <div>
              <b style="display:block;font-size:13px;">Double-Hazard Emergency</b>
              <small style="color:var(--ink-3);">Heat WBGT > 32°C + Dust PM10 > 200 µg/m³ &bull; Immediate red strobe</small>
            </div>
          </button>
        </div>
      </section>
    </div>

    <!-- Hardware Breakdown Table -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Hardware Architecture &amp; Collection Mechanisms</h2>
          <p class="sub">Complete bill of materials, circuit connections, and physical sensing methods for the ESP32 node.</p>
        </div>
        <span class="pill none sm">9 Components</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${WOKWI_PARTS.map((p) => `
          <div style="display:grid;grid-template-columns:220px 180px minmax(0,1fr);gap:16px;padding:14px 0;border-top:1px solid var(--line);align-items:start;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span class="round xs bg-${p.tone} t-${p.tone}">${ic(p.icon, 14, 2)}</span>
                <b style="font-size:13.5px;">${esc(p.name)}</b>
              </div>
              <span class="pill none sm" style="font-size:11px;">${esc(p.tag)}</span>
            </div>
            <div>
              <b style="display:block;font-size:12.5px;color:var(--ink);">${esc(p.pin)}</b>
              <small style="font-size:11.5px;color:var(--ink-3);">Wiring Interface</small>
            </div>
            <div>
              <p style="font-size:12.5px;color:var(--ink-1);margin:0 0 6px 0;line-height:1.4;">
                <b>Purpose:</b> ${esc(p.use)}
              </p>
              <p style="font-size:12px;color:var(--ink-3);margin:0;line-height:1.4;">
                <b>Sensing Mechanism:</b> ${esc(p.how)}
              </p>
            </div>
          </div>`).join("")}
      </div>
    </section>`;

  // Helper to update live console meters
  const updateConsole = (r) => {
    if (!r) return;
    const airT = r.ambient_temp_c !== null && r.ambient_temp_c !== undefined ? `${Number(r.ambient_temp_c).toFixed(1)}°C` : "--";
    const rh = r.relative_humidity_pct !== null && r.relative_humidity_pct !== undefined ? `${Math.round(r.relative_humidity_pct)}%` : "--";
    const globeT = r.globe_temp_c !== null && r.globe_temp_c !== undefined ? `${Number(r.globe_temp_c).toFixed(1)}°C` : "--";
    const wbgt = r.wbgt_c !== null && r.wbgt_c !== undefined ? `${Number(r.wbgt_c).toFixed(1)}°C` : "--";
    const pm10 = r.pm10_0_ug_m3 !== null && r.pm10_0_ug_m3 !== undefined ? `${Math.round(r.pm10_0_ug_m3)} µg` : "--";
    const pm25 = r.pm2_5_ug_m3 !== null && r.pm2_5_ug_m3 !== undefined ? `${Math.round(r.pm2_5_ug_m3)} µg` : "--";
    const noise = r.noise_dba !== null && r.noise_dba !== undefined ? `${Math.round(r.noise_dba)} dBA` : "--";
    const uv = r.uv_index !== null && r.uv_index !== undefined ? `UV ${Number(r.uv_index).toFixed(1)}` : "--";

    $("#wk-val-air").textContent = `${airT} / ${rh}`;
    $("#wk-val-wbgt").textContent = `${globeT} / ${wbgt}`;
    $("#wk-val-dust").textContent = `${pm10} / ${pm25}`;
    $("#wk-val-noise").textContent = `${noise} • ${uv}`;
    $("#wk-last-time").textContent = `Updated ${new Date().toLocaleTimeString()}`;

    // Status lamp & advice
    const lampCode = (r.jobs && r.jobs[0] && r.jobs[0].lamp) || "GREEN";
    const advice = (r.jobs && r.jobs[0] && r.jobs[0].text) || "No reading yet.";
    const lampBadge = $("#wk-lamp-badge");
    const actionText = $("#wk-action-text");

    if (lampBadge) {
      lampBadge.className = `pill ${lampCode === "RED_FLASH" || lampCode === "RED" ? "action" : lampCode === "ORANGE" || lampCode === "YELLOW" ? "due" : "clear"} sm`;
      lampBadge.innerHTML = `${lamp(lampCode)} ${lampCode}`;
    }
    if (actionText) {
      actionText.textContent = advice;
    }

    const statusPill = $("#wk-status-pill");
    if (statusPill) {
      statusPill.className = "pill clear sm";
      statusPill.innerHTML = `${ic("wifi", 14, 2)} Simulator sending`;
    }
  };

  // Telemetry sender with scenario values
  const sendPacket = async (scenario = "normal") => {
    if (window.WORKCHECK_STATIC_DATA) {
      toast(READ_ONLY_MESSAGE, "watch");
      return;
    }
    let tAir = 28.0, rh = 52.0, tGlobe = 32.0, pm10 = 35.0, uv = 4.2, noise = 68.0;

    if (scenario === "heat") {
      tAir = 38.5 + (Math.random() - 0.5) * 0.8;
      rh = 44.0 + (Math.random() - 0.5) * 2;
      tGlobe = 51.2 + (Math.random() - 0.5) * 1.0;
      pm10 = 65.0;
      uv = 10.2;
      noise = 74.0;
    } else if (scenario === "dust") {
      tAir = 32.0;
      rh = 40.0;
      tGlobe = 38.0;
      pm10 = 275.0 + (Math.random() - 0.5) * 25.0;
      uv = 6.5;
      noise = 86.0;
    } else if (scenario === "compound") {
      tAir = 37.0;
      rh = 50.0;
      tGlobe = 49.5;
      pm10 = 210.0;
      uv = 9.5;
      noise = 82.0;
    } else {
      // Normal drift
      tAir = 28.5 + (Math.random() - 0.5) * 0.5;
      rh = 55.0 + (Math.random() - 0.5) * 2;
      tGlobe = 33.0 + (Math.random() - 0.5) * 0.8;
      pm10 = 42.0 + (Math.random() - 0.5) * 5;
      uv = 4.8;
      noise = 70.0;
    }

    const payload = {
      device_id: "wokwi-node-01",
      site_id: "kandla_port",
      source: "wokwi_simulated",
      ambient_temp_c: Math.round(tAir * 10) / 10,
      relative_humidity_pct: Math.round(rh),
      globe_temp_c: Math.round(tGlobe * 10) / 10,
      pm10_0_ug_m3: Math.round(pm10 * 10) / 10,
      pm2_5_ug_m3: Math.round((pm10 * 0.44) * 10) / 10,
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
      if (next && next.latest) {
        updateConsole(next.latest);
      }
    }
  };

  // Populate initial values
  if (state.latest) {
    updateConsole(state.latest);
  }

  // Bind scenario buttons
  $$("[data-scenario]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      activeScenario = btn.dataset.scenario;
      toast(`Simulating: ${btn.querySelector("b").textContent}`);
      await sendPacket(activeScenario);
    });
  });

  // Toggle stream button
  const streamBtn = $("#wk-toggle-stream");
  streamBtn.addEventListener("click", async () => {
    if (wkStreamTimer) {
      clearInterval(wkStreamTimer);
      wkStreamTimer = null;
      streamBtn.innerHTML = `${ic("player-play", 14, 2)} Start Live Feed`;
      toast("Live telemetry paused.");
    } else {
      toast("Streaming simulated Wokwi ESP32 telemetry every 3s...");
      await sendPacket(activeScenario);
      streamBtn.innerHTML = `${ic("player-pause", 14, 2)} Pause Stream`;
      wkStreamTimer = setInterval(() => sendPacket(activeScenario), 3000);
    }
  });

  // Expand / pop-out Wokwi project
  $("#wk-btn-expand").addEventListener("click", () => {
    window.open(WOKWI_PROJECT_URL, "_blank", "noopener");
  });

  onCleanup(() => {
    if (wkStreamTimer) {
      clearInterval(wkStreamTimer);
      wkStreamTimer = null;
    }
  });
};

"use strict";
/* Small hand-written SVG charts. One axis only, thin marks, a label on every status colour. */
const num = (v) => Number(v).toFixed(2).replace(/\.?0+$/, "");

function monotone(pts) {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${num(pts[0][0])},${num(pts[0][1])}`;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${num(pts[0][0])},${num(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${num(pts[i][0] + h)},${num(pts[i][1] + t[i] * h)} ${num(pts[i + 1][0] - h)},${num(pts[i + 1][1] - t[i + 1] * h)} ${num(pts[i + 1][0])},${num(pts[i + 1][1])}`;
  }
  return d;
}

/* cfg: labels, series [{name, values, color}], yMax, yTicks, unit, height */
function lineChart(host, cfg) {
  if (host._ro) host._ro.disconnect();
  const H = cfg.height || 250;
  host.style.height = `${H}px`;
  const draw = () => {
    const W = host.clientWidth;
    if (!W) return;
    const small = W < 460;
    const m = { t: 12, r: small ? 12 : 84, b: 26, l: 30 };
    const x = (i) => m.l + (i * (W - m.l - m.r)) / (cfg.labels.length - 1);
    const y0 = cfg.yMin || 0;
    const y = (v) => m.t + (1 - (v - y0) / (cfg.yMax - y0)) * (H - m.t - m.b);
    const grid = cfg.yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`).join("");
    const step = small ? 2 : 1;
    const xs = cfg.labels.map((l, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="axis">${l}</text>` : "")).join("");
    const lines = cfg.series.map((s, k) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = monotone(pts);
      const area = k === 0 ? `<path d="${d}L${x(s.values.length - 1)},${y(y0)}L${x(0)},${y(y0)}Z" fill="${s.color}" opacity=".07"/>` : "";
      return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linecap="round"/>`;
    }).join("");
    let labelYs = cfg.series.map((s) => y(s.values[s.values.length - 1]));
    if (labelYs.length === 2 && Math.abs(labelYs[0] - labelYs[1]) < 16) { const mid = (labelYs[0] + labelYs[1]) / 2; const up = labelYs[0] <= labelYs[1] ? -8 : 8; labelYs = [mid + up, mid - up]; }
    const direct = small ? "" : cfg.series.map((s, k) => `<text x="${W - m.r + 10}" y="${labelYs[k] + 4}" class="direct">${esc(s.name)}</text>`).join("");
    host.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(cfg.aria || "Line chart")}">${grid}${xs}${lines}${direct}<g class="hover" visibility="hidden"><line class="cross" y1="${m.t}" y2="${H - m.b}"/>${cfg.series.map((s) => `<circle r="5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join("")}</g><rect class="hit" data-tip-custom="1" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/></svg>`;
    const group = $(".hover", host), cross = $(".cross", host), dots = $$("circle", group), hit = $(".hit", host);
    const move = (e) => {
      const p = e.touches ? e.touches[0] : e;
      const box = hit.getBoundingClientRect();
      const i = Math.max(0, Math.min(cfg.labels.length - 1, Math.round(((p.clientX - box.left) / box.width) * (cfg.labels.length - 1))));
      group.setAttribute("visibility", "visible");
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      cfg.series.forEach((s, k) => { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.values[i])); });
      showTip(`<div class="tip-title">${esc(cfg.tipTitle ? cfg.tipTitle(i) : cfg.labels[i])}</div>${cfg.series.map((s) => `<div class="tip-row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${s.values[i].toFixed(1)}${cfg.unit ? ` ${esc(cfg.unit)}` : ""}</b></div>`).join("")}`, p.clientX, p.clientY);
    };
    const leave = () => { group.setAttribute("visibility", "hidden"); hideTip(); };
    hit.addEventListener("mousemove", move);
    hit.addEventListener("touchstart", move, { passive: true });
    hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", leave);
    if (cfg.onClick) hit.addEventListener("click", (e) => { const box = hit.getBoundingClientRect(); cfg.onClick(Math.round(((e.clientX - box.left) / box.width) * (cfg.labels.length - 1))); });
    if (cfg.after) cfg.after(host, x, y);
  };
  draw();
  host._ro = new ResizeObserver(draw);
  host._ro.observe(host);
  onCleanup(() => host._ro && host._ro.disconnect());
  return draw;
}

const legend = (items) => `<div class="legend">${items.map(([name, color]) => `<span><i style="background:${color}"></i>${esc(name)}</span>`).join("")}</div>`;

const YEAR_COLORS = ["#4656E6", "#12A0A4"];
/* Card with the two-shift chart, shared by Today and Heat map. */
async function mountYearChart(root, jobs, jobId = "port_yard_kandla") {
  const options = jobs.map((j) => [j.job_id, `${j.label}, ${j.place}`]);
  root.innerHTML = `<div class="card-head"><div><h2>Safe work hours through the year</h2><p class="sub" id="yc-sub"></p></div>${selectBox("yc-job", options, jobId, "Choose a job")}</div>
    <div class="insight" id="yc-insight"></div>
    <div id="yc-chart" class="chart"></div>
    ${legend([["9am to 6pm shift", YEAR_COLORS[0]], ["6am to 3pm shift", YEAR_COLORS[1]]])}`;
  const load = async (id) => {
    const y = await api(`/api/heat/year?job_id=${encodeURIComponent(id)}`);
    $("#yc-sub", root).textContent = `Hours of a 9-hour shift inside the heat limit. Model estimate for 2025.`;
    const gain = y.summer["6-15"] - y.summer["9-18"];
    $("#yc-insight", root).innerHTML = gain >= 0.1
      ? `${ic("sparkles", 16, 2)}<span>From April to October, starting at 6am adds <b>${gain.toFixed(1)} safe hours</b> a shift. ${y.under_half_days ? `On a 9am shift, <b>${y.under_half_days} days</b> fall under half a shift.` : ""}</span>`
      : `${ic("circle-check", 16, 2)}<span>This shaded job stays inside the heat limit all year in the model.</span>`;
    lineChart($("#yc-chart", root), { labels: MONTHS, yMax: 9, yTicks: [0, 3, 6, 9], unit: "h", height: 230, aria: `Safe work hours by month for ${y.label}`, series: [{ name: "9am to 6pm", values: y.series["9-18"], color: YEAR_COLORS[0] }, { name: "6am to 3pm", values: y.series["6-15"], color: YEAR_COLORS[1] }] });
  };
  $("#yc-job", root).addEventListener("change", (e) => load(e.target.value));
  await load(jobId);
}

const TONE_MARK = { action: "#E5484D", due: "#F5A524", watch: "#7E8CF8", clear: "#34C48B", none: "#CDD1E4" };

function spark(values, tone, labels, unit) {
  const pairs = values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
  if (pairs.length < 2) return `<div class="spark-empty"></div>`;
  const nums = pairs.map(([v]) => v);
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const W = 120, H = 36;
  const pts = pairs.map(([v, i]) => [(i * W) / (values.length - 1), 4 + (1 - (v - min) / span) * (H - 8)]);
  const d = monotone(pts);
  const color = TONE_MARK[tone];
  return `<svg class="spark" data-tip-custom="1" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-values="${esc(JSON.stringify(values))}" data-labels="${esc(JSON.stringify(labels || []))}" data-unit="${esc(unit || "")}" aria-hidden="true"><path d="${d}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`;
}
function mountSparks(root) {
  $$(".spark", root).forEach((el) => {
    const values = JSON.parse(el.dataset.values), labels = JSON.parse(el.dataset.labels), unit = el.dataset.unit;
    el.addEventListener("mousemove", (e) => {
      const box = el.getBoundingClientRect();
      const i = Math.max(0, Math.min(values.length - 1, Math.round(((e.clientX - box.left) / box.width) * (values.length - 1))));
      if (values[i] !== null) showTip(`<div class="tip-title">${esc(labels[i] || "")}</div>${values[i]} ${esc(unit)}`, e.clientX, e.clientY);
    });
    el.addEventListener("mouseleave", hideTip);
  });
}

function ring(done, total, size = 44, color = "#4656E6") {
  const r = size / 2 - 4, c = 2 * Math.PI * r, share = total ? done / total : 0;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(share * 100)} percent done"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E9EBF6" stroke-width="5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * share} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="${size * 0.26}" font-weight="600" fill="#14182B">${Math.round(share * 100)}</text></svg>`;
}

const HEAVY_ZONES = [{ to: 27.5, color: "#34C48B" }, { to: 29, color: "#F5C13D" }, { to: 30.5, color: "#F2822E" }, { to: 40, color: "#E5484D" }];
function gauge(value, size = 320) {
  const min = 20, max = 40, sw = size * 0.052, r = size / 2 - sw - 24, cx = size / 2, cy = r + sw + 24, height = cy + 14;
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const pt = (v, rad = r) => { const a = Math.PI * (1 - (clamp(v) - min) / (max - min)); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
  let from = min;
  const arcs = HEAVY_ZONES.map((z) => {
    const a = pt(from + 0.09), b = pt(z.to - 0.09);
    const out = `<path d="M${num(a[0])},${num(a[1])}A${num(r)},${num(r)} 0 0 1 ${num(b[0])},${num(b[1])}" fill="none" stroke="${z.color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
    from = z.to;
    return out;
  }).join("");
  const ends = [[min, HEAVY_ZONES[0].color], [max, HEAVY_ZONES[3].color]].map(([v, c]) => { const p = pt(v); return `<circle cx="${num(p[0])}" cy="${num(p[1])}" r="${sw / 2}" fill="${c}"/>`; }).join("");
  const ticks = [27.5, 29, 30.5].map((v) => { const p = pt(v, r + sw / 2 + 12); return `<text x="${num(p[0])}" y="${num(p[1] + 4)}" text-anchor="middle" class="axis">${v}</text>`; }).join("");
  const mark = pt(value);
  return `<svg class="gauge" width="100%" viewBox="0 0 ${size} ${height}" role="img" aria-label="Heat index ${value} degrees">${arcs}${ends}${ticks}<circle class="gauge-mark" cx="${num(mark[0])}" cy="${num(mark[1])}" r="${sw * 0.78}" fill="#fff" stroke="#14182B" stroke-width="${size * 0.012}"/></svg>`;
}

const LAMP_COLOR = { GREEN: "#34C48B", YELLOW: "#F5C13D", ORANGE: "#F2822E", RED: "#E5484D", RED_FLASH: "#E5484D" };
const lamp = (name) => `<span class="lamp${name === "RED_FLASH" ? " flash" : ""}" style="--lamp:${LAMP_COLOR[name]}" aria-hidden="true"></span>`;

function restBar(work, rest, words = {}) {
  if (work === 0) return `<div class="wr"><span class="wr-pause" style="flex:1">${ic("hand-stop", 14, 2)}${esc(words.pause || "Pause this hour")}</span></div>`;
  if (words.min) return `<div class="wr" role="img" aria-label="${work} ${esc(words.min)} / ${rest} ${esc(words.min)}"><span class="wr-work" style="flex:${work}">${work} ${esc(words.min)}</span>${rest ? `<span class="wr-rest" style="flex:${rest}">${rest >= 30 ? `${rest} ${esc(words.min)}` : rest}</span>` : ""}</div>`;
  return `<div class="wr" role="img" aria-label="${work} minutes work, ${rest} minutes rest"><span class="wr-work" style="flex:${work}">${work} min work</span>${rest ? `<span class="wr-rest" style="flex:${rest}">${rest >= 30 ? `${rest} min rest` : rest}</span>` : ""}</div>`;
}

/* Kachchh map from OpenStreetMap boundaries. */
let mapCache;
async function loadMap() {
  if (!mapCache) mapCache = await fetch("/static/assets/kachchh_map.json").then((r) => r.json());
  return mapCache;
}
function mapSvg(map, cfg = {}) {
  const paths = map.talukas.map((t) => `<path class="tal" data-name="${esc(t.name)}" d="${t.path}" tabindex="0" aria-label="${esc(t.name)}"/>`).join("");
  const labels = map.talukas.map((t) => {
    const lift = t.name === "Gandhidham" ? [62, -22] : t.name === "Anjar" ? [-24, 14] : [0, 0];
    return `<text class="tal-label" x="${t.label[0] + lift[0]}" y="${t.label[1] + lift[1]}" text-anchor="middle">${esc(t.name)}</text>`;
  }).join("");
  const pins = (cfg.pins || []).map(([k, name, dx = 12, dy = 5]) => { const p = map.points[k]; return `<g class="pin"><circle cx="${p[0]}" cy="${p[1]}" r="6"/><text x="${p[0] + dx}" y="${p[1] + dy}">${esc(name)}</text></g>`; }).join("");
  return `<svg class="kmap" viewBox="-6 -6 ${map.width + 12} ${map.height + 28}" role="img" aria-label="Map of Kachchh by taluka">${paths}${labels}${pins}</svg>`;
}
const HEAT_RAMP = [[0, [196, 48, 82]], [0.25, [229, 90, 104]], [0.5, [244, 133, 118]], [0.75, [251, 196, 176]], [1, [255, 241, 234]]];
function heatColor(hours) {
  const t = Math.max(0, Math.min(1, hours / 9));
  for (let i = 1; i < HEAT_RAMP.length; i++) {
    if (t <= HEAT_RAMP[i][0]) {
      const [a, ca] = HEAT_RAMP[i - 1], [b, cb] = HEAT_RAMP[i], k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
    }
  }
  return "rgb(255,241,234)";
}

const DUST_RAMP = [[0, [240, 253, 244]], [0.33, [254, 240, 138]], [0.58, [251, 146, 60]], [0.83, [225, 29, 72]], [1, [107, 33, 168]]];
function dustColor(pm10) {
  const t = Math.max(0, Math.min(1, pm10 / 120));
  for (let i = 1; i < DUST_RAMP.length; i++) {
    if (t <= DUST_RAMP[i][0]) {
      const [a, ca] = DUST_RAMP[i - 1], [b, cb] = DUST_RAMP[i], k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
    }
  }
  return "rgb(107,33,168)";
}

const COMPOUND_RAMP = [[0, [240, 253, 244]], [0.35, [254, 240, 138]], [0.60, [251, 146, 60]], [0.80, [225, 29, 72]], [1, [107, 33, 168]]];
function compoundColor(score) {
  const t = Math.max(0, Math.min(1, score / 100));
  for (let i = 1; i < COMPOUND_RAMP.length; i++) {
    if (t <= COMPOUND_RAMP[i][0]) {
      const [a, ca] = COMPOUND_RAMP[i - 1], [b, cb] = COMPOUND_RAMP[i], k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
    }
  }
  return "rgb(107,33,168)";
}

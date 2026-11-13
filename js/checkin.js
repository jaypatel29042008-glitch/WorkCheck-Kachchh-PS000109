"use strict";
/* The daily check-in: three short questions, a body to tap, and a calendar of past days.
   Gujarati and Hindi here need a fluent speaker's review before real use. */
const CHECKIN_I18N = {
  en: {
    title: "Today's check-in", sub: "Three quick questions. Takes under a minute.", q1: "How do you feel today?", q2: "Is anything bothering you? Tap the body.", q3: "Did you have these today?",
    nothing: "Nothing is bothering me", pick: "Tap a part of the body to choose what you feel.", yes: "Yes", no: "No", next: "Next", back: "Back", save: "Save check-in", done: "Checked in today", change: "Change",
    water: "Water drunk so far (litres)", hours: "Hours worked today", calendar: "My last 5 weeks", calSub: "One square for each day. Tap a day to see what you wrote.", noLog: "No check-in", missing: "Missing",
    stats: (h) => `Checked in ${h.logged} of 35 days${h.unwell_days ? `, ${h.unwell_days} not well` : ""}.`, streak: (n) => `${n} days in a row`, chosen: "You chose", step: (n) => `Step ${n} of 3`,
    feelings: { 1: "Good", 2: "Okay", 3: "Not well", 4: "Very unwell" },
    regions: { head: "Head", eyes: "Eyes", ears: "Ears", chest: "Chest and breathing", stomach: "Stomach and water", back: "Back", arms: "Arms and hands", legs: "Legs and feet", skin: "Skin", whole: "Whole body" },
    symptoms: {}, ppe: {},
  },
  gu: {
    title: "આજની નોંધ", sub: "ત્રણ ટૂંકા સવાલ. એક મિનિટથી ઓછો સમય.", q1: "આજે તમને કેવું લાગે છે?", q2: "કોઈ તકલીફ છે? શરીર પર દબાવો.", q3: "આજે આ વસ્તુઓ મળી હતી?",
    nothing: "કોઈ તકલીફ નથી", pick: "શું તકલીફ છે તે પસંદ કરવા શરીરના ભાગ પર દબાવો.", yes: "હા", no: "ના", next: "આગળ", back: "પાછળ", save: "નોંધ સાચવો", done: "આજની નોંધ થઈ ગઈ", change: "બદલો",
    water: "અત્યાર સુધી પીધેલું પાણી (લિટર)", hours: "આજે કામના કલાક", calendar: "મારા છેલ્લા 5 અઠવાડિયાં", calSub: "દરેક દિવસ માટે એક ચોરસ. શું લખ્યું હતું તે જોવા દિવસ પર દબાવો.", noLog: "નોંધ નથી", missing: "મળ્યું નહીં",
    stats: (h) => `35 માંથી ${h.logged} દિવસ નોંધ કરી${h.unwell_days ? `, ${h.unwell_days} દિવસ સારું નહોતું` : ""}.`, streak: (n) => `સળંગ ${n} દિવસ`, chosen: "તમે પસંદ કર્યું", step: (n) => `પગલું ${n} / 3`,
    feelings: { 1: "સારું", 2: "ઠીક", 3: "સારું નથી", 4: "ખૂબ ખરાબ" },
    regions: { head: "માથું", eyes: "આંખો", ears: "કાન", chest: "છાતી અને શ્વાસ", stomach: "પેટ અને પાણી", back: "કમર", arms: "હાથ", legs: "પગ", skin: "ચામડી", whole: "આખું શરીર" },
    symptoms: { headache: "માથાનો દુખાવો", dizzy: "ચક્કર આવવા", eye_burn: "આંખોમાં બળતરા કે પાણી", blurred: "ઝાંખું દેખાવું", ringing: "કાનમાં અવાજ", hard_hearing: "ઓછું સંભળાવું", cough: "ખાંસી", breathless: "શ્વાસ લેવામાં તકલીફ", chest_pain: "છાતીમાં દુખાવો", cramps: "પેટમાં ચૂંક", vomiting: "ઊલટી", dark_urine: "ઘેરો પેશાબ", back_pain: "કમરનો દુખાવો", joint_pain: "સાંધાનો દુખાવો", cuts: "કાપ કે ઘા", leg_cramps: "પગમાં ગોટલા", leg_pain: "પગમાં દુખાવો", rash: "ફોલ્લી કે ખંજવાળ", sunburn: "તડકાથી ચામડી બળવી", tired: "ખૂબ થાક", fever: "તાવ", collapse: "બેભાન થઈ જવું" },
    ppe: { mask: "ધૂળનો માસ્ક", helmet: "હેલ્મેટ", boots: "બૂટ", glasses: "આંખનું રક્ષણ", ears: "કાનનું રક્ષણ", water: "નજીકમાં પીવાનું પાણી", shade: "આરામ માટે છાંયડો" },
  },
  hi: {
    title: "आज की जानकारी", sub: "तीन छोटे सवाल. एक मिनट से कम समय.", q1: "आज आप कैसा महसूस कर रहे हैं?", q2: "कोई तकलीफ़ है? शरीर पर दबाइए.", q3: "क्या आज ये चीज़ें मिलीं?",
    nothing: "कोई तकलीफ़ नहीं", pick: "क्या तकलीफ़ है यह चुनने के लिए शरीर के हिस्से पर दबाइए.", yes: "हाँ", no: "नहीं", next: "आगे", back: "पीछे", save: "जानकारी सेव करें", done: "आज की जानकारी दर्ज है", change: "बदलें",
    water: "अब तक पिया पानी (लीटर)", hours: "आज काम के घंटे", calendar: "मेरे पिछले 5 हफ़्ते", calSub: "हर दिन के लिए एक खाना. क्या लिखा था यह देखने के लिए दिन पर दबाइए.", noLog: "जानकारी नहीं", missing: "नहीं मिला",
    stats: (h) => `35 में से ${h.logged} दिन जानकारी दी${h.unwell_days ? `, ${h.unwell_days} दिन तबीयत ठीक नहीं थी` : ""}.`, streak: (n) => `लगातार ${n} दिन`, chosen: "आपने चुना", step: (n) => `चरण ${n} / 3`,
    feelings: { 1: "अच्छा", 2: "ठीक-ठाक", 3: "ठीक नहीं", 4: "बहुत खराब" },
    regions: { head: "सिर", eyes: "आँखें", ears: "कान", chest: "सीना और साँस", stomach: "पेट और पानी", back: "कमर", arms: "हाथ", legs: "पैर", skin: "त्वचा", whole: "पूरा शरीर" },
    symptoms: { headache: "सिरदर्द", dizzy: "चक्कर आना", eye_burn: "आँखों में जलन या पानी", blurred: "धुंधला दिखना", ringing: "कान में आवाज़", hard_hearing: "कम सुनाई देना", cough: "खाँसी", breathless: "साँस लेने में तकलीफ़", chest_pain: "सीने में दर्द", cramps: "पेट में मरोड़", vomiting: "उल्टी", dark_urine: "गहरे रंग का पेशाब", back_pain: "कमर दर्द", joint_pain: "जोड़ों का दर्द", cuts: "कट या घाव", leg_cramps: "पैर में ऐंठन", leg_pain: "पैर में दर्द", rash: "दाने या खुजली", sunburn: "धूप से त्वचा जलना", tired: "बहुत थकान", fever: "बुखार", collapse: "बेहोश हो जाना" },
    ppe: { mask: "धूल का मास्क", helmet: "हेलमेट", boots: "जूते", glasses: "आँखों की सुरक्षा", ears: "कान की सुरक्षा", water: "पास में पीने का पानी", shade: "आराम के लिए छाया" },
  },
};
const FEEL_TONE = { 1: "clear", 2: "watch", 3: "due", 4: "action" };
const FEEL_ICON = { 1: "mood-smile", 2: "mood-neutral", 3: "mood-sad", 4: "mood-sad-2" };

/* A plain figure. Each region is its own shape so it can be tapped, focused and coloured. */
function checkinBody(counts, active, t) {
  const cls = (k) => `bp${counts[k] ? " has" : ""}${active === k ? " on" : ""}`;
  const attrs = (k) => `class="${cls(k)}" data-region="${k}" role="button" tabindex="0" aria-pressed="${active === k}" aria-label="${esc(t.regions[k])}${counts[k] ? `, ${counts[k]}` : ""}"`;
  const badge = (k, x, y) => (counts[k] ? `<g class="bp-n" pointer-events="none"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y + 3.6}" text-anchor="middle">${counts[k]}</text></g>` : "");
  const tip = (k) => ` data-tip="${esc(t.regions[k])}"`;
  return `<svg class="cbody" viewBox="0 0 220 392" aria-label="${esc(t.q2)}">
    <g ${attrs("arms")}${tip("arms")}><path d="M58 108C46 132 40 178 36 226" class="line"/><path d="M162 108C174 132 180 178 184 226" class="line"/></g>
    <g ${attrs("legs")}${tip("legs")}><path d="M93 240L89 372" class="line wide"/><path d="M127 240L131 372" class="line wide"/></g>
    <g ${attrs("head")}${tip("head")}><rect x="101" y="68" width="18" height="20" rx="4"/><circle cx="110" cy="46" r="27"/></g>
    <g ${attrs("ears")}${tip("ears")}><circle cx="82" cy="48" r="12" class="hit"/><circle cx="138" cy="48" r="12" class="hit"/><ellipse cx="82" cy="48" rx="4.5" ry="8"/><ellipse cx="138" cy="48" rx="4.5" ry="8"/></g>
    <g ${attrs("eyes")}${tip("eyes")}><rect x="92" y="34" width="36" height="20" rx="10" class="hit"/><circle cx="100" cy="44" r="4"/><circle cx="120" cy="44" r="4"/></g>
    <g ${attrs("chest")}${tip("chest")}><path d="M78 90h64a14 14 0 0 1 14 14l-5 62H69l-5-62a14 14 0 0 1 14-14Z"/></g>
    <g ${attrs("stomach")}${tip("stomach")}><path d="M69 170h82l-2 46a16 16 0 0 1-16 16H87a16 16 0 0 1-16-16Z"/></g>
    ${badge("head", 134, 24)}${badge("eyes", 110, 30)}${badge("ears", 150, 40)}${badge("chest", 152, 98)}${badge("stomach", 150, 180)}${badge("arms", 186, 170)}${badge("legs", 146, 300)}
  </svg>`;
}

function checkinSummary(log, t, cat) {
  const sym = log.symptoms.map((s) => t.symptoms[s.code] || s.label);
  const ppeLabel = (k) => t.ppe[k] || (cat.ppe.find((p) => p.key === k) || {}).label || k;
  return `<div class="ci-done ${FEEL_TONE[log.feeling]}">
      <span class="ci-face">${ic(FEEL_ICON[log.feeling], 30, 1.9)}</span>
      <div><h3>${esc(t.done)}: ${esc(t.feelings[log.feeling])}</h3>
        <p>${sym.length ? esc(sym.join(", ")) : esc(t.nothing)}${log.ppe_missing.length ? ` · ${esc(t.missing)}: ${esc(log.ppe_missing.map(ppeLabel).join(", "))}` : ""}</p></div>
      <button class="btn btn-ghost btn-sm" type="button" id="ci-change">${ic("pencil", 14, 2)}${esc(t.change)}</button>
    </div>`;
}

/* Mounts the card into host. data is the reply of /api/log/today. */
function mountCheckin(host, data, opts = {}) {
  const lang = opts.lang || "en";
  const t = { ...CHECKIN_I18N.en, ...CHECKIN_I18N[lang] };
  const cat = data.catalogue;
  const st = { step: data.log ? -1 : 0, feeling: data.log ? data.log.feeling : null, symptoms: new Set(data.log ? data.log.symptoms.map((s) => s.code) : []), region: null,
    ppe: data.log ? { ...data.log.ppe } : {}, water: data.log ? data.log.water_litres : null, hours: data.log ? data.log.hours : null };
  const symptomName = (s) => t.symptoms[s.code] || s.label;
  const regionOf = (code) => cat.regions.find((r) => r.symptoms.some((s) => s.code === code));
  const allSymptoms = cat.regions.flatMap((r) => r.symptoms);

  const stepFeeling = () => `<p class="ci-q">${esc(t.q1)}</p>
    <div class="ci-faces" role="radiogroup" aria-label="${esc(t.q1)}">${cat.feelings.map((f) => `<button type="button" role="radio" aria-checked="${st.feeling === f.value}" class="ci-feel ${FEEL_TONE[f.value]}${st.feeling === f.value ? " on" : ""}" data-feel="${f.value}">${ic(f.icon, 34, 1.7)}<span>${esc(t.feelings[f.value])}</span></button>`).join("")}</div>`;

  const stepBody = () => {
    const counts = {};
    st.symptoms.forEach((c) => { const r = regionOf(c); if (r) counts[r.key] = (counts[r.key] || 0) + 1; });
    const region = cat.regions.find((r) => r.key === st.region);
    const extra = ["back", "skin", "whole"];
    const chosen = [...st.symptoms].map((c) => allSymptoms.find((s) => s.code === c)).filter(Boolean);
    return `<p class="ci-q">${esc(t.q2)}</p>
      <div class="ci-body">
        <div class="ci-figure">${checkinBody(counts, st.region, t)}
          <div class="ci-extra">${extra.map((k) => `<button type="button" class="fpill${st.region === k ? " on" : ""}${counts[k] ? " has" : ""}" data-region="${k}" aria-pressed="${st.region === k}">${esc(t.regions[k])}${counts[k] ? ` <span>${counts[k]}</span>` : ""}</button>`).join("")}</div>
        </div>
        <div class="ci-pick" aria-live="polite">
          ${region ? `<h3>${esc(t.regions[region.key])}</h3><div class="ci-chips">${region.symptoms.map((s) => `<button type="button" class="ci-chip${st.symptoms.has(s.code) ? " on" : ""}${s.urgent ? " urgent" : ""}" data-sym="${s.code}" aria-pressed="${st.symptoms.has(s.code)}">${st.symptoms.has(s.code) ? ic("check", 14, 2.4) : s.urgent ? ic("alert-triangle", 14, 2) : ""}${esc(symptomName(s))}</button>`).join("")}</div>`
      : `<div class="ci-hint">${ic("hand-stop", 22)}<p>${esc(t.pick)}</p></div>`}
          ${chosen.length ? `<div class="ci-chosen"><small>${esc(t.chosen)}</small><p>${chosen.map((s) => esc(symptomName(s))).join(", ")}</p></div>` : ""}
        </div>
      </div>`;
  };

  const stepGear = () => `<p class="ci-q">${esc(t.q3)}</p>
    <div class="ci-gear">${cat.ppe.map((p) => `<div class="ci-gear-row"><span class="round sm bg-indigo">${ic(p.icon, 16, 2)}</span><b>${esc(t.ppe[p.key] || p.label)}</b>
      <div class="yn" role="radiogroup" aria-label="${esc(t.ppe[p.key] || p.label)}"><button type="button" role="radio" aria-checked="${st.ppe[p.key] === true}" class="${st.ppe[p.key] === true ? "on yes" : ""}" data-ppe="${p.key}" data-v="1">${esc(t.yes)}</button><button type="button" role="radio" aria-checked="${st.ppe[p.key] === false}" class="${st.ppe[p.key] === false ? "on no" : ""}" data-ppe="${p.key}" data-v="0">${esc(t.no)}</button></div></div>`).join("")}</div>
    <div class="ci-nums"><label class="field"><span>${esc(t.water)}</span><span class="input"><input id="ci-water" type="number" inputmode="decimal" min="0" max="15" step="0.5" value="${st.water ?? ""}" placeholder="2.5"></span></label>
      <label class="field"><span>${esc(t.hours)}</span><span class="input"><input id="ci-hours" type="number" inputmode="decimal" min="0" max="16" step="0.5" value="${st.hours ?? ""}" placeholder="9"></span></label></div>`;

  const draw = () => {
    if (st.step === -1) {
      host.innerHTML = `<div class="card-head"><div><h2>${esc(t.title)}</h2></div>${data.history.streak > 1 ? `<span class="pill clear sm">${ic("check", 12, 2.4)}${esc(t.streak(data.history.streak))}</span>` : ""}</div>${checkinSummary(data.log, t, cat)}`;
      $("#ci-change", host).addEventListener("click", () => { st.step = 0; draw(); });
      return;
    }
    const steps = [stepFeeling, stepBody, stepGear];
    host.innerHTML = `<div class="card-head"><div><h2>${esc(t.title)}</h2><p class="sub">${esc(t.sub)}</p></div><span class="ci-steps" aria-label="${esc(t.step(st.step + 1))}">${[0, 1, 2].map((i) => `<i class="${i < st.step ? "done" : i === st.step ? "on" : ""}"></i>`).join("")}</span></div>
      <div class="ci-step">${steps[st.step]()}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="ci-actions">
        ${st.step > 0 ? `<button class="btn btn-ghost" type="button" id="ci-back">${ic("arrow-left", 16, 2)}${esc(t.back)}</button>` : "<span></span>"}
        ${st.step === 1 && !st.symptoms.size ? `<button class="btn btn-ink" type="button" id="ci-next">${esc(t.nothing)}${ic("arrow-right", 16, 2)}</button>` : ""}
        ${st.step === 1 && st.symptoms.size ? `<button class="btn btn-ink" type="button" id="ci-next">${esc(t.next)}${ic("arrow-right", 16, 2)}</button>` : ""}
        ${st.step === 2 ? `<button class="btn btn-ink" type="button" id="ci-save">${ic("check", 16, 2.4)}${esc(t.save)}</button>` : ""}
      </div>`;
    $$("[data-feel]", host).forEach((b) => b.addEventListener("click", () => { st.feeling = Number(b.dataset.feel); st.step = 1; draw(); }));
    $$("[data-region]", host).forEach((el) => {
      const pick = () => { st.region = el.dataset.region; draw(); const first = $(".ci-chip", host); if (first) first.focus({ preventScroll: true }); };
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    $$("[data-sym]", host).forEach((b) => b.addEventListener("click", () => { const c = b.dataset.sym; if (st.symptoms.has(c)) st.symptoms.delete(c); else st.symptoms.add(c); draw(); }));
    $$("[data-ppe]", host).forEach((b) => b.addEventListener("click", () => { keepNumbers(); st.ppe[b.dataset.ppe] = b.dataset.v === "1"; draw(); }));
    const back = $("#ci-back", host), next = $("#ci-next", host), save = $("#ci-save", host);
    if (back) back.addEventListener("click", () => { keepNumbers(); st.step -= 1; draw(); });
    if (next) next.addEventListener("click", () => { st.step = 2; draw(); });
    if (save) save.addEventListener("click", submit);
  };
  const number = (id) => { const el = $(id, host); if (!el || el.value === "") return null; const v = Number(el.value); return Number.isFinite(v) ? v : null; };
  const keepNumbers = () => { if ($("#ci-water", host)) { st.water = number("#ci-water"); st.hours = number("#ci-hours"); } };
  const submit = async () => {
    keepNumbers();
    const btn = $("#ci-save", host);
    btn.disabled = true;
    try {
      const res = await api("/api/log", { method: "POST", body: { feeling: st.feeling, symptoms: [...st.symptoms], ppe: st.ppe, water_litres: st.water, hours: st.hours } });
      data.log = res.log; data.history = res.history;
      st.step = -1;
      draw();
      toast(res.message, res.urgent ? "action" : "good");
      if (opts.onSaved) opts.onSaved(res);
    } catch (err) { formError(host, err); btn.disabled = false; }
  };
  draw();
}

/* Five weeks as a grid, Monday first. Colour and a face together, so it never relies on colour alone. */
function logCalendar(h, lang = "en", days = 35) {
  const t = { ...CHECKIN_I18N.en, ...CHECKIN_I18N[lang] };
  const list = h.days.slice(-days);
  const [y, m, d] = list[0].day.split("-").map(Number);
  const pad = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const today = list[list.length - 1].day;
  const cell = (x) => {
    const bits = [`${dayName(x.day)} ${fmtDate(x.day, false)}`, x.feeling ? t.feelings[x.feeling] : t.noLog];
    if (x.symptoms.length) bits.push(x.symptoms.join(", "));
    if (x.ppe_missing.length) bits.push(`${t.missing}: ${x.ppe_missing.join(", ")}`);
    return `<span class="cal-day ${x.feeling ? FEEL_TONE[x.feeling] : "none"}${x.ppe_missing.length ? " gap" : ""}${x.day === today ? " today" : ""}" tabindex="0" data-tip="${esc(bits.join(". "))}" aria-label="${esc(bits.join(". "))}">${x.icon ? ic(x.icon, 17, 1.9) : `<small>${Number(x.day.slice(8))}</small>`}</span>`;
  };
  return `<div class="cal"><div class="cal-head">${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${"<span></span>".repeat(pad)}${list.map(cell).join("")}</div></div>
    <div class="legend cal-legend"><span><i class="lg clear"></i>${esc(t.feelings[1])}</span><span><i class="lg watch"></i>${esc(t.feelings[2])}</span><span><i class="lg due"></i>${esc(t.feelings[3])}</span><span><i class="lg action"></i>${esc(t.feelings[4])}</span><span><i class="lg none"></i>${esc(t.noLog)}</span></div>`;
}

function calendarCard(h, lang = "en", title) {
  const t = { ...CHECKIN_I18N.en, ...CHECKIN_I18N[lang] };
  return `<div class="card-head"><div><h2>${esc(title || t.calendar)}</h2><p class="sub">${esc(t.stats(h))}</p></div></div>${logCalendar(h, lang)}`;
}

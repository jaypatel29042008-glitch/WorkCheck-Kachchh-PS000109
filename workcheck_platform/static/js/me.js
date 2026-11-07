"use strict";
/* Worker Dashboard 2.0:
   - Feature 1: Health Pass · સ્વાસ્થ્ય કાર્ડ with QR Code.
   - Feature 2: 4 Worker Exposure & Demographic Metadata Tiles (Age, Worksite, Silica Range, Severe Heat Hours).
   - Feature 1 (Right): Log Daily Symptoms / લક્ષણો નોંધો (4 acute symptom checkboxes).
   - Feature 3: Nearest Hospital Connector depending on each site and sorted by diseases.
*/
const PLAN_KEYS = [100, 75, 50, 25, 0];
const I18N = {
  en: {
    name: "English", pauseHour: "Pause this hour", minWord: "min", testReading: "Test reading", hello: "Hello", fictional: "Fictional test record", signout: "Sign out",
    status: { action: ["Please visit the clinic", "Something on your record needs a doctor."], due: ["A check is waiting for you", "Visit the clinic when you can. It will not take long."], watch: ["Nothing to do today", "The risks of your work are being watched."], clear: ["You are all clear", "No check is waiting."] },
    today: "Today at work", plan: { 100: ["Safe to work", "No extra heat limit for this work. Keep drinking water."], 75: ["Take regular breaks", "Work 45 minutes, then rest 15 minutes in shade with water."], 50: ["Work half of each hour", "Work 30 minutes, then rest 30 minutes in shade with water."], 25: ["Mostly rest", "Work 15 minutes, then rest 45 minutes in shade with water."], 0: ["Pause this work", "Too hot for this work. A supervisor must review before it continues."] },
    feel: "Log Daily Symptoms / લક્ષણો નોંધો",
    feelSub: "Select any symptoms from today's shift. The clinic team will see your report.",
    collapse: "Someone collapsed in heat (Emergency 108)", saved: "Symptoms saved. The clinic team can see them.",
    urgentTitle: "Call 108 now", urgentSteps: ["Move them to shade immediately.", "Pour cool water on their skin and fan them vigorously.", "Do not give water if they are not fully alert."], call: "Call 108 Base",
    checks: "My Medical Checks", noChecks: "No check is waiting.",
    pass: "Health Pass · સ્વાસ્થ્ય કાર્ડ", passSub: "Prototype · Fictional test record",
    checkNames: { "Lung check": "Lung check", "TB test": "TB test", "Breathing test": "Breathing test", "Kidney test": "Kidney test", "Hydration check": "Hydration check", "Heat check": "Heat check", "Hearing test": "Hearing test", "Eye and skin check": "Eye & skin check", "Blood pressure check": "Blood pressure check", "Back and joint check": "Back & joint check" },
    stat: { Missed: "Missed", Due: "Due", "Follow-up open": "Follow-up open", "Doctor noted (demo)": "Doctor noted" },
  },
  gu: {
    name: "ગુજરાતી", pauseHour: "આ કલાકે કામ બંધ", minWord: "મિનિટ", testReading: "ટેસ્ટ રીડિંગ", hello: "નમસ્તે", fictional: "કાલ્પનિક ટેસ્ટ રેકોર્ડ", signout: "બહાર નીકળો",
    status: { action: ["કૃપા કરીને દવાખાને આવો", "તમારા રેકોર્ડમાં એક બાબત માટે ડૉક્ટરની જરૂર છે."], due: ["તમારી એક તપાસ બાકી છે", "સમય મળે ત્યારે દવાખાને જાઓ. વધુ સમય નહીં લાગે."], watch: ["આજે કંઈ કરવાનું નથી", "તમારા કામના જોખમ પર નજર રાખવામાં આવી રહી છે."], clear: ["બધું બરાબર છે", "કોઈ તપાસ બાકી નથી."] },
    today: "આજે કામ પર", plan: { 100: ["કામ કરવું સલામત છે", "આ કામ માટે ગરમીની વધારાની મર્યાદા નથી. પાણી પીતા રહો."], 75: ["નિયમિત આરામ લો", "45 મિનિટ કામ, પછી 15 મિનિટ છાંયડામાં આરામ અને પાણી."], 50: ["દર કલાકે અડધો સમય કામ કરો", "30 મિનિટ કામ, પછી 30 મિનિટ છાંયડામાં આરામ અને પાણી."], 25: ["મોટા ભાગે આરામ કરો", "15 મિનિટ કામ, પછી 45 મિનિટ છાંયડામાં આરામ અને પાણી."], 0: ["આ કામ બંધ કરો", "આ કામ માટે ખૂબ ગરમી છે. સુપરવાઈઝર તપાસ કરે પછી જ ફરી શરૂ કરો."] },
    feel: "લક્ષણો નોંધો / Log Daily Symptoms",
    feelSub: "આજના શિફ્ટ દરમિયાન થયેલા લક્ષણો પસંદ કરો. દવાખાનાની ટીમ તમારો રિપોર્ટ જોશે.",
    collapse: "ગરમીમાં કોઈ બેભાન થયું (ઇમરજન્સી 108)", saved: "લક્ષણો નોંધાયા. દવાખાનાની ટીમ તે જોઈ શકે છે.",
    urgentTitle: "હમણાં 108 પર ફોન કરો", urgentSteps: ["તેમને તાત્કાલિક છાંયડામાં લઈ જાઓ.", "ચામડી પર ઠંડું પાણી રેડો અને જોરથી પવન નાખો.", "પૂરા ભાનમાં ન હોય તો પાણી પીવડાવશો નહીં."], call: "108 પર ફોન કરો",
    checks: "મારી તપાસ", noChecks: "કોઈ તપાસ બાકી નથી.",
    pass: "સ્વાસ્થ્ય કાર્ડ · Health Pass", passSub: "પ્રોટોટાઇપ · કાલ્પનિક ટેસ્ટ રેકોર્ડ",
    checkNames: { "Lung check": "ફેફસાંની તપાસ", "TB test": "ટીબીની તપાસ", "Breathing test": "શ્વાસની તપાસ", "Kidney test": "કિડનીની તપાસ", "Hydration check": "પાણીની ઊણપની તપાસ", "Heat check": "ગરમીની અસરની તપાસ", "Hearing test": "સાંભળવાની તપાસ", "Eye and skin check": "આંખ અને ચામડીની તપાસ", "Blood pressure check": "બ્લડ પ્રેશરની તપાસ", "Back and joint check": "કમર અને સાંધાની તપાસ" },
    stat: { Missed: "ચૂકી ગયા", Due: "બાકી", "Follow-up open": "ફરી તપાસ બાકી", "Doctor noted (demo)": "ડૉક્ટરે નોંધ્યું" },
  },
  hi: {
    name: "हिंदी", pauseHour: "इस घंटे काम बंद", minWord: "मिनट", testReading: "टेस्ट रीडिंग", hello: "नमस्ते", fictional: "काल्पनिक टेस्ट रिकॉर्ड", signout: "बाहर निकलें",
    status: { action: ["कृपया क्लिनिक आइए", "आपके रिकॉर्ड में एक बात के लिए डॉक्टर की ज़रूरत है."], due: ["आपकी एक जाँच बाकी है", "समय मिलने पर क्लिनिक जाइए. ज़्यादा समय नहीं लगेगा."], watch: ["आज कुछ नहीं करना है", "आपके काम के जोखिम पर नज़र रखी जा रही है."], clear: ["सब ठीक है", "कोई जाँच बाकी नहीं है."] },
    today: "आज काम पर", plan: { 100: ["काम करना सुरक्षित है", "इस काम के लिए गर्मी की कोई अतिरिक्त सीमा नहीं है. पानी पीते रहिए."], 75: ["नियमित आराम लीजिए", "45 मिनट काम, फिर 15 मिनट छाया में आराम और पानी."], 50: ["हर घंटे आधा समय काम कीजिए", "30 मिनट काम, फिर 30 मिनट छाया में आराम और पानी."], 25: ["ज़्यादातर आराम कीजिए", "15 मिनट काम, फिर 45 मिनट छाया में आराम और पानी."], 0: ["यह काम रोक दीजिए", "इस काम के लिए बहुत गर्मी है. सुपरवाइज़र की जाँच के बाद ही फिर शुरू कीजिए."] },
    feel: "दैनिक लक्षण दर्ज करें / Log Daily Symptoms",
    feelSub: "आज की शिफ्ट में हुए लक्षण चुनें. क्लिनिक की टीम आपकी रिपोर्ट देखेगी.",
    collapse: "गर्मी में कोई बेहोश हो गया (इमरजेंसी 108)", saved: "लक्षण दर्ज हुए. क्लिनिक की टीम उन्हें देख सकती है.",
    urgentTitle: "अभी 108 पर फ़ोन कीजिए", urgentSteps: ["उन्हें तुरंत छाया में ले जाइए.", "त्वचा पर ठंडा पानी डालिए और हवा कीजिए.", "पूरी तरह होश में न हों तो पानी मत पिलाइए."], call: "108 पर फ़ोन कीजिए",
    checks: "मेरी जाँच", noChecks: "कोई जाँच बाकी नहीं है.",
    pass: "स्वास्थ्य कार्ड · Health Pass", passSub: "प्रोटोटाइप · काल्पनिक टेस्ट रिकॉर्ड",
    checkNames: { "Lung check": "फेफड़ों की जाँच", "TB test": "टीबी की जाँच", "Breathing test": "साँस की जाँच", "Kidney test": "किडनी की जाँच", "Hydration check": "पानी की कमी की जाँच", "Heat check": "गर्मी के असर की जाँच", "Hearing test": "सुनने की जाँच", "Eye and skin check": "आँख और त्वचा की जाँच", "Blood pressure check": "ब्लड प्रेशर की जाँच", "Back and joint check": "कमर और जोड़ों की जाँच" },
    stat: { Missed: "छूट गई", Due: "बाकी", "Follow-up open": "दोबारा जाँच बाकी", "Doctor noted (demo)": "डॉक्टर ने नोट किया" },
  },
};

const SYMPTOM_DEFINITIONS = [
  { id: "dark_urine", title: "Dark Urine (કાળો / ઘેરો પેશાબ)", sub: "Key clinical dehydration & CKD marker", icon: "droplet" },
  { id: "dizzy", title: "Dizziness / Fainting (ચક્કર આવવા)", sub: "Acute heat exhaustion warning", icon: "alert-triangle" },
  { id: "cough", title: "Persistent Cough (લાંબા સમયની ખાંસી)", sub: "Respirable quartz / silica warning", icon: "lungs" },
  { id: "eye_skin", title: "Eye Burning / Glare (આંખોમાં બળતરા)", sub: "Solar UV & salt brine reflection", icon: "eye" },
];

function getLang() { try { return localStorage.getItem("wc-lang") || "en"; } catch { return "en"; } }
function setLang(l) { try { localStorage.setItem("wc-lang", l); } catch { /* ignore */ } }

// Worker dashboard reactive state
const W_STATE = {
  workerId: "SIM-B",
  siteId: "little_rann_kutch",
  disease: "all",
  facData: null,
};

VIEWS.me = async () => {
  const workerId = (S.user && S.user.worker_id) || W_STATE.workerId || "SIM-B";
  W_STATE.workerId = workerId;

  const [p, today] = await Promise.all([
    api(`/api/workers/${encodeURIComponent(workerId)}`),
    api("/api/me/today"),
  ]);

  if (p.card && p.card.location_id) {
    W_STATE.siteId = p.card.location_id;
  }

  const facData = await api(`/api/facilities?site_id=${encodeURIComponent(W_STATE.siteId)}&disease=${encodeURIComponent(W_STATE.disease)}`);
  W_STATE.facData = facData;

  S.mine = { p, today, facData };
  renderMe();
};

function renderFacilityCardsHtml(facilities) {
  if (!facilities || !facilities.length) {
    return `<div class="empty small">${ic("hospital-circle", 24)}<p>No health facilities match this criteria.</p></div>`;
  }
  return facilities.map((f) => {
    const tierClass = f.facility_tier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `
      <div class="facility-card${f.disease_match ? " matched" : ""}" data-facility-id="${esc(f.facility_id)}">
        <div class="fac-card-top">
          <div>
            <span class="tier-badge ${tierClass}">${esc(f.facility_tier)}</span>
            <h4 class="fac-name">${esc(f.facility_name)}</h4>
            <span class="fac-taluka">Taluka: <b>${esc(f.taluka)}</b> &bull; <span class="dist-badge">about ${f.distance_km} km, straight line</span></span>
          </div>
          <span class="round xs bg-indigo t-indigo">${ic("hospital-circle", 18, 2)}</span>
        </div>

        <div class="fac-capabilities">
          <span class="${f.has_digital_xray ? "yes" : "no"}">&bull; Digital X-Ray: <b>${f.has_digital_xray ? "YES" : "NO"}</b></span>
          <span class="${f.has_spirometer ? "yes" : "no"}">&bull; Spirometer: <b>${f.has_spirometer ? "YES" : "NO"}</b></span>
          <span class="${f.has_biochemical_lab ? "yes" : "no"}">&bull; Blood Lab: <b>${f.has_biochemical_lab ? "YES" : "NO"}</b></span>
          <span class="${f.emergency_108_base ? "yes alert-108" : "no"}">&bull; 108 Base: <b>${f.emergency_108_base ? "YES" : "NO"}</b></span>
        </div>

        ${f.match_label ? `<div class="fac-match-pill">${esc(f.match_label)}</div>` : ""}

        <div class="fac-actions">
          <button type="button" class="btn btn-ghost btn-sm fac-route-btn" data-fac-id="${esc(f.facility_id)}" data-fac-name="${esc(f.facility_name)}">
            ${ic("route", 14, 2)} Note referral
          </button>
          ${f.emergency_108_base ? `<a class="btn btn-danger btn-sm" href="tel:108" title="Call Emergency 108">${ic("phone", 13, 2)} 108</a>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderMe() {
  const { p, today, facData } = S.mine;
  const lang = getLang(), t = I18N[lang];
  const level = p.state.level;
  document.documentElement.lang = lang;
  const adv = today.advice, plan = t.plan[adv.allowed_work_pct];
  const icons = { action: "alert-triangle", due: "calendar-check", watch: "eye", clear: "circle-check" };
  const first = p.card.name.split(" ")[0];

  const jobRoleTaluka = `${p.card.job} · ${p.card.taluka}`;
  const worksiteName = p.card.place;
  const silicaRange = p.silica_range;
  const safeHeat = p.safe_heat_hours;
  const statutoryText = p.statutory_text;

  $("#app").innerHTML = `<div class="me">
    <header class="me-top">
      ${logo()}
      <button class="icon-btn" id="sign-out" type="button" aria-label="${esc(t.signout)}">${ic("logout", 18)}</button>
    </header>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div class="lang" role="group" aria-label="Language">
        ${Object.entries(I18N).map(([k, v]) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}"${k === lang ? ' class="on"' : ""}>${v.name}</button>`).join("")}
      </div>
    </div>

    <h1>${esc(t.hello)}, ${esc(first)}</h1>

    <!-- Triage Status Banner -->
    <section class="next ${level} me-status">
      <span class="round">${ic(icons[level], 24, 2)}</span>
      <div>
        <h3>${esc(t.status[level][0])}</h3>
        <p>${esc(t.status[level][1])}</p>
      </div>
    </section>

    <!-- Top Grid: Health Pass (Features 1 & 2) on Left, Symptoms Logger (Feature 1 Right) on Right -->
    <div class="worker-dashboard-grid">
      <!-- Feature 1 & 2: Health Pass Card -->
      <section class="card health-pass-card">
        <div class="pass-header">
          <div class="pass-title-group">
            <span class="round sm bg-green t-green">${ic("shield-check", 22, 2)}</span>
            <div>
              <h3>${esc(t.pass)}</h3>
              <p class="sub">${esc(t.passSub)}</p>
            </div>
          </div>
          <span class="pill none sm" style="font-weight:700">Test pass</span>
        </div>

        <div class="pass-id-box">
          <div class="pass-qr-wrap" id="pass-qr-box" title="QR pass"></div>
          <div class="pass-fields">
            <div>
              <label>Name:</label>
              <h4>${esc(p.card.name)}</h4>
            </div>
            <div>
              <label>Job Role &amp; Taluka:</label>
              <span class="role-taluka">${esc(jobRoleTaluka)}</span>
            </div>
            <div>
              <label>Test record ID:</label>
              <span class="uan-mono">${esc(p.card.id)}</span>
            </div>
          </div>
        </div>

        <!-- Feature 2: 4 Detailed Worker Metadata Tiles Grid -->
        <div class="pass-meta-grid">
          <div class="meta-item">
            <label>Age:</label>
            <span>${esc(p.card.age)} yrs</span>
          </div>
          <div class="meta-item">
            <label>Assigned Worksite:</label>
            <span class="t-indigo">${esc(worksiteName)}</span>
          </div>
          <div class="meta-item">
            <label>Cumulative Silica Est. Range:</label>
            <span class="t-amber">${esc(silicaRange)}</span>
          </div>
          <div class="meta-item">
            <label>Safe Heat Hours (Apr–Oct, model):</label>
            <span class="t-rose">${esc(safeHeat)}</span>
          </div>
        </div>

        <div class="statutory-banner">
          <span class="round xs bg-indigo t-indigo">${ic("scale-outline", 14, 2)}</span>
          <div>
            <b>Legal exam:</b>
            <p>${esc(statutoryText)}</p>
          </div>
        </div>
      </section>

      <!-- Feature 1 (Right): Log Daily Symptoms Panel -->
      <section class="card symptoms-card">
        <div class="card-head">
          <div class="symptom-title-group">
            <span class="round sm bg-amber t-amber">${ic("alert-triangle", 20, 2)}</span>
            <div>
              <h2>${esc(t.feel)}</h2>
              <p class="sub">${esc(t.feelSub)}</p>
            </div>
          </div>
        </div>

        <div class="symptom-checkbox-grid">
          ${SYMPTOM_DEFINITIONS.map((s) => `
            <label class="symptom-checkbox-tile">
              <input type="checkbox" name="acute-symptom" value="${s.id}" id="symp-${s.id}" />
              <div class="tile-content">
                <b>${esc(s.title)}</b>
                <small>${esc(s.sub)}</small>
              </div>
            </label>
          `).join("")}
        </div>

        <div class="symptom-actions">
          <button type="button" class="btn btn-ink" id="btn-submit-symptoms" style="flex:2">
            ${ic("clipboard-check", 18, 2)} Submit Clinical Symptoms
          </button>
          <button type="button" class="btn btn-danger" id="collapse" style="flex:1">
            ${ic("ambulance", 18, 2)} ${esc(t.call)}
          </button>
        </div>

        <div id="symptom-feedback-banner" class="symptom-feedback good" hidden>
          ${ic("circle-check", 18, 2)}
          <span id="symptom-feedback-text"></span>
        </div>
      </section>
    </div>

    <!-- Today Work-Rest Heat Guidance Bar -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>${esc(t.today)}</h2>
          <p class="sub">Work and rest guidance from published heat tables</p>
        </div>
        <span class="pill none sm">${esc(t.testReading)}</span>
      </div>
      <p class="me-plan">${lamp(adv.lamp)}<b>${esc(plan[0])}</b></p>
      ${restBar(adv.work, adv.rest, { pause: t.pauseHour, min: t.minWord })}
      <p class="sub me-plan-text">${esc(plan[1])}</p>
      <p class="fine">${esc(today.site)} &bull; WBGT ${today.wbgt_c}°C</p>
    </section>

    <!-- Feature 3: Nearest Hospital Connector Depending on Each Site & Sorted by Diseases -->
    <section class="card facilities-connector-card">
      <div class="facilities-header">
        <div>
          <h2>Nearest health facilities</h2>
          <p class="sub">Sample list for testing. Confirm services with each facility.</p>
        </div>
        <div class="facilities-site-picker">
          <label for="fac-site-select">${ic("map-pin", 14, 2)} Worksite:</label>
          <select id="fac-site-select">
            ${facData.sites.map((s) => `<option value="${s.site_id}"${s.site_id === W_STATE.siteId ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="disease-sorter-toolbar">
        <span class="sorter-label">${ic("adjustments-horizontal", 14, 2)} Sort &amp; Filter by Disease:</span>
        <div class="disease-pills" id="disease-pills">
          ${facData.diseases.map((d) => `
            <button type="button" class="pill-btn${d.key === W_STATE.disease ? " on" : ""}" data-disease="${d.key}">
              ${ic(d.icon, 13, 2)} ${esc(d.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="facilities-grid" id="facilities-grid">
        ${renderFacilityCardsHtml(facData.facilities)}
      </div>
    </section>

    <!-- My Open Checks Section -->
    <section class="card">
      <div class="card-head">
        <h2>${esc(t.checks)}</h2>
      </div>
      ${p.open_checks.length ? `<div class="todo">${p.open_checks.map((k) => `<div class="todo-row"><span class="round sm bg-${k.tone} t-${k.tone}">${ic(k.icon, 16, 2)}</span><div><b>${esc(t.checkNames[k.check] || k.check)}</b><small class="t-${k.tone}">${esc(t.stat[k.text] || k.text)}</small></div></div>`).join("")}</div>` : `<div class="empty small">${ic("circle-check", 24)}<p>${esc(t.noChecks)}</p></div>`}
    </section>

    <p class="fine center">${esc(t.fictional)}</p>
  </div>`;

  // Render QR Code in the Health Pass Card
  const qr = qrcode(0, "M");
  qr.addData(`${location.origin}${location.pathname}#/workers/${p.card.id}`);
  qr.make();
  const qrContainer = $("#pass-qr-box");
  if (qrContainer) {
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 3.8, margin: 0, scalable: true });
  }

  $("#sign-out").addEventListener("click", signOut);

  $$("[data-lang]").forEach((b) => b.addEventListener("click", () => {
    setLang(b.dataset.lang);
    renderMe();
  }));

  // Submit Clinical Symptoms (Multi-checkbox)
  $("#btn-submit-symptoms").addEventListener("click", async () => {
    const checked = $$('input[name="acute-symptom"]:checked').map((el) => el.value);
    if (!checked.length) {
      toast("Please check at least one symptom to log.", "watch");
      return;
    }
    try {
      const res = await api(`/api/workers/${encodeURIComponent(p.card.id)}/symptoms/batch`, {
        method: "POST",
        body: { symptoms: checked },
      });
      const banner = $("#symptom-feedback-banner");
      const bannerText = $("#symptom-feedback-text");
      if (banner && bannerText) {
        bannerText.textContent = res.message || t.saved;
        banner.hidden = false;
      }
      toast(t.saved, "good");
      $$('input[name="acute-symptom"]').forEach((el) => { el.checked = false; });
    } catch (err) {
      toast(err.message || "Failed to log symptoms.", "action");
    }
  });

  // Emergency 108 collapse handler
  $("#collapse").addEventListener("click", async () => {
    await api(`/api/workers/${encodeURIComponent(p.card.id)}/symptoms`, { method: "POST", body: { symptom: "collapse" } });
    openModal(`<div class="urgent"><span class="round bg-action t-action">${ic("ambulance", 26, 2)}</span><h2>${esc(t.urgentTitle)}</h2><ol>${t.urgentSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><a class="btn btn-danger btn-full" href="tel:108">${ic("phone", 20, 2)}${esc(t.call)}</a></div>`, t.urgentTitle);
  });

  // Worksite selector change (Nearest Hospital Connector)
  const siteSelect = $("#fac-site-select");
  if (siteSelect) {
    siteSelect.addEventListener("change", async (e) => {
      W_STATE.siteId = e.target.value;
      const updated = await api(`/api/facilities?site_id=${encodeURIComponent(W_STATE.siteId)}&disease=${encodeURIComponent(W_STATE.disease)}`);
      W_STATE.facData = updated;
      S.mine.facData = updated;
      const grid = $("#facilities-grid");
      if (grid) grid.innerHTML = renderFacilityCardsHtml(updated.facilities);
      wireReferrals();
    });
  }

  // Disease sorter buttons
  $$("#disease-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      $$("#disease-pills .pill-btn").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      W_STATE.disease = btn.dataset.disease;
      const updated = await api(`/api/facilities?site_id=${encodeURIComponent(W_STATE.siteId)}&disease=${encodeURIComponent(W_STATE.disease)}`);
      W_STATE.facData = updated;
      S.mine.facData = updated;
      const grid = $("#facilities-grid");
      if (grid) grid.innerHTML = renderFacilityCardsHtml(updated.facilities);
      wireReferrals();
    });
  });

  function wireReferrals() {
    $$(".fac-route-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const facId = btn.dataset.facId;
        const facName = btn.dataset.facName;
        try {
          const reply = await api("/api/facilities/refer", {
            method: "POST",
            body: {
              worker_id: p.card.id,
              facility_id: facId,
              disease: W_STATE.disease,
            },
          });
          btn.innerHTML = `${ic("circle-check", 14, 2)} Referral Noted`;
          btn.classList.add("btn-ink");
          toast(reply.message || `Referral to ${facName} noted.`, "good");
        } catch (err) {
          toast(err.message || "Could not note the referral.", "action");
        }
      });
    });
  }

  wireReferrals();
}

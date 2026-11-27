"use strict";
/* Full client-side interactive backend emulator for static GitHub Pages hosting.
   Persists onboarding, daily check-ins, incidents, medical checks, referrals, training,
   site checklists, and device controls in browser localStorage so deployed Pages matches
   localhost feature-for-feature without requiring a Python backend. */
(() => {
  const STORE_KEY = "wc_demo_store_v1";
  const USER_KEY = "wc_static_user";
  const CONSENT_VERSION = "dpdp-v1-2026";
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  const ORG_KINDS = [
    "Salt pan", "Port or dock", "Cement plant", "Construction site",
    "Stone crusher or mine", "Transport yard", "Other",
  ];
  const PLACES = [
    ["little_rann_kutch", "Little Rann (Rapar)"], ["kandla_port", "Kandla Port"],
    ["mundra_port", "Mundra Port"], ["abdasa_cement", "Abdasa cement belt"],
    ["bhuj", "Bhuj"], ["anjar", "Anjar"], ["bhachau", "Bhachau"],
    ["gandhidham", "Gandhidham"], ["lakhpat", "Lakhpat"], ["mandvi", "Mandvi"],
    ["nakhatrana", "Nakhatrana"], ["rapar", "Rapar town"],
  ];
  const JOB_CHOICES = [
    ["salt_raking", "Salt-pan worker"], ["port_yard_kandla", "Port yard loader"],
    ["cement_yard", "Cement yard loader"], ["cement_walk", "Plant staff, walking rounds"],
    ["construction", "Construction worker"], ["stone_crushing", "Stone crusher operator"],
    ["crane_cab", "Crane operator"], ["truck_cab", "Truck driver"],
  ];
  const JOB_ICONS = {
    salt_raking: "salt", port_yard_kandla: "forklift", port_yard_mundra: "forklift",
    cement_yard: "building-factory-2", cement_walk: "building-factory-2",
    construction: "helmet", stone_crushing: "pick", crane_cab: "crane", truck_cab: "truck",
  };
  const ROLE_NAMES = {
    clinician: "Clinic team", ddo: "District office",
    supervisor: "Site supervisor", worker: "Worker",
  };
  const CONTROL_DEFAULTS = {
    ambient_temp_c: 34.0, relative_humidity_pct: 45.0,
    globe_temp_c: 44.0, pm10_0_ug_m3: 90.0, uv_index: 9.0, noise_dba: 78.0,
  };

  const FEELINGS = {
    1: ["Good", "mood-smile", "clear"],
    2: ["Okay", "mood-neutral", "watch"],
    3: ["Not well", "mood-sad", "due"],
    4: ["Very unwell", "mood-sad-2", "action"],
  };
  const SYMPTOMS = {
    headache: ["Headache", "head", false, null],
    dizzy: ["Dizzy or faint", "head", false, "dizzy"],
    eye_burn: ["Eyes burning or watering", "eyes", false, "eye_skin"],
    blurred: ["Blurred sight", "eyes", false, "eye_skin"],
    ringing: ["Ringing in ears", "ears", false, null],
    hard_hearing: ["Hard to hear", "ears", false, null],
    cough: ["Cough", "chest", false, "cough"],
    breathless: ["Hard to breathe", "chest", false, "breathless"],
    chest_pain: ["Chest pain", "chest", true, null],
    cramps: ["Stomach cramps", "stomach", false, "dizzy"],
    vomiting: ["Vomiting", "stomach", false, "dizzy"],
    dark_urine: ["Dark urine", "stomach", false, "dark_urine"],
    back_pain: ["Back pain", "back", false, "back_joint"],
    joint_pain: ["Joint pain", "arms", false, "back_joint"],
    cuts: ["Cut or wound", "arms", false, null],
    leg_cramps: ["Leg cramps", "legs", false, "dizzy"],
    leg_pain: ["Leg or foot pain", "legs", false, "back_joint"],
    rash: ["Rash or itching", "skin", false, "eye_skin"],
    sunburn: ["Sunburn", "skin", false, "eye_skin"],
    tired: ["Very tired", "whole", false, null],
    fever: ["Fever", "whole", false, null],
    collapse: ["Collapsed or fainted", "whole", true, "collapse"],
  };
  const CLINIC_SYMPTOM_LABELS = {
    breathless: "Short of breath", cough: "Persistent cough", dizzy: "Dizziness or heat fainting",
    dark_urine: "Dark urine or pain passing water", eye_skin: "Skin or eye irritation",
    back_joint: "Back or joint strain", collapse: "Collapsed at work",
  };
  const REGIONS = [
    ["head", "Head"], ["eyes", "Eyes"], ["ears", "Ears"], ["chest", "Chest and breathing"],
    ["stomach", "Stomach and water"], ["back", "Back"], ["arms", "Arms and hands"],
    ["legs", "Legs and feet"], ["skin", "Skin"], ["whole", "Whole body"],
  ];
  const PPE = [
    ["mask", "Dust mask", "face-mask"], ["helmet", "Helmet", "helmet"],
    ["boots", "Boots", "shoe"], ["glasses", "Eye protection", "eye"],
    ["ears", "Ear protection", "ear"], ["water", "Water within reach", "bottle"],
    ["shade", "Shade for breaks", "umbrella"],
  ];
  const PPE_FOR_JOB = {
    salt_raking: ["glasses", "boots", "water", "shade"],
    port_yard_kandla: ["helmet", "boots", "mask", "ears", "water", "shade"],
    port_yard_mundra: ["helmet", "boots", "mask", "ears", "water", "shade"],
    cement_yard: ["mask", "helmet", "boots", "glasses", "water", "shade"],
    cement_walk: ["mask", "helmet", "boots", "water"],
    construction: ["helmet", "boots", "mask", "water", "shade"],
    stone_crushing: ["mask", "ears", "glasses", "boots", "water", "shade"],
    crane_cab: ["helmet", "boots", "water"],
    truck_cab: ["boots", "water"],
  };
  const INCIDENT_KINDS = [
    ["injury", "Injury", "first-aid-kit"], ["near_miss", "Near miss", "alert-triangle"],
    ["heat", "Heat illness", "temperature-sun"], ["dust", "Dust or fumes", "wind"],
    ["machine", "Machine or vehicle", "forklift"], ["other", "Other", "notes"],
  ];
  const SEVERITIES = {
    minor: ["Minor, no time off", "due"],
    serious: ["Serious, needed care", "action"],
    emergency: ["Emergency, 108 called", "action"],
  };
  const COURSES = [
    ["heat", "Heat safety", 12], ["dust", "Dust and mask fit", 12],
    ["first_aid", "First aid", 24], ["noise", "Hearing protection", 12],
    ["lifting", "Safe lifting", 24],
  ];
  const SITE_ITEMS = [
    ["water", "Drinking water within 100 m", "bottle"], ["shade", "Shaded rest area", "umbrella"],
    ["masks", "Dust masks in stock", "face-mask"], ["first_aid", "First-aid kit stocked", "first-aid-kit"],
    ["heat_plan", "Heat plan on display", "temperature-sun"], ["spray", "Water spray for dust working", "droplets"],
    ["ears", "Ear protection available", "ear"], ["exam", "Yearly medical exams booked", "stethoscope"],
  ];
  const MEDICAL = [
    ["Lung check", 12], ["TB test", 12], ["Breathing test", 12], ["Kidney test", 12],
    ["Hearing test", 12], ["Eye and skin check", 12], ["Blood pressure check", 12],
    ["Back and joint check", 12], ["Heat check", 6], ["Hydration check", 6],
  ];
  const RESULTS = {
    normal: ["Nothing noted", "clear"],
    follow_up: ["Follow-up needed", "due"],
    referred: ["Referred on", "action"],
  };
  const CONDITION_STATUS = {
    CHECKED_NOTHING_NOTED: ["clear", "Nothing noted"],
    CHECKED_FOLLOW_UP_OPEN: ["due", "Follow-up open"],
    CHECKED_FOLLOW_UP_DONE: ["clear", "Follow-up done"],
    CHECK_DUE: ["due", "Due"],
    CHECK_MISSED: ["action", "Missed"],
  };
  const COMMON_PASSWORDS = new Set(["password123", "password1234", "1234567890", "workcheck123"]);
  let _memStore = null;

  function istDateIso(offsetDays = 0) {
    const ms = Date.now() + 19800000 - offsetDays * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  function nowIso() { return new Date().toISOString(); }
  function addMonthsIso(dayIso, months) {
    const parts = String(dayIso || istDateIso()).slice(0, 10).split("-").map(Number);
    const d = parts.length === 3 && parts.every(Number.isFinite)
      ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
      : new Date();
    const origDay = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + Number(months || 12));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(origDay, last));
    return d.toISOString().slice(0, 10);
  }
  function daysDiff(aIso, bIso) {
    const a = Date.parse(`${aIso.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${bIso.slice(0, 10)}T00:00:00Z`);
    return Math.round((a - b) / 86400000);
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normaliseIdentity(v) {
    const clean = String(v || "").trim();
    if (clean.includes("@")) return clean.toLowerCase();
    const digits = clean.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    return digits.length === 10 ? digits : clean.toLowerCase();
  }
  function passwordProblem(pw, identity = "") {
    if (!pw || pw.length < 10) return "Use at least 10 characters.";
    const low = pw.toLowerCase();
    if (COMMON_PASSWORDS.has(low) || COMMON_PASSWORDS.has(low.replace(/-/g, ""))) {
      return "That password is too common. Pick something only you would know.";
    }
    if (identity && low.includes(identity.toLowerCase())) {
      return "Don't use your email or phone number in the password.";
    }
    return null;
  }
  function initialsOf(name) {
    const parts = String(name || "").replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
    return ((parts[0] ? parts[0][0] : "?") + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  function newCode(existing) {
    for (;;) {
      let s = "";
      for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      const code = `${s.slice(0, 4)}-${s.slice(4)}`;
      if (!existing.some((x) => x.code === code)) return code;
    }
  }
  function catalogue() {
    return {
      feelings: Object.entries(FEELINGS).map(([k, [label, icon, tone]]) => ({ value: Number(k), label, icon, tone })),
      regions: REGIONS.map(([key, label]) => ({
        key, label,
        symptoms: Object.entries(SYMPTOMS).filter(([, v]) => v[1] === key).map(([code, v]) => ({ code, label: v[0], urgent: v[2] })),
      })),
      ppe: PPE.map(([key, label, icon]) => ({ key, label, icon })),
      incident_kinds: INCIDENT_KINDS.map(([key, label, icon]) => ({ key, label, icon })),
      severities: Object.entries(SEVERITIES).map(([key, [label]]) => ({ key, label })),
      courses: COURSES.map(([key, label, months]) => ({ key, label, months })),
      site_items: SITE_ITEMS.map(([key, label, icon]) => ({ key, label, icon })),
      medical: MEDICAL.map(([name, months]) => ({ name, months })),
      results: Object.entries(RESULTS).map(([key, [label]]) => ({ key, label })),
    };
  }

  function seedStore(D) {
    const demoOrg = { id: 1, name: "Kachchh Sample Operations", kind: "Salt pan", district: "Kachchh", demo: true, created_at: "2026-01-01T00:00:00Z" };
    const sites = [{ id: 1, org_id: 1, name: "Little Rann Salt Pan (Rapar)", location_id: "little_rann_kutch", created_at: "2026-01-01T00:00:00Z" }];
    const users = {};
    let uid = 1;
    Object.entries(D.users || {}).forEach(([email, entry]) => {
      users[email] = {
        id: uid++,
        email,
        password: entry.password,
        user: { ...entry.user, org_id: 1, site_id: 1, org: { id: 1, name: demoOrg.name, kind: demoOrg.kind, demo: true } },
        created_at: "2026-01-01T00:00:00Z",
      };
    });

    const workers = ((D.workers && D.workers.workers) || []);
    const rng = makeRng(7);
    const sample = [];
    const seen = new Set();
    const simB = workers.find((w) => w.id === "SIM-B");
    if (simB) { sample.push(simB); seen.add(simB.id); }
    workers.slice(0, 36).forEach((w) => { if (!seen.has(w.id)) { sample.push(w); seen.add(w.id); } });

    const daily_logs = [];
    const pool = ["headache", "tired", "cough", "eye_burn", "leg_cramps", "back_pain", "dizzy", "dark_urine"];
    for (let d = 0; d < 21; d++) {
      const day = istDateIso(d);
      sample.forEach((w) => {
        // Leave SIM-B unlogged today so Worker test login showcases the interactive Daily Check-in wizard immediately.
        if (d === 0 && w.id === "SIM-B") return;
        if (rng() < 0.22 + 0.015 * d) return;
        const r = rng();
        const feeling = r < 0.62 ? 1 : r < 0.87 ? 2 : r < 0.98 ? 3 : 4;
        const symCount = feeling > 1 ? Math.min(2, Math.floor(rng() * feeling)) : (rng() < 0.08 ? 1 : 0);
        const symptoms = [];
        for (let k = 0; k < symCount; k++) {
          const code = pool[Math.floor(rng() * pool.length)];
          if (!symptoms.includes(code)) symptoms.push(code);
        }
        const jobId = (D.worker_details && D.worker_details[w.id] && D.worker_details[w.id].places && D.worker_details[w.id].places.slice(-1)[0]?.job_id) || "salt_raking";
        const keys = PPE_FOR_JOB[jobId] || PPE.map((x) => x[0]);
        const ppe = {};
        keys.forEach((k) => { ppe[k] = rng() > (k === "mask" ? 0.22 : k === "shade" ? 0.08 : 0.04); });
        daily_logs.push({
          id: daily_logs.length + 1,
          worker_id: w.id,
          org_id: 1,
          day,
          at: `${day}T07:30:00Z`,
          feeling,
          symptoms,
          ppe,
          water_litres: Number((1.8 + rng() * 2.5).toFixed(1)),
          hours: [8, 9, 9, 10][Math.floor(rng() * 4)],
          note: "",
        });
      });
    }

    const pickWorker = (i) => sample[i % sample.length] || { id: "SIM-W090" };
    const incidents = [
      { id: 1, org_id: 1, site_id: 1, site_name: sites[0].name, worker_id: pickWorker(2).id, kind: "near_miss", severity: "minor", what: "Forklift reversed close to a worker at the loading bay.", action: "Spoke to the driver. Painted a walking line.", status: "closed", at: `${istDateIso(9)}T09:15:00Z`, closed_at: `${istDateIso(9)}T14:00:00Z`, closed_note: "Marked pedestrian lane." },
      { id: 2, org_id: 1, site_id: 1, site_name: sites[0].name, worker_id: pickWorker(5).id, kind: "heat", severity: "serious", what: "A worker felt faint at 2pm on the salt pan. Moved to shade, drank water, recovered in 40 minutes.", action: "Shifted the afternoon break to 1pm.", status: "open", at: `${istDateIso(4)}T08:40:00Z`, closed_at: null, closed_note: "" },
      { id: 3, org_id: 1, site_id: 1, site_name: sites[0].name, worker_id: null, kind: "dust", severity: "minor", what: "Water spray at the crusher stopped for the morning.", action: "", status: "open", at: `${istDateIso(1)}T05:30:00Z`, closed_at: null, closed_note: "" },
    ];

    const medical_checks = [];
    sample.slice(0, 20).forEach((w, idx) => {
      const [check_name, months] = MEDICAL[idx % 7];
      const daysOffset = idx % 3 === 0 ? -(10 + idx) : idx % 3 === 1 ? (5 + idx) : 120;
      const next_due = istDateIso(-daysOffset);
      const done_on = addMonthsIso(next_due, -months);
      medical_checks.push({
        id: medical_checks.length + 1,
        org_id: 1,
        worker_id: w.id,
        check_name,
        done_on,
        result: daysOffset < 0 ? "follow_up" : "normal",
        next_due,
        note: "",
        at: `${done_on}T06:00:00Z`,
      });
    });

    const trainings = [];
    sample.slice(0, 22).forEach((w, idx) => {
      COURSES.slice(0, 3).forEach(([course, , months], ci) => {
        const daysAgo = 40 + ((idx * 37 + ci * 130) % 410);
        const done_on = istDateIso(daysAgo);
        trainings.push({ id: trainings.length + 1, org_id: 1, worker_id: w.id, course, done_on, valid_until: addMonthsIso(done_on, months), at: `${done_on}T06:00:00Z` });
      });
    });

    const site_checks = [];
    SITE_ITEMS.forEach(([item], idx) => {
      const status = (item === "shade" || item === "spray") ? "missing" : "ok";
      site_checks.push({ id: idx + 1, org_id: 1, site_id: 1, site_name: sites[0].name, item, status, note: "", at: `${istDateIso(item === "water" ? 2 : 12)}T06:00:00Z` });
    });

    return {
      version: 1,
      nextId: 100,
      orgs: [demoOrg],
      sites,
      users,
      invites: [],
      org_workers: [],
      daily_logs,
      incidents,
      medical_checks,
      referrals: [],
      trainings,
      site_checks,
      condition_updates: {},
      symptom_reviews: {},
      custom_symptoms: {},
      node_controls: { "1:wokwi-node-01": { device_id: "wokwi-node-01", org_id: 1, enabled: false, values: { ...CONTROL_DEFAULTS }, rev: 0, ack_rev: 0, ack_at: null, updated_at: null } },
      consents: {},
    };
  }

  function loadStore(D) {
    if (_memStore) return _memStore;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.orgs)) {
          _memStore = parsed;
          return _memStore;
        }
      }
    } catch { /* ignore storage errors */ }
    _memStore = seedStore(D);
    saveStore(_memStore);
    return _memStore;
  }

  function saveStore(store) {
    _memStore = store;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* ignore quota */ }
  }

  function nextId(store) {
    store.nextId = (store.nextId || 100) + 1;
    return store.nextId;
  }

  function enrichUser(u, store) {
    if (!u) return null;
    const oid = u.org_id || 1;
    const org = store.orgs.find((o) => o.id === oid) || store.orgs[0];
    return {
      ...u,
      org_id: org.id,
      site_id: u.site_id || (store.sites.find((s) => s.org_id === org.id) || {}).id || 1,
      org: { id: org.id, name: org.name, kind: org.kind, demo: Boolean(org.demo) },
    };
  }

  function currentSessionUser(store) {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return enrichUser(parsed, store);
    } catch {
      try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
      return null;
    }
  }

  function setSessionUser(user, store) {
    const clean = enrichUser(user, store);
    try {
      if (clean) localStorage.setItem(USER_KEY, JSON.stringify(clean));
      else localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    return clean;
  }

  function requireUser(store, ApiError, roles) {
    const u = currentSessionUser(store);
    if (!u) throw new ApiError(401, "Please sign in.");
    if (roles && !roles.includes(u.role)) throw new ApiError(403, "Your role cannot open this page.");
    return u;
  }

  function toLogRow(r) {
    const meta = FEELINGS[r.feeling] || FEELINGS[1];
    const syms = (r.symptoms || []).filter((c) => SYMPTOMS[c]).map((c) => ({
      code: c, label: SYMPTOMS[c][0], region: SYMPTOMS[c][1], urgent: SYMPTOMS[c][2],
    }));
    const ppe = r.ppe || {};
    return {
      id: r.id, worker_id: r.worker_id, day: r.day, at: r.at,
      feeling: r.feeling, feeling_label: meta[0], tone: meta[2], icon: meta[1],
      symptoms: syms, ppe,
      ppe_missing: Object.entries(ppe).filter(([, v]) => v === false).map(([k]) => k),
      water_litres: r.water_litres ?? null, hours: r.hours ?? null, note: r.note || "",
      urgent: syms.some((s) => s.urgent),
    };
  }

  function dayTone(log) {
    if (!log) return "none";
    if (log.urgent || log.feeling === 4) return "action";
    if (log.feeling === 3 || log.symptoms.length >= 2) return "due";
    if (log.ppe_missing.length) return "watch";
    return "clear";
  }

  function buildHistory(store, workerId, days = 35) {
    const byDay = {};
    store.daily_logs.filter((r) => r.worker_id === workerId).forEach((r) => { byDay[r.day] = toLogRow(r); });
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = istDateIso(i);
      const log = byDay[d] || null;
      out.push({
        day: d,
        tone: dayTone(log),
        feeling: log ? log.feeling : null,
        icon: log ? log.icon : null,
        symptoms: log ? log.symptoms.map((s) => s.label) : [],
        ppe_missing: log ? log.ppe_missing : [],
        note: log ? log.note : "",
      });
    }
    const loggedRows = out.filter((h) => h.feeling);
    let streak = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].feeling) streak++;
      else break;
    }
    const symCounts = {};
    loggedRows.forEach((h) => h.symptoms.forEach((s) => { symCounts[s] = (symCounts[s] || 0) + 1; }));
    const common = Object.entries(symCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      days: out, logged: loggedRows.length, streak,
      unwell_days: loggedRows.filter((h) => h.feeling >= 3).length,
      common,
    };
  }

  function basicWorkersForOrg(D, store, orgId) {
    const org = store.orgs.find((o) => o.id === orgId);
    if (org && org.demo) {
      return ((D.workers && D.workers.workers) || []).map((w) => {
        const det = D.worker_details && D.worker_details[w.id];
        const jobId = (det && det.places && det.places.slice(-1)[0]?.job_id) || "salt_raking";
        return { id: w.id, name: w.name, initials: w.initials, job: w.job, job_id: jobId, icon: w.icon, place: w.place, location_id: w.location_id || "bhuj", taluka: w.taluka, site_id: 1, age: w.age };
      });
    }
    const siteMap = Object.fromEntries(store.sites.filter((s) => s.org_id === orgId).map((s) => [s.id, s]));
    const placeMap = Object.fromEntries(PLACES);
    const jobMap = Object.fromEntries(JOB_CHOICES);
    return store.org_workers.filter((w) => w.org_id === orgId).map((w) => {
      const site = siteMap[w.site_id];
      const locId = site ? site.location_id : "bhuj";
      return {
        id: w.id, name: w.name, initials: initialsOf(w.name), age: w.age,
        employer: "Joined with invite", job: jobMap[w.job_id] || w.job_id, job_id: w.job_id,
        icon: JOB_ICONS[w.job_id] || "helmet",
        place: site ? site.name : "No site", location_id: locId,
        taluka: placeMap[locId] || "", site_id: w.site_id, joined: w.joined_at, phone: w.phone,
      };
    });
  }

  function workerBelongs(store, workerId, orgId) {
    if (String(workerId).startsWith("SIM-")) return orgId === 1;
    return store.org_workers.some((w) => w.id === workerId && w.org_id === orgId);
  }

  function medicalStatusMap(store, orgId, workerIds) {
    const set = new Set(workerIds);
    const latest = {};
    store.medical_checks.filter((m) => m.org_id === orgId && set.has(m.worker_id)).forEach((m) => {
      const key = `${m.worker_id}::${m.check_name}`;
      if (!latest[key] || m.done_on >= latest[key].done_on) latest[key] = m;
    });
    const td = istDateIso(0);
    const out = {};
    Object.values(latest).forEach((m) => {
      if (!m.next_due) return;
      const days = daysDiff(m.next_due, td);
      const entry = { check: m.check_name, due: m.next_due, days, state: days < 0 ? "overdue" : days <= 30 ? "soon" : "ok" };
      if (!out[m.worker_id] || entry.days < out[m.worker_id].days) out[m.worker_id] = entry;
    });
    return out;
  }

  function siteCheckState(store, orgId) {
    const td = istDateIso(0);
    return store.sites.filter((s) => s.org_id === orgId).map((s) => {
      const latest = {};
      store.site_checks.filter((c) => c.org_id === orgId && c.site_id === s.id).forEach((c) => { latest[c.item] = c; });
      const items = SITE_ITEMS.map(([key, label, icon]) => {
        const r = latest[key];
        let status = r ? r.status : "unknown";
        if (status === "ok" && r && daysDiff(td, r.at.slice(0, 10)) > 30) status = "stale";
        return { key, label, icon, status, checked_on: r ? r.at.slice(0, 10) : null, note: r ? (r.note || "") : "" };
      });
      return {
        ...s, items,
        missing: items.filter((i) => i.status === "missing").length,
        unchecked: items.filter((i) => i.status === "unknown" || i.status === "stale").length,
      };
    });
  }

  function incidentRow(r, namesByWid) {
    const kind = INCIDENT_KINDS.find((k) => k[0] === r.kind) || INCIDENT_KINDS[INCIDENT_KINDS.length - 1];
    const sev = SEVERITIES[r.severity] || SEVERITIES.minor;
    return { ...r, kind_label: kind[1], icon: kind[2], severity_label: sev[0], tone: r.status === "closed" ? "clear" : sev[1], worker_name: namesByWid[r.worker_id] || null };
  }

  function orgWorkerLevel(store, orgId, workerId) {
    const week = istDateIso(6);
    const reasons = [];
    store.daily_logs
      .filter((r) => r.worker_id === workerId && r.day >= week)
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .forEach((raw) => {
        const l = toLogRow(raw);
        const dm = `${l.day.slice(8)}/${l.day.slice(5, 7)}`;
        if (l.urgent) reasons.push({ tone: "action", text: `Reported ${l.symptoms[0].label.toLowerCase()} on ${dm}`, urgent: true });
        else if (l.feeling >= 3) {
          const sy = l.symptoms.length ? `: ${l.symptoms.slice(0, 2).map((s) => s.label.toLowerCase()).join(", ")}` : "";
          reasons.push({ tone: l.feeling === 3 ? "due" : "action", text: `Felt ${l.feeling_label.toLowerCase()} on ${dm}${sy}`, urgent: false });
        }
      });
    const med = medicalStatusMap(store, orgId, [workerId])[workerId];
    if (med) {
      if (med.state === "overdue") reasons.push({ tone: "action", text: `${med.check} overdue since ${med.due}`, urgent: false });
      else if (med.state === "soon") reasons.push({ tone: "due", text: `${med.check} due by ${med.due}`, urgent: false });
    }
    const level = reasons.some((r) => r.tone === "action") ? "action" : reasons.length ? "due" : "watch";
    return { level, reasons };
  }

  function orgWorkerCards(D, store, orgId) {
    return basicWorkersForOrg(D, store, orgId).map((c) => {
      const { level, reasons } = orgWorkerLevel(store, orgId, c.id);
      const hasAnyLog = store.daily_logs.some((r) => r.worker_id === c.id);
      return {
        ...c, level,
        headline: reasons[0] ? reasons[0].text : hasAnyLog ? "Checked in, nothing open" : "No check-ins yet",
        headline_area: null, more: Math.max(0, reasons.length - 1), moves: 0,
        urgent: reasons.some((r) => r.urgent),
      };
    });
  }

  function simWorkerPassport(D, store, wid) {
    const base = D.worker_details && D.worker_details[wid];
    if (!base) return null;
    const p = JSON.parse(JSON.stringify(base));
    const updates = store.condition_updates[wid] || {};
    const statusMap = (st) => CONDITION_STATUS[st] || ["due", st];
    const rewriteChecks = (arr) => (arr || []).map((k) => {
      if (!updates[k.condition]) return k;
      const [tone, text] = statusMap(updates[k.condition].status);
      return { ...k, tone, text };
    });
    p.open_checks = rewriteChecks(p.open_checks);
    p.other_checks = rewriteChecks(p.other_checks);
    const revs = store.symptom_reviews || {};
    const extraSyms = (store.custom_symptoms[wid] || []).slice();
    p.symptoms = extraSyms.concat(p.symptoms || []).map((s) => (revs[`${wid}:${s.id}`] ? { ...s, reviewed: true } : s));
    p.updates = (Object.values(updates).map((u) => ({ at: u.at.slice(0, 10), text: `${u.condition}: ${u.text}`, note: u.note }))).concat(p.updates || []);
    return p;
  }

  function buildOrgPassport(D, store, wid) {
    const w = store.org_workers.find((x) => x.id === wid);
    if (!w) return null;
    const card = orgWorkerCards(D, store, w.org_id).find((c) => c.id === wid);
    if (!card) return null;
    const { level, reasons } = orgWorkerLevel(store, w.org_id, wid);
    const log = buildHistory(store, wid, 35);
    const heatVal = D.heat_year && D.heat_year[card.job_id] && D.heat_year[card.job_id].summer ? D.heat_year[card.job_id].summer["9-18"] : null;
    const exposure = [];
    if (heatVal != null) {
      const lvl = heatVal < 4.5 ? "high" : heatVal < 7 ? "moderate" : "ok";
      exposure.push({ key: "heat", label: "Heat", icon: "temperature-sun", value: heatVal.toFixed(1), unit: "safe hours a shift", caption: "April to October, model estimate for this job", level: lvl, chip: { high: "High", moderate: "Moderate", ok: "Low" }[lvl], series: [], months: [] });
    }
    const week = istDateIso(6);
    const hoursRows = store.daily_logs.filter((r) => r.worker_id === wid && r.day >= week && r.hours != null);
    const totH = hoursRows.reduce((s, r) => s + Number(r.hours), 0);
    exposure.push(hoursRows.length
      ? { key: "hours", label: "Work hours", icon: "clock-hour-9", value: String(Math.round(totH)), unit: "hours in the last 7 days", caption: "From the worker's own check-ins", level: totH >= 55 ? "high" : "ok", chip: totH >= 55 ? "Over 55 hours" : "Under 55 hours", series: [], months: [] }
      : { key: "hours", label: "Work hours", icon: "clock-hour-9", value: "None", unit: "entered in the last 7 days", caption: "From the worker's own check-ins", level: "none", chip: "No data", series: [], months: [] });

    const medical = store.medical_checks
      .filter((m) => m.worker_id === wid && m.org_id === w.org_id)
      .sort((a, b) => (a.done_on < b.done_on ? 1 : -1))
      .map((m) => ({ ...m, result_label: (RESULTS[m.result] || RESULTS.normal)[0], tone: (RESULTS[m.result] || RESULTS.normal)[1] }));
    const referrals = store.referrals.filter((r) => r.worker_id === wid && r.org_id === w.org_id).slice().reverse();
    const courseLabels = Object.fromEntries(COURSES.map(([k, l]) => [k, l]));
    const trainings = store.trainings.filter((t) => t.worker_id === wid && t.org_id === w.org_id).map((t) => ({ ...t, course_label: courseLabels[t.course] || t.course }));
    const syms = (store.custom_symptoms[wid] || []).map((s) => ({
      ...s,
      text: CLINIC_SYMPTOM_LABELS[s.code || s.text] || s.text,
      reviewed: Boolean(store.symptom_reviews[`${wid}:${s.id}`] || s.reviewed),
    }));
    const first = card.name.split(" ")[0];
    let nxt;
    if (reasons[0] && reasons[0].urgent) nxt = { title: `${first} reported an emergency symptom`, body: "If this is happening now, call 108. Check on them today.", cta: "Record a check" };
    else if (level === "action") nxt = { title: `Check on ${first}`, body: `${reasons[0].text}.`, cta: "Record a check" };
    else if (level === "due") nxt = { title: `Book a check for ${first}`, body: `${reasons[0].text}.`, cta: "Record a check" };
    else nxt = { title: "Nothing to do today", body: `${first} has nothing open. Daily check-ins are being watched.`, cta: null };

    return {
      card, state: { level, reasons: reasons.map((r) => r.text) }, next: nxt, exposure,
      log, medical, referrals, trainings, symptoms: syms,
      joined: w.joined_at, label: "Browser demo record (saved in this browser). Not a diagnosis.", kind: "org",
    };
  }

  function buildDashboard(D, store, user) {
    const orgId = user.org_id || 1;
    const org = store.orgs.find((o) => o.id === orgId) || store.orgs[0];
    const workers = basicWorkersForOrg(D, store, orgId);
    const byId = Object.fromEntries(workers.map((w) => [w.id, w]));
    const td = istDateIso(0);
    const staff = user.role === "supervisor" || user.role === "clinician";
    const rowsToday = store.daily_logs.filter((r) => r.org_id === orgId && r.day === td).map(toLogRow);
    const feelings = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const unwell = [];
    rowsToday.forEach((l) => {
      feelings[l.feeling] = (feelings[l.feeling] || 0) + 1;
      if (l.feeling >= 3 || l.urgent) {
        const w = byId[l.worker_id] || { name: "Unknown", job: "", initials: "?", icon: "helmet" };
        const syms = l.symptoms.filter(() => user.role === "clinician" || l.urgent).map((s) => s.label);
        unwell.push({ worker_id: l.worker_id, name: w.name, job: w.job, initials: w.initials, icon: w.icon, feeling: l.feeling, feeling_label: l.feeling_label, tone: l.tone, symptoms: syms, urgent: l.urgent, note: user.role === "clinician" ? l.note : "" });
      }
    });
    unwell.sort((a, b) => (a.urgent !== b.urgent ? (a.urgent ? -1 : 1) : b.feeling - a.feeling));

    const ppeGaps = PPE.map(([key, label, icon]) => {
      const asked = rowsToday.filter((l) => key in l.ppe);
      if (!asked.length) return null;
      const missing = asked.filter((l) => l.ppe[key] === false);
      return { key, label, icon, missing: missing.length, of: asked.length, names: missing.slice(0, 8).map((l) => (byId[l.worker_id] || {}).name || "?") };
    }).filter(Boolean).sort((a, b) => b.missing - a.missing);

    const openInc = store.incidents
      .filter((i) => i.org_id === orgId && i.status === "open")
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((r) => incidentRow(r, Object.fromEntries(workers.map((w) => [w.id, w.name]))));

    const medMap = medicalStatusMap(store, orgId, workers.map((w) => w.id));
    const medOver = Object.entries(medMap).filter(([, s]) => s.state === "overdue").map(([wid, s]) => ({ ...byId[wid], ...s }));
    const medSoon = Object.entries(medMap).filter(([, s]) => s.state === "soon").map(([wid, s]) => ({ ...byId[wid], ...s }));
    const neverMed = workers.filter((w) => !medMap[w.id]);

    const latestTr = {};
    store.trainings.filter((t) => t.org_id === orgId).forEach((t) => { latestTr[`${t.worker_id}::${t.course}`] = t; });
    let trExp = 0, trSoon = 0;
    const trainedIds = new Set();
    Object.values(latestTr).forEach((t) => {
      trainedIds.add(t.worker_id);
      const d = daysDiff(t.valid_until, td);
      if (d < 0) trExp++;
      else if (d <= 30) trSoon++;
    });

    const sites = siteCheckState(store, orgId);
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const day = istDateIso(i);
      const dayLogs = store.daily_logs.filter((r) => r.org_id === orgId && r.day === day);
      series.push({ day, checked_in: dayLogs.length, unwell: dayLogs.filter((r) => r.feeling >= 3).length });
    }

    let unreviewed = 0;
    workers.forEach((w) => {
      const syms = (store.custom_symptoms[w.id] || []).concat((D.worker_details && D.worker_details[w.id] && D.worker_details[w.id].symptoms) || []);
      unreviewed += syms.filter((s) => !s.reviewed && !store.symptom_reviews[`${w.id}:${s.id}`]).length;
    });

    const todo = [];
    const urg = unwell.filter((u) => u.urgent);
    if (urg.length) todo.push({ tone: "action", text: `${urg[0].name} reported ${(urg[0].symptoms[0] || "an emergency").toLowerCase()} today. Check on them now.`, href: "#/dashboard" });
    if (unwell.length > urg.length) todo.push({ tone: unwell.length >= 3 ? "action" : "due", text: `${unwell.length} worker${unwell.length === 1 ? "" : "s"} said they are not well today.`, href: "#/dashboard" });
    if (openInc.length) todo.push({ tone: openInc.some((i) => i.severity !== "minor") ? "action" : "due", text: `${openInc.length} incident${openInc.length === 1 ? "" : "s"} still open. Record what was done and close them.`, href: "#/incidents" });
    const missingSite = sites.flatMap((s) => s.items.filter((i) => i.status === "missing").map((i) => [s.name, i.label]));
    if (missingSite.length) todo.push({ tone: "due", text: `${missingSite[0][1]} is missing at ${missingSite[0][0]}.` + (missingSite.length > 1 ? ` ${missingSite.length - 1} more missing.` : ""), href: "#/compliance" });
    if (ppeGaps[0] && ppeGaps[0].missing) todo.push({ tone: "due", text: `${ppeGaps[0].missing} of ${ppeGaps[0].of} who checked in had no ${ppeGaps[0].label.toLowerCase()} today.`, href: "#/dashboard" });
    if (medOver.length) todo.push({ tone: "due", text: `${medOver.length} medical check${medOver.length === 1 ? " is" : "s are"} overdue.`, href: "#/care" });
    if (trExp) todo.push({ tone: "due", text: `${trExp} training record${trExp === 1 ? " has" : "s have"} run out.`, href: "#/compliance" });
    const unchecked = sites.reduce((s, x) => s + x.unchecked, 0);
    if (unchecked) todo.push({ tone: "watch", text: `${unchecked} site item${unchecked === 1 ? " has" : "s have"} not been checked this month.`, href: "#/compliance" });
    if (workers.length && rowsToday.length < workers.length * 0.5) todo.push({ tone: "watch", text: `Only ${rowsToday.length} of ${workers.length} workers have checked in today.`, href: "#/dashboard" });
    if (!todo.length) todo.push({ tone: "clear", text: "Nothing is waiting. Everyone who checked in is well and the site items are in place.", href: null });

    const mask = staff ? (n) => n : (n) => (n > 0 && n < 5 ? "<5" : n);
    const outFeelings = {};
    Object.keys(FEELINGS).forEach((k) => { outFeelings[k] = mask(feelings[k] || 0); });
    return {
      day: td,
      org: { ...org, demo: Boolean(org.demo) },
      workers_total: mask(workers.length),
      checked_in: mask(rowsToday.length),
      feelings: outFeelings,
      feeling_labels: Object.fromEntries(Object.entries(FEELINGS).map(([k, v]) => [k, v[0]])),
      unwell: staff ? unwell : [],
      unwell_count: mask(unwell.length),
      ppe: staff ? ppeGaps : ppeGaps.map(({ names, ...rest }) => ({ ...rest, missing: mask(rest.missing), of: mask(rest.of) })),
      incidents: { open: mask(openInc.length), list: staff ? openInc.slice(0, 5) : [] },
      medical: { overdue: mask(medOver.length), soon: mask(medSoon.length), never: mask(neverMed.length) },
      training: { expired: mask(trExp), expiring: mask(trSoon), never: mask(workers.length - trainedIds.size) },
      sites,
      trend: staff ? series : [],
      todo: staff ? todo : todo.filter((x) => !x.text.includes("reported")),
      unreviewed_reports: mask(unreviewed),
    };
  }

  function controlsViewDemo(store, orgId, dev) {
    const key = `${orgId}:${dev}`;
    const c = (store.node_controls && store.node_controls[key]) || {
      device_id: dev, org_id: orgId, enabled: false, values: { ...CONTROL_DEFAULTS },
      rev: 0, ack_rev: 0, ack_at: null, updated_at: null,
    };
    const values = { ...CONTROL_DEFAULTS, ...(c.values || {}) };
    const seenAt = store.node_device_seen && store.node_device_seen[key];
    const seen = seenAt ? Math.max(0, Math.round((Date.now() - seenAt) / 1000)) : null;
    const acked = Boolean(c.ack_at && c.ack_rev === c.rev && c.rev > 0);
    const confirmedSec = acked ? Math.max(0, Math.round((Date.now() - Date.parse(c.ack_at)) / 1000)) : null;
    return {
      ...c,
      values,
      device_seen_seconds: seen,
      device_online: seen !== null && seen < 60,
      confirmed: Boolean(c.enabled && acked),
      confirmed_seconds: confirmedSec,
    };
  }

  function storeDemoReading(store, orgId, view, isWokwi) {
    store.node_latest = store.node_latest || {};
    store.node_recent = store.node_recent || {};
    store.node_device_seen = store.node_device_seen || {};
    store.node_wokwi_seen = store.node_wokwi_seen || {};
    store.node_latest[orgId] = view;
    const prev = Array.isArray(store.node_recent[orgId]) ? store.node_recent[orgId] : [];
    store.node_recent[orgId] = [{
      id: view.id, at: view.at, device_id: view.device_id, site_id: view.site_id, source: view.source,
      wbgt_c: view.wbgt_c, ambient_temp_c: view.ambient_temp_c, relative_humidity_pct: view.relative_humidity_pct,
      pm10_0_ug_m3: view.pm10_0_ug_m3, uv_index: view.uv_index, noise_dba: view.noise_dba,
    }, ...prev].slice(0, 6);
    store.node_device_seen[`${orgId}:${view.device_id}`] = Date.now();
    if (isWokwi) store.node_wokwi_seen[orgId] = { at: Date.now(), device_id: view.device_id };
  }

  window.workcheckDemoApi = async function workcheckDemoApi(path, method, options, helpers) {
    const D = window.WORKCHECK_STATIC_DATA;
    const { ApiError, computeWbgt, haversineKm, nodeView, cache, talukaAliases } = helpers;
    const store = loadStore(D);
    const u = new URL(path, window.location.origin);
    const p = u.pathname;
    const body = (options && options.body) || {};

    // --- Auth & Privacy ---
    if (p === "/api/auth/options") {
      const su = currentSessionUser(store);
      return { demo: true, env: "browser-demo", consent_version: CONSENT_VERSION, authenticated: Boolean(su), user: su };
    }
    if (p === "/api/privacy/notice") {
      return D.privacy_notice || { consent_version: CONSENT_VERSION, controller: "WorkCheck Kachchh Pilot", rights: [] };
    }
    if (p === "/api/privacy/consent" && method === "POST") {
      const su = requireUser(store, ApiError);
      const stamp = nowIso();
      store.consents[su.email] = { version: CONSENT_VERSION, at: stamp };
      saveStore(store);
      return { ok: true, consent_version: CONSENT_VERSION, consent_at: stamp };
    }
    if (p === "/api/auth/login" && method === "POST") {
      const id = normaliseIdentity(body.email);
      const acct = store.users[id] || store.users[body.email];
      if (!acct || acct.password !== body.password) throw new ApiError(401, "Check your email and password.");
      return setSessionUser(acct.user, store);
    }
    if (p === "/api/auth/me") return requireUser(store, ApiError);
    if (p === "/api/auth/logout") {
      setSessionUser(null, store);
      return { ok: true };
    }
    if (p === "/api/auth/password" && method === "POST") {
      const su = requireUser(store, ApiError);
      const acct = store.users[su.email];
      if (!acct || acct.password !== body.current) throw new ApiError(400, "That is not your current password.");
      const prob = passwordProblem(body.new, su.email);
      if (prob) throw new ApiError(400, prob);
      acct.password = body.new;
      saveStore(store);
      return { ok: true, message: "Password updated in this browser demo." };
    }

    // --- Onboarding, Teams & Invites ---
    if (p === "/api/org/options") {
      return { kinds: ORG_KINDS, places: PLACES.map(([id, label]) => ({ id, label })), jobs: JOB_CHOICES.map(([id, label]) => ({ id, label })) };
    }
    if (p === "/api/org/register" && method === "POST") {
      const email = normaliseIdentity(body.email);
      if (!email.includes("@") && !/^\d+$/.test(email)) throw new ApiError(400, "Enter an email address or a 10-digit mobile number.");
      const prob = passwordProblem(body.password, email);
      if (prob) throw new ApiError(400, prob);
      if (store.users[email]) throw new ApiError(409, "An account with that email or number already exists. Sign in instead.");
      const orgId = nextId(store);
      const siteId = nextId(store);
      const stamp = nowIso();
      const org = { id: orgId, name: String(body.org_name || "").trim(), kind: body.org_kind, district: "Kachchh", demo: false, created_at: stamp };
      store.orgs.push(org);
      store.sites.push({ id: siteId, org_id: orgId, name: String(body.site_name || "").trim(), location_id: body.location_id, created_at: stamp });
      const userObj = { email, role: "supervisor", name: String(body.admin_name || "").trim(), worker_id: null, org_id: orgId, site_id: siteId, org: { id: orgId, name: org.name, kind: org.kind, demo: false } };
      store.users[email] = { id: nextId(store), email, password: body.password, user: userObj, created_at: stamp };
      saveStore(store);
      return { user: setSessionUser(userObj, store), org_id: orgId, site_id: siteId };
    }
    if (p === "/api/org" && method === "GET") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician"]);
      const orgId = su.org_id || 1;
      const org = store.orgs.find((o) => o.id === orgId);
      const sites = store.sites.filter((s) => s.org_id === orgId);
      const siteNames = Object.fromEntries(sites.map((s) => [s.id, s.name]));
      const jobMap = Object.fromEntries(JOB_CHOICES);
      const people = Object.values(store.users).filter((x) => x.user.org_id === orgId).map((x) => ({
        id: x.id, display_name: x.user.name, role: x.user.role, role_name: ROLE_NAMES[x.user.role],
        site: siteNames[x.user.site_id] || null, created_at: x.created_at,
      }));
      const invites = su.role === "supervisor" ? store.invites.filter((i) => i.org_id === orgId && i.active && i.uses < i.max_uses).map((i) => ({
        ...i, site: siteNames[i.site_id] || null, job: jobMap[i.job_id] || null, role_name: ROLE_NAMES[i.role],
      })) : [];
      const workerCount = org.demo ? ((D.workers && D.workers.workers) || []).length : store.org_workers.filter((w) => w.org_id === orgId).length;
      return { org, sites, people, invites, workers: workerCount, places: Object.fromEntries(PLACES), jobs: JOB_CHOICES.map(([id, label]) => ({ id, label })) };
    }
    if (p === "/api/org/sites" && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor"]);
      const sid = nextId(store);
      store.sites.push({ id: sid, org_id: su.org_id, name: String(body.name || "").trim(), location_id: body.location_id, created_at: nowIso() });
      saveStore(store);
      return { id: sid };
    }
    if (p === "/api/org/invites" && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor"]);
      const code = newCode(store.invites);
      const maxUses = body.role === "worker" ? Math.max(1, Number(body.max_uses || 1)) : 1;
      store.invites.unshift({ code, org_id: su.org_id, site_id: body.site_id || su.site_id, role: body.role, job_id: body.role === "worker" ? body.job_id : null, max_uses: maxUses, uses: 0, active: true, created_at: nowIso() });
      saveStore(store);
      return { code, expires_in_days: 14, max_uses: maxUses };
    }
    if (p.startsWith("/api/org/invites/") && method === "DELETE") {
      const su = requireUser(store, ApiError, ["supervisor"]);
      const code = decodeURIComponent(p.split("/").pop() || "").toUpperCase();
      const inv = store.invites.find((i) => i.code === code && i.org_id === su.org_id);
      if (!inv) throw new ApiError(404, "No such invite.");
      inv.active = false;
      saveStore(store);
      return { ok: true };
    }
    if (p.startsWith("/api/join/")) {
      const code = decodeURIComponent(p.split("/").pop() || "").trim().toUpperCase();
      const inv = store.invites.find((i) => i.code === code);
      if (!inv) throw new ApiError(404, "That code is not right. Check it with the person who gave it to you.");
      if (!inv.active || inv.uses >= inv.max_uses) throw new ApiError(410, "That code has expired or has already been used.");
      const org = store.orgs.find((o) => o.id === inv.org_id);
      const site = store.sites.find((s) => s.id === inv.site_id);
      const jobMap = Object.fromEntries(JOB_CHOICES);
      if (method === "GET") {
        return { org: org.name, kind: org.kind, site: site ? site.name : null, role: inv.role, role_name: ROLE_NAMES[inv.role], job: jobMap[inv.job_id] || null, label: "" };
      }
      if (method === "POST") {
        const identity = normaliseIdentity(body.identity);
        if (!identity.includes("@") && !/^\d+$/.test(identity)) throw new ApiError(400, "Enter an email address or a 10-digit mobile number.");
        const prob = passwordProblem(body.password, identity);
        if (prob) throw new ApiError(400, prob);
        if (store.users[identity]) throw new ApiError(409, "An account with that email or number already exists. Sign in instead.");
        let workerId = null;
        if (inv.role === "worker") {
          let suf = "";
          for (let i = 0; i < 5; i++) suf += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
          workerId = `W-${suf}`;
          store.org_workers.push({ id: workerId, org_id: org.id, site_id: inv.site_id, name: String(body.name || "").trim(), age: body.age || null, phone: /^\d+$/.test(identity) ? identity : null, job_id: inv.job_id || "construction", joined_at: istDateIso(0) });
        }
        const userObj = { email: identity, role: inv.role, name: String(body.name || "").trim(), worker_id: workerId, org_id: org.id, site_id: inv.site_id, org: { id: org.id, name: org.name, kind: org.kind, demo: Boolean(org.demo) } };
        store.users[identity] = { id: nextId(store), email: identity, password: body.password, user: userObj, created_at: nowIso() };
        inv.uses += 1;
        saveStore(store);
        return { user: setSessionUser(userObj, store) };
      }
    }

    // --- Overview, Dashboard & Workers ---
    if (p === "/api/overview") {
      const su = requireUser(store, ApiError, ["clinician", "ddo"]);
      return su.org_id === 1 ? D.overview : { total: 0, levels: { action: 0, due: 0, watch: 0, clear: 0 }, first: [], checks: [], talukas: [], legal: { total: 0, done: 0 }, readings: 0, label: "Custom workplace overview." };
    }
    if (p === "/api/dashboard") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician", "ddo"]);
      return buildDashboard(D, store, su);
    }
    if (p === "/api/workers") {
      const su = requireUser(store, ApiError, ["clinician", "supervisor"]);
      const org = store.orgs.find((o) => o.id === su.org_id);
      if (org && org.demo) return { ...D.workers, kind: "fictional" };
      return { workers: orgWorkerCards(D, store, su.org_id), kind: "org" };
    }
    if (p.startsWith("/api/workers/")) {
      const su = requireUser(store, ApiError);
      const parts = p.split("/");
      const wid = decodeURIComponent(parts[3] || "");
      if (su.role === "worker" && su.worker_id !== wid) throw new ApiError(403, "You can only see your own record.");
      if (su.role !== "worker" && !workerBelongs(store, wid, su.org_id)) throw new ApiError(403, "That worker is not in your organisation.");
      if (parts.length === 4) {
        const res = wid.startsWith("SIM-") ? simWorkerPassport(D, store, wid) : buildOrgPassport(D, store, wid);
        if (!res) throw new ApiError(404, "No such worker.");
        return res;
      }
      if (method === "POST") {
        if (parts[4] === "conditions") {
          store.condition_updates[wid] = store.condition_updates[wid] || {};
          const [, text] = CONDITION_STATUS[body.status] || ["due", body.status];
          store.condition_updates[wid][body.condition] = { status: body.status, text, note: body.note || "", at: nowIso() };
          saveStore(store);
          return { saved: true, preview: true };
        }
        if (parts[4] === "symptoms" && parts[6] === "review") {
          store.symptom_reviews[`${wid}:${parts[5]}`] = nowIso();
          saveStore(store);
          return { reviewed: true, preview: true };
        }
        const urgent = body.symptom === "collapse" || (Array.isArray(body.symptoms) && body.symptoms.includes("collapse"));
        if (parts[4] === "symptoms") {
          const items = Array.isArray(body.symptoms) ? body.symptoms : [body.symptom || "symptom"];
          store.custom_symptoms[wid] = store.custom_symptoms[wid] || [];
          items.forEach((sym) => store.custom_symptoms[wid].unshift({ id: String(nextId(store)), code: sym, text: CLINIC_SYMPTOM_LABELS[sym] || sym, at: nowIso(), urgent: Boolean(urgent), reviewed: false }));
          saveStore(store);
        }
        return { saved: true, preview: true, urgent, message: urgent ? "Emergency 108 instructions opened. Recorded in browser demo session." : "Saved in browser demo session." };
      }
    }

    // --- Daily Check-in & 35-day Log History ---
    if (p === "/api/log/today") {
      const su = requireUser(store, ApiError, ["worker"]);
      const wid = su.worker_id;
      const td = istDateIso(0);
      const existing = store.daily_logs.find((r) => r.worker_id === wid && r.day === td);
      const jobId = wid.startsWith("SIM-")
        ? ((D.worker_details && D.worker_details[wid] && D.worker_details[wid].places.slice(-1)[0]?.job_id) || "salt_raking")
        : ((store.org_workers.find((w) => w.id === wid) || {}).job_id || "construction");
      const cat = catalogue();
      const ppeKeys = PPE_FOR_JOB[jobId] || PPE.map((x) => x[0]);
      cat.ppe = cat.ppe.filter((item) => ppeKeys.includes(item.key));
      return { day: td, log: existing ? toLogRow(existing) : null, catalogue: cat, history: buildHistory(store, wid, 35) };
    }
    if (p === "/api/log" && method === "POST") {
      const su = requireUser(store, ApiError, ["worker"]);
      const wid = su.worker_id;
      const td = istDateIso(0);
      const syms = Array.isArray(body.symptoms) ? body.symptoms.filter((c) => SYMPTOMS[c]) : [];
      const row = {
        id: nextId(store), worker_id: wid, org_id: su.org_id, day: td, at: nowIso(),
        feeling: Number(body.feeling || 1), symptoms: syms, ppe: body.ppe || {},
        water_litres: body.water_litres ?? null, hours: body.hours ?? null, note: String(body.note || "").trim(),
      };
      const idx = store.daily_logs.findIndex((r) => r.worker_id === wid && r.day === td);
      if (idx >= 0) store.daily_logs[idx] = row;
      else store.daily_logs.push(row);
      syms.forEach((c) => {
        const clinicCode = SYMPTOMS[c][3];
        if (clinicCode) {
          store.custom_symptoms[wid] = store.custom_symptoms[wid] || [];
          store.custom_symptoms[wid].unshift({ id: String(nextId(store)), code: clinicCode, text: CLINIC_SYMPTOM_LABELS[clinicCode] || SYMPTOMS[c][0], at: nowIso(), urgent: SYMPTOMS[c][2], reviewed: false });
        }
      });
      saveStore(store);
      const urgent = syms.some((c) => SYMPTOMS[c][2]);
      const msg = urgent ? "Saved. If this is happening now, call 108." : row.feeling >= 3 ? "Saved in this browser. The clinic view now shows you are not well today." : "Saved. Thank you, see you tomorrow.";
      return { saved: true, urgent, message: msg, log: toLogRow(row), history: buildHistory(store, wid, 35) };
    }
    if (p.startsWith("/api/log/history/")) {
      const su = requireUser(store, ApiError);
      const wid = decodeURIComponent(p.split("/").pop() || "");
      if (su.role === "worker" && su.worker_id !== wid) throw new ApiError(403, "Forbidden");
      if (!workerBelongs(store, wid, su.org_id)) throw new ApiError(403, "Forbidden");
      const days = Math.max(7, Math.min(Number(u.searchParams.get("days") || 35), 180));
      return buildHistory(store, wid, days);
    }

    // --- Incidents, Medical Checks, Referrals, Training, Site Checks ---
    if (p === "/api/incidents" && method === "GET") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician"]);
      const workers = basicWorkersForOrg(D, store, su.org_id);
      const names = Object.fromEntries(workers.map((w) => [w.id, w.name]));
      const list = store.incidents.filter((i) => i.org_id === su.org_id).sort((a, b) => (a.status === b.status ? (a.at < b.at ? 1 : -1) : a.status === "open" ? -1 : 1)).map((i) => incidentRow(i, names));
      return { incidents: list, open: list.filter((i) => i.status === "open").length, sites: store.sites.filter((s) => s.org_id === su.org_id), workers: workers.map((w) => ({ id: w.id, name: w.name })).sort((a, b) => a.name.localeCompare(b.name)), catalogue: catalogue() };
    }
    if (p === "/api/incidents" && method === "POST") {
      const su = requireUser(store, ApiError);
      const wid = su.role === "worker" ? su.worker_id : (body.worker_id || null);
      const site = store.sites.find((s) => s.id === body.site_id && s.org_id === su.org_id);
      const rec = { id: nextId(store), org_id: su.org_id, site_id: body.site_id || null, site_name: site ? site.name : null, worker_id: wid, kind: body.kind, severity: body.severity, what: String(body.what || "").trim(), action: String(body.action || "").trim(), status: "open", at: nowIso(), closed_at: null, closed_note: "" };
      store.incidents.unshift(rec);
      saveStore(store);
      return { id: rec.id, message: body.severity === "emergency" ? "Call 108 now if anyone is hurt. Saved in this browser." : "Saved in browser demo storage." };
    }
    if (p.startsWith("/api/incidents/") && p.endsWith("/close") && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician"]);
      const iid = Number(p.split("/")[3]);
      const inc = store.incidents.find((i) => i.id === iid && i.org_id === su.org_id && i.status === "open");
      if (!inc) throw new ApiError(404, "No open incident with that number.");
      inc.status = "closed";
      inc.closed_at = nowIso();
      inc.closed_note = String(body.note || "").trim();
      saveStore(store);
      return { ok: true };
    }

    if (p === "/api/medical" && method === "GET") {
      const su = requireUser(store, ApiError, ["clinician", "supervisor"]);
      const workers = basicWorkersForOrg(D, store, su.org_id);
      const byId = Object.fromEntries(workers.map((w) => [w.id, w]));
      const status = medicalStatusMap(store, su.org_id, workers.map((w) => w.id));
      const due = Object.entries(status).filter(([wid, s]) => Boolean(byId[wid]) && s.state !== "ok").map(([wid, s]) => ({ ...byId[wid], ...s })).sort((a, b) => a.days - b.days);
      const never = workers.filter((w) => !status[w.id]);
      const referrals = su.role === "clinician" ? store.referrals.filter((r) => r.org_id === su.org_id).map((r) => ({ ...r, worker_name: (byId[r.worker_id] || {}).name || r.worker_id })) : [];
      return { due, never_checked: never.length, never_list: never.slice(0, 50), checks: [], referrals, catalogue: catalogue() };
    }
    if (p === "/api/medical" && method === "POST") {
      const su = requireUser(store, ApiError, ["clinician"]);
      const months = (MEDICAL.find((m) => m[0] === body.check_name) || [null, 12])[1];
      const nextDue = body.next_due || addMonthsIso(body.done_on, months);
      store.medical_checks.push({ id: nextId(store), org_id: su.org_id, worker_id: body.worker_id, check_name: body.check_name, done_on: body.done_on, result: body.result, next_due: nextDue, note: body.note || "", at: nowIso() });
      saveStore(store);
      return { saved: true, next_due: nextDue };
    }
    if (p === "/api/referrals" && method === "POST") {
      const su = requireUser(store, ApiError, ["clinician"]);
      const rec = { id: nextId(store), org_id: su.org_id, worker_id: body.worker_id, facility_id: body.facility_id, facility_name: body.facility_name, reason: body.reason, status: "sent", outcome: "", at: nowIso() };
      store.referrals.unshift(rec);
      saveStore(store);
      return { id: rec.id, message: `Referral to ${body.facility_name} noted in browser storage.` };
    }
    if (p.startsWith("/api/referrals/") && method === "POST") {
      const su = requireUser(store, ApiError, ["clinician"]);
      const rid = Number(p.split("/")[3]);
      const refObj = store.referrals.find((r) => r.id === rid && r.org_id === su.org_id);
      if (!refObj) throw new ApiError(404, "No such referral.");
      refObj.status = body.status;
      refObj.outcome = body.outcome || "";
      saveStore(store);
      return { ok: true };
    }

    if (p === "/api/training" && method === "GET") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician"]);
      const workers = basicWorkersForOrg(D, store, su.org_id);
      const td = istDateIso(0);
      const latest = {};
      store.trainings.filter((t) => t.org_id === su.org_id).forEach((t) => {
        const k = `${t.worker_id}::${t.course}`;
        if (!latest[k] || t.done_on >= latest[k].done_on) latest[k] = t;
      });
      const perCourse = COURSES.map(([key, label]) => {
        let done = 0, expiring = 0, expired = 0;
        const missing = [];
        workers.forEach((w) => {
          const r = latest[`${w.id}::${key}`];
          if (!r) { missing.push(w); return; }
          const d = daysDiff(r.valid_until, td);
          if (d < 0) { expired++; missing.push(w); }
          else if (d <= 30) { expiring++; done++; }
          else done++;
        });
        return { key, label, done, expiring, expired, never: missing.length - expired, missing: missing.slice(0, 60), total: workers.length };
      });
      return { courses: perCourse, workers, catalogue: catalogue() };
    }
    if (p === "/api/training" && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor"]);
      const course = COURSES.find((c) => c[0] === body.course);
      if (!course) throw new ApiError(400, "Choose a course.");
      const valid = addMonthsIso(body.done_on, course[2]);
      let saved = 0;
      (body.worker_ids || []).forEach((wid) => {
        if (workerBelongs(store, wid, su.org_id)) {
          store.trainings.push({ id: nextId(store), org_id: su.org_id, worker_id: wid, course: body.course, done_on: body.done_on, valid_until: valid, at: nowIso() });
          saved++;
        }
      });
      saveStore(store);
      return { saved, valid_until: valid };
    }
    if (p === "/api/site-checks" && method === "GET") {
      const su = requireUser(store, ApiError, ["supervisor", "clinician", "ddo"]);
      return { sites: siteCheckState(store, su.org_id), catalogue: catalogue() };
    }
    if (p === "/api/site-checks" && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor"]);
      const site = store.sites.find((s) => s.id === body.site_id && s.org_id === su.org_id);
      if (!site) throw new ApiError(400, "That site is not in your organisation.");
      store.site_checks.push({ id: nextId(store), org_id: su.org_id, site_id: site.id, site_name: site.name, item: body.item, status: body.status, note: body.note || "", at: nowIso() });
      saveStore(store);
      return { ok: true };
    }

    // --- Heat, Site Node, Device Controls, Live APIs & Facilities ---
    if (p === "/api/heat/map") return D.heat_map;
    if (p === "/api/heat/jobs") return D.heat_jobs;
    if (p === "/api/heat/year") return (D.heat_year && D.heat_year[u.searchParams.get("job_id")]) || { curve: [] };
    if (p === "/api/node/state") {
      const su = requireUser(store, ApiError, ["supervisor", "ddo", "clinician"]);
      const latest = (store.node_latest && store.node_latest[su.org_id]) || D.node_state.latest;
      const recent = (store.node_recent && store.node_recent[su.org_id]) || D.node_state.recent;
      const w = store.node_wokwi_seen && store.node_wokwi_seen[su.org_id];
      const sec = w && w.at ? Math.max(0, Math.round((Date.now() - w.at) / 1000)) : null;
      return {
        latest,
        recent,
        wokwi: { connected: sec !== null && sec < 30, last_seen_seconds: sec, device_id: (w && w.device_id) || null },
      };
    }
    if (p === "/api/node/controls") {
      const su = requireUser(store, ApiError, ["supervisor", "ddo", "clinician"]);
      const dev = u.searchParams.get("device_id") || body.device_id || "wokwi-node-01";
      const key = `${su.org_id}:${dev}`;
      if (method === "POST") {
        store.node_controls = store.node_controls || {};
        const cur = store.node_controls[key] || { device_id: dev, org_id: su.org_id, rev: 0, ack_rev: 0, ack_at: null };
        const prevVals = { ...CONTROL_DEFAULTS, ...(cur.values || {}) };
        store.node_controls[key] = {
          ...cur, enabled: Boolean(body.enabled), rev: (cur.rev || 0) + 1, updated_at: nowIso(),
          values: {
            ambient_temp_c: Number(body.ambient_temp_c ?? prevVals.ambient_temp_c),
            relative_humidity_pct: Number(body.relative_humidity_pct ?? prevVals.relative_humidity_pct),
            globe_temp_c: Number(body.globe_temp_c ?? prevVals.globe_temp_c),
            pm10_0_ug_m3: Number(body.pm10_0_ug_m3 ?? prevVals.pm10_0_ug_m3),
            uv_index: Number(body.uv_index ?? prevVals.uv_index),
            noise_dba: Number(body.noise_dba ?? prevVals.noise_dba),
          },
        };
        saveStore(store);
      }
      return controlsViewDemo(store, su.org_id, dev);
    }
    if (p === "/api/node/day") {
      requireUser(store, ApiError, ["supervisor", "ddo", "clinician"]);
      const lid = u.searchParams.get("location_id") || "kandla_port";
      return (D.node_day && D.node_day[lid]) || (D.node_day && D.node_day.kandla_port) || { location_id: lid, day: "2025-05-19", hours: [] };
    }
    if (p === "/api/node/replay") {
      const su = requireUser(store, ApiError, ["supervisor", "ddo", "clinician"]);
      const lid = u.searchParams.get("location_id") || "kandla_port";
      const h = Number(u.searchParams.get("hour") || 12);
      const day = u.searchParams.get("day") || "2025-05-19";
      const hr = ((D.node_day && D.node_day[lid] && D.node_day[lid].hours) || []).find((x) => x.hour === h);
      const base = (D.node_replay && D.node_replay[lid]) || D.node_state.latest;
      if (hr) {
        const simTa = Math.round((27 + Math.max(0, hr.wbgt - 22) * 1.15) * 10) / 10;
        const view = nodeView(D, { site_id: lid, source: "model_replay", ambient_temp_c: simTa, relative_humidity_pct: 45, pm10_0_ug_m3: base.pm10_0_ug_m3, uv_index: h >= 10 && h <= 16 ? 9 : 2 }, hr.wbgt, "Model estimate for sun");
        storeDemoReading(store, su.org_id, view, false);
        saveStore(store);
        return { ...view, hour: h, date: day };
      }
      return { ...base, hour: h, date: day };
    }
    if (p === "/api/node/simulate" && method === "POST") {
      const su = requireUser(store, ApiError, ["supervisor", "ddo", "clinician"]);
      const isWokwi = body.source === "wokwi_simulated";
      const dev = isWokwi ? (body.device_id || "wokwi-node-01") : "browser-node";
      const view = nodeView(D, { ...body, device_id: dev, source: isWokwi ? "wokwi_simulated" : "browser_simulator" });
      storeDemoReading(store, su.org_id, view, isWokwi);
      if (isWokwi && store.node_controls) {
        const key = `${su.org_id}:${dev}`;
        const c = store.node_controls[key];
        if (c && body.remote_rev != null && Number(body.remote_rev) === c.rev && c.rev > 0) {
          c.ack_rev = Number(body.remote_rev);
          c.ack_at = nowIso();
        }
      }
      saveStore(store);
      if (isWokwi) {
        const ctrl = controlsViewDemo(store, su.org_id, dev);
        return {
          r_on: ctrl.enabled ? 1 : 0,
          r_rev: ctrl.rev,
          r_temp: ctrl.values.ambient_temp_c,
          r_rh: ctrl.values.relative_humidity_pct,
          r_globe: ctrl.values.globe_temp_c,
          r_pm10: ctrl.values.pm10_0_ug_m3,
          r_uv: ctrl.values.uv_index,
          r_noise: ctrl.values.noise_dba,
          controls: ctrl,
          ...view,
        };
      }
      return view;
    }

    if (p === "/api/live/environment") {
      const sid = u.searchParams.get("site_id");
      const sites = D.site_coords || (D.facilities_default && D.facilities_default.sites) || [];
      let payload = cache.env;
      if (!payload || Date.now() - cache.envTs > 900000) {
        try {
          const lats = sites.map((s) => s.lat).join(",");
          const lons = sites.map((s) => s.lon).join(",");
          const [wr, ar] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,uv_index&wind_speed_unit=ms&timezone=Asia%2FKolkata`),
            fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm10,pm2_5,dust&timezone=Asia%2FKolkata`),
          ]);
          const [wRaw, aRaw] = await Promise.all([wr.json(), ar.json()]);
          const wList = Array.isArray(wRaw) ? wRaw : [wRaw];
          const aList = Array.isArray(aRaw) ? aRaw : [aRaw];
          const built = sites.map((s, idx) => {
            const wc = (wList[idx] && wList[idx].current) || {}, ac = (aList[idx] && aList[idx].current) || {};
            const ta = wc.temperature_2m, rh = wc.relative_humidity_2m, rad = wc.shortwave_radiation || 0, wind = Math.max(0.8, wc.wind_speed_10m || 1.5);
            const tg = ta != null ? ta + (rad > 0 ? Math.min(16, (rad * 0.015) / Math.pow(wind, 0.35)) : 0) : null;
            return { site_id: s.site_id, label: s.label, taluka: s.taluka, lat: s.lat, lon: s.lon, live: true, source: "Open-Meteo Forecast + CAMS Air Quality", temp_c: ta, humidity_pct: rh, wind_ms: wc.wind_speed_10m, shortwave_wm2: rad, uv_index: wc.uv_index, wbgt_shade_c: ta != null && rh != null ? Number(computeWbgt(ta, rh)[0].toFixed(1)) : null, wbgt_sun_est_c: ta != null && rh != null ? Number(computeWbgt(ta, rh, tg)[0].toFixed(1)) : null, pm10_ug_m3: ac.pm10, pm25_ug_m3: ac.pm2_5, dust_ug_m3: ac.dust, observed_at: wc.time || ac.time || nowIso() };
          });
          payload = { live: true, fetched_at: nowIso(), provider: "Open-Meteo Weather Forecast & CAMS Air Quality", method_note: "Ambient gridded forecast and CAMS model estimate; not an on-site black-globe hardware sensor.", sites: built };
          cache.env = payload; cache.envTs = Date.now();
        } catch {
          payload = { live: false, fetched_at: nowIso(), provider: "2025 Kachchh Reference Baseline", method_note: "Live feed offline; showing saved climatology.", sites: sites.map((s) => ({ ...s, live: false, temp_c: null, humidity_pct: null, wbgt_sun_est_c: null, pm10_ug_m3: null })) };
        }
      }
      return sid && sid !== "all" ? { ...payload, sites: payload.sites.filter((x) => x.site_id === sid) } : payload;
    }

    if (p.startsWith("/api/live/pincode/")) {
      const pin = decodeURIComponent(p.split("/").pop() || "").trim();
      if (!/^\d{6}$/.test(pin)) throw new ApiError(400, "Enter a valid 6-digit Indian pincode.");
      if (cache.pins[pin]) return cache.pins[pin];
      let offices = [], status = "unavailable", live = false;
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        const json = await res.json();
        const entry = Array.isArray(json) ? json[0] : {};
        if (entry && entry.Status === "Success" && Array.isArray(entry.PostOffice)) { offices = entry.PostOffice; status = "ok"; live = true; }
        else { status = "not_found"; live = true; }
      } catch { /* offline */ }
      const first = offices[0] || {};
      const district = first.District || "", rawBlock = first.Block || first.Taluk || "", state = first.State || "";
      const block = rawBlock && rawBlock.toUpperCase() !== "NA" ? rawBlock : "";
      const facs = (D.facilities_default && D.facilities_default.facilities) || [];
      const counts = {};
      offices.forEach((o) => {
        const hay = `${o.Block || ""} ${o.Taluk || ""} ${o.Name || ""}`.toLowerCase();
        Object.entries(talukaAliases).forEach(([alias, canon]) => { if (hay.includes(alias)) counts[canon] = (counts[canon] || 0) + 1; });
      });
      const matched = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
      const out = { pincode: pin, live, status, provider: "India Post Pincode Directory", district, taluka: matched || block, matched_taluka: matched, state, in_kachchh: ["kachchh", "kutch"].includes(district.toLowerCase()), post_offices: offices.slice(0, 6).map((o) => ({ name: o.Name, branch_type: o.BranchType, block: o.Block, district: o.District })), matching_facilities: facs.filter((f) => matched && f.taluka === matched).slice(0, 4) };
      if (live) cache.pins[pin] = out;
      return out;
    }

    if (p === "/api/live/road-distances") {
      const siteId = u.searchParams.get("site_id") || "little_rann_kutch";
      const cached = cache.roads[siteId];
      if (cached && (Date.now() - cached.ts) < 21600000) return cached.data;
      const base = D.facilities_default || { facilities: [], sites: [] };
      const site = (base.sites || []).find((s) => s.site_id === siteId) || base.selected_site || { site_id: siteId, lat: 23.45, lon: 70.85 };
      const facs = base.facilities || [];
      const coords = [[site.lon, site.lat], ...facs.map((f) => [f.longitude, f.latitude])].map(([lo, la]) => `${lo},${la}`).join(";");
      try {
        const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`);
        const json = await res.json();
        const dists = (json && json.distances && json.distances[0]) || [];
        const durs = (json && json.durations && json.durations[0]) || [];
        if (json && json.code === "Ok" && dists.length > facs.length) {
          const routes = {};
          facs.forEach((f, idx) => {
            routes[f.facility_id] = { road_km: dists[idx + 1] != null ? Number((dists[idx + 1] / 1000).toFixed(1)) : null, duration_min: durs[idx + 1] != null ? Math.max(1, Math.round(durs[idx + 1] / 60)) : null, straight_km: haversineKm(site.lat, site.lon, f.latitude, f.longitude) };
          });
          const out = { live: true, provider: "OSRM OpenStreetMap Driving Router", site_id: siteId, routes };
          cache.roads[siteId] = { ts: Date.now(), data: out };
          return out;
        }
      } catch { /* offline */ }
      const fallbackRoutes = {};
      facs.forEach((f) => { fallbackRoutes[f.facility_id] = { road_km: null, duration_min: null, straight_km: haversineKm(site.lat, site.lon, f.latitude, f.longitude) }; });
      return { live: false, provider: "Straight-line Haversine estimate (OSRM offline)", site_id: siteId, routes: fallbackRoutes };
    }

    if (p === "/api/facilities") {
      const siteId = u.searchParams.get("site_id") || "little_rann_kutch";
      const taluka = u.searchParams.get("taluka");
      const disease = u.searchParams.get("disease") || "all";
      const base = JSON.parse(JSON.stringify(D.facilities_default || { facilities: [], sites: [], diseases: [] }));
      const site = (base.sites || []).find((s) => s.site_id === siteId) || base.selected_site || { site_id: siteId, lat: 23.45, lon: 70.85 };
      let list = (base.facilities || []).map((f) => {
        const dist = haversineKm(site.lat, site.lon, f.latitude, f.longitude);
        const silicoOk = f.has_digital_xray && f.has_spirometer, heatOk = f.emergency_108_base, ckdOk = f.has_biochemical_lab,
          eyeOk = /hospital|medical college|rath/i.test(f.facility_name), noiseOk = f.has_audiometry;
        let diseaseMatch = true, matchLabel = `${f.facility_tier} • ${f.taluka}`;
        if (disease === "silicosis") { diseaseMatch = silicoOk; matchLabel = silicoOk ? "★ Silicosis Ready: Digital X-Ray + Spirometer" : "Partial Diagnostic Facility"; }
        else if (disease === "heatstroke") { diseaseMatch = heatOk; matchLabel = heatOk ? "🚨 108 Base & Rapid Cooling Care" : "No 108 Base Station"; }
        else if (disease === "ckd") { diseaseMatch = ckdOk; matchLabel = ckdOk ? "💧 Biochemical Lab (Creatinine / Urine)" : "No In-House Blood Lab"; }
        else if (disease === "eye") { diseaseMatch = eyeOk; matchLabel = eyeOk ? "👁️ Ophthalmic & Slit-Lamp Protocol" : "General Primary Clinic"; }
        else if (disease === "noise") { diseaseMatch = noiseOk; matchLabel = noiseOk ? "🔊 Audiometric Booth Equipped" : "No Audiometer"; }
        return { ...f, distance_km: dist, disease_match: diseaseMatch, match_label: matchLabel };
      });
      if (taluka && taluka !== "ALL") list = list.filter((f) => f.taluka && f.taluka.toLowerCase() === taluka.toLowerCase());
      list.sort((a, b) => (disease !== "all" && a.disease_match !== b.disease_match ? (a.disease_match ? -1 : 1) : a.distance_km - b.distance_km));
      return { ...base, facilities: list, selected_site: site, active_disease: disease };
    }

    if (p === "/api/facilities/refer" && method === "POST") {
      const su = currentSessionUser(store);
      const facId = body.facility_id || "";
      const fac = ((D.facilities_default && D.facilities_default.facilities) || []).find((x) => x.facility_id === facId);
      const facName = (fac && fac.facility_name) || facId;
      if (su && body.worker_id) {
        store.referrals.unshift({ id: nextId(store), org_id: su.org_id, worker_id: body.worker_id, facility_id: facId, facility_name: facName, reason: body.disease ? `Facility finder (${body.disease})` : "Referral noted", status: "sent", outcome: "", at: nowIso() });
        saveStore(store);
      }
      return { success: true, facility_name: facName, message: `Referral note to ${facName} saved in this browser demo (not sent externally).` };
    }

    if (p === "/api/me/today") {
      const su = currentSessionUser(store);
      if (su && su.worker_id && !su.worker_id.startsWith("SIM-")) {
        const w = store.org_workers.find((x) => x.id === su.worker_id);
        const site = w ? store.sites.find((s) => s.id === w.site_id) : null;
        return { ...D.me_today, site: site ? site.name : D.me_today.site, site_id: site ? site.location_id : "kandla_port", checkin_hours_week: 0, checkin_over_55: false };
      }
      return D.me_today;
    }

    if (p === "/api/me/export") {
      const su = requireUser(store, ApiError);
      return {
        exported_at: nowIso(),
        browser_demo: true,
        consent: store.consents[su.email] || null,
        profile: su,
        worker_records: su.worker_id ? {
          daily_logs: store.daily_logs.filter((r) => r.worker_id === su.worker_id),
          medical_checks: store.medical_checks.filter((m) => m.worker_id === su.worker_id),
          referrals: store.referrals.filter((r) => r.worker_id === su.worker_id),
        } : undefined,
      };
    }

    if (p === "/api/evidence") return D.evidence;
    if (p === "/api/storage") {
      return {
        status: "ready",
        browser_demo: true,
        reference_tables: (D.evidence && D.evidence.dictionary ? D.evidence.dictionary.length : 44),
        runtime: {
          users: Object.keys(store.users).length,
          organisations: store.orgs.length,
          daily_logs: store.daily_logs.length,
          incidents: store.incidents.length,
          medical_checks: store.medical_checks.length,
        },
      };
    }

    throw new ApiError(404, "Endpoint not found");
  };
})();

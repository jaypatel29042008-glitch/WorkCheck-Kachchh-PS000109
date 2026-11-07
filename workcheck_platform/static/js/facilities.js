"use strict";
/* Healthcare facilities and referral notes
   Diagnostic referral network with digital X-ray, spirometry, and 108 emergency ambulance bases across 10 Talukas.
   Connected depending on each site and sorted by diseases.
*/
const FAC_STATE = {
  siteId: "little_rann_kutch",
  disease: "all",
  taluka: "ALL",
  data: null,
};

VIEWS.facilities = async () => {
  const data = await api(`/api/facilities?site_id=${encodeURIComponent(FAC_STATE.siteId)}&disease=${encodeURIComponent(FAC_STATE.disease)}&taluka=${encodeURIComponent(FAC_STATE.taluka)}`);
  FAC_STATE.data = data;
  renderFacilitiesPage();
};

function renderFacilitiesCards(facilities) {
  if (!facilities || !facilities.length) {
    return `<div class="empty small" style="grid-column: 1 / -1">${ic("hospital-circle", 28)}<p>No health facilities match the selected filters.</p></div>`;
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
          <button type="button" class="btn btn-ghost btn-sm fac-page-route-btn" data-fac-id="${esc(f.facility_id)}" data-fac-name="${esc(f.facility_name)}">
            ${ic("route", 14, 2)} Note referral
          </button>
          ${f.emergency_108_base ? `<a class="btn btn-danger btn-sm" href="tel:108" title="Call Emergency 108">${ic("phone", 13, 2)} 108</a>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderFacilitiesPage() {
  const data = FAC_STATE.data;
  const talukas = ["ALL", "Bhuj", "Gandhidham", "Mundra", "Anjar", "Mandvi", "Abdasa", "Rapar", "Nakhatrana", "Bhachau", "Lakhpat"];

  $("#view").innerHTML = `
    <header class="page-head">
      <div>
        <h1>Kachchh Health Facilities</h1>
        <p class="lead">Sample list for testing. Confirm services with each facility.</p>
      </div>
      <span class="pill none" data-tip="Services are not yet confirmed with each facility, and none is connected to this tool.">${ic("info-circle", 14, 2)}12 sample facilities</span>
    </header>

    <section class="card facilities-connector-card">
      <div class="facilities-header">
        <div>
          <h2 style="font-size:16px;margin:0">Active Worksite &amp; Taluka Filter</h2>
          <p class="sub">Shows straight-line distance from each worksite to each facility.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="facilities-site-picker">
            <label for="fac-page-site">${ic("map-pin", 14, 2)} Worksite:</label>
            <select id="fac-page-site">
              ${data.sites.map((s) => `<option value="${s.site_id}"${s.site_id === FAC_STATE.siteId ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
            </select>
          </div>
          <div class="facilities-site-picker">
            <label for="fac-page-taluka">Taluka:</label>
            <select id="fac-page-taluka">
              ${talukas.map((t) => `<option value="${t}"${t === FAC_STATE.taluka ? " selected" : ""}>${t === "ALL" ? "All Talukas (12 Facilities)" : t}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>

      <div class="disease-sorter-toolbar">
        <span class="sorter-label">${ic("adjustments-horizontal", 14, 2)} Sort &amp; Filter by Disease:</span>
        <div class="disease-pills" id="fac-page-disease-pills">
          ${data.diseases.map((d) => `
            <button type="button" class="pill-btn${d.key === FAC_STATE.disease ? " on" : ""}" data-disease="${d.key}">
              ${ic(d.icon, 13, 2)} ${esc(d.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="facilities-grid" id="fac-page-grid">
        ${renderFacilitiesCards(data.facilities)}
      </div>
    </section>
  `;

  // Worksite selector handler
  $("#fac-page-site").addEventListener("change", async (e) => {
    FAC_STATE.siteId = e.target.value;
    await refreshFacilities();
  });

  // Taluka filter handler
  $("#fac-page-taluka").addEventListener("change", async (e) => {
    FAC_STATE.taluka = e.target.value;
    await refreshFacilities();
  });

  // Disease sorter handlers
  $$("#fac-page-disease-pills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      $$("#fac-page-disease-pills .pill-btn").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      FAC_STATE.disease = btn.dataset.disease;
      await refreshFacilities();
    });
  });

  wirePageReferrals();
}

async function refreshFacilities() {
  const updated = await api(`/api/facilities?site_id=${encodeURIComponent(FAC_STATE.siteId)}&disease=${encodeURIComponent(FAC_STATE.disease)}&taluka=${encodeURIComponent(FAC_STATE.taluka)}`);
  FAC_STATE.data = updated;
  const grid = $("#fac-page-grid");
  if (grid) grid.innerHTML = renderFacilitiesCards(updated.facilities);
  wirePageReferrals();
}

function wirePageReferrals() {
  $$(".fac-page-route-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const facId = btn.dataset.facId;
      const facName = btn.dataset.facName;
      try {
        const reply = await api("/api/facilities/refer", {
          method: "POST",
          body: {
            worker_id: (S.user && S.user.worker_id) || "GENERAL_TRIAGE",
            facility_id: facId,
            disease: FAC_STATE.disease,
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

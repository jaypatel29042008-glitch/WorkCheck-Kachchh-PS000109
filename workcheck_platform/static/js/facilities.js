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
  return renderFacilityCardsHtml(facilities, {
    routeBtnClass: "fac-page-route-btn",
    emptyMsg: "No health facilities match the selected filters.",
  });
}

function renderFacilitiesPage() {
  const data = FAC_STATE.data;
  const talukas = ["ALL", "Bhuj", "Gandhidham", "Mundra", "Anjar", "Mandvi", "Abdasa", "Rapar", "Nakhatrana", "Bhachau", "Lakhpat"];

  $("#view").innerHTML = `
    <header class="page-head">
      <div>
        <h1>Kachchh Health Facilities</h1>
        <p class="lead">Verified Kachchh facility names, pincodes &amp; landlines (kachchh.nic.in &amp; GBOCWWB). Confirm services by phone before dispatch.</p>
      </div>
      <span class="pill none" data-tip="Names, talukas, pincodes, addresses and phone numbers match official kachchh.nic.in &amp; GBOCWWB directories; X-ray/spirometer/lab flags remain sample baseline estimates until field check.">${ic("info-circle", 14, 2)}12 Kachchh facilities</span>
    </header>

    <section class="card facilities-connector-card">
      <div class="facilities-header">
        <div>
          <h2 style="font-size:16px;margin:0">Active Worksite &amp; Taluka Filter</h2>
          <p class="sub">Straight-line distance sorted first, enriched live with OSRM road distance &amp; driving ETA when online.</p>
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
          <div class="pincode-bar">
            <label class="sr" for="fac-pin">Search by Indian pincode</label>
            <input id="fac-pin" type="text" inputmode="numeric" maxlength="6" placeholder="Pincode (e.g. 370001)">
            <button type="button" class="btn btn-ghost btn-sm" id="fac-pin-btn">${ic("search", 14, 2)}Lookup</button>
          </div>
        </div>
      </div>
      <p class="sub" id="fac-pin-msg" hidden style="margin-top:8px"></p>

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

  const runPin = async () => {
    const pin = ($("#fac-pin")?.value || "").trim();
    const msg = $("#fac-pin-msg");
    const btn = $("#fac-pin-btn");
    if (!pin) return;
    if (msg) { msg.hidden = false; msg.textContent = "Looking up India Post directory..."; }
    if (btn) btn.disabled = true;
    try {
      const info = await api(`/api/live/pincode/${encodeURIComponent(pin)}`);
      const matched = info.matched_taluka || (talukas.includes(info.taluka) ? info.taluka : "");
      const talSelect = $("#fac-page-taluka");
      const didFilter = Boolean(info.in_kachchh && matched && talSelect);
      if (msg) {
        msg.hidden = false;
        if (info.status === "ok") {
          msg.textContent = `PIN ${info.pincode}: ${info.district || "Unknown"}, ${info.state || ""}${info.taluka ? ` (Block/Taluka: ${info.taluka})` : ""}${didFilter ? ` — filtered to ${matched} taluka.` : info.in_kachchh ? " — in Kachchh." : " — outside Kachchh."}`;
        } else {
          msg.textContent = `PIN ${info.pincode}: No post office found (${info.status}).`;
        }
      }
      if (didFilter) {
        FAC_STATE.taluka = matched;
        talSelect.value = matched;
        await refreshFacilities();
      }
    } catch (err) {
      if (msg) { msg.hidden = false; msg.textContent = err.message || "Enter 6 digits."; }
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  $("#fac-pin-btn")?.addEventListener("click", runPin);
  $("#fac-pin")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runPin(); } });

  wirePageReferrals();
  attachRoadDistances($("#fac-page-grid"), FAC_STATE.siteId);
}

async function refreshFacilities() {
  const updated = await api(`/api/facilities?site_id=${encodeURIComponent(FAC_STATE.siteId)}&disease=${encodeURIComponent(FAC_STATE.disease)}&taluka=${encodeURIComponent(FAC_STATE.taluka)}`);
  FAC_STATE.data = updated;
  const grid = $("#fac-page-grid");
  if (grid) {
    grid.innerHTML = renderFacilitiesCards(updated.facilities);
    attachRoadDistances(grid, FAC_STATE.siteId);
  }
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
            worker_id: (S.user && S.user.worker_id) || null,
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

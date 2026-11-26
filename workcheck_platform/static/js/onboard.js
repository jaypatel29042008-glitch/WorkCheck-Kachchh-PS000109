"use strict";
/* Getting started: a workplace sets itself up in three short steps, and people join with a code. */
const SETUP_STEPS = [["Your workplace", "Name and type"], ["Your first site", "Where the work happens"], ["Your account", "How you sign in"]];
const JOIN_STEPS = [["Your code", "From your supervisor"], ["About you", "Name and password"]];

function onboardFrame(steps, at, title, lead, body) {
  return `<div class="login onboard">
    <section class="login-art">
      ${SCENE}
      <div class="login-copy">
        <div class="logo on-dark">${logoMark()}<div><b>WorkCheck</b><span>Kachchh</span></div></div>
        <h1>${esc(title)}</h1>
        <p>${esc(lead)}</p>
        <ol class="ob-steps">${steps.map(([name, hint], i) => `<li class="${i < at ? "done" : i === at ? "on" : ""}"><span>${i < at ? ic("check", 14, 2.6) : i + 1}</span><div><b>${esc(name)}</b><small>${esc(hint)}</small></div></li>`).join("")}</ol>
      </div>
    </section>
    <main class="login-form" id="main" tabindex="-1">${body}</main>
  </div>`;
}

const pwField = (id = "ob-password", label = "Password") => `<label class="field"><span>${label}</span><span class="input">${ic("lock", 18)}<input id="${id}" type="password" autocomplete="new-password" placeholder="At least 10 characters" required minlength="10"><button type="button" class="icon-btn ghost" data-show="${id}" aria-label="Show password">${ic("eye", 18)}</button></span></label><p class="pw-hint" id="${id}-hint">${ic("info-circle", 14, 2)}<span>Use 10 or more characters. A short sentence works well.</span></p>`;
function wirePassword(root, id = "ob-password") {
  const input = $(`#${id}`, root), hint = $(`#${id}-hint`, root);
  $(`[data-show="${id}"]`, root).addEventListener("click", (e) => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.innerHTML = ic(show ? "eye-off" : "eye", 18);
  });
  input.addEventListener("input", () => {
    const ok = input.value.length >= 10;
    hint.classList.toggle("ok", ok);
    hint.innerHTML = `${ic(ok ? "circle-check" : "info-circle", 14, 2)}<span>${ok ? "Long enough." : `${10 - input.value.length} more character${10 - input.value.length === 1 ? "" : "s"} needed.`}</span>`;
  });
}

async function renderSetup() {
  runCleanup();
  S.page = null;
  const opt = await api("/api/org/options").catch(() => null);
  if (!opt) { location.hash = ""; return renderLogin(); }
  const v = { org_name: "", org_kind: opt.kinds[0], site_name: "", location_id: opt.places[0].id, admin_name: "", email: "" };
  let step = 0;
  const forms = [
    () => `<h2>Set up your workplace</h2><p class="sub">Free to try. Takes about two minutes.</p>
      <label class="field"><span>Name of the company or site owner</span><span class="input">${ic("building", 18)}<input id="ob-org" value="${esc(v.org_name)}" placeholder="For example, Rann Salt Works" required maxlength="80" autocomplete="organization"></span></label>
      <fieldset class="field"><legend>What kind of work is it?</legend><div class="choices kinds">${opt.kinds.map((k) => `<label class="choice"><input type="radio" name="ob-kind" value="${esc(k)}"${k === v.org_kind ? " checked" : ""}><span>${esc(k)}</span></label>`).join("")}</div></fieldset>`,
    () => `<h2>Add your first site</h2><p class="sub">You can add more sites later.</p>
      <label class="field"><span>What do people call this site?</span><span class="input">${ic("map-pin", 18)}<input id="ob-site" value="${esc(v.site_name)}" placeholder="For example, Pan 7 or Yard B" required maxlength="80"></span></label>
      <label class="field"><span>Nearest place in Kachchh</span><span class="select wide"><select id="ob-place">${opt.places.map((p) => `<option value="${p.id}"${p.id === v.location_id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select>${ic("chevron-down", 16, 2)}</span></label>
      <p class="fine">We use this to show the heat and dust estimate for your area.</p>`,
    () => `<h2>Create your account</h2><p class="sub">You will be the supervisor for ${esc(v.org_name)}.</p>
      <label class="field"><span>Your name</span><span class="input">${ic("user-check", 18)}<input id="ob-name" value="${esc(v.admin_name)}" placeholder="Your full name" required maxlength="60" autocomplete="name"></span></label>
      <label class="field"><span>Email or mobile number</span><span class="input">${ic("mail", 18)}<input id="ob-email" value="${esc(v.email)}" placeholder="you@example.com or 98765 43210" required maxlength="120" autocomplete="username"></span></label>
      ${pwField()}`,
  ];
  const keep = () => {
    if (step === 0) { v.org_name = $("#ob-org").value.trim(); v.org_kind = $("input[name=ob-kind]:checked").value; }
    if (step === 1) { v.site_name = $("#ob-site").value.trim(); v.location_id = $("#ob-place").value; }
    if (step === 2) { v.admin_name = $("#ob-name").value.trim(); v.email = $("#ob-email").value.trim(); }
  };
  const draw = () => {
    $("#app").innerHTML = onboardFrame(SETUP_STEPS, step, "Know how your workers are, every day.", "Workers check in from their phone. You see who is unwell, what is missing on site, and what to do next.",
      `<form id="ob-form" novalidate>${forms[step]()}
        <p class="form-error" role="alert" hidden></p>
        <div class="ob-actions">${step ? `<button class="btn btn-ghost" type="button" id="ob-back">${ic("arrow-left", 16, 2)}Back</button>` : ""}<button class="btn btn-ink" type="submit" id="ob-next">${step === 2 ? "Create workplace" : "Continue"} ${ic("arrow-right", 18, 2)}</button></div>
        <p class="fine center-text">Already set up? <a href="#/">Sign in</a> · Have a code? <a href="#/join">Join your workplace</a></p>
      </form>`);
    const form = $("#ob-form");
    if (step === 2) wirePassword(form);
    const first = $("input:not([type=radio])", form);
    if (first) first.focus();
    const back = $("#ob-back");
    if (back) back.addEventListener("click", () => { keep(); step -= 1; draw(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      keep();
      const need = [[v.org_name.length >= 2, "Enter the name of your company or site owner."], [v.site_name.length >= 2, "Enter a name for the site."], [v.admin_name.length >= 2 && v.email.length >= 3, "Enter your name and an email or mobile number."]][step];
      if (!need[0]) return formError(form, new Error(need[1]));
      if (step < 2) { step += 1; return draw(); }
      const btn = $("#ob-next");
      btn.disabled = true;
      try {
        const res = await api("/api/org/register", { method: "POST", body: { ...v, password: $("#ob-password").value } });
        S.user = res.user;
        S.welcome = true;
        $("#app").innerHTML = "";
        location.hash = "#/team";
      } catch (err) { formError(form, err); btn.disabled = false; }
    });
  };
  draw();
}

async function renderJoin(code) {
  runCleanup();
  S.page = null;
  let invite = null, value = (code || "").toUpperCase();
  const draw = (error) => {
    const step = invite ? 1 : 0;
    const body = invite
      ? `<form id="ob-form" novalidate><h2>Join ${esc(invite.org)}</h2>
          <div class="ob-invite">${ic("circle-check", 18, 2)}<div><b>${esc(invite.role_name)}${invite.job ? `, ${esc(invite.job)}` : ""}</b><small>${invite.site ? `${esc(invite.site)} · ` : ""}${esc(invite.kind)}</small></div></div>
          <label class="field"><span>Your name</span><span class="input">${ic("user-check", 18)}<input id="ob-name" placeholder="Your full name" required maxlength="60" autocomplete="name"></span></label>
          <label class="field"><span>Mobile number or email</span><span class="input">${ic("phone", 18)}<input id="ob-email" placeholder="98765 43210" required maxlength="120" autocomplete="username"></span></label>
          ${invite.role === "worker" ? `<label class="field"><span>Age (optional)</span><span class="input"><input id="ob-age" type="number" inputmode="numeric" min="16" max="80" placeholder="34"></span></label>` : ""}
          ${pwField()}
          <p class="form-error" role="alert" hidden></p>
          <div class="ob-actions"><button class="btn btn-ghost" type="button" id="ob-back">${ic("arrow-left", 16, 2)}Back</button><button class="btn btn-ink" type="submit" id="ob-next">Join ${ic("arrow-right", 18, 2)}</button></div>
        </form>`
      : `<form id="ob-form" novalidate><h2>Join your workplace</h2><p class="sub">Enter the 8-character invite code your supervisor gave you.</p>
          <label class="field"><span>Invite code</span><span class="input code">${ic("ticket", 18)}<input id="ob-code" value="${esc(value)}" placeholder="ABCD-2345" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required></span></label>
          <p class="form-error" role="alert"${error ? "" : " hidden"}>${esc(error || "")}</p>
          <div class="ob-actions"><button class="btn btn-ink" type="submit" id="ob-next">Continue ${ic("arrow-right", 18, 2)}</button></div>
          <p class="fine center-text">No code? Ask your supervisor, or <a href="#/setup">set up a new workplace</a>. <a href="#/">Sign in</a></p>
        </form>`;
    $("#app").innerHTML = onboardFrame(JOIN_STEPS, step, "One minute a day keeps your record up to date.", "Tell us how you feel and what was missing. Your clinic team sees it the same day.", body);
    const form = $("#ob-form");
    const first = $("input", form);
    if (first) first.focus();
    if (invite) {
      wirePassword(form);
      $("#ob-back").addEventListener("click", () => { invite = null; draw(); });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = $("#ob-next");
        btn.disabled = true;
        const age = $("#ob-age") && $("#ob-age").value ? Number($("#ob-age").value) : null;
        try {
          const res = await api(`/api/join/${encodeURIComponent(value)}`, { method: "POST", body: { name: $("#ob-name").value.trim(), identity: $("#ob-email").value.trim(), password: $("#ob-password").value, age } });
          S.user = res.user;
          $("#app").innerHTML = "";
          location.hash = `#/${NAV[S.user.role][0][0]}`;
        } catch (err) { formError(form, err.status === 422 ? new Error("Check your name, number and password, then try again.") : err); btn.disabled = false; }
      });
    } else {
      form.addEventListener("submit", (e) => { e.preventDefault(); value = $("#ob-code").value.trim().toUpperCase(); lookup(); });
    }
  };
  const lookup = async () => {
    if (!value) return draw("Enter your code.");
    try { invite = await api(`/api/join/${encodeURIComponent(value)}`); draw(); } catch (err) { invite = null; draw(err.message); }
  };
  if (value) await lookup(); else draw();
}

"use strict";
const turbine = (x, y, h, delay) => `<g opacity=".85"><line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><g class="blades" style="transform-origin:${x}px ${y - h}px;animation-delay:${delay}s">${[0, 120, 240].map((a) => `<line x1="${x}" y1="${y - h}" x2="${x}" y2="${y - h - h * 0.55}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" transform="rotate(${a} ${x} ${y - h})"/>`).join("")}</g><circle cx="${x}" cy="${y - h}" r="3.4" fill="#fff"/></g>`;
const SCENE = `<svg class="scene" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4553E2"/><stop offset=".42" stop-color="#7A87F6"/><stop offset=".62" stop-color="#BDB4F3"/><stop offset=".74" stop-color="#F3C8CF"/><stop offset=".8" stop-color="#FDE3CC"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#FFF3DD" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE4C6" stop-opacity=".5"/><stop offset="1" stop-color="#FFE4C6" stop-opacity="0"/></radialGradient>
    <linearGradient id="pan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE6DE"/><stop offset=".5" stop-color="#E9E9FC"/><stop offset="1" stop-color="#CBD0FA"/></linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#sky)"/>
  <circle cx="560" cy="700" r="270" fill="url(#glow)"/><circle cx="560" cy="700" r="66" fill="#FFF6E6"/>
  <g fill="#fff" opacity=".2"><rect x="70" y="470" width="240" height="16" rx="8"/><rect x="130" y="496" width="150" height="12" rx="6"/><rect x="520" y="400" width="210" height="14" rx="7"/><rect x="480" y="424" width="130" height="10" rx="5"/></g>
  ${turbine(90, 772, 118, 0)}${turbine(190, 776, 96, -1.3)}${turbine(280, 778, 78, -2.4)}
  <g stroke="#6770D8" stroke-linecap="round" fill="none" opacity=".75">
    <path stroke-width="5" d="M640 778V664M690 778V664M628 664H770M650 664V632M650 632L770 664M650 632L628 664" />
    <path stroke-width="3" d="M640 720H690M640 720L690 760M690 720L640 760M738 664V700"/>
    <path stroke-width="4" d="M742 778V716M776 778V716M730 716H800"/>
  </g>
  <rect x="726" y="700" width="24" height="12" rx="2" fill="#6770D8" opacity=".75"/>
  <path d="M0 782C120 762 260 772 400 778S680 770 800 762V830H0Z" fill="#B7B0EC"/>
  <rect y="790" width="800" height="210" fill="url(#pan)"/>
  <ellipse cx="560" cy="838" rx="110" ry="16" fill="#FFF3DF" opacity=".85"/>
  <g stroke="#fff" stroke-width="2" opacity=".6" fill="none"><path d="M0 812H800M0 850H800M0 910H800"/><path d="M400 790L60 1000M400 790L280 1000M400 790L520 1000M400 790L740 1000M400 790L-160 1000M400 790L960 1000"/></g>
  <path d="M30 845C70 780 110 744 142 740C176 744 222 786 262 845Z" fill="#fff"/><path d="M142 740C176 744 222 786 262 845H160C164 804 156 768 142 740Z" fill="#CDD2FA"/>
  <path d="M190 846C214 808 240 790 258 788C278 790 306 812 332 846Z" fill="#F7F7FF"/><path d="M258 788C278 790 306 812 332 846H270C274 824 268 802 258 788Z" fill="#D8DCFB"/>
  <g transform="translate(486 842)" fill="#232A58"><path d="M6 8a12 12 0 0 1 24 0Z" fill="#F5A524"/><rect x="2" y="7" width="32" height="3.4" rx="1.7" fill="#F5A524"/><circle cx="18" cy="16" r="8.5"/><path d="M6 28q12-6 24 0l3 34H3Z"/><rect x="6" y="60" width="10" height="36" rx="5"/><rect x="20" y="60" width="10" height="36" rx="5"/><path d="M30 32l26 16" stroke="#232A58" stroke-width="7" stroke-linecap="round"/><path d="M78 2L48 98" stroke="#232A58" stroke-width="4" stroke-linecap="round"/><path d="M34 96h28" stroke="#232A58" stroke-width="5" stroke-linecap="round"/></g>
</svg>`;

const TEST_ACCOUNTS = [
  ["clinic@workcheck.demo", "Demo-Clinic-2026", "Clinic team", "Sees each worker", "stethoscope"],
  ["ddo@workcheck.demo", "Demo-DDO-2026", "District office", "Totals only", "building-factory-2"],
  ["site@workcheck.demo", "Demo-Site-2026", "Site supervisor", "Heat at the site", "helmet"],
  ["worker@workcheck.demo", "Demo-Worker-2026", "Worker", "Own record only", "heartbeat"],
];

function renderLogin() {
  runCleanup();
  S.page = null;
  $("#app").innerHTML = `<div class="login">
    <section class="login-art">
      ${SCENE}
      <div class="login-copy">
        <div class="logo on-dark">${logoMark()}<div><b>WorkCheck</b><span>Kachchh</span></div></div>
        <h1>Every worker followed, from first alert to last check.</h1>
        <p>Clear risk. Clear next step. Built for the salt pans, ports and plants of Kachchh.</p>
      </div>
      <div class="float-card fc1"><span class="av av1" aria-hidden="true">KP<i>${ic("pick", 12, 2)}</i></span><div><b>Kishan P.</b><span>Stone crusher operator</span></div>${pill("due", "Hearing test due", true)}</div>
      <div class="float-card fc2"><span class="round sm bg-action t-action">${ic("temperature-sun", 16, 2)}</span><div><b>2.3 safe hours</b><span>Per shift, April to October</span></div></div>
    </section>
    <section class="login-form">
      <form id="login-form" novalidate>
        <h2>Sign in</h2>
        <p class="sub">Use your WorkCheck account.</p>
        <label class="field"><span>Email</span><span class="input">${ic("mail", 18)}<input id="email" type="email" autocomplete="username" placeholder="you@example.com" required></span></label>
        <label class="field"><span>Password</span><span class="input">${ic("lock", 18)}<input id="password" type="password" autocomplete="current-password" placeholder="Your password" required><button type="button" class="icon-btn ghost" id="show-pw" aria-label="Show password">${ic("eye", 18)}</button></span></label>
        <p class="form-error" id="login-error" role="alert" hidden></p>
        <button class="btn btn-ink btn-full" id="login-go" type="submit">Sign in ${ic("arrow-right", 18, 2)}</button>
        <div class="divider"><span>Try a test account</span></div>
        <div class="test-accounts">${TEST_ACCOUNTS.map(([e, p, n, d, i], k) => `<button type="button" class="test-acc" data-k="${k}"><span class="round sm bg-indigo">${ic(i, 16, 2)}</span><span><b>${n}</b><small>${d}</small></span></button>`).join("")}</div>
        <p class="fine">All workers here are fictional. Test accounts work only on this copy.</p>
      </form>
    </section>
  </div>`;
  const form = $("#login-form");
  const go = async (email, password) => {
    const err = $("#login-error"), btn = $("#login-go");
    err.hidden = true; btn.disabled = true;
    try {
      S.user = await api("/api/auth/login", { method: "POST", body: { email, password } });
      $("#app").innerHTML = "";
      if (location.hash.length > 2 && !location.hash.startsWith("#/login")) route();
      else { location.hash = `#/${NAV[S.user.role][0][0]}`; }
    } catch (e) {
      err.textContent = e.message; err.hidden = false; btn.disabled = false;
    }
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); go($("#email").value, $("#password").value); });
  $("#show-pw").addEventListener("click", (e) => {
    const input = $("#password"), show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.innerHTML = ic(show ? "eye-off" : "eye", 18);
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  $$(".test-acc").forEach((b) => b.addEventListener("click", () => {
    const [email, password] = TEST_ACCOUNTS[Number(b.dataset.k)];
    $("#email").value = email; $("#password").value = password;
    go(email, password);
  }));
}

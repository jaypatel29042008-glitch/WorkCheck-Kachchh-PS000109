# WorkCheck Kachchh platform

A worker health monitoring platform for PS000109: login, stored records, risk views and a device connection.

**This holds no real Kachchh worker health data.** Workers are fictional, heat and UV are model estimates, and silica and noise come from outside Kachchh. Don't present it as field results.

## Start it

- **Mac:** double-click `run.command`
- **Windows:** double-click `run.bat`
- **Manual:** `python3 -m pip install -r requirements.txt`, then `python3 -m uvicorn app.main:app --port 8090`

Then open http://localhost:8090.

## Demo accounts

| Role | Email | Password | What it can open |
|---|---|---|---|
| Clinic team | clinic@workcheck.demo | Demo-Clinic-2026 | Today, every worker record, recording check results |
| District office | ddo@workcheck.demo | Demo-DDO-2026 | Anonymous totals, CSV export; no individual records |
| Site supervisor | site@workcheck.demo | Demo-Site-2026 | Site monitor and heat map |
| Worker | worker@workcheck.demo | Demo-Worker-2026 | Own record, QR pass, symptom reports |

These are for local demos. Change them before putting the platform on the internet.

## What a new workplace does

1. On the sign-in page, choose **New workplace**. Three steps: the company, the first site, your account. You become its supervisor.
2. On **Team & invites**, choose **Invite people**. You get an 8-character code (also a link and a QR code).
3. Workers open the app, choose **Join with a code**, and set a name, mobile number or email, and a password.
4. Each morning a worker does the **daily check-in**: how they feel, anything bothering them (tap the body), and whether they had their safety gear.
5. The supervisor's **Daily check-ins** page lists what needs doing today. Clinic staff, invited the same way, see symptoms and record medical checks.

The four demo accounts belong to a sample organisation that holds the fictional test workers. Its check-ins, incidents, training and medical-check entries are made up so the pages have something to show, and are labelled as such.

## Who can see what

| Role | Sees |
|---|---|
| Worker | Own record and own check-ins only |
| Site supervisor | Who checked in and who is unwell, by name. Symptoms only when it is an emergency. Incidents, training, site checks, invites. No health records |
| Clinic team | Health records, symptoms, medical checks and referrals for workers in their own organisation |
| District office | Counts only, never names |

## Where data is stored

| File | Contents |
|---|---|
| `data/reference.db` | Read-only copy of `final_dataset/ps000109_final.db` (version 2) |
| `data/runtime.db` | Created on first run: accounts with hashed passwords, sessions, access log, organisations, sites, invite codes, daily check-ins, incidents, medical checks, referrals, training, site checks, clinic updates, symptom reports, node readings |

To reset, stop the server and delete `data/runtime.db`.

## Code layout

| File | Contents |
|---|---|
| `app/core.py` | Settings, storage, passwords, sessions, role checks |
| `app/security.py` | Security headers, cross-site request check, rate limits |
| `app/orgs.py` | Company sign-up, sites, invite codes, joining |
| `app/trackers.py` | Daily check-in, incidents, medical checks, referrals, training, site checks, the daily dashboard |
| `app/main.py` | Sign-in, the fictional test workers, heat views, the device connection |

## Connect Wokwi

Free Wokwi runs in the cloud, so it can reach the internet but not `localhost`. The platform needs a public address.

1. Start the platform, then open a tunnel to it: `brew install cloudflared`, then `cloudflared tunnel --url http://localhost:8090`. It prints an address ending in `trycloudflare.com`. The address changes each time.
2. Open the [Wokwi project](https://wokwi.com/projects/479831190538594305) and make the three edits in `wokwi/wokwi_platform_patch.ino`, with that address in `PLATFORM_URL`.
3. Press play and keep the Wokwi tab in front. Wokwi slows right down in a background tab.
4. The serial monitor prints `POST 200, platform lamp: ...`. In **Site monitor**, the **Wokwi device** tab turns green.
5. To show the link working the other way, switch on **Control the device from here** in that tab and move a slider. Within a few seconds the Wokwi device takes the values: its screen, lamp and buzzer follow, and the website shows "Device is using these values". These are test values typed on the website, not sensor readings.

Tested on 13 and 14 Nov 2026 with the team's sketch. Readings arrived, and the platform's heat index (19.5°C) matched the one the sketch worked out itself. With website control on, values of 38°C air, 52°C globe and dust 260 put the device into ALERT with its lamp lit; moving the sliders to 27°C, 30°C and 40 brought it back to OK. The first secure try after start-up failed once with "connection refused"; the next ones went through.

Set `WC_DEVICE_KEY` to a private value before leaving a tunnel open, and close the tunnel when you finish. Wokwi says traffic on its free gateway is monitored, so send only simulated data.

The **Replay a real day** and **Move the sliders** tabs work without Wokwi.

## Security

- Passwords are stored as salted scrypt hashes, must be at least 10 characters, and accounts lock for 5 minutes after 5 wrong tries.
- Sign-in and sign-up are rate-limited for each connection.
- The session cookie is `HttpOnly` and `SameSite=Strict`. Every request that changes something must carry the app's own header, so another website cannot act for a signed-in user.
- Every response carries a content security policy (no inline scripts, no outside scripts, no framing) and related headers.
- Every opening of a health record is logged. Clinic staff can open records only for their own organisation.
- Changing a password signs that account out everywhere else.

Not done yet: email or SMS verification, password reset without a supervisor, two-step sign-in, and a security review by someone independent. Get those before real health data goes in.

## Putting it online

It runs anywhere that runs Python (for example Render, Railway, Fly.io or a small server). Start command: `python3 -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`

| Setting | Use |
|---|---|
| `WC_ENV=production` | Turns off the API docs page and the demo accounts, and trusts the host's forwarded address for rate limits |
| `WC_HTTPS=1` | Marks the cookie secure and sends the HTTPS-only header. Serve over HTTPS |
| `WC_ALLOWED_HOSTS=your.domain` | Refuses requests for any other host name |
| `WC_DEVICE_KEY` | Private key for sensor devices. Change it from the default |
| `WC_RUNTIME_DB` | Where to keep the runtime database. Point it at a disk that survives restarts |
| `WC_DEMO=1` | Keeps the four demo accounts in production. Leave off for real use |

The runtime database is SQLite, which suits one server. Use a hosted database before running several.

## Tests

`python3 -m pytest tests -q` (26 tests: sign-in, roles, sign-up, invites, check-ins, trackers, heat views, device)

## Notes

- Gujarati and Hindi cover the worker screen and the daily check-in. Have a fluent speaker check them before any real use.
- The check-in records what a worker says. It is not a diagnosis, and the symptom list has not been reviewed by a doctor.
- Display names such as "Kishan P." are made up in the platform layer so test workers are easier to read. The dataset still holds only the SIM IDs.
- Map boundaries come from OpenStreetMap contributors (ODbL) and are simplified. This is not an official map. Icons are Tabler (MIT); fonts are Plus Jakarta Sans and Noto (OFL).
- All alert rules need a clinician's review. The platform tracks follow-up and doesn't diagnose.
- Tables generated by `scripts/generate_missing_datasets.py` and `scripts/build_public_downloads.py` in the team repo are deliberately not used, because they carry real organisations' names without real source data.

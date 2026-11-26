# System Architecture — WorkCheck Kachchh

## Dual Delivery Architecture

1. **GitHub Pages Static Edition (`/`)**:
   - Served directly from repository root `index.html` + `js/mock_data.js` + modular ES5/ES6 browser scripts under `js/`.
   - Uses `<meta http-equiv="Content-Security-Policy">` (zero inline scripts via `js/boot.js`), `sw.js` app-shell caching, and direct HTTPS CORS queries to `api.open-meteo.com`, `air-quality-api.open-meteo.com`, and `api.postalpincode.in`.
2. **Full-Stack FastAPI Edition (`workcheck_platform/`)**:
   - Entrypoint: `uvicorn app.main:app --port 8090`.
   - Split modules:
     - `app/core.py`: Environment settings, `scrypt` hashing, session cookie auth, RBAC helpers (`require`), SQLite schema/migrations.
     - `app/security.py`: `SecurityHeaders`, `CsrfCheck` (`X-Requested-With: WorkCheck` + `Origin` vs `Host`), bounded sliding-window `RateLimiter`, `WC_TRUSTED_PROXIES` IP extraction.
     - `app/live.py`: SSRF validator (`safe_forward_url`), CSV formula guard (`csv_safe`), cached Open-Meteo Forecast + CAMS Air Quality (`15m` TTL) & India Post Pincode (`24h` TTL) clients with `reference.db` fallback.
     - `app/orgs.py`: Organisation registration, single-use staff invites, 8-char invite onboarding, DPDP consent timestamping.
     - `app/trackers.py`: Daily check-ins, incidents, medical checks, referrals, trainings, site checklists, `<5` small-cell suppression.
     - `app/main.py`: ISO 7243 WBGT physics (`compute_wbgt`), worker passports, facilities proximity sorting, live public API endpoints, DPDP export, static SPA hosting.
3. **Wokwi ESP32 Hardware Bridge (`wokwi_bridge/`)**:
   - Standalone FastAPI relay service (`:8080`) with `hmac.compare_digest` key validation (`BRIDGE_ENV=production` fail-closed) and SSRF-safe forwarding to `/api/v1/telemetry`.

## Storage Separation
- `workcheck_platform/data/reference.db` (read-only URI mode): 43 reference tables covering 128 synthetic test cohorts, 12 Kachchh locations (`8,760` hourly rows each in `location_hourly_2025`), CPCB Gujarat air quality (`10,815` rows), NFHS-5, PLFS Gujarat, Lancet Countdown, MSHA silica/noise benchmarks, and ISO heat limits.
- `workcheck_platform/data/runtime.db` (read/write): Organisation-scoped tables (`org_id`) with foreign keys and additive schema migrations.

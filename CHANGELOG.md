# Changelog

## v3.1.0 — Official Release Hardening, Live Public APIs & Unified Deployment (2026-11-26)

### Security & Multi-Tenant Hardening
- Unified `feat/v2-platform` (`architecture.html`, `docs/`) cleanly with `main` and retired broken legacy `app/` and empty `app.db`.
- Fixed cross-tenant authorization gaps in `/api/workers/{id}/conditions`, `/api/workers/{id}/symptoms/{symptom_id}/review`, `/api/node/controls`, `/api/node/state`, `/api/v1/telemetry`, and `/api/facilities/refer`.
- Required authentication on `/api/facilities`, enforced fail-closed device keys (`503`) in production, added SSRF validation (`safe_forward_url`), bounded rate limiters (`RateLimiter`), fixed `TRUSTED_PROXIES` IP extraction, upgraded invite codes to 8-char (`XXXX-XXXX`) with server-side `max_uses=1` for staff/clinicians, and added CSV formula neutralization (`csv_safe`).
- Removed hardcoded `X-API-Key: demo-device-key` headers from client JavaScript (`js/site.js`, `js/wokwi.js`), escaped all remaining dynamic interpolations, and enforced strict CSP without inline script exceptions.

### Live Public APIs & Dormant Dataset Activation
- Integrated cached **Open-Meteo Weather Forecast + CAMS Air Quality** (`/api/live/environment` + browser CORS) across `#/site` and `#/heat` with honest non-sensor disclosure and reference baseline fallback.
- Integrated **India Post Pincode Directory** (`/api/live/pincode/{pincode}`) lookup directly inside `#/facilities`.
- Surfaced all 6 dormant `reference.db` tables (`cpcb_gujarat_daily_pm`, `kachchh_nfhs5_health_indicators`, `msha_noise_by_commodity_job`, `plfs_gujarat_table41_hours`, `lancet_india_hours_lost`, `district_facts`) in `/api/evidence` and `#/evidence`.
- Wired weekly `checkins` gate hours into worker passports (`#workers` & `#me`).

### Official Compliance, SEO, PWA & Test Coverage
- Added `DPDP Act 2023` notice, consent timestamping, and personal JSON archive download (`/api/privacy/*`, `/api/me/export`), footer legal modals, custom `404.html`, `favicon.svg`/`.ico`, `manifest.webmanifest`, offline shell `sw.js`, `robots.txt`, and `sitemap.xml`.
- Fixed broken static GitHub Pages features (CSV Blob export, working simulation/replay/facilities Haversine & disease sorting, non-blocking 108 modal) and `375px` mobile layout overflow/tap targets.
- Expanded automated tests to 72 passing pytest cases (38 platform/security/live-API + 34 Wokwi bridge) plus GitHub Actions CI.

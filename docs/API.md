# API Contract — WorkCheck Kachchh v3.1

## Authentication & Privacy
- `GET /api/auth/options` — Non-secret server mode info (`demo`, `env`, `consent_version`, `authenticated`, `user`). Returns `200` cleanly before login.
- `POST /api/auth/login` | `POST /api/auth/logout` | `GET /api/auth/me` | `POST /api/auth/password`
- `GET /api/privacy/notice` — Public DPDP Act 2023 controller & data minimisation notice.
- `POST /api/privacy/consent` — Authenticated consent timestamp recording (`dpdp-v1-2026`).
- `GET /api/me/export` — Authenticated JSON archive download of personal user & worker records.

## Live Public APIs & Reference Evidence
- `GET /api/live/environment?site_id=` — Auth-required cached (15m TTL) Open-Meteo Forecast + CAMS Air Quality metrics + ISO shade/estimated-sun WBGT across 12 Kachchh sites (falls back cleanly to 2025 climatology).
- `GET /api/live/pincode/{pincode}` — Auth-required cached (24h TTL) India Post Pincode lookup (`^\d{6}$`) matching Kachchh talukas (including India Post `"Rahpar"` -> `"Rapar"` normalization) & verified health facilities.
- `GET /api/live/road-distances?site_id=` — Auth-required cached (6h TTL) OSRM driving route distances (`road_km`) and ETAs (`drive_minutes`) from selected Kachchh worksite to health facilities, falling back cleanly to Haversine estimate when offline.
- `GET /api/evidence` — Published citations, source register, 44-table data dictionary, MSHA/NIOSH silica & noise benchmarks, silica control scenarios, CPCB Gujarat daily PM summary, NFHS-5, PLFS Gujarat (hours & bands), Lancet heat hours lost & outdoor workforce exposure, District facts & 2025 Kachchh locality heat priority.

## Triage, Workers, Facilities & Telemetry
- `GET /api/overview` | `GET /api/dashboard` | `GET /api/export/district.csv` (DDO `<5` suppression + CSV formula neutralization).
- `GET /api/workers` | `GET /api/workers/{id}` | `POST /api/workers/{id}/conditions` | `POST /api/workers/{id}/symptoms` | `POST /api/workers/{id}/symptoms/batch` | `POST /api/workers/{id}/symptoms/{sid}/review` (org-scoped).
- `GET /api/facilities` | `POST /api/facilities/refer` (authenticated, org-scoped `worker_id` validation).
- `GET /api/node/state` | `GET /api/node/day` | `POST /api/node/replay` | `POST /api/node/simulate` | `GET/POST /api/node/controls` (org-scoped).
- `POST /api/v1/telemetry` | `POST /api/v1/checkin` (`X-API-Key`; fails closed with `503` in `production` if unset/default).

*State-changing browser routes require `X-Requested-With: WorkCheck` header and same-origin validation.*

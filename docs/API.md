# API Contract — WorkCheck Kachchh v3.1

## Authentication & Privacy
- `GET /api/auth/options` — Non-secret server mode info (`demo`, `env`, `consent_version`).
- `POST /api/auth/login` | `POST /api/auth/logout` | `GET /api/auth/me` | `POST /api/auth/password`
- `GET /api/privacy/notice` — Public DPDP Act 2023 controller & data minimisation notice.
- `POST /api/privacy/consent` — Authenticated consent timestamp recording (`dpdp-v1-2026`).
- `GET /api/me/export` — Authenticated JSON archive download of personal user & worker records.

## Live Public APIs & Reference Evidence
- `GET /api/live/environment?site_id=` — Auth-required cached (15m TTL) Open-Meteo Forecast + CAMS Air Quality metrics + ISO shade/estimated-sun WBGT across 12 Kachchh sites (falls back cleanly to 2025 climatology).
- `GET /api/live/pincode/{pincode}` — Auth-required cached (24h TTL) India Post Pincode lookup (`^\d{6}$`) matching Kachchh talukas & health facilities.
- `GET /api/evidence` — Published citations, source register, 43-table data dictionary, MSHA silica/noise benchmarks, CPCB Gujarat daily PM summary, NFHS-5, PLFS Gujarat, Lancet heat hours lost, District facts.

## Triage, Workers, Facilities & Telemetry
- `GET /api/overview` | `GET /api/dashboard` | `GET /api/export/district.csv` (DDO `<5` suppression + CSV formula neutralization).
- `GET /api/workers` | `GET /api/workers/{id}` | `POST /api/workers/{id}/conditions` | `POST /api/workers/{id}/symptoms` | `POST /api/workers/{id}/symptoms/batch` | `POST /api/workers/{id}/symptoms/{sid}/review` (org-scoped).
- `GET /api/facilities` | `POST /api/facilities/refer` (authenticated, org-scoped `worker_id` validation).
- `GET /api/node/state` | `GET /api/node/day` | `POST /api/node/replay` | `POST /api/node/simulate` | `GET/POST /api/node/controls` (org-scoped).
- `POST /api/v1/telemetry` | `POST /api/v1/checkin` (`X-API-Key`; fails closed with `503` in `production` if unset/default).

*State-changing browser routes require `X-Requested-With: WorkCheck` header and same-origin validation.*

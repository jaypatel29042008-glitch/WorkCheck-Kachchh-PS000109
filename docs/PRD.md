# Product Requirements Document (PRD) — WorkCheck Kachchh

## 1. Problem Statement
Workers across Kachchh salt pans, ports, cement plants, stone crushers, and construction yards face compounding occupational heat stress (high Wet-Bulb Globe Temperature, WBGT), airborne dust/particulates, intense solar UV, and noise exposure, while follow-up exams frequently stall across contractor changes and district referral facilities.

## 2. Target Users & Roles
- **Worker (`worker`)**: Trilingual (`ગુજ`, `हिં`, `ENG`) QR health pass, morning check-in, PPE logging, immediate 108 cooling protocol button, nearest health facility filter, and personal DPDP JSON data export.
- **Site Supervisor (`supervisor`)**: Morning workforce check-in dashboard, incident tracking, monthly site hazard checklist, training expiry tracking, invite-code onboarding (`XXXX-XXXX`), and site WBGT sensor controls.
- **Clinic Team (`clinician`)**: Follow-up triage queue, symptom review, condition updates (`condition_updates`), medical check tracking, and referral logging scoped strictly to their organization.
- **District Office (`ddo`)**: Anonymized district taluka summaries (`<5` small-cell suppression enforced), multi-hazard map, and formula-safe CSV export.

## 3. Core Functional Scope
1. **Static Zero-Install Preview (`GitHub Pages`)**: Client-side router powered by verified `reference.db` extract (`js/mock_data.js`), in-browser ISO 7243 WBGT simulator, live Open-Meteo/CAMS & India Post CORS API calls, and formula-safe CSV Blob download.
2. **Full-Stack Platform (`workcheck_platform/`, port `8090`)**: FastAPI REST service backed by split SQLite (`reference.db` read-only + `runtime.db` WAL/FK transactional writes).
3. **IoT Bridge (`wokwi_bridge/`, port `8080`)**: Receives ESP32 / Wokwi environmental telemetry and relays readings cleanly with API-key authentication and bi-directional threshold overrides.

## 4. Explicit Non-Goals & Regulatory Boundaries
- **Not a medical diagnosis tool**: Alerts trigger clinical follow-up checks, never automated diagnoses.
- **No external government writes**: Does not claim active production writes to ABDM/ABHA, e-Shram, or hospital EHRs.
- **Transparent model labeling**: Gridded Open-Meteo forecasts and ERA5/CAMS climatology are clearly badged as ambient model estimates rather than calibrated worksite black-globe measurements.

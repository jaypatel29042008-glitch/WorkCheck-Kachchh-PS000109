# Verification & Test Plan

## 1. Automated Pytest Suites (`72` tests total)
- `workcheck_platform/tests/test_platform.py` (16 tests): password scrypt hashing, lockout, DDO `<5` suppression, worker self-only access, clinic queue mutations, symptom review flow, ISO WBGT replay, weekly check-ins, CSV anonymisation, combined hazard map, Wokwi telemetry, facility distance/disease sorting, batch symptoms.
- `workcheck_platform/tests/test_onboarding_and_trackers.py` (7 tests): CSRF header gate, security headers, company registration, 8-char invite flow, daily check-ins, incidents/training/site-checks, clinician onboarding, bi-directional device controls.
- `workcheck_platform/tests/test_security_and_live_apis.py` (15 tests): cross-origin CSRF rejection, `TRUSTED_PROXIES` IP parsing, multi-tenant IDOR isolation (`conditions`, `review`, `referrals`, `controls`, `readings`), unauthenticated facility gate, fail-closed prod `WC_DEVICE_KEY`, SSRF private/metadata block, CSV formula escaping, DDO dashboard masking, DPDP notice/consent/export, dormant dataset surfacing, Open-Meteo live fetch & offline fallback, India Post pincode validation/lookup.
- `wokwi_bridge/test_bridge.py` (34 tests): ISO 7243 WBGT math, rule thresholds, hydration/UV/noise alerts, session state, fail-closed `BRIDGE_API_KEY` in production.

## 2. Static Asset Parity & Client Checks
- SHA-256 hash verification across all 26 mirrored files between repo root `/` and `workcheck_platform/static/`.
- Zero hardcoded `demo-device-key` strings inside client JS bundles (`js/*.js`).
- Browser headless/DevTools audit at `1440px` desktop and `375px` mobile viewports checking zero console errors, zero horizontal overflow, clean SVG/favicon loading, live Open-Meteo response, and offline CSV/108 flows.

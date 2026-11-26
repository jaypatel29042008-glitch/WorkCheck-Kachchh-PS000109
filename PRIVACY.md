# Privacy Notice & DPDP Act 2023 Alignment

**Consent Version:** `dpdp-v1-2026`  
**Status:** Occupational Heat & Health Follow-Up Prototype (`Kachchh District`)

## Data Minimisation & Purpose Limitation

1. **Purpose**: WorkCheck Kachchh records environmental risk metrics (WBGT, PM10, UV, noise), daily check-ins, self-reported symptoms, PPE compliance, and facility referral notes solely to assist workplace safety follow-up.
2. **Non-Diagnostic Clarification**: WorkCheck Kachchh is not a medical diagnostic device, does not transmit records to hospitals, and does **not** connect to ABHA, ABDM, or e-Shram production servers.
3. **Sample vs Onboarded Data**:
   - Demo cohort records (`SIM-*`) are synthetic fictional accounts derived from published public climatology and epidemiology datasets.
   - Company workspaces created via `/api/org/register` record explicit `consent_version` and `consent_at` timestamps at registration and invite onboarding.
4. **District-Level Privacy Preservation**:
   - District Office (`ddo`) views never receive worker names or individual records.
   - Counts between `1` and `4` are masked as `<5` in both aggregate summaries (`/api/overview`, `/api/dashboard`) and CSV exports (`/api/export/district.csv`).
5. **Individual Rights**:
   - Authenticated users can inspect their privacy notice (`GET /api/privacy/notice`), re-confirm consent (`POST /api/privacy/consent`), and download a portable JSON archive of their stored data (`GET /api/me/export`).

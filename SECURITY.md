# Security Policy & Controls

## Reporting a Vulnerability

If you discover a security issue in WorkCheck Kachchh, please report it via GitHub Security Advisories or open a confidential report with steps to reproduce and affected endpoints. Avoid posting active credentials or exploit payloads in public issues.

## Implemented Security Controls

1. **Authentication & Password Hardening**:
   - Passwords hashed with `hashlib.scrypt` (`n=16384, r=8, p=1`) + per-user random 16-byte salts (`workcheck_platform/app/core.py`).
   - Account lockout after `5` failed login attempts (`LOCK_MINUTES = 5`).
   - High-entropy random session tokens stored hashed (`SHA-256`) in SQLite; `HttpOnly`, `SameSite=Strict`, and conditional `Secure` flags.
2. **CSRF & Origin Enforcement (`workcheck_platform/app/security.py`)**:
   - All state-changing `/api/*` browser routes require `X-Requested-With: WorkCheck` plus strict same-origin `Origin` vs `Host` validation.
3. **Security Headers & Content Security Policy**:
   - `Content-Security-Policy` (`default-src 'self'`, `script-src 'self'` without `'unsafe-inline'`, explicit HTTPS allowlist for Open-Meteo and India Post APIs, `object-src 'none'`).
   - `X-Frame-Options: DENY` & `frame-ancestors 'none'` on FastAPI responses, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`.
4. **Multi-Tenant Organization Isolation**:
   - Strict `org_id` isolation across worker passports, condition updates, symptom reviews, referrals, check-ins, sensor telemetry (`readings`), and bi-directional `device_controls`.
   - Single-use invite limit enforced server-side for `supervisor` and `clinician` invites (`orgs.py`), paired with 8-character ambiguity-free invite codes and rate-limited lookups (`JOIN_LIMIT`).
5. **Production Fail-Closed Secrets & SSRF Protection**:
   - When `WC_ENV=production` (`BRIDGE_ENV=production`), device endpoints fail closed (`503`) unless a non-default `WC_DEVICE_KEY` (`BRIDGE_API_KEY`) is provided.
   - `WC_FORWARD_URL` and `DASHBOARD_TELEMETRY_URL` block cloud metadata (`169.254.169.254`), link-local, loopback, and private RFC1918 ranges in production (`live.safe_forward_url`).
6. **CSV Formula Injection Prevention**:
   - District exports neutralise formula trigger prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) via `csv_safe()`.

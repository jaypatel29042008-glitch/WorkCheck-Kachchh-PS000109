"""Shared pieces: settings from the environment, storage, passwords, sessions and role checks.

Reference data is read-only (data/reference.db). Everything users create goes in the runtime database.
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
REFERENCE_DB = ROOT / "data" / "reference.db"

# --- Settings ----------------------------------------------------------------
# Every value has a safe local default and can be changed without touching code.
ENV = os.environ.get("WC_ENV", "local")               # local | production
HTTPS = os.environ.get("WC_HTTPS", os.environ.get("WC_SECURE_COOKIE", "")) == "1"
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("WC_ALLOWED_HOSTS", "").split(",") if h.strip()]
TRUSTED_PROXIES = {h.strip() for h in os.environ.get("WC_TRUSTED_PROXIES", "127.0.0.1,::1").split(",") if h.strip()}
DEMO = os.environ.get("WC_DEMO", "1" if ENV == "local" else "0") == "1"
COOKIE = "wc_session"
SESSION_HOURS = int(os.environ.get("WC_SESSION_HOURS", "8"))
MAX_FAILED = 5
LOCK_MINUTES = 5
MIN_PASSWORD = 10
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "WorkCheck"
CONSENT_VERSION = "dpdp-v1-2026"

ROLES = ("worker", "supervisor", "clinician", "ddo")
ROLE_NAMES = {"worker": "Worker", "supervisor": "Site supervisor", "clinician": "Clinic team", "ddo": "District office"}

DEMO_USERS = [
    ("ddo@workcheck.demo", "Demo-DDO-2026", "ddo", "District Office", None),
    ("clinic@workcheck.demo", "Demo-Clinic-2026", "clinician", "Clinic Team", None),
    ("site@workcheck.demo", "Demo-Site-2026", "supervisor", "Site Supervisor", None),
    ("worker@workcheck.demo", "Demo-Worker-2026", "worker", "Kishan P.", "SIM-B"),
]
DEMO_ORG = 1  # The organisation that holds the fictional test workers.

COMMON_PASSWORDS = {
    "password", "password1", "password123", "password2026", "1234567890", "123456789012",
    "qwertyuiop", "qwerty1234", "workcheck1", "workcheck2026", "welcome123", "admin12345",
    "admin@2026", "letmein123", "iloveyou12", "kachchh2026", "india12345", "pass@12345",
}


def device_key_secret():
    """Return configured device API key, failing closed in production when unset or default."""
    key = os.environ.get("WC_DEVICE_KEY", "").strip()
    if ENV == "production":
        if not key or key == "demo-device-key":
            return None
        return key
    return key or "demo-device-key"


# --- Storage -----------------------------------------------------------------
class Connection(sqlite3.Connection):
    """Commits on success, rolls back on error, and always closes when a with-block ends."""

    def __exit__(self, *args):
        result = super().__exit__(*args)
        self.close()
        return result


def ref():
    con = sqlite3.connect(f"file:{REFERENCE_DB}?mode=ro", uri=True, factory=Connection)
    con.row_factory = sqlite3.Row
    return con


def runtime_path():
    return Path(os.environ.get("WC_RUNTIME_DB", ROOT / "data" / "runtime.db"))


def now():
    return datetime.now(timezone.utc)


IST = timezone(timedelta(hours=5, minutes=30))


def local_date():
    """Today's date in India. A worker's day must not change at 5:30 in the morning."""
    return now().astimezone(IST).date()


def today():
    return local_date().isoformat()


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    return salt.hex() + "$" + hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex()


def password_ok(password, stored):
    salt, _ = stored.split("$")
    return hmac.compare_digest(hash_password(password, bytes.fromhex(salt)), stored)


def password_problem(password, identity=""):
    """Plain-language reason a password is not allowed, or None."""
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters."
    if password.lower() in COMMON_PASSWORDS or password.lower().replace("-", "") in COMMON_PASSWORDS:
        return "That password is too common. Pick something only you would know."
    if identity and identity.lower() in password.lower():
        return "Don't use your email or phone number in the password."
    return None


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, worker_id TEXT, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, org_id INTEGER, site_id INTEGER, created_at TEXT, consent_version TEXT, consent_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER NOT NULL, action TEXT NOT NULL, worker_id TEXT);
CREATE TABLE IF NOT EXISTS condition_updates (id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER NOT NULL, worker_id TEXT NOT NULL, condition TEXT NOT NULL, status TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS symptom_reports (id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER NOT NULL, worker_id TEXT NOT NULL, symptom TEXT NOT NULL, urgent INTEGER NOT NULL, reviewed_at TEXT, org_id INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY, at TEXT NOT NULL, device_id TEXT NOT NULL, site_id TEXT NOT NULL, job_id TEXT, source TEXT NOT NULL, ambient_temp_c REAL NOT NULL, relative_humidity_pct REAL NOT NULL, globe_temp_c REAL, natural_wet_bulb_c REAL, pm2_5_ug_m3 REAL, pm10_0_ug_m3 REAL, uv_index REAL, noise_dba REAL, wbgt_c REAL NOT NULL, wbgt_method TEXT NOT NULL, forward_status TEXT, org_id INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY, at TEXT NOT NULL, worker_id TEXT NOT NULL, device_id TEXT NOT NULL, site_id TEXT NOT NULL, event TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS organisations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, district TEXT NOT NULL DEFAULT 'Kachchh', demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by INTEGER);
CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organisations(id), name TEXT NOT NULL, location_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, org_id INTEGER NOT NULL, site_id INTEGER, role TEXT NOT NULL, job_id TEXT, label TEXT, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS org_workers (id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, site_id INTEGER, user_id INTEGER, name TEXT NOT NULL, age INTEGER, phone TEXT, job_id TEXT NOT NULL, joined_at TEXT NOT NULL, consent_version TEXT, consent_at TEXT);

CREATE TABLE IF NOT EXISTS daily_logs (id INTEGER PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL, worker_id TEXT NOT NULL, org_id INTEGER, feeling INTEGER NOT NULL, symptoms TEXT NOT NULL DEFAULT '[]', ppe TEXT NOT NULL DEFAULT '{}', water_litres REAL, hours REAL, note TEXT, reviewed_at TEXT, UNIQUE(worker_id, day));
CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY, at TEXT NOT NULL, org_id INTEGER, site_id INTEGER, site_name TEXT, worker_id TEXT, kind TEXT NOT NULL, severity TEXT NOT NULL, what TEXT NOT NULL, action TEXT, status TEXT NOT NULL DEFAULT 'open', reported_by INTEGER NOT NULL, closed_at TEXT, closed_note TEXT);
CREATE TABLE IF NOT EXISTS medical_checks (id INTEGER PRIMARY KEY, at TEXT NOT NULL, org_id INTEGER, worker_id TEXT NOT NULL, check_name TEXT NOT NULL, done_on TEXT NOT NULL, result TEXT NOT NULL, next_due TEXT, note TEXT, by_user INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY, at TEXT NOT NULL, org_id INTEGER, worker_id TEXT NOT NULL, facility_id TEXT NOT NULL, facility_name TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent', outcome TEXT, by_user INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trainings (id INTEGER PRIMARY KEY, at TEXT NOT NULL, org_id INTEGER, worker_id TEXT NOT NULL, course TEXT NOT NULL, done_on TEXT NOT NULL, valid_until TEXT, by_user INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS site_checks (id INTEGER PRIMARY KEY, at TEXT NOT NULL, org_id INTEGER, site_id INTEGER, site_name TEXT, item TEXT NOT NULL, status TEXT NOT NULL, note TEXT, by_user INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS device_controls (device_id TEXT PRIMARY KEY, org_id INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 0, settings TEXT NOT NULL DEFAULT '{}', rev INTEGER NOT NULL DEFAULT 0, updated_at TEXT, updated_by INTEGER, ack_rev INTEGER NOT NULL DEFAULT 0, ack_at TEXT);
CREATE INDEX IF NOT EXISTS daily_logs_day ON daily_logs(day);
CREATE INDEX IF NOT EXISTS daily_logs_worker ON daily_logs(worker_id, day);
"""

MIGRATIONS = {
    "symptom_reports": [("reviewed_at", "TEXT"), ("org_id", "INTEGER NOT NULL DEFAULT 1")],
    "readings": [("org_id", "INTEGER NOT NULL DEFAULT 1")],
    "device_controls": [("org_id", "INTEGER NOT NULL DEFAULT 1")],
    "users": [("org_id", "INTEGER"), ("site_id", "INTEGER"), ("created_at", "TEXT"), ("consent_version", "TEXT"), ("consent_at", "TEXT")],
    "org_workers": [("consent_version", "TEXT"), ("consent_at", "TEXT")],
}


def db():
    con = sqlite3.connect(runtime_path(), factory=Connection)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    for table, columns in MIGRATIONS.items():
        have = {r["name"] for r in con.execute(f"PRAGMA table_info({table})")}
        for name, kind in columns:
            if name not in have:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
    if con.execute("SELECT COUNT(*) FROM organisations").fetchone()[0] == 0:
        con.execute("INSERT INTO organisations (id, name, kind, district, demo, created_at) VALUES (?,?,?,?,?,?)", (DEMO_ORG, "Kachchh Sample Sites", "Sample sites", "Kachchh", 1, now().isoformat()))
        con.execute("INSERT INTO sites (org_id, name, location_id, created_at) VALUES (?,?,?,?)", (DEMO_ORG, "Little Rann pan 3", "little_rann_kutch", now().isoformat()))
    if DEMO and con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        for email, password, role, name, worker in DEMO_USERS:
            con.execute("INSERT INTO users (email, password_hash, role, display_name, worker_id, org_id, created_at) VALUES (?,?,?,?,?,?,?)", (email, hash_password(password), role, name, worker, DEMO_ORG, now().isoformat()))
    con.commit()
    return con


# --- Sign-in -----------------------------------------------------------------
class Login(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)


def normalise_identity(value):
    """Email or Indian mobile number, lower-cased and trimmed."""
    value = value.strip().lower()
    digits = "".join(c for c in value if c.isdigit())
    if "@" not in value and len(digits) in (10, 12) and digits == value.replace("+", "").replace(" ", "").replace("-", ""):
        return digits[-10:]
    return value


def open_session(con, user_id):
    token = secrets.token_urlsafe(32)
    con.execute("DELETE FROM sessions WHERE expires_at < ?", (now().isoformat(),))
    con.execute("INSERT INTO sessions VALUES (?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, (now() + timedelta(hours=SESSION_HOURS)).isoformat()))
    return token


def set_cookie(response, token):
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict", secure=HTTPS, max_age=SESSION_HOURS * 3600, path="/")


def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in.")
    with db() as con:
        row = con.execute("SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if row is None or row["expires_at"] < now().isoformat():
        raise HTTPException(401, "Your session has ended. Please sign in again.")
    return dict(row)


def require(*roles):
    def check(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Your role cannot open this information.")
        return user
    return check


def public_user(user, con=None):
    org = None
    if user.get("org_id"):
        close = con is None
        con = con or db()
        row = con.execute("SELECT id, name, kind, demo FROM organisations WHERE id = ?", (user["org_id"],)).fetchone()
        org = dict(row) if row else None
        if close:
            con.close()
    return {"email": user["email"], "role": user["role"], "name": user["display_name"], "worker_id": user["worker_id"], "org": org}


def log_action(con, user_id, action, worker_id=None):
    con.execute("INSERT INTO access_log (at, user_id, action, worker_id) VALUES (?,?,?,?)", (now().isoformat(), user_id, action, worker_id))

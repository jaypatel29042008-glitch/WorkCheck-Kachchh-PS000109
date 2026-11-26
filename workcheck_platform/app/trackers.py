"""Trackers that people fill in day to day: the daily check-in, incidents, medical checks, referrals, training and site checks.

Everything here is written by users and stored in the runtime database. Nothing is diagnosis; it is a record of what was said and done.
"""
import json
import random
from collections import Counter
from datetime import date, timedelta
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .core import DEMO, DEMO_ORG, current_user, db, local_date, log_action, now, require, today
from .orgs import JOB_CHOICES, JOB_ICONS, PLACES, initials, org_of, org_worker_cards, sites_of, worker_belongs

router = APIRouter(prefix="/api")

# --- Plain-language catalogues ---------------------------------------------------
FEELINGS = {1: ("Good", "mood-smile", "clear"), 2: ("Okay", "mood-neutral", "watch"), 3: ("Not well", "mood-sad", "due"), 4: ("Very unwell", "mood-sad-2", "action")}
# code: (label, body region, urgent, code used by the clinic queue)
SYMPTOMS = {
    "headache": ("Headache", "head", False, None), "dizzy": ("Dizzy or faint", "head", False, "dizzy"),
    "eye_burn": ("Eyes burning or watering", "eyes", False, "eye_skin"), "blurred": ("Blurred sight", "eyes", False, "eye_skin"),
    "ringing": ("Ringing in ears", "ears", False, None), "hard_hearing": ("Hard to hear", "ears", False, None),
    "cough": ("Cough", "chest", False, "cough"), "breathless": ("Hard to breathe", "chest", False, "breathless"), "chest_pain": ("Chest pain", "chest", True, None),
    "cramps": ("Stomach cramps", "stomach", False, "dizzy"), "vomiting": ("Vomiting", "stomach", False, "dizzy"), "dark_urine": ("Dark urine", "stomach", False, "dark_urine"),
    "back_pain": ("Back pain", "back", False, "back_joint"), "joint_pain": ("Joint pain", "arms", False, "back_joint"), "cuts": ("Cut or wound", "arms", False, None),
    "leg_cramps": ("Leg cramps", "legs", False, "dizzy"), "leg_pain": ("Leg or foot pain", "legs", False, "back_joint"),
    "rash": ("Rash or itching", "skin", False, "eye_skin"), "sunburn": ("Sunburn", "skin", False, "eye_skin"),
    "tired": ("Very tired", "whole", False, None), "fever": ("Fever", "whole", False, None), "collapse": ("Collapsed or fainted", "whole", True, "collapse"),
}
REGIONS = [("head", "Head"), ("eyes", "Eyes"), ("ears", "Ears"), ("chest", "Chest and breathing"), ("stomach", "Stomach and water"), ("back", "Back"), ("arms", "Arms and hands"), ("legs", "Legs and feet"), ("skin", "Skin"), ("whole", "Whole body")]
PPE = [("mask", "Dust mask", "face-mask"), ("helmet", "Helmet", "helmet"), ("boots", "Boots", "shoe"), ("glasses", "Eye protection", "eye"), ("ears", "Ear protection", "ear"), ("water", "Water within reach", "bottle"), ("shade", "Shade for breaks", "umbrella")]
PPE_FOR_JOB = {  # Which items matter for which job, so people are not asked about gear they never need.
    "salt_raking": ["glasses", "boots", "water", "shade"], "port_yard_kandla": ["helmet", "boots", "mask", "ears", "water", "shade"], "port_yard_mundra": ["helmet", "boots", "mask", "ears", "water", "shade"],
    "cement_yard": ["mask", "helmet", "boots", "glasses", "water", "shade"], "cement_walk": ["mask", "helmet", "boots", "water"], "construction": ["helmet", "boots", "mask", "water", "shade"],
    "stone_crushing": ["mask", "ears", "glasses", "boots", "water", "shade"], "crane_cab": ["helmet", "boots", "water"], "truck_cab": ["boots", "water"],
}
INCIDENT_KINDS = [("injury", "Injury", "first-aid-kit"), ("near_miss", "Near miss", "alert-triangle"), ("heat", "Heat illness", "temperature-sun"), ("dust", "Dust or fumes", "wind"), ("machine", "Machine or vehicle", "forklift"), ("other", "Other", "notes")]
SEVERITIES = {"minor": ("Minor, no time off", "due"), "serious": ("Serious, needed care", "action"), "emergency": ("Emergency, 108 called", "action")}
COURSES = [("heat", "Heat safety", 12), ("dust", "Dust and mask fit", 12), ("first_aid", "First aid", 24), ("noise", "Hearing protection", 12), ("lifting", "Safe lifting", 24)]
SITE_ITEMS = [("water", "Drinking water within 100 m", "bottle"), ("shade", "Shaded rest area", "umbrella"), ("masks", "Dust masks in stock", "face-mask"), ("first_aid", "First-aid kit stocked", "first-aid-kit"),
              ("heat_plan", "Heat plan on display", "temperature-sun"), ("spray", "Water spray for dust working", "droplets"), ("ears", "Ear protection available", "ear"), ("exam", "Yearly medical exams booked", "stethoscope")]
MEDICAL = [("Lung check", 12), ("TB test", 12), ("Breathing test", 12), ("Kidney test", 12), ("Hearing test", 12), ("Eye and skin check", 12), ("Blood pressure check", 12), ("Back and joint check", 12), ("Heat check", 6), ("Hydration check", 6)]
RESULTS = {"normal": ("Nothing noted", "clear"), "follow_up": ("Follow-up needed", "due"), "referred": ("Referred on", "action")}
SOON_DAYS = 30


def catalogue():
    return {"feelings": [{"value": k, "label": v[0], "icon": v[1], "tone": v[2]} for k, v in FEELINGS.items()],
            "regions": [{"key": k, "label": l, "symptoms": [{"code": c, "label": s[0], "urgent": s[2]} for c, s in SYMPTOMS.items() if s[1] == k]} for k, l in REGIONS],
            "ppe": [{"key": k, "label": l, "icon": i} for k, l, i in PPE], "incident_kinds": [{"key": k, "label": l, "icon": i} for k, l, i in INCIDENT_KINDS],
            "severities": [{"key": k, "label": v[0]} for k, v in SEVERITIES.items()], "courses": [{"key": k, "label": l, "months": m} for k, l, m in COURSES],
            "site_items": [{"key": k, "label": l, "icon": i} for k, l, i in SITE_ITEMS], "medical": [{"name": n, "months": m} for n, m in MEDICAL], "results": [{"key": k, "label": v[0]} for k, v in RESULTS.items()]}


def day_start_utc():
    """When today began in India, as the UTC text that stored timestamps use."""
    from datetime import datetime, time, timezone
    from .core import IST
    return datetime.combine(local_date(), time.min, IST).astimezone(timezone.utc).isoformat()


# --- Who is who ------------------------------------------------------------------
def basic_workers(org_id, con):
    """Name, job and place for every worker in the organisation, without the heavier risk state."""
    if org_id == DEMO_ORG:
        from .main import reference  # Loaded lazily: main imports this module.
        R = reference()
        out = []
        for wid, w in R["workers"].items():
            a = R["assignments"][wid][-1]
            out.append({"id": wid, "name": R["names"][wid], "initials": initials(R["names"][wid]), "job": a["job"], "job_id": a["job_id"], "icon": a["icon"], "place": a["place"], "site_id": None, "age": w["age_on_1_jan_2025"]})
        return out
    return org_worker_cards(org_id, con)


def worker_job(worker_id, con):
    if worker_id.startswith("SIM-"):
        from .main import reference
        return reference()["assignments"][worker_id][-1]["job_id"]
    row = con.execute("SELECT job_id FROM org_workers WHERE id = ?", (worker_id,)).fetchone()
    return row["job_id"] if row else "construction"


def own_or_staff(user, worker_id, con, roles=("clinician",)):
    if user["role"] == "worker":
        if user["worker_id"] != worker_id:
            raise HTTPException(403, "You can only see your own record.")
        return
    if user["role"] not in roles or not worker_belongs(worker_id, user["org_id"], con):
        raise HTTPException(403, "Your role cannot open this record.")


# --- Daily check-in -----------------------------------------------------------------
class SymptomPick(BaseModel):
    code: str


class DailyLog(BaseModel):
    feeling: int = Field(ge=1, le=4)
    symptoms: List[str] = Field(default_factory=list, max_length=12)
    ppe: Dict[str, bool] = Field(default_factory=dict)
    water_litres: Optional[float] = Field(default=None, ge=0, le=15)
    hours: Optional[float] = Field(default=None, ge=0, le=16)
    note: str = Field(default="", max_length=240)


def log_row(r):
    symptoms = json.loads(r["symptoms"])
    ppe = json.loads(r["ppe"])
    return {"id": r["id"], "worker_id": r["worker_id"], "day": r["day"], "at": r["at"], "feeling": r["feeling"], "feeling_label": FEELINGS[r["feeling"]][0], "tone": FEELINGS[r["feeling"]][2], "icon": FEELINGS[r["feeling"]][1],
            "symptoms": [{"code": c, "label": SYMPTOMS[c][0], "region": SYMPTOMS[c][1], "urgent": SYMPTOMS[c][2]} for c in symptoms if c in SYMPTOMS],
            "ppe": ppe, "ppe_missing": [k for k, v in ppe.items() if v is False], "water_litres": r["water_litres"], "hours": r["hours"], "note": r["note"], "urgent": any(SYMPTOMS.get(c, (0, 0, False))[2] for c in symptoms)}


def day_tone(log):
    """One colour for the calendar: worst of feeling, urgent symptom and missing gear."""
    if log is None:
        return "none"
    if log["urgent"] or log["feeling"] == 4:
        return "action"
    if log["feeling"] == 3 or len(log["symptoms"]) >= 2:
        return "due"
    if log["ppe_missing"]:
        return "watch"
    return "clear"


def history(worker_id, con, days=35):
    start = (local_date() - timedelta(days=days - 1)).isoformat()
    rows = {r["day"]: log_row(r) for r in con.execute("SELECT * FROM daily_logs WHERE worker_id = ? AND day >= ? ORDER BY day", (worker_id, start))}
    out = []
    for i in range(days):
        d = (local_date() - timedelta(days=days - 1 - i)).isoformat()
        log = rows.get(d)
        out.append({"day": d, "tone": day_tone(log), "feeling": log["feeling"] if log else None, "icon": log["icon"] if log else None, "symptoms": [s["label"] for s in log["symptoms"]] if log else [], "ppe_missing": log["ppe_missing"] if log else [], "note": log["note"] if log else ""})
    logged = [h for h in out if h["feeling"]]
    streak = 0
    for h in reversed(out):
        if h["feeling"]:
            streak += 1
        else:
            break
    return {"days": out, "logged": len(logged), "streak": streak, "unwell_days": sum(1 for h in logged if h["feeling"] >= 3), "common": Counter(s for h in logged for s in h["symptoms"]).most_common(3)}


@router.get("/log/today")
def log_today(user=Depends(require("worker"))):
    with db() as con:
        job = worker_job(user["worker_id"], con)
        row = con.execute("SELECT * FROM daily_logs WHERE worker_id = ? AND day = ?", (user["worker_id"], today())).fetchone()
        h = history(user["worker_id"], con)
    ppe_keys = PPE_FOR_JOB.get(job, [k for k, _, _ in PPE])
    cat = catalogue()
    cat["ppe"] = [p for p in cat["ppe"] if p["key"] in ppe_keys]
    return {"day": today(), "log": log_row(row) if row else None, "catalogue": cat, "history": h}


@router.post("/log")
def save_log(payload: DailyLog, user=Depends(require("worker"))):
    bad = [c for c in payload.symptoms if c not in SYMPTOMS]
    if bad:
        raise HTTPException(400, "Unknown symptom.")
    urgent = any(SYMPTOMS[c][2] for c in payload.symptoms)
    with db() as con:
        job = worker_job(user["worker_id"], con)
        allowed = set(PPE_FOR_JOB.get(job, [k for k, _, _ in PPE]))
        ppe = {k: bool(v) for k, v in payload.ppe.items() if k in allowed}
        con.execute("""INSERT INTO daily_logs (at, day, worker_id, org_id, feeling, symptoms, ppe, water_litres, hours, note) VALUES (?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(worker_id, day) DO UPDATE SET at=excluded.at, feeling=excluded.feeling, symptoms=excluded.symptoms, ppe=excluded.ppe, water_litres=excluded.water_litres, hours=excluded.hours, note=excluded.note, reviewed_at=NULL""",
                    (now().isoformat(), today(), user["worker_id"], user["org_id"], payload.feeling, json.dumps(payload.symptoms), json.dumps(ppe), payload.water_litres, payload.hours, payload.note.strip()))
        # The clinic queue keeps working off symptom reports, so each new symptom with a clinic code is passed on once a day.
        existing = {r["symptom"] for r in con.execute("SELECT symptom FROM symptom_reports WHERE worker_id = ? AND at >= ?", (user["worker_id"], day_start_utc()))}
        for c in payload.symptoms:
            code = SYMPTOMS[c][3]
            if code and code not in existing:
                con.execute("INSERT INTO symptom_reports (at, user_id, worker_id, symptom, urgent) VALUES (?,?,?,?,?)", (now().isoformat(), user["id"], user["worker_id"], code, int(SYMPTOMS[c][2])))
                existing.add(code)
        log_action(con, user["id"], "daily_log", user["worker_id"])
        row = con.execute("SELECT * FROM daily_logs WHERE worker_id = ? AND day = ?", (user["worker_id"], today())).fetchone()
        h = history(user["worker_id"], con)
    if urgent:
        message = "Saved. If this is happening now, call 108. The clinic team has been told."
    elif payload.feeling >= 3:
        message = "Saved. The clinic team can see you are not well today."
    else:
        message = "Saved. Thank you, see you tomorrow."
    return {"saved": True, "urgent": urgent, "message": message, "log": log_row(row), "history": h}


@router.get("/log/history/{worker_id}")
def log_history(worker_id: str, days: int = 90, user=Depends(current_user)):
    with db() as con:
        own_or_staff(user, worker_id, con, roles=("clinician", "supervisor"))
        return history(worker_id, con, max(7, min(days, 180)))


# --- Incidents ------------------------------------------------------------------------
class Incident(BaseModel):
    kind: Literal["injury", "near_miss", "heat", "dust", "machine", "other"]
    severity: Literal["minor", "serious", "emergency"]
    what: str = Field(min_length=3, max_length=400)
    action: str = Field(default="", max_length=300)
    worker_id: Optional[str] = None
    site_id: Optional[int] = None


def incident_row(r, names):
    kind = next((k for k in INCIDENT_KINDS if k[0] == r["kind"]), INCIDENT_KINDS[-1])
    return {**dict(r), "kind_label": kind[1], "icon": kind[2], "severity_label": SEVERITIES[r["severity"]][0], "tone": "clear" if r["status"] == "closed" else SEVERITIES[r["severity"]][1], "worker_name": names.get(r["worker_id"])}


@router.get("/incidents")
def incidents(user=Depends(require("supervisor", "clinician"))):
    with db() as con:
        org = org_of(user, con)
        rows = con.execute("SELECT * FROM incidents WHERE org_id = ? ORDER BY status DESC, at DESC LIMIT 200", (org["id"],)).fetchall()
        names = {w["id"]: w["name"] for w in basic_workers(org["id"], con)}
        sites = sites_of(org["id"], con)
    out = [incident_row(r, names) for r in rows]
    return {"incidents": out, "open": sum(1 for i in out if i["status"] == "open"), "sites": sites, "workers": [{"id": k, "name": v} for k, v in sorted(names.items(), key=lambda kv: kv[1])], "catalogue": catalogue()}


@router.post("/incidents")
def report_incident(payload: Incident, user=Depends(current_user)):
    with db() as con:
        org = org_of(user, con)
        worker_id = user["worker_id"] if user["role"] == "worker" else payload.worker_id
        if worker_id and not worker_belongs(worker_id, org["id"], con):
            raise HTTPException(400, "That worker is not in your organisation.")
        site = None
        if payload.site_id:
            site = con.execute("SELECT name FROM sites WHERE id = ? AND org_id = ?", (payload.site_id, org["id"])).fetchone()
        cur = con.execute("INSERT INTO incidents (at, org_id, site_id, site_name, worker_id, kind, severity, what, action, reported_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
                          (now().isoformat(), org["id"], payload.site_id, site["name"] if site else None, worker_id, payload.kind, payload.severity, payload.what.strip(), payload.action.strip(), user["id"]))
        log_action(con, user["id"], f"incident:{payload.kind}", worker_id)
    return {"id": cur.lastrowid, "message": "Call 108 now if anyone is hurt. This report is saved." if payload.severity == "emergency" else "Saved. The supervisor and clinic team can see it."}


class Close(BaseModel):
    note: str = Field(default="", max_length=300)


@router.post("/incidents/{incident_id}/close")
def close_incident(incident_id: int, payload: Close, user=Depends(require("supervisor", "clinician"))):
    with db() as con:
        cur = con.execute("UPDATE incidents SET status = 'closed', closed_at = ?, closed_note = ? WHERE id = ? AND org_id = ? AND status = 'open'", (now().isoformat(), payload.note.strip(), incident_id, user["org_id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "No open incident with that number.")
    return {"ok": True}


# --- Medical checks and referrals ------------------------------------------------------------
class MedicalCheck(BaseModel):
    worker_id: str
    check_name: str
    done_on: str
    result: Literal["normal", "follow_up", "referred"]
    note: str = Field(default="", max_length=300)
    next_due: Optional[str] = None


def add_months(day, months):
    """The same day of the month, that many months later (clamped to the month's last day)."""
    y, m = divmod(day.month - 1 + months, 12)
    y, m = day.year + y, m + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(day.day, last))


def iso_day(value, field):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise HTTPException(400, f"Enter the {field} as a date.")


def medical_status(worker_ids, con):
    """For each worker, the next check that is due or overdue, from recorded checks."""
    out = {}
    rows = con.execute("SELECT worker_id, check_name, MAX(done_on) done_on, next_due FROM medical_checks WHERE worker_id IN (%s) GROUP BY worker_id, check_name" % ",".join("?" * len(worker_ids)), list(worker_ids)).fetchall() if worker_ids else []
    t = local_date()
    for r in rows:
        if not r["next_due"]:
            continue
        due = date.fromisoformat(r["next_due"])
        days = (due - t).days
        entry = {"check": r["check_name"], "due": r["next_due"], "days": days, "state": "overdue" if days < 0 else "soon" if days <= SOON_DAYS else "ok"}
        if r["worker_id"] not in out or entry["days"] < out[r["worker_id"]]["days"]:
            out[r["worker_id"]] = entry
    return out


@router.get("/medical")
def medical(worker_id: Optional[str] = None, user=Depends(require("clinician", "supervisor"))):
    with db() as con:
        org = org_of(user, con)
        workers = basic_workers(org["id"], con)
        names = {w["id"]: w for w in workers}
        status = medical_status([w["id"] for w in workers], con)
        checks = []
        if worker_id and user["role"] == "clinician":
            checks = [dict(r) | {"result_label": RESULTS[r["result"]][0], "tone": RESULTS[r["result"]][1]} for r in con.execute("SELECT * FROM medical_checks WHERE worker_id = ? AND org_id = ? ORDER BY done_on DESC", (worker_id, org["id"]))]
        referrals = []
        if user["role"] == "clinician":
            referrals = [dict(r) | {"worker_name": names.get(r["worker_id"], {}).get("name")} for r in con.execute("SELECT * FROM referrals WHERE org_id = ? ORDER BY status = 'closed', at DESC LIMIT 100", (org["id"],))]
    due = sorted([{**names[w], **s} for w, s in status.items() if s["state"] != "ok" and w in names], key=lambda x: x["days"])
    never = [w for w in workers if w["id"] not in status]
    return {"due": due, "never_checked": len(never), "never_list": never[:50], "checks": checks, "referrals": referrals, "catalogue": catalogue()}


@router.post("/medical")
def record_check(payload: MedicalCheck, user=Depends(require("clinician"))):
    months = dict(MEDICAL).get(payload.check_name)
    if months is None:
        raise HTTPException(400, "Choose a check from the list.")
    done = iso_day(payload.done_on, "date of the check")
    next_due = iso_day(payload.next_due, "next due date") if payload.next_due else add_months(date.fromisoformat(done), months).isoformat()
    with db() as con:
        org = org_of(user, con)
        if not worker_belongs(payload.worker_id, org["id"], con):
            raise HTTPException(400, "That worker is not in your organisation.")
        con.execute("INSERT INTO medical_checks (at, org_id, worker_id, check_name, done_on, result, next_due, note, by_user) VALUES (?,?,?,?,?,?,?,?,?)",
                    (now().isoformat(), org["id"], payload.worker_id, payload.check_name, done, payload.result, next_due, payload.note.strip(), user["id"]))
        log_action(con, user["id"], f"medical:{payload.check_name}", payload.worker_id)
    return {"saved": True, "next_due": next_due}


class Referral(BaseModel):
    worker_id: str
    facility_id: str
    facility_name: str = Field(min_length=2, max_length=120)
    reason: str = Field(min_length=2, max_length=200)


@router.post("/referrals")
def refer(payload: Referral, user=Depends(require("clinician"))):
    with db() as con:
        org = org_of(user, con)
        if not worker_belongs(payload.worker_id, org["id"], con):
            raise HTTPException(400, "That worker is not in your organisation.")
        cur = con.execute("INSERT INTO referrals (at, org_id, worker_id, facility_id, facility_name, reason, by_user, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                          (now().isoformat(), org["id"], payload.worker_id, payload.facility_id, payload.facility_name.strip(), payload.reason.strip(), user["id"], now().isoformat()))
        log_action(con, user["id"], f"referral:{payload.facility_id}", payload.worker_id)
    return {"id": cur.lastrowid, "message": f"Referral to {payload.facility_name} noted. Nothing was sent to the facility; tell the worker where to go."}


class ReferralUpdate(BaseModel):
    status: Literal["sent", "attended", "closed"]
    outcome: str = Field(default="", max_length=300)


@router.post("/referrals/{referral_id}")
def update_referral(referral_id: int, payload: ReferralUpdate, user=Depends(require("clinician"))):
    with db() as con:
        cur = con.execute("UPDATE referrals SET status = ?, outcome = ?, updated_at = ? WHERE id = ? AND org_id = ?", (payload.status, payload.outcome.strip(), now().isoformat(), referral_id, user["org_id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "No such referral.")
    return {"ok": True}


# --- Training and site checks --------------------------------------------------------------
class Training(BaseModel):
    course: str
    done_on: str
    worker_ids: List[str] = Field(min_length=1, max_length=500)


@router.get("/training")
def training(user=Depends(require("supervisor", "clinician"))):
    with db() as con:
        org = org_of(user, con)
        workers = basic_workers(org["id"], con)
        rows = con.execute("SELECT worker_id, course, MAX(done_on) done_on, valid_until FROM trainings WHERE org_id = ? GROUP BY worker_id, course", (org["id"],)).fetchall()
    latest = {(r["worker_id"], r["course"]): r for r in rows}
    t = local_date()
    per_course = []
    for key, label, _ in COURSES:
        done = expiring = expired = 0
        missing = []
        for w in workers:
            r = latest.get((w["id"], key))
            if r is None:
                missing.append(w)
                continue
            days = (date.fromisoformat(r["valid_until"]) - t).days
            if days < 0:
                expired += 1; missing.append(w)
            elif days <= SOON_DAYS:
                expiring += 1; done += 1
            else:
                done += 1
        per_course.append({"key": key, "label": label, "done": done, "expiring": expiring, "expired": expired, "never": len(missing) - expired, "missing": missing[:60], "total": len(workers)})
    return {"courses": per_course, "workers": workers, "catalogue": catalogue()}


@router.post("/training")
def record_training(payload: Training, user=Depends(require("supervisor"))):
    months = next((m for k, _, m in COURSES if k == payload.course), None)
    if months is None:
        raise HTTPException(400, "Choose a course from the list.")
    done = iso_day(payload.done_on, "training date")
    valid = add_months(date.fromisoformat(done), months).isoformat()
    with db() as con:
        org = org_of(user, con)
        saved = 0
        for wid in payload.worker_ids:
            if worker_belongs(wid, org["id"], con):
                con.execute("INSERT INTO trainings (at, org_id, worker_id, course, done_on, valid_until, by_user) VALUES (?,?,?,?,?,?,?)", (now().isoformat(), org["id"], wid, payload.course, done, valid, user["id"]))
                saved += 1
        log_action(con, user["id"], f"training:{payload.course}:{saved}")
    return {"saved": saved, "valid_until": valid}


class SiteCheck(BaseModel):
    site_id: int
    item: str
    status: Literal["ok", "missing", "na"]
    note: str = Field(default="", max_length=200)


def site_check_state(org_id, con):
    sites = sites_of(org_id, con)
    latest = {}
    for r in con.execute("SELECT * FROM site_checks WHERE org_id = ? ORDER BY id", (org_id,)):
        latest[(r["site_id"], r["item"])] = dict(r)
    out = []
    for s in sites:
        items = []
        for key, label, icon in SITE_ITEMS:
            r = latest.get((s["id"], key))
            age = (local_date() - date.fromisoformat(r["at"][:10])).days if r else None
            status = r["status"] if r else "unknown"
            if status == "ok" and age is not None and age > 30:
                status = "stale"
            items.append({"key": key, "label": label, "icon": icon, "status": status, "checked_on": r["at"][:10] if r else None, "note": r["note"] if r else ""})
        out.append({**s, "items": items, "missing": sum(1 for i in items if i["status"] == "missing"), "unchecked": sum(1 for i in items if i["status"] in ("unknown", "stale"))})
    return out


@router.get("/site-checks")
def site_checks(user=Depends(require("supervisor", "clinician", "ddo"))):
    with db() as con:
        org = org_of(user, con)
        return {"sites": site_check_state(org["id"], con), "catalogue": catalogue()}


@router.post("/site-checks")
def record_site_check(payload: SiteCheck, user=Depends(require("supervisor"))):
    if payload.item not in {k for k, _, _ in SITE_ITEMS}:
        raise HTTPException(400, "Choose an item from the list.")
    with db() as con:
        org = org_of(user, con)
        site = con.execute("SELECT name FROM sites WHERE id = ? AND org_id = ?", (payload.site_id, org["id"])).fetchone()
        if site is None:
            raise HTTPException(400, "That site is not in your organisation.")
        con.execute("INSERT INTO site_checks (at, org_id, site_id, site_name, item, status, note, by_user) VALUES (?,?,?,?,?,?,?,?)", (now().isoformat(), org["id"], payload.site_id, site["name"], payload.item, payload.status, payload.note.strip(), user["id"]))
        log_action(con, user["id"], f"site_check:{payload.item}:{payload.status}")
    return {"ok": True}


# --- The dashboard: one page that says what to do today ------------------------------------
def ensure_demo(con):
    """Fictional, labelled check-ins for the demo organisation so the trackers have something to show. Never touches reference data."""
    if not DEMO or con.execute("SELECT 1 FROM daily_logs WHERE org_id = ? LIMIT 1", (DEMO_ORG,)).fetchone():
        return
    rng = random.Random(7)
    workers = basic_workers(DEMO_ORG, con)
    sample = rng.sample(workers, 40)
    site = con.execute("SELECT id, name FROM sites WHERE org_id = ? ORDER BY id LIMIT 1", (DEMO_ORG,)).fetchone()
    user = con.execute("SELECT id FROM users WHERE role = 'supervisor' AND org_id = ? LIMIT 1", (DEMO_ORG,)).fetchone()
    by = user["id"] if user else 1
    for d in range(21):
        day = (local_date() - timedelta(days=d)).isoformat()
        for w in sample:
            if rng.random() < 0.18 + 0.02 * d:
                continue  # Not everyone checks in every day.
            feeling = rng.choices([1, 2, 3, 4], weights=[62, 25, 11, 2])[0]
            pool = ["headache", "tired", "cough", "eye_burn", "leg_cramps", "back_pain", "dizzy", "dark_urine"]
            symptoms = rng.sample(pool, k=min(len(pool), max(0, feeling - 1 + (1 if rng.random() < .15 else 0)))) if feeling > 1 else ([] if rng.random() > .1 else [rng.choice(pool)])
            keys = PPE_FOR_JOB.get(w["job_id"], [k for k, _, _ in PPE])
            ppe = {k: (rng.random() > (0.22 if k == "mask" else 0.08 if k == "shade" else 0.04)) for k in keys}
            con.execute("INSERT OR IGNORE INTO daily_logs (at, day, worker_id, org_id, feeling, symptoms, ppe, water_litres, hours, note) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (f"{day}T07:{rng.randint(10, 59):02d}:00+00:00", day, w["id"], DEMO_ORG, feeling, json.dumps(symptoms), json.dumps(ppe), round(rng.uniform(1.5, 4.5), 1), rng.choice([8, 9, 9, 10, 11]), ""))
    inc = [("near_miss", "minor", "Forklift reversed close to a worker at the loading bay.", "Spoke to the driver. Painted a walking line.", 9, "closed"),
           ("heat", "serious", "A worker felt faint at 2pm on the salt pan. Moved to shade, drank water, recovered in 40 minutes.", "Shifted the afternoon break to 1pm.", 4, "open"),
           ("dust", "minor", "Water spray at the crusher stopped for the morning.", "", 1, "open")]
    for kind, sev, what, action, days_ago, status in inc:
        at = (now() - timedelta(days=days_ago)).isoformat()
        con.execute("INSERT INTO incidents (at, org_id, site_id, site_name, worker_id, kind, severity, what, action, status, reported_by, closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (at, DEMO_ORG, site["id"], site["name"], rng.choice(sample)["id"] if kind != "dust" else None, kind, sev, what, action, status, by, at if status == "closed" else None))
    for w in sample[:30]:
        for key, _, months in COURSES[:3]:
            done = local_date() - timedelta(days=rng.randint(20, 420))
            con.execute("INSERT INTO trainings (at, org_id, worker_id, course, done_on, valid_until, by_user) VALUES (?,?,?,?,?,?,?)", (now().isoformat(), DEMO_ORG, w["id"], key, done.isoformat(), (done + timedelta(days=30 * months)).isoformat(), by))
    clinic = con.execute("SELECT id FROM users WHERE role = 'clinician' AND org_id = ? LIMIT 1", (DEMO_ORG,)).fetchone()
    for w in sample[:24]:
        name, months = rng.choice(MEDICAL[:7])
        done = local_date() - timedelta(days=rng.randint(60, 400))
        con.execute("INSERT INTO medical_checks (at, org_id, worker_id, check_name, done_on, result, next_due, note, by_user) VALUES (?,?,?,?,?,?,?,?,?)",
                    (now().isoformat(), DEMO_ORG, w["id"], name, done.isoformat(), rng.choice(["normal", "normal", "normal", "follow_up"]), (done + timedelta(days=30 * months)).isoformat(), "", clinic["id"] if clinic else by))
    for key, _, _ in SITE_ITEMS:
        status = "missing" if key in ("shade", "spray") else "ok"
        con.execute("INSERT INTO site_checks (at, org_id, site_id, site_name, item, status, note, by_user) VALUES (?,?,?,?,?,?,?,?)", ((now() - timedelta(days=rng.randint(1, 40) if key != "water" else 2)).isoformat(), DEMO_ORG, site["id"], site["name"], key, status, "", by))
    con.commit()


@router.get("/dashboard")
def dashboard(user=Depends(require("supervisor", "clinician", "ddo"))):
    with db() as con:
        org = org_of(user, con)
        if org["demo"]:
            ensure_demo(con)
        workers = basic_workers(org["id"], con)
        by_id = {w["id"]: w for w in workers}
        t = today()
        logs = [log_row(r) for r in con.execute("SELECT * FROM daily_logs WHERE org_id = ? AND day = ?", (org["id"], t))]
        start = (local_date() - timedelta(days=13)).isoformat()
        trend_rows = con.execute("SELECT day, COUNT(*) n, SUM(feeling >= 3) unwell, SUM(ppe LIKE '%false%') gaps FROM daily_logs WHERE org_id = ? AND day >= ? GROUP BY day", (org["id"], start)).fetchall()
        open_inc = [incident_row(r, {k: v["name"] for k, v in by_id.items()}) for r in con.execute("SELECT * FROM incidents WHERE org_id = ? AND status = 'open' ORDER BY at DESC", (org["id"],))]
        med = medical_status(list(by_id), con)
        tr = con.execute("SELECT worker_id, course, MAX(valid_until) valid_until FROM trainings WHERE org_id = ? GROUP BY worker_id, course", (org["id"],)).fetchall()
        site_state = site_check_state(org["id"], con)
        unreviewed = con.execute("SELECT COUNT(*) FROM symptom_reports WHERE reviewed_at IS NULL AND worker_id IN (%s)" % ",".join("?" * len(by_id)), list(by_id)).fetchone()[0] if by_id else 0
    staff = user["role"] in ("supervisor", "clinician")
    rows_today = {l["worker_id"]: l for l in logs}
    feelings = Counter(l["feeling"] for l in logs)
    unwell = []
    for wid, l in rows_today.items():
        if l["feeling"] >= 3 or l["urgent"]:
            w = by_id.get(wid, {"name": "Unknown", "job": "", "initials": "?", "icon": "helmet"})
            # Health detail is for the clinic team. A supervisor sees who is unwell, and the symptom only when it is an emergency.
            shown = [s["label"] for s in l["symptoms"] if user["role"] == "clinician" or s["urgent"]]
            unwell.append({"worker_id": wid, "name": w["name"], "job": w["job"], "initials": w["initials"], "icon": w["icon"], "feeling": l["feeling"], "feeling_label": l["feeling_label"], "tone": l["tone"], "symptoms": shown, "urgent": l["urgent"], "note": l["note"] if user["role"] == "clinician" else ""})
    unwell.sort(key=lambda x: (not x["urgent"], -x["feeling"], x["name"]))
    ppe_gaps = []
    for key, label, icon in PPE:
        asked = [l for l in rows_today.values() if key in l["ppe"]]
        missing = [l for l in asked if l["ppe"][key] is False]
        if asked:
            ppe_gaps.append({"key": key, "label": label, "icon": icon, "missing": len(missing), "of": len(asked), "names": [by_id.get(w, {}).get("name", "?") for w, l in rows_today.items() if l["ppe"].get(key) is False][:8]})
    ppe_gaps.sort(key=lambda g: -g["missing"])
    td = local_date()
    med_over = [{**by_id[w], **s} for w, s in med.items() if s["state"] == "overdue" and w in by_id]
    med_soon = [{**by_id[w], **s} for w, s in med.items() if s["state"] == "soon" and w in by_id]
    never = [w for w in by_id.values() if w["id"] not in med]
    tr_expired = tr_soon = 0
    tr_names = []
    for r in tr:
        days = (date.fromisoformat(r["valid_until"]) - td).days
        if days < 0:
            tr_expired += 1; tr_names.append((by_id.get(r["worker_id"], {}).get("name", "?"), r["course"]))
        elif days <= SOON_DAYS:
            tr_soon += 1
    course_names = {k: l for k, l, _ in COURSES}
    trained = {r["worker_id"] for r in tr}
    trend = {r["day"]: r for r in trend_rows}
    series = []
    for i in range(14):
        d = (td - timedelta(days=13 - i)).isoformat()
        r = trend.get(d)
        series.append({"day": d, "checked_in": r["n"] if r else 0, "unwell": r["unwell"] if r else 0, "gaps": r["gaps"] if r else 0})
    missing_items = [(s["name"], i["label"]) for s in site_state for i in s["items"] if i["status"] == "missing"]
    unchecked = sum(s["unchecked"] for s in site_state)
    # The to-do list, worst first, in plain words.
    todo = []
    urgent = [u for u in unwell if u["urgent"]]
    if urgent:
        todo.append({"tone": "action", "text": f"{urgent[0]['name']} reported {urgent[0]['symptoms'][0].lower() if urgent[0]['symptoms'] else 'an emergency'} today. Check on them now.", "href": "#/dashboard"})
    if len(unwell) > len(urgent):
        todo.append({"tone": "action" if len(unwell) >= 3 else "due", "text": f"{len(unwell)} worker{'s' if len(unwell) != 1 else ''} said they are not well today.", "href": "#/dashboard"})
    if open_inc:
        serious = [i for i in open_inc if i["severity"] != "minor"]
        todo.append({"tone": "action" if serious else "due", "text": f"{len(open_inc)} incident{'s' if len(open_inc) != 1 else ''} still open. Record what was done and close them.", "href": "#/incidents"})
    if missing_items:
        todo.append({"tone": "due", "text": f"{missing_items[0][1]} is missing at {missing_items[0][0]}." + (f" {len(missing_items) - 1} more site item{'s' if len(missing_items) > 2 else ''} missing." if len(missing_items) > 1 else ""), "href": "#/compliance"})
    if ppe_gaps and ppe_gaps[0]["missing"]:
        g = ppe_gaps[0]
        todo.append({"tone": "due", "text": f"{g['missing']} of {g['of']} who checked in had no {g['label'].lower()} today.", "href": "#/dashboard"})
    if med_over:
        todo.append({"tone": "due", "text": f"{len(med_over)} medical check{'s are' if len(med_over) != 1 else ' is'} overdue.", "href": "#/care"})
    if tr_expired:
        todo.append({"tone": "due", "text": f"{tr_expired} training record{'s have' if tr_expired != 1 else ' has'} run out.", "href": "#/compliance"})
    if unchecked:
        todo.append({"tone": "watch", "text": f"{unchecked} site item{'s have' if unchecked != 1 else ' has'} not been checked this month.", "href": "#/compliance"})
    if len(rows_today) < len(by_id) * 0.5 and by_id:
        todo.append({"tone": "watch", "text": f"Only {len(rows_today)} of {len(by_id)} workers have checked in today.", "href": "#/dashboard"})
    if not todo:
        todo.append({"tone": "clear", "text": "Nothing is waiting. Everyone who checked in is well and the site items are in place.", "href": None})
    return {"day": t, "org": org, "workers_total": len(by_id), "checked_in": len(rows_today), "feelings": {k: feelings.get(k, 0) for k in FEELINGS}, "feeling_labels": {k: v[0] for k, v in FEELINGS.items()},
            "unwell": unwell if staff else [], "unwell_count": len(unwell), "ppe": ppe_gaps if staff else [{k: v for k, v in g.items() if k != "names"} for g in ppe_gaps],
            "incidents": {"open": len(open_inc), "list": open_inc[:5] if staff else []},
            "medical": {"overdue": len(med_over), "soon": len(med_soon), "never": len(never), "list": (sorted(med_over + med_soon, key=lambda x: x["days"])[:8]) if staff else []},
            "training": {"expired": tr_expired, "expiring": tr_soon, "never": len(by_id) - len(trained), "list": [{"name": n, "course": course_names.get(c, c)} for n, c in tr_names[:8]] if staff else []},
            "sites": site_state, "trend": series, "todo": todo, "unreviewed_reports": unreviewed}


# --- A worker record for people who joined with an invite ---------------------------------
def org_level(worker_id, con):
    """Plain state from the last 7 days of check-ins, open symptom reports and medical due dates."""
    reasons = []
    week = (local_date() - timedelta(days=6)).isoformat()
    for r in con.execute("SELECT * FROM daily_logs WHERE worker_id = ? AND day >= ? ORDER BY day DESC", (worker_id, week)):
        l = log_row(r)
        if l["urgent"]:
            reasons.append(("action", f"Reported {l['symptoms'][0]['label'].lower()} on {l['day'][8:]}/{l['day'][5:7]}", True))
        elif l["feeling"] >= 3:
            reasons.append(("due" if l["feeling"] == 3 else "action", f"Felt {l['feeling_label'].lower()} on {l['day'][8:]}/{l['day'][5:7]}" + (f": {', '.join(s['label'].lower() for s in l['symptoms'][:2])}" if l["symptoms"] else ""), False))
    for w, s in medical_status([worker_id], con).items():
        if s["state"] == "overdue":
            reasons.append(("action", f"{s['check']} overdue since {s['due']}", False))
        elif s["state"] == "soon":
            reasons.append(("due", f"{s['check']} due by {s['due']}", False))
    seen, out = set(), []
    for tone, text, urgent in reasons:
        if text not in seen:
            seen.add(text); out.append({"tone": tone, "text": text, "urgent": urgent})
    level = "action" if any(r["tone"] == "action" for r in out) else "due" if out else "watch"
    return level, out


def org_cards(org_id, con):
    cards = org_worker_cards(org_id, con)
    for c in cards:
        level, reasons = org_level(c["id"], con)
        c.update({"level": level, "headline": reasons[0]["text"] if reasons else "Checked in, nothing open" if con.execute("SELECT 1 FROM daily_logs WHERE worker_id = ? LIMIT 1", (c["id"],)).fetchone() else "No check-ins yet", "headline_area": None, "more": max(0, len(reasons) - 1), "moves": 0, "urgent": any(r["urgent"] for r in reasons)})
    return cards


def org_passport(worker_id, user, con):
    from .main import LABEL, heat_jobs_table
    card = next((c for c in org_cards(user["org_id"] if user["role"] != "worker" else con.execute("SELECT org_id FROM org_workers WHERE id = ?", (worker_id,)).fetchone()["org_id"], con) if c["id"] == worker_id), None)
    if card is None:
        raise HTTPException(404, "No such worker.")
    level, reasons = org_level(worker_id, con)
    h = history(worker_id, con, 35)
    heat = heat_jobs_table().get(card["job_id"])
    exposure = []
    if heat:
        lvl = "high" if heat < 4.5 else "moderate" if heat < 7 else "ok"
        exposure.append({"key": "heat", "label": "Heat", "icon": "temperature-sun", "value": f"{heat:.1f}", "unit": "safe hours a shift", "caption": "April to October, model estimate for this job", "level": lvl, "chip": {"high": "High", "moderate": "Moderate", "ok": "Low"}[lvl], "series": [], "months": []})
    hours = [d for d in con.execute("SELECT hours FROM daily_logs WHERE worker_id = ? AND day >= ? AND hours IS NOT NULL", (worker_id, (local_date() - timedelta(days=6)).isoformat()))]
    total = sum(r["hours"] for r in hours)
    if hours:
        exposure.append({"key": "hours", "label": "Work hours", "icon": "clock-hour-9", "value": f"{total:.0f}", "unit": "hours in the last 7 days", "caption": "From the worker's own check-ins", "level": "high" if total >= 55 else "ok", "chip": "Over 55 hours" if total >= 55 else "Under 55 hours", "series": [], "months": []})
    else:
        exposure.append({"key": "hours", "label": "Work hours", "icon": "clock-hour-9", "value": "None", "unit": "entered in the last 7 days", "caption": "From the worker's own check-ins", "level": "none", "chip": "No data", "series": [], "months": []})
    checks = [dict(r) | {"result_label": RESULTS[r["result"]][0], "tone": RESULTS[r["result"]][1]} for r in con.execute("SELECT * FROM medical_checks WHERE worker_id = ? ORDER BY done_on DESC LIMIT 12", (worker_id,))]
    referrals = [dict(r) for r in con.execute("SELECT * FROM referrals WHERE worker_id = ? ORDER BY at DESC LIMIT 12", (worker_id,))]
    trainings = [dict(r) | {"course_label": dict((k, l) for k, l, _ in COURSES).get(r["course"], r["course"])} for r in con.execute("SELECT * FROM trainings WHERE worker_id = ? ORDER BY done_on DESC LIMIT 12", (worker_id,))]
    symptoms = [{"id": r["id"], "at": r["at"], "text": r["symptom"], "urgent": bool(r["urgent"]), "reviewed": bool(r["reviewed_at"])} for r in con.execute("SELECT * FROM symptom_reports WHERE worker_id = ? ORDER BY id DESC LIMIT 12", (worker_id,))]
    first = card["name"].split(" ")[0]
    if reasons and reasons[0]["urgent"]:
        nxt = {"title": f"{first} reported an emergency symptom", "body": "If this is happening now, call 108. Check on them today.", "cta": "Record a check"}
    elif level == "action":
        nxt = {"title": f"Check on {first}", "body": reasons[0]["text"] + ".", "cta": "Record a check"}
    elif level == "due":
        nxt = {"title": f"Book a check for {first}", "body": reasons[0]["text"] + ".", "cta": "Record a check"}
    else:
        nxt = {"title": "Nothing to do today", "body": f"{first} has nothing open. Daily check-ins are being watched.", "cta": None}
    return {"card": card, "state": {"level": level, "reasons": [r["text"] for r in reasons]}, "next": nxt, "exposure": exposure, "log": h, "medical": checks, "referrals": referrals, "trainings": trainings, "symptoms": symptoms,
            "joined": card["joined"], "label": "Record of what this worker and the team entered. Not a diagnosis.", "kind": "org"}

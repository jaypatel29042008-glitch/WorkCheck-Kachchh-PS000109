"""Organisations and onboarding: a company sets itself up, then invites workers and staff with a code."""
import secrets
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .core import (DEMO_ORG, ROLE_NAMES, current_user, db, hash_password, log_action, normalise_identity, now, open_session, password_problem,
                   public_user, require, set_cookie, today)
from .security import SIGNUP_LIMIT, limit

router = APIRouter(prefix="/api")

ORG_KINDS = ["Salt pan", "Port or dock", "Cement plant", "Construction site", "Stone crusher or mine", "Transport yard", "Other"]
# Model places a site can be matched to, so heat and dust estimates apply from day one.
PLACES = [("little_rann_kutch", "Little Rann (Rapar)"), ("kandla_port", "Kandla Port"), ("mundra_port", "Mundra Port"), ("abdasa_cement", "Abdasa cement belt"), ("bhuj", "Bhuj"),
          ("anjar", "Anjar"), ("bhachau", "Bhachau"), ("gandhidham", "Gandhidham"), ("lakhpat", "Lakhpat"), ("mandvi", "Mandvi"), ("nakhatrana", "Nakhatrana"), ("rapar", "Rapar town")]
JOB_CHOICES = [("salt_raking", "Salt-pan worker"), ("port_yard_kandla", "Port yard loader"), ("cement_yard", "Cement yard loader"), ("cement_walk", "Plant staff, walking rounds"),
               ("construction", "Construction worker"), ("stone_crushing", "Stone crusher operator"), ("crane_cab", "Crane operator"), ("truck_cab", "Truck driver")]
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # No 0/O or 1/I/L, so codes read aloud without mistakes.


def new_code():
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    return f"{raw[:3]}-{raw[3:]}"


def new_worker_id(con):
    while True:
        wid = "W-" + "".join(secrets.choice("23456789ABCDEFGHJKMNPQRSTUVWXYZ") for _ in range(5))
        if con.execute("SELECT 1 FROM org_workers WHERE id = ?", (wid,)).fetchone() is None:
            return wid


def org_of(user, con):
    if not user.get("org_id"):
        raise HTTPException(403, "Your account is not linked to an organisation.")
    row = con.execute("SELECT * FROM organisations WHERE id = ?", (user["org_id"],)).fetchone()
    if row is None:
        raise HTTPException(404, "Organisation not found.")
    return dict(row)


def sites_of(org_id, con):
    return [dict(r) for r in con.execute("SELECT id, name, location_id FROM sites WHERE org_id = ? ORDER BY id", (org_id,))]


@router.get("/org/options")
def options():
    return {"kinds": ORG_KINDS, "places": [{"id": k, "label": v} for k, v in PLACES], "jobs": [{"id": k, "label": v} for k, v in JOB_CHOICES]}


# --- Company sign-up -----------------------------------------------------------
class Register(BaseModel):
    org_name: str = Field(min_length=2, max_length=80)
    org_kind: str = Field(min_length=2, max_length=40)
    site_name: str = Field(min_length=2, max_length=80)
    location_id: str = Field(min_length=2, max_length=40)
    admin_name: str = Field(min_length=2, max_length=60)
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)


@router.post("/org/register")
def register(payload: Register, request: Request, response: Response):
    limit(SIGNUP_LIMIT, request, "sign-ups")
    if payload.org_kind not in ORG_KINDS:
        raise HTTPException(400, "Choose a type of workplace from the list.")
    if payload.location_id not in dict(PLACES):
        raise HTTPException(400, "Choose the nearest place from the list.")
    email = normalise_identity(payload.email)
    if "@" not in email and not email.isdigit():
        raise HTTPException(400, "Enter an email address or a 10-digit mobile number.")
    problem = password_problem(payload.password, email)
    if problem:
        raise HTTPException(400, problem)
    with db() as con:
        if con.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(409, "An account with that email or number already exists. Sign in instead.")
        cur = con.execute("INSERT INTO organisations (name, kind, created_at) VALUES (?,?,?)", (payload.org_name.strip(), payload.org_kind, now().isoformat()))
        org_id = cur.lastrowid
        site_id = con.execute("INSERT INTO sites (org_id, name, location_id, created_at) VALUES (?,?,?,?)", (org_id, payload.site_name.strip(), payload.location_id, now().isoformat())).lastrowid
        user_id = con.execute("INSERT INTO users (email, password_hash, role, display_name, org_id, site_id, created_at) VALUES (?,?,?,?,?,?,?)",
                              (email, hash_password(payload.password), "supervisor", payload.admin_name.strip(), org_id, site_id, now().isoformat())).lastrowid
        con.execute("UPDATE organisations SET created_by = ? WHERE id = ?", (user_id, org_id))
        token = open_session(con, user_id)
        log_action(con, user_id, "org_register")
        user = dict(con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        set_cookie(response, token)
        return {"user": public_user(user, con), "org_id": org_id, "site_id": site_id}


# --- The organisation page ----------------------------------------------------
@router.get("/org")
def organisation(user=Depends(require("supervisor", "clinician"))):
    with db() as con:
        org = org_of(user, con)
        sites = sites_of(org["id"], con)
        people = [dict(r) for r in con.execute("SELECT id, display_name, role, email, site_id, created_at FROM users WHERE org_id = ? ORDER BY role, display_name", (org["id"],))]
        invites = []
        if user["role"] == "supervisor":
            invites = [dict(r) for r in con.execute("SELECT * FROM invites WHERE org_id = ? AND expires_at > ? AND uses < max_uses ORDER BY created_at DESC", (org["id"], now().isoformat()))]
        workers = con.execute("SELECT COUNT(*) FROM org_workers WHERE org_id = ?", (org["id"],)).fetchone()[0]
    site_names = {s["id"]: s["name"] for s in sites}
    for p in people:
        p["role_name"] = ROLE_NAMES.get(p["role"], p["role"])
        p["site"] = site_names.get(p["site_id"])
    for i in invites:
        i["site"] = site_names.get(i["site_id"])
        i["job"] = dict(JOB_CHOICES).get(i["job_id"])
        i["role_name"] = ROLE_NAMES.get(i["role"], i["role"])
    return {"org": org, "sites": sites, "people": people, "invites": invites, "workers": workers if not org["demo"] else 128, "places": dict(PLACES), "jobs": [{"id": k, "label": v} for k, v in JOB_CHOICES]}


class NewSite(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    location_id: str = Field(min_length=2, max_length=40)


@router.post("/org/sites")
def add_site(payload: NewSite, user=Depends(require("supervisor"))):
    if payload.location_id not in dict(PLACES):
        raise HTTPException(400, "Choose the nearest place from the list.")
    with db() as con:
        org = org_of(user, con)
        site_id = con.execute("INSERT INTO sites (org_id, name, location_id, created_at) VALUES (?,?,?,?)", (org["id"], payload.name.strip(), payload.location_id, now().isoformat())).lastrowid
        log_action(con, user["id"], f"site_add:{site_id}")
    return {"id": site_id}


class NewInvite(BaseModel):
    role: Literal["worker", "supervisor", "clinician"]
    site_id: Optional[int] = None
    job_id: Optional[str] = None
    label: str = Field(default="", max_length=60)
    max_uses: int = Field(default=1, ge=1, le=500)
    days: int = Field(default=14, ge=1, le=90)


@router.post("/org/invites")
def create_invite(payload: NewInvite, user=Depends(require("supervisor"))):
    if payload.role == "worker" and payload.job_id not in dict(JOB_CHOICES):
        raise HTTPException(400, "Choose the job this invite is for.")
    with db() as con:
        org = org_of(user, con)
        if payload.site_id is not None and not con.execute("SELECT 1 FROM sites WHERE id = ? AND org_id = ?", (payload.site_id, org["id"])).fetchone():
            raise HTTPException(400, "That site is not in your organisation.")
        code = new_code()
        while con.execute("SELECT 1 FROM invites WHERE code = ?", (code,)).fetchone():
            code = new_code()
        con.execute("INSERT INTO invites (code, org_id, site_id, role, job_id, label, created_by, created_at, expires_at, max_uses) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (code, org["id"], payload.site_id, payload.role, payload.job_id if payload.role == "worker" else None, payload.label.strip(), user["id"], now().isoformat(), (now() + timedelta(days=payload.days)).isoformat(), payload.max_uses))
        log_action(con, user["id"], f"invite_create:{payload.role}")
    return {"code": code, "expires_in_days": payload.days}


@router.delete("/org/invites/{code}")
def cancel_invite(code: str, user=Depends(require("supervisor"))):
    with db() as con:
        cur = con.execute("UPDATE invites SET expires_at = ? WHERE code = ? AND org_id = ?", (now().isoformat(), code.upper(), user["org_id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "No such invite.")
    return {"ok": True}


# --- Joining with a code ------------------------------------------------------
def valid_invite(code, con):
    row = con.execute("SELECT i.*, o.name org_name, o.kind org_kind, s.name site_name FROM invites i JOIN organisations o ON o.id = i.org_id LEFT JOIN sites s ON s.id = i.site_id WHERE i.code = ?", (code.strip().upper(),)).fetchone()
    if row is None:
        raise HTTPException(404, "That code is not right. Check it with the person who gave it to you.")
    if row["expires_at"] <= now().isoformat() or row["uses"] >= row["max_uses"]:
        raise HTTPException(410, "That code has expired or has already been used. Ask for a new one.")
    return dict(row)


@router.get("/join/{code}")
def join_preview(code: str):
    with db() as con:
        inv = valid_invite(code, con)
    return {"org": inv["org_name"], "kind": inv["org_kind"], "site": inv["site_name"], "role": inv["role"], "role_name": ROLE_NAMES[inv["role"]], "job": dict(JOB_CHOICES).get(inv["job_id"]), "label": inv["label"]}


class Join(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    identity: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)
    age: Optional[int] = Field(default=None, ge=16, le=80)


@router.post("/join/{code}")
def join(code: str, payload: Join, request: Request, response: Response):
    limit(SIGNUP_LIMIT, request, "sign-ups")
    identity = normalise_identity(payload.identity)
    if "@" not in identity and not identity.isdigit():
        raise HTTPException(400, "Enter an email address or a 10-digit mobile number.")
    problem = password_problem(payload.password, identity)
    if problem:
        raise HTTPException(400, problem)
    with db() as con:
        inv = valid_invite(code, con)
        if con.execute("SELECT 1 FROM users WHERE email = ?", (identity,)).fetchone():
            raise HTTPException(409, "An account with that email or number already exists. Sign in instead.")
        worker_id = None
        if inv["role"] == "worker":
            worker_id = new_worker_id(con)
        user_id = con.execute("INSERT INTO users (email, password_hash, role, display_name, worker_id, org_id, site_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
                              (identity, hash_password(payload.password), inv["role"], payload.name.strip(), worker_id, inv["org_id"], inv["site_id"], now().isoformat())).lastrowid
        if worker_id:
            con.execute("INSERT INTO org_workers (id, org_id, site_id, user_id, name, age, phone, job_id, joined_at) VALUES (?,?,?,?,?,?,?,?,?)",
                        (worker_id, inv["org_id"], inv["site_id"], user_id, payload.name.strip(), payload.age, identity if identity.isdigit() else None, inv["job_id"], today()))
        con.execute("UPDATE invites SET uses = uses + 1 WHERE code = ?", (inv["code"],))
        token = open_session(con, user_id)
        log_action(con, user_id, f"join:{inv['role']}")
        user = dict(con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        set_cookie(response, token)
        return {"user": public_user(user, con)}


# --- Workers of an organisation --------------------------------------------------
JOB_ICONS = {"salt_raking": "salt", "port_yard_kandla": "forklift", "port_yard_mundra": "forklift", "cement_yard": "building-factory-2", "cement_walk": "building-factory-2",
             "construction": "helmet", "stone_crushing": "pick", "crane_cab": "crane", "truck_cab": "truck"}


def initials(name):
    parts = name.replace(".", "").split()
    return (parts[0][0] + (parts[1][0] if len(parts) > 1 else "")).upper()


def org_worker_cards(org_id, con):
    """Plain cards for workers who joined through an invite. Demo workers come from the reference data instead."""
    sites = {s["id"]: s for s in sites_of(org_id, con)}
    places = dict(PLACES)
    out = []
    for r in con.execute("SELECT * FROM org_workers WHERE org_id = ? ORDER BY name", (org_id,)):
        site = sites.get(r["site_id"])
        out.append({"id": r["id"], "name": r["name"], "initials": initials(r["name"]), "age": r["age"], "employer": "Joined with invite", "job": dict(JOB_CHOICES).get(r["job_id"], r["job_id"]), "job_id": r["job_id"],
                    "icon": JOB_ICONS.get(r["job_id"], "helmet"), "place": site["name"] if site else "No site", "location_id": site["location_id"] if site else "bhuj", "taluka": places.get(site["location_id"], "") if site else "",
                    "site_id": r["site_id"], "joined": r["joined_at"], "phone": r["phone"]})
    return out


def worker_belongs(worker_id, org_id, con):
    if worker_id.startswith("SIM-"):
        return org_id == DEMO_ORG
    return con.execute("SELECT 1 FROM org_workers WHERE id = ? AND org_id = ?", (worker_id, org_id)).fetchone() is not None

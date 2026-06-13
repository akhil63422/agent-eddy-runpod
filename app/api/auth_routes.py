import base64
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# ── Models ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    org_code: str = ""
    username: str = ""
    password: str = ""

class RegisterRequest(BaseModel):
    org_code: str = ""
    username: str = ""
    password: str = ""
    email: str = ""

def _make_token(username: str, role: str, company_id: str) -> str:
    payload = json.dumps({"sub": username, "role": role, "company_id": company_id})
    return "dev." + base64.b64encode(payload.encode()).decode()

def _parse_token(token: str) -> dict:
    try:
        _, b64 = token.split(".", 1)
        return json.loads(base64.b64decode(b64.encode()).decode())
    except Exception:
        return {}

# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
def login(body: LoginRequest):
    role = "Admin"
    company_id = (body.org_code or "DEFAULT").upper()
    username = body.username or "admin"
    token = _make_token(username, role, company_id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": f"user-{username}",
        "username": username,
        "role": role,
        "company_id": company_id,
    }

@router.post("/auth/register")
def register(body: RegisterRequest):
    return login(LoginRequest(
        org_code=body.org_code,
        username=body.username,
        password=body.password,
    ))

@router.post("/auth/register/create-org")
def register_create_org(body: dict):
    username = body.get("username", "admin")
    org_code = body.get("org_code", "DEFAULT")
    return login(LoginRequest(org_code=org_code, username=username, password=""))

@router.post("/auth/register/join")
def register_join(body: dict):
    return login(LoginRequest(
        org_code=body.get("org_code", "DEFAULT"),
        username=body.get("username", "admin"),
        password="",
    ))

@router.get("/auth/me")
def get_me():
    return {
        "user_id": "user-admin",
        "username": "admin",
        "role": "Admin",
        "company_id": "DEFAULT",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

@router.get("/companies/by-code/{org_code}")
def get_company_by_code(org_code: str):
    return {
        "id": f"company-{org_code}",
        "org_code": org_code.upper(),
        "name": f"{org_code.capitalize()} Organization",
    }

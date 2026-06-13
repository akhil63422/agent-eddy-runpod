from typing import Optional, Any
from datetime import datetime, timezone
import os
import json as _json_mod
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import PartnerProfile
from app.core.logger import get_logger

# Directory for uploaded partner files (relative to project root)
UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "partners"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_SPEC_TYPES = {".pdf", ".doc", ".docx"}
ALLOWED_SAMPLE_TYPES = {".edi", ".txt", ".x12", ".edi835", ".edi850"}
MAX_SPEC_SIZE = 20 * 1024 * 1024   # 20 MB
MAX_SAMPLE_SIZE = 10 * 1024 * 1024 # 10 MB

log = get_logger("api.partners")
router = APIRouter()


# ── New-UI schema models ──────────────────────────────────────────────────────

class PartnerCreate(BaseModel):
    # New UI fields
    business_name: Optional[str] = None
    partner_code: Optional[str] = None
    role: Optional[str] = "Both"
    industry: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = "Active"
    business_contact: Optional[dict] = None
    technical_contact: Optional[dict] = None
    edi_config: Optional[dict] = None
    transport_config: Optional[dict] = None
    document_agreements: Optional[list] = []
    erp_context: Optional[dict] = None
    wizard_metadata: Optional[dict] = None
    sla_hours: Optional[int] = 24
    notes: Optional[str] = None
    # Legacy fields (still accepted)
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    isa_qualifier: Optional[str] = "ZZ"
    isa_id: Optional[str] = None
    gs_id: Optional[str] = None
    edi_version: Optional[str] = "005010"
    transport: Optional[str] = None
    van_provider: Optional[str] = None


class PartnerUpdate(BaseModel):
    business_name: Optional[str] = None
    partner_code: Optional[str] = None
    role: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None
    business_contact: Optional[dict] = None
    technical_contact: Optional[dict] = None
    edi_config: Optional[dict] = None
    transport_config: Optional[dict] = None
    document_agreements: Optional[list] = None
    erp_context: Optional[dict] = None
    wizard_metadata: Optional[dict] = None
    sla_hours: Optional[int] = None
    notes: Optional[str] = None
    # Legacy
    partner_name: Optional[str] = None
    isa_qualifier: Optional[str] = None
    isa_id: Optional[str] = None
    gs_id: Optional[str] = None
    edi_version: Optional[str] = None
    transport: Optional[str] = None
    van_provider: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _body_to_model(body: PartnerCreate) -> dict:
    """Map new-UI create body → PartnerProfile column values."""
    # Prefer new UI fields, fall back to legacy
    partner_id = body.partner_code or body.partner_id or ""
    partner_name = body.business_name or body.partner_name or partner_id

    edi = body.edi_config or {}
    isa_qualifier = edi.get("isa_qualifier") or body.isa_qualifier or "ZZ"
    isa_id = edi.get("isa_sender_id") or body.isa_id or partner_id
    gs_id = (edi.get("gs_ids") or {}).get("sender") or body.gs_id
    edi_version = edi.get("version") or body.edi_version or "005010"

    transport_cfg = body.transport_config or {}
    transport_type = transport_cfg.get("type") or body.transport or None

    # Store rich data in notes JSON blob (reuse the notes column for extra fields)
    extra: dict = {}
    if body.role:
        extra["role"] = body.role
    if body.status:
        extra["status"] = body.status
    if body.industry:
        extra["industry"] = body.industry
    if body.country:
        extra["country"] = body.country
    if body.timezone:
        extra["timezone"] = body.timezone
    if body.business_contact:
        extra["business_contact"] = body.business_contact
    if body.technical_contact:
        extra["technical_contact"] = body.technical_contact
    if body.edi_config:
        extra["edi_config"] = body.edi_config
    if body.transport_config:
        extra["transport_config"] = body.transport_config
    if body.erp_context:
        extra["erp_context"] = body.erp_context
    if body.wizard_metadata:
        extra["wizard_metadata"] = body.wizard_metadata

    # Store extra fields in van_provider column as JSON string
    import json
    van_provider = json.dumps(extra) if extra else None

    return dict(
        partner_id=partner_id,
        partner_name=partner_name,
        isa_qualifier=isa_qualifier,
        isa_id=isa_id or partner_id,
        gs_id=gs_id,
        edi_version=edi_version,
        transport=transport_type,
        van_provider=van_provider,
        document_agreements=body.document_agreements or [],
        notes=body.notes,
    )


def _coerce_files_list(files_list, legacy_single) -> list:
    """
    Normalise stored file metadata into a list.
    - If a list is already stored under spec_files / sample_files, return it.
    - If only the legacy single-file dict exists, wrap it in a list (migration).
    """
    if isinstance(files_list, list):
        return files_list
    if isinstance(legacy_single, dict) and legacy_single.get("name"):
        # Auto-migrate old single-file entry: add an id so delete/download work
        import uuid as _uuid
        if not legacy_single.get("id"):
            legacy_single["id"] = str(_uuid.uuid4())
        return [legacy_single]
    return []


def _serialize(p: PartnerProfile) -> dict:
    import json as _json
    extra = {}
    if p.van_provider:
        try:
            extra = _json.loads(p.van_provider)
        except Exception:
            extra = {}

    edi_cfg = extra.get("edi_config") or {
        "standard": "X12",
        "version": p.edi_version or "005010",
        "isa_sender_id": p.isa_id,
        "gs_ids": {"sender": p.gs_id or "", "receiver": ""},
    }

    transport_cfg = extra.get("transport_config") or (
        {"type": p.transport} if p.transport else None
    )

    return {
        # IDs — new UI uses id, old UI used partner_id
        "id": p.id,
        "partner_id": p.partner_id,
        "partner_code": p.partner_id,
        # Names
        "business_name": p.partner_name,
        "partner_name": p.partner_name,
        # Profile fields
        "role": extra.get("role", "Both"),
        "status": extra.get("status", "Active"),
        "industry": extra.get("industry"),
        "country": extra.get("country"),
        "timezone": extra.get("timezone"),
        # Contacts
        "business_contact": extra.get("business_contact"),
        "technical_contact": extra.get("technical_contact"),
        # EDI
        "edi_config": edi_cfg,
        "isa_qualifier": p.isa_qualifier,
        "isa_id": p.isa_id,
        "gs_id": p.gs_id,
        "edi_version": p.edi_version,
        # Transport
        "transport_config": transport_cfg,
        "transport": p.transport,
        "van_provider": None,
        # Documents
        "document_agreements": p.document_agreements or [],
        # ERP
        "erp_context": extra.get("erp_context"),
        # Wizard metadata
        "wizard_metadata": extra.get("wizard_metadata"),
        # Uploaded files lists (stored in wizard_metadata)
        "spec_files": _coerce_files_list((extra.get("wizard_metadata") or {}).get("spec_files"),
                                         (extra.get("wizard_metadata") or {}).get("spec_file")),
        "sample_files": _coerce_files_list((extra.get("wizard_metadata") or {}).get("sample_files"),
                                           (extra.get("wizard_metadata") or {}).get("sample_file")),
        # Notes
        "notes": p.notes,
        # SLA
        "sla_hours": p.sla_hours or 24,
        # Timestamps
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/partners/training/overview")
def get_training_overview(db: Session = Depends(get_db)):
    return {"partners": [], "total": 0}

@router.get("/partners/")
@router.get("/partners")
def list_partners(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(PartnerProfile).order_by(PartnerProfile.partner_name)
    if search:
        q = q.filter(
            PartnerProfile.partner_name.ilike(f"%{search}%") |
            PartnerProfile.partner_id.ilike(f"%{search}%")
        )
    partners = q.offset(skip).limit(limit).all()
    return [_serialize(p) for p in partners]


@router.post("/partners/", summary="Create a partner profile", status_code=201)
@router.post("/partners", summary="Create a partner profile", status_code=201)
def create_partner(body: PartnerCreate, db: Session = Depends(get_db)):
    partner_id = body.partner_code or body.partner_id or ""
    if not partner_id:
        raise HTTPException(status_code=422, detail="partner_code or partner_id is required")
    existing = db.query(PartnerProfile).filter_by(partner_id=partner_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Partner '{partner_id}' already exists")
    data = _body_to_model(body)
    p = PartnerProfile(**data)
    db.add(p)
    db.commit()
    db.refresh(p)
    log.info(f"[partners] created partner_id={p.partner_id}")
    return _serialize(p)


@router.get("/partners/{partner_id}/training/status")
def get_training_status(partner_id: str):
    return {"partner_id": partner_id, "status": "not_started"}

@router.get("/partners/{partner_id}/field-mappings")
def get_field_mappings(partner_id: str):
    return []


@router.get("/partners/{partner_id}")
def get_partner(partner_id: str, db: Session = Depends(get_db)):
    p = (
        db.query(PartnerProfile).filter(
            (PartnerProfile.id == partner_id) | (PartnerProfile.partner_id == partner_id)
        ).first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    return _serialize(p)


@router.put("/partners/{partner_id}")
def update_partner(partner_id: str, body: PartnerUpdate, db: Session = Depends(get_db)):
    p = db.query(PartnerProfile).filter(
        (PartnerProfile.id == partner_id) | (PartnerProfile.partner_id == partner_id)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    _apply_update(p, body)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.patch("/partners/{partner_id}")
def patch_partner(partner_id: str, body: dict, db: Session = Depends(get_db)):
    p = db.query(PartnerProfile).filter(
        (PartnerProfile.id == partner_id) | (PartnerProfile.partner_id == partner_id)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    # Merge into van_provider JSON blob
    import json as _json
    extra = {}
    if p.van_provider:
        try:
            extra = _json.loads(p.van_provider)
        except Exception:
            pass
    for key, val in body.items():
        if key in ("business_name", "partner_name"):
            p.partner_name = val
        elif key in ("partner_code", "partner_id"):
            pass  # don't change PK
        elif key in ("isa_qualifier", "isa_id", "gs_id", "edi_version", "transport", "notes"):
            setattr(p, key, val)
        else:
            extra[key] = val
    p.van_provider = _json.dumps(extra) if extra else None
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/partners/{partner_id}", status_code=204)
def delete_partner(partner_id: str, db: Session = Depends(get_db)):
    p = db.query(PartnerProfile).filter(
        (PartnerProfile.id == partner_id) | (PartnerProfile.partner_id == partner_id)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    db.delete(p)
    db.commit()
    log.info(f"[partners] deleted partner_id={partner_id}")


@router.post("/partners/{partner_id}/training/edi")
def upload_training_edi(partner_id: str):
    return {"partner_id": partner_id, "uploaded": True}

@router.post("/partners/{partner_id}/training/mappings")
def upload_training_mappings(partner_id: str):
    return {"partner_id": partner_id, "uploaded": True}

@router.post("/partners/{partner_id}/training/erp")
def upload_training_erp(partner_id: str):
    return {"partner_id": partner_id, "uploaded": True}


# ── File upload / download / delete (multi-file per type) ────────────────────

def _get_partner_or_404(partner_id: str, db: Session) -> PartnerProfile:
    p = db.query(PartnerProfile).filter(
        (PartnerProfile.id == partner_id) | (PartnerProfile.partner_id == partner_id)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    return p


def _partner_upload_dir(partner_id: str) -> Path:
    d = UPLOADS_DIR / str(partner_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read_wm(p: PartnerProfile) -> tuple[dict, dict]:
    """Return (extra dict, wizard_metadata dict) from van_provider blob."""
    import json as _j
    extra: dict = {}
    if p.van_provider:
        try:
            extra = _j.loads(p.van_provider)
        except Exception:
            pass
    return extra, extra.get("wizard_metadata") or {}


def _save_wm(p: PartnerProfile, extra: dict, wm: dict, db: Session):
    import json as _j
    extra["wizard_metadata"] = wm
    p.van_provider = _j.dumps(extra)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)


def _wm_files_list(wm: dict, file_type: str) -> list:
    """Return the list for spec_files or sample_files, migrating legacy single entry."""
    key = f"{file_type}_files"
    legacy_key = f"{file_type}_file"
    files = wm.get(key)
    if isinstance(files, list):
        return files
    # Migrate legacy single-file dict
    import uuid as _u
    legacy = wm.get(legacy_key)
    if isinstance(legacy, dict) and legacy.get("name"):
        if not legacy.get("id"):
            legacy["id"] = str(_u.uuid4())
        return [legacy]
    return []


@router.post("/partners/{partner_id}/files/spec", summary="Append a spec document for a partner")
async def upload_spec_file(
    partner_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    import uuid as _u
    p = _get_partner_or_404(partner_id, db)
    ext = Path(file.filename or "spec.pdf").suffix.lower()
    if ext not in ALLOWED_SPEC_TYPES:
        raise HTTPException(status_code=422, detail=f"Spec file must be PDF, DOC, or DOCX. Got '{ext}'")

    content = await file.read()
    if len(content) > MAX_SPEC_SIZE:
        raise HTTPException(status_code=422, detail="Spec file exceeds 20 MB limit")

    file_id = str(_u.uuid4())
    dest = _partner_upload_dir(str(p.id)) / f"spec_{file_id}{ext}"
    dest.write_bytes(content)

    meta = {
        "id": file_id,
        "name": file.filename,
        "size": len(content),
        "ext": ext,
        "path": str(dest),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    extra, wm = _read_wm(p)
    files = _wm_files_list(wm, "spec")
    files.append(meta)
    wm["spec_files"] = files
    wm.pop("spec_file", None)   # remove legacy key
    _save_wm(p, extra, wm, db)

    log.info(f"[partners] spec file uploaded partner_id={p.id} file_id={file_id} name={file.filename}")
    return {"ok": True, "file": meta}


@router.post("/partners/{partner_id}/files/sample", summary="Append a sample EDI file for a partner")
async def upload_sample_file(
    partner_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    import uuid as _u
    p = _get_partner_or_404(partner_id, db)
    ext = Path(file.filename or "sample.edi").suffix.lower()
    if ext not in ALLOWED_SAMPLE_TYPES:
        raise HTTPException(status_code=422, detail=f"Sample file must be .edi, .txt, or .x12. Got '{ext}'")

    content = await file.read()
    if len(content) > MAX_SAMPLE_SIZE:
        raise HTTPException(status_code=422, detail="Sample file exceeds 10 MB limit")

    file_id = str(_u.uuid4())
    dest = _partner_upload_dir(str(p.id)) / f"sample_{file_id}{ext}"
    dest.write_bytes(content)

    meta = {
        "id": file_id,
        "name": file.filename,
        "size": len(content),
        "ext": ext,
        "path": str(dest),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    extra, wm = _read_wm(p)
    files = _wm_files_list(wm, "sample")
    files.append(meta)
    wm["sample_files"] = files
    wm.pop("sample_file", None)  # remove legacy key
    _save_wm(p, extra, wm, db)

    log.info(f"[partners] sample file uploaded partner_id={p.id} file_id={file_id} name={file.filename}")
    return {"ok": True, "file": meta}


@router.delete(
    "/partners/{partner_id}/files/{file_type}/{file_id}",
    summary="Delete a specific partner file by ID",
)
def delete_partner_file(
    partner_id: str,
    file_type: str,
    file_id: str,
    db: Session = Depends(get_db),
):
    if file_type not in ("spec", "sample"):
        raise HTTPException(status_code=422, detail="file_type must be 'spec' or 'sample'")
    p = _get_partner_or_404(partner_id, db)
    extra, wm = _read_wm(p)
    files = _wm_files_list(wm, file_type)

    target = next((f for f in files if f.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove from disk
    if target.get("path"):
        try:
            Path(target["path"]).unlink(missing_ok=True)
        except Exception:
            pass

    files = [f for f in files if f.get("id") != file_id]
    wm[f"{file_type}_files"] = files
    wm.pop(f"{file_type}_file", None)
    _save_wm(p, extra, wm, db)

    log.info(f"[partners] {file_type} file deleted partner_id={p.id} file_id={file_id}")
    return {"ok": True}


@router.get(
    "/partners/{partner_id}/files/{file_type}/{file_id}",
    summary="Download a specific partner file by ID",
)
def download_partner_file(
    partner_id: str,
    file_type: str,
    file_id: str,
    db: Session = Depends(get_db),
):
    if file_type not in ("spec", "sample"):
        raise HTTPException(status_code=422, detail="file_type must be 'spec' or 'sample'")
    p = _get_partner_or_404(partner_id, db)
    _, wm = _read_wm(p)
    files = _wm_files_list(wm, file_type)

    target = next((f for f in files if f.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")

    path = Path(target["path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(path),
        filename=target.get("name", path.name),
        media_type="application/octet-stream",
    )


def _apply_update(p: PartnerProfile, body: PartnerUpdate):
    import json as _json
    extra = {}
    if p.van_provider:
        try:
            extra = _json.loads(p.van_provider)
        except Exception:
            pass

    data = body.model_dump(exclude_none=True)
    for key, val in data.items():
        if key in ("business_name", "partner_name"):
            p.partner_name = val
        elif key in ("isa_qualifier", "isa_id", "gs_id", "edi_version", "transport", "notes", "sla_hours"):
            setattr(p, key, val)
        elif key in ("role", "status", "industry", "country", "timezone",
                     "business_contact", "technical_contact", "edi_config",
                     "transport_config", "erp_context", "wizard_metadata"):
            extra[key] = val
        elif key == "document_agreements":
            p.document_agreements = val
    p.van_provider = _json.dumps(extra) if extra else None

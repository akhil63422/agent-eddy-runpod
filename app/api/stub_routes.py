"""
Stub endpoints for exceptions, connections, audit logs, settings, mappings.
These return empty/default responses so the new frontend doesn't crash.
"""
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import TransactionDocument

router = APIRouter()

# ── Exceptions (derived from failed/hitl documents) ──────────────────────────

def _doc_to_exception(doc: TransactionDocument) -> dict:
    errors = doc.validation_errors or []
    if doc.final_status == "FAILED":
        exc_type = "PARSE_FAILURE" if not doc.canonical_event else "VALIDATION_ERROR"
        severity = "HIGH"
        status = "ACTIVE"
    else:  # HITL_PENDING / HITL_REQUIRED
        exc_type = "LOW_CONFIDENCE"
        severity = "MEDIUM"
        status = "ACTIVE"
    direction = "Inbound" if (doc.direction or "").upper() == "INBOUND" else "Outbound"
    partner = doc.source_partner if direction == "Inbound" else doc.destination_partner
    return {
        "id": doc.id,
        "document_id": doc.id,
        "file_id": doc.id,
        "partner_id": partner,
        "partner_code": partner,
        "exception_type": exc_type,
        "severity": severity,
        "status": status,
        "description": errors[0] if errors else f"{exc_type.replace('_', ' ').title()} on {doc.transaction_type or 'document'}",
        "direction": direction,
        "document_type": doc.transaction_type,
        "confidence_score": doc.confidence_score,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }

@router.get("/exceptions/")
@router.get("/exceptions")
def list_exceptions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    docs = db.query(TransactionDocument).filter(
        TransactionDocument.final_status.in_(["FAILED", "HITL_PENDING", "HITL_REQUIRED"])
    ).order_by(TransactionDocument.created_at.desc()).offset(skip).limit(limit).all()
    return [_doc_to_exception(d) for d in docs]

@router.get("/exceptions/summary")
def exceptions_summary(date_range: str = "last30days", db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    all_docs = db.query(TransactionDocument).filter(TransactionDocument.created_at >= since).all()
    active = [d for d in all_docs if d.final_status in ("FAILED", "HITL_PENDING", "HITL_REQUIRED")]
    resolved = [d for d in all_docs if d.final_status in ("COMPLETED", "APPROVED") and d.created_at >= since_24h]
    low_conf = [d for d in all_docs if (d.confidence_score or 1.0) < 0.75 and d.final_status not in ("FAILED",)]
    critical = [d for d in active if d.final_status == "FAILED"]
    return {
        "active_exceptions": len(active),
        "resolved_today": len(resolved),
        "low_confidence": len(low_conf),
        "critical_errors": len(critical),
        "total": len(active),
        "open": len(active),
        "resolved": len(resolved),
        "critical": len(critical),
    }

@router.get("/exceptions/list")
def exceptions_list(
    page: int = 1, page_size: int = 20,
    date_range: str = "last30days",
    partner: str = None, severity: str = None,
    status: str = None, exception_type: str = None,
    search: str = None,
    db: Session = Depends(get_db)
):
    docs = db.query(TransactionDocument).filter(
        TransactionDocument.final_status.in_(["FAILED", "HITL_PENDING", "HITL_REQUIRED"])
    ).order_by(TransactionDocument.created_at.desc()).all()

    items = [_doc_to_exception(d) for d in docs]

    # Client-side filters
    if severity and severity != "all":
        items = [i for i in items if i["severity"] == severity.upper()]
    if exception_type and exception_type != "all":
        items = [i for i in items if i["exception_type"] == exception_type]
    if partner and partner != "all":
        items = [i for i in items if i["partner_id"] == partner]
    if search:
        q = search.lower()
        items = [i for i in items if q in (i.get("description") or "").lower()
                 or q in (i.get("partner_id") or "").lower()]

    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start:start + page_size]

    breakdown = {}
    for i in items:
        t = i["exception_type"]
        breakdown[t] = breakdown.get(t, 0) + 1

    return {"items": page_items, "total": total, "page": page, "page_size": page_size, "type_breakdown": breakdown}

@router.get("/exceptions/{exception_id}")
def get_exception(exception_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == exception_id).first()
    if doc:
        return _doc_to_exception(doc)
    return {"id": exception_id, "status": "Active", "severity": "Medium", "exception_type": "UNKNOWN"}

@router.post("/exceptions/{exception_id}/resolve")
def resolve_exception(exception_id: str, body: dict = {}, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == exception_id).first()
    if doc and doc.final_status in ("FAILED", "HITL_PENDING", "HITL_REQUIRED"):
        doc.final_status = "COMPLETED"
        doc.hitl_required = False
        doc.updated_at = datetime.now(timezone.utc)
        db.commit()
    return {"id": exception_id, "status": "Resolved"}

# ── Connections ───────────────────────────────────────────────────────────────

@router.get("/connections/our-company")
def get_our_company():
    return {
        "id": "our-company",
        "partner_id": "AGENT-EDDY",
        "business_name": "Agent Eddy",
        "partner_name": "Agent Eddy",
        "isa_id": "AGENTEDDY",
        "isa_qualifier": "ZZ",
        "our_company_isa_id": "AGENTEDDY",
        "status": "Active",
    }

@router.get("/connections/direction-matrix/preview")
def get_direction_matrix():
    return {"matrix": [], "partners": []}

@router.get("/connections/")
@router.get("/connections")
def list_connections(partner_id: Optional[str] = None):
    return []

@router.get("/connections/{connection_id}")
def get_connection(connection_id: str):
    return {"id": connection_id}

@router.post("/connections/")
@router.post("/connections")
def create_connection(body: dict):
    return {"id": str(uuid.uuid4()), **body}

@router.put("/connections/{connection_id}")
def update_connection(connection_id: str, body: dict):
    return {"id": connection_id, **body}

@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: str):
    return {"deleted": True}

# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs/")
@router.get("/audit-logs")
def list_audit_logs(skip: int = 0, limit: int = 100):
    return []

@router.get("/audit-logs/{log_id}")
def get_audit_log(log_id: str):
    return {"id": log_id}

# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings/")
@router.get("/settings")
def get_settings():
    return {"settings": {}}

@router.put("/settings/")
@router.put("/settings")
def update_settings(body: dict):
    return {"settings": body}

# ── Mappings ──────────────────────────────────────────────────────────────────

@router.get("/mappings/")
@router.get("/mappings")
def list_mappings():
    return []

@router.post("/mappings/")
@router.post("/mappings")
def create_mapping(body: dict):
    return {"id": str(uuid.uuid4()), **body}

@router.get("/mappings/{mapping_id}")
def get_mapping(mapping_id: str):
    return {"id": mapping_id}

# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok"}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass

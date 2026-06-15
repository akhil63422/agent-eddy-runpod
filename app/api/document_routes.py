import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.db.models import TransactionDocument, PartnerProfile
from app.core.logger import get_logger
from app.services.correlation_service import correlation_service

log = get_logger("document_routes")
router = APIRouter()

# ── Status / type mappings ────────────────────────────────────────────────────

_STATUS_MAP = {
    "COMPLETED": "Completed",
    "FAILED": "Failed",
    "IN_PROGRESS": "Processing",
    "HITL_REQUIRED": "Needs Review",
    "HITL_PENDING": "Needs Review",   # validator/hitl skill uses HITL_PENDING
    "APPROVED": "Ready for Dispatch",
    "REJECTED": "Rejected",
}

_DIRECTION_MAP = {
    "INBOUND": "Inbound",
    "OUTBOUND": "Outbound",
    "inbound": "Inbound",
    "outbound": "Outbound",
}

_TX_TO_DOC_TYPE = {
    "PURCHASE_ORDER": "850",
    "SHIPMENT_NOTICE": "856",
    "INVOICE": "810",
    "PO_ACK": "855",
    "PAYMENT_REMITTANCE": "820",
}

_REQUIRED_FIELDS = {
    "PURCHASE_ORDER": ["vendor_id", "customer_id", "document_number", "line_items"],
    "INVOICE": ["vendor_id", "document_number", "total_value"],
    "SHIPMENT_NOTICE": ["vendor_id", "document_number", "line_items"],
}


def _validate_mapped_payload(payload: dict, tx_type: str) -> list[str]:
    """Validate mapped payload against required fields for transaction type."""
    errors: list[str] = []
    required = _REQUIRED_FIELDS.get(tx_type, [])
    for field in required:
        if not payload.get(field):
            errors.append(f"Missing required ERP field: {field}")

    if tx_type == "PURCHASE_ORDER":
        items = payload.get("line_items", [])
        if not items:
            errors.append("Purchase Order must have at least one line item")

    return errors


def _build_metadata(doc: TransactionDocument) -> dict:
    mp = doc.mapped_payload or {}
    canonical = doc.canonical_event or {}
    totals = canonical.get("totals", {})
    items = canonical.get("items", [])
    erp_payload = None
    if mp:
        erp_payload = {
            **mp,
            "idocType": mp.get("erp_document_type", doc.transaction_type or ""),
            "poNumber": mp.get("document_number") or canonical.get("document_number") or canonical.get("po_number", ""),
            "lineItems": mp.get("line_items", items),
            "totals": {
                "grandTotal": mp.get("total_value") or totals.get("grand_total", 0),
                "currency": mp.get("currency") or totals.get("currency", "USD"),
            },
        }
    return {
        "inbound_source_format": doc.source_format,
        "detected_standard": doc.source_format,
        "has_warnings": bool(doc.validation_errors),
        "warning_count": len(doc.validation_errors or []),
        "erp_payload": erp_payload,
        "ai_corrections_resolved": False,
        "source_structure": None,
    }


def _match_items(po_canonical: dict, invoice_canonical: dict) -> list:
    """Compare invoice items against PO items. Return list of discrepancies."""
    discrepancies = []

    po_items = po_canonical.get("items", [])
    invoice_items = invoice_canonical.get("items", [])

    po_items_by_sku = {item.get("product_id"): item for item in po_items}

    for inv_item in invoice_items:
        inv_sku = inv_item.get("product_id")
        inv_qty = inv_item.get("quantity")
        inv_price = inv_item.get("unit_price")

        if inv_sku not in po_items_by_sku:
            discrepancies.append({
                "type": "UNKNOWN_ITEM",
                "product_id": inv_sku,
                "invoice_qty": inv_qty,
                "invoice_price": inv_price,
                "msg": f"Product {inv_sku} not in original PO"
            })
        else:
            po_item = po_items_by_sku[inv_sku]
            po_qty = po_item.get("quantity")
            po_price = po_item.get("unit_price")

            if po_qty != inv_qty:
                discrepancies.append({
                    "type": "QTY_MISMATCH",
                    "product_id": inv_sku,
                    "po_qty": po_qty,
                    "invoice_qty": inv_qty,
                    "msg": f"Quantity mismatch: PO {po_qty} vs Invoice {inv_qty}"
                })

            if po_price and inv_price and abs(float(po_price or 0) - float(inv_price or 0)) > 0.01:
                discrepancies.append({
                    "type": "PRICE_MISMATCH",
                    "product_id": inv_sku,
                    "po_price": po_price,
                    "invoice_price": inv_price,
                    "msg": f"Price mismatch: PO ${po_price} vs Invoice ${inv_price}"
                })

    return discrepancies


def _auto_link_and_sla(doc: TransactionDocument, db: Session):
    """Auto-link invoices to POs, validate items, set SLA deadlines."""
    canonical = doc.canonical_event or {}

    if doc.transaction_type == "PURCHASE_ORDER":
        doc.document_reference_number = canonical.get("po_number") or canonical.get("document_number")

        # Get partner's SLA hours
        partner_name = doc.source_partner or doc.destination_partner
        partner = None
        if partner_name:
            partner = db.query(PartnerProfile).filter(
                PartnerProfile.partner_name == partner_name
            ).first()

        sla_h = partner.sla_hours if partner and partner.sla_hours else 24
        doc.sla_hours = sla_h
        doc.expected_dispatch_by = doc.created_at + timedelta(hours=sla_h)
        doc.item_match_status = "NA"

        log.info(f"[auto-link] PO {doc.document_reference_number} → SLA {sla_h}h, deadline {doc.expected_dispatch_by}")

    elif doc.transaction_type == "INVOICE":
        doc.document_reference_number = canonical.get("invoice_number") or canonical.get("document_number")
        ref_po = canonical.get("po_number")

        if ref_po:
            po = db.query(TransactionDocument).filter(
                TransactionDocument.transaction_type == "PURCHASE_ORDER",
                TransactionDocument.document_reference_number == ref_po,
                TransactionDocument.source_partner == doc.source_partner,
            ).order_by(TransactionDocument.created_at.desc()).first()

            if po:
                doc.linked_document_id = po.id
                discrepancies = _match_items(po.canonical_event or {}, canonical)
                doc.item_discrepancies = discrepancies
                doc.item_match_status = "DISCREPANCY" if discrepancies else "MATCHED"

                if discrepancies:
                    errors = list(doc.validation_errors or [])
                    errors.append(f"Invoice-PO mismatch: {len(discrepancies)} discrepancy(s)")
                    doc.validation_errors = errors
                    doc.hitl_required = True
                    doc.final_status = "HITL_REQUIRED"
                    log.warning(f"[auto-link] Invoice linked to PO {ref_po} with {len(discrepancies)} mismatches → HITL")
                else:
                    log.info(f"[auto-link] Invoice linked to PO {ref_po} → items matched")
            else:
                doc.item_match_status = "PENDING"
                log.info(f"[auto-link] Invoice references PO {ref_po} but not found in DB")
        else:
            doc.item_match_status = "PENDING"

    elif doc.transaction_type == "SHIPMENT_NOTICE":
        doc.document_reference_number = canonical.get("shipment_id") or canonical.get("document_number")
        doc.item_match_status = "NA"

    db.commit()


_STEP_MAP_INBOUND = {
    "COMPLETED": 5, "APPROVED": 5, "REJECTED": 5,
    "HITL_PENDING": 3, "HITL_REQUIRED": 3,
    "FAILED": 3, "IN_PROGRESS": 2,
}
_STEP_MAP_OUTBOUND = {
    "COMPLETED": 4, "APPROVED": 4, "REJECTED": 4,
    "FAILED": 2, "IN_PROGRESS": 2,
}

def _doc_shape(doc: TransactionDocument) -> dict:
    direction = _DIRECTION_MAP.get(doc.direction or "", doc.direction or "Inbound")
    # Outbound terminal = "Delivered"; Inbound terminal = "Completed"
    if direction == "Outbound" and doc.final_status == "COMPLETED":
        status = "Delivered"
    elif doc.final_status in ("HITL_PENDING", "HITL_REQUIRED") and (doc.validation_errors or []):
        # Has actual field validation errors → "Exception" (enables header editing form in UI)
        status = "Exception"
    else:
        status = _STATUS_MAP.get(doc.final_status, doc.final_status)
    doc_type = _TX_TO_DOC_TYPE.get(doc.transaction_type or "", doc.transaction_type or "")
    partner_id = doc.source_partner if direction == "Inbound" else doc.destination_partner
    step_map = _STEP_MAP_OUTBOUND if direction == "Outbound" else _STEP_MAP_INBOUND
    processing_step = step_map.get(doc.final_status, 1)
    return {
        "id": doc.id,
        "status": status,
        "direction": direction,
        "document_type": doc_type,
        "transaction_type": doc.transaction_type,
        "source_format": doc.source_format,
        "partner_id": partner_id,
        "source_partner": doc.source_partner,
        "destination_partner": doc.destination_partner,
        "relationship_type": doc.relationship_type,
        "confidence_score": doc.confidence_score,
        "hitl_required": doc.hitl_required,
        "processing_step": processing_step,
        "validation_results": [
            {
                "valid": False,
                "field": e.split(":")[-1].strip() if ":" in e else e,
                "message": e,
                "severity": "high",
                "rule": "mandatory_field",
                "code": "MISSING_MANDATORY_FIELD",
                "auto_correctable": False,
            }
            for e in (doc.validation_errors or [])
        ] + (
            [{"valid": False, "field": "confidence", "message": f"Low AI confidence: {round((doc.confidence_score or 0)*100)}%",
              "severity": "medium", "rule": "confidence_threshold", "code": "LOW_CONFIDENCE", "auto_correctable": False}]
            if doc.final_status in ("HITL_PENDING", "HITL_REQUIRED") and not (doc.validation_errors or [])
            else []
        ),
        "validation_errors": doc.validation_errors or [],
        "canonical_event": doc.canonical_event or {},
        "mapped_payload": doc.mapped_payload or {},
        "mapping_explanations": doc.mapping_explanations or [],
        "unmapped_fields": doc.unmapped_fields or [],
        "edi_output": doc.edi_output or "",
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
        "received_at": doc.created_at.isoformat() if doc.created_at else None,
        "processed_at": doc.updated_at.isoformat() if doc.updated_at else None,
        # Field aliases expected by DocumentTable / DocumentDetail components
        "source_system": doc.source_partner,
        "target_system": doc.destination_partner,
        "partner_code": partner_id,
        "detected_format": doc.source_format,
        "file_name": f"{doc.transaction_type or 'document'}_{doc.id[:8]}.{(doc.source_format or 'json').lower()}",
        "canonical_json": doc.canonical_event or {},
        # Raw content alias
        "raw_edi": doc.raw_document or "",
        # X12 output alias
        "x12_output": doc.edi_output or "",
        # Confidence aliases
        "ai_confidence_score": doc.confidence_score or 0.0,
        # LLM Token usage
        "prompt_tokens": doc.prompt_tokens or 0,
        "completion_tokens": doc.completion_tokens or 0,
        "total_tokens": doc.total_tokens or 0,
        "llm_call_count": doc.llm_call_count or 0,
        # ERP payload in the shape the detail page expects
        "metadata": _build_metadata(doc),
    }

# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/documents/")
def list_documents(
    skip: int = 0,
    limit: int = 100,
    direction: Optional[str] = None,
    status: Optional[str] = None,
    document_type: Optional[str] = None,
    partner_id: Optional[str] = None,
    summary: Optional[bool] = None,
    viewer_role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(TransactionDocument).order_by(desc(TransactionDocument.created_at))

    if direction:
        direction_upper = direction.upper()
        q = q.filter(TransactionDocument.direction == direction_upper)

    if status:
        # "Needs Review" maps to two possible DB values
        if status == "Needs Review":
            q = q.filter(TransactionDocument.final_status.in_(["HITL_PENDING", "HITL_REQUIRED"]))
        else:
            reverse = {v: k for k, v in _STATUS_MAP.items()}
            db_status = reverse.get(status, status)
            q = q.filter(TransactionDocument.final_status == db_status)

    if document_type:
        rev_tx = {v: k for k, v in _TX_TO_DOC_TYPE.items()}
        tx_type = rev_tx.get(document_type, document_type)
        q = q.filter(TransactionDocument.transaction_type == tx_type)

    if partner_id:
        q = q.filter(
            (TransactionDocument.source_partner == partner_id) |
            (TransactionDocument.destination_partner == partner_id)
        )

    docs = q.offset(skip).limit(limit).all()
    return [_doc_shape(d) for d in docs]


@router.get("/transactions/grouped")
def list_grouped(limit: int = 40, partner_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(TransactionDocument).order_by(desc(TransactionDocument.created_at))
    if partner_id:
        q = q.filter(
            (TransactionDocument.source_partner == partner_id) |
            (TransactionDocument.destination_partner == partner_id)
        )
    docs = q.limit(limit).all()
    return [_group_shape(d) for d in docs]


def _group_shape(doc: TransactionDocument) -> dict:
    """Shape expected by ActivityGroupedTable in the new frontend."""
    base = _doc_shape(doc)
    direction = base["direction"]  # "Inbound" | "Outbound"
    canonical = doc.canonical_event or {}

    document_number = (
        canonical.get("document_number")
        or canonical.get("po_number")
        or canonical.get("invoice_number")
        or canonical.get("shipment_id")
        or ""
    )

    sender_name = doc.source_partner or ""
    receiver_name = doc.destination_partner or ""

    return {
        **base,
        # Group-level fields for ActivityGroupedTable
        "group_id": doc.id,
        "root_document_id": doc.id,
        "flow_label": base["file_name"],
        "document_number": document_number,
        "received_at": base["created_at"],
        "sender_name": sender_name,
        "receiver_name": receiver_name,
        "doc_type": base["document_type"],
        "partner_name": sender_name if direction == "Inbound" else receiver_name,
        "partner_code": sender_name if direction == "Inbound" else receiver_name,
        "partner_validation_status": "VALID",
        "children": [],
        "root": base,   # ActivityGroupedTable reads root.status for the status badge
    }


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}")
def get_document(doc_id: str, viewer_role: Optional[str] = None, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_shape(doc)


@router.get("/documents/{doc_id}/raw-input")
def get_raw_input(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "content": doc.raw_document or "",
        "raw_document": doc.raw_document or "",
        "raw_edi": doc.raw_document or "",
        "source_format": doc.source_format,
    }


@router.get("/documents/{doc_id}/generated-x12")
def get_generated_x12(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"edi_output": doc.edi_output or ""}


# ── Upload (multipart) ────────────────────────────────────────────────────────

def _is_outbound_json(raw: str) -> bool:
    """Detect if content is a JSON outbound document (PO to convert to X12)."""
    stripped = raw.strip()
    if not stripped.startswith("{"):
        return False
    try:
        data = json.loads(stripped)
        # Only true if:
        # - Has po_number AND
        # - Does NOT have inbound-specific fields (shipment_id, invoice_number, receipt_date, etc.)
        has_po = "po_number" in data or "purchase_order" in data
        has_inbound_fields = any(k in data for k in ["shipment_id", "invoice_number", "receipt_date", "tracking_number", "asn_number"])

        # It's outbound PO only if it has PO fields but NOT inbound-specific fields
        return has_po and not has_inbound_fields
    except Exception:
        return False


_OUTBOUND_STATE_BASE = lambda doc_id, raw, src, dst: {
    "document_id": doc_id, "raw_document": raw,
    "source_format": "", "transaction_type": "",
    "source_partner": src, "destination_partner": dst,
    "relationship_type": "", "direction": "OUTBOUND",
    "parsed_data": {}, "canonical_event": {}, "mapped_payload": {},
    "validation_errors": [], "confidence_score": 0.0,
    "mapping_explanations": [], "unmapped_fields": [],
    "current_skill": "", "completed_skills": [],
    "hitl_required": False, "hitl_corrections": {},
    "final_status": "IN_PROGRESS", "error": "", "edi_output": "",
    "partner_isa_qualifier": "ZZ", "partner_isa_id": "",
    "partner_gs_id": "", "partner_edi_version": "005010",
    "our_isa_qualifier": "ZZ", "our_isa_id": "AGENTEDDY      ",
    "our_gs_id": "AGENTEDDY", "partner_profile": {},
}

_INBOUND_STATE_BASE = lambda doc_id, raw, src, dst: {
    **_OUTBOUND_STATE_BASE(doc_id, raw, src, dst),
    "direction": "",
}


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    source_partner: str = Form(""),
    destination_partner: str = Form(""),
    direction: str = Form(""),
    db: Session = Depends(get_db),
):
    from app.orchestrator.graph import workflow
    from app.orchestrator.outbound_graph import outbound_workflow

    raw = (await file.read()).decode("utf-8", errors="replace")
    document_id = str(uuid.uuid4())

    # Auto-detect: JSON with PO/Invoice/ASN keys → outbound pipeline
    is_outbound = direction.upper() == "OUTBOUND" or (not direction and _is_outbound_json(raw))

    if is_outbound:
        state = _OUTBOUND_STATE_BASE(document_id, raw, source_partner, destination_partner)
        result = await outbound_workflow.ainvoke(state)
        final_direction = "OUTBOUND"
    else:
        state = _INBOUND_STATE_BASE(document_id, raw, source_partner, destination_partner)
        result = await workflow.ainvoke(state)
        final_direction = "INBOUND"

    log.info(f"[document_routes] DEBUG result tokens: prompt={result.get('prompt_tokens')}, completion={result.get('completion_tokens')}, total={result.get('total_tokens')}, calls={result.get('llm_call_count')}")

    doc = TransactionDocument(
        id=document_id,
        raw_document=raw,
        source_format=result.get("source_format"),
        transaction_type=result.get("transaction_type"),
        source_partner=source_partner or result.get("source_partner"),
        destination_partner=destination_partner or result.get("destination_partner"),
        direction=final_direction,
        canonical_event=result.get("canonical_event"),
        mapped_payload=result.get("mapped_payload"),
        confidence_score=result.get("confidence_score"),
        mapping_explanations=result.get("mapping_explanations"),
        unmapped_fields=result.get("unmapped_fields"),
        validation_errors=result.get("validation_errors"),
        hitl_required=result.get("hitl_required", False),
        edi_output=result.get("edi_output"),
        final_status=result.get("final_status", "COMPLETED"),
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
        total_tokens=result.get("total_tokens", 0),
        llm_call_count=result.get("llm_call_count", 0),
    )
    db.add(doc)
    db.commit()

    # Auto-link invoices to POs, set SLA deadlines
    _auto_link_and_sla(doc, db)

    # Correlate document to BusinessTransaction (auto-linking multi-doc transactions)
    with open("/tmp/correlation_debug.log", "a") as f:
        f.write(f"[{datetime.now(timezone.utc)}] Starting correlation for {document_id[:12]}...\n")

    try:
        transaction, corr_result = correlation_service.correlate_document(doc, db)
        with open("/tmp/correlation_debug.log", "a") as f:
            if transaction:
                f.write(f"[{datetime.now(timezone.utc)}] ✅ Correlated to {transaction.transaction_id}\n")
                log.info(f"[document_routes] ✅ Document correlated: {corr_result['message']}")
            else:
                f.write(f"[{datetime.now(timezone.utc)}] ⚠️ No transaction: {corr_result['message']}\n")
                log.warning(f"[document_routes] ⚠️ No transaction created: {corr_result['message']}")
    except Exception as e:
        with open("/tmp/correlation_debug.log", "a") as f:
            f.write(f"[{datetime.now(timezone.utc)}] ❌ ERROR: {type(e).__name__}: {str(e)}\n")
        log.error(f"[document_routes] ❌ Correlation FAILED: {type(e).__name__}: {str(e)}", exc_info=True)

    return _doc_shape(doc)


@router.post("/documents/validate-partner")
def validate_partner(body: dict):
    return {"valid": True, "partner": None}


# ── Review / corrections ──────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/review")
def get_review(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    errors = doc.validation_errors or []
    suggestions = [
        {"field": e, "message": e, "severity": "error", "auto_fixable": False}
        for e in errors
    ]
    return {
        "document_id": doc_id,
        "document": _doc_shape(doc),   # full doc shape the detail page expects
        "suggestions": suggestions,
        "ai_corrections": [],
        "corrections_resolved": False,
        "exceptions": [],
        "partner": None,
        "parsed_segments": [],
    }


@router.get("/documents/{doc_id}/review/ai-suggestions")
def get_ai_suggestions(doc_id: str):
    return {"ai_corrections": [], "ready": True}


@router.post("/documents/{doc_id}/review/apply")
def apply_review_correction(doc_id: str, body: dict, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document_id": doc_id, "applied": True}


@router.patch("/documents/{doc_id}/canonical")
def patch_canonical(doc_id: str, body: dict, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    canonical = dict(doc.canonical_event or {})
    edits = body.get("edits", [])
    for edit in edits:
        field = edit.get("field")
        value = edit.get("value")
        if field:
            canonical[field] = value

    header = body.get("header") or {}
    if header:
        # Standard flat fields
        for key in ("po_number", "order_date", "document_number", "document_date",
                    "invoice_number", "shipment_id"):
            if header.get(key):
                canonical[key] = header[key]

        # vendor_id → update seller party id + mapped_payload
        if header.get("vendor_id"):
            parties = canonical.get("parties") or []
            for p in parties:
                if p.get("role") in ("seller", "supplier"):
                    p["id"] = header["vendor_id"]
            canonical["parties"] = parties
            mp = dict(doc.mapped_payload or {})
            mp["vendor_id"] = header["vendor_id"]
            doc.mapped_payload = mp

        # customer_id → update buyer party id + mapped_payload
        if header.get("customer_id"):
            parties = canonical.get("parties") or []
            for p in parties:
                if p.get("role") == "buyer":
                    p["id"] = header["customer_id"]
            canonical["parties"] = parties
            mp = dict(doc.mapped_payload or {})
            mp["customer_id"] = header["customer_id"]
            doc.mapped_payload = mp

    doc.canonical_event = canonical

    # Re-validate after edits to compute blockers
    validation_errors = _validate_mapped_payload(doc.mapped_payload or {}, doc.transaction_type or "")
    doc.validation_errors = validation_errors
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    shape = _doc_shape(doc)
    return {
        **shape,
        "success": True,
        "message": "Header saved",
        "canonical_json": canonical,
        "canonical_approve_blockers": validation_errors,
    }


@router.post("/documents/{doc_id}/approve")
def approve_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.final_status = "APPROVED"
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {
        **_doc_shape(doc),
        "success": True,
        "message": "Document approved — ready for dispatch",
    }


@router.post("/documents/{doc_id}/reject")
def reject_document(doc_id: str, body: dict = {}, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.final_status = "REJECTED"
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {
        **_doc_shape(doc),
        "success": True,
        "message": "Document rejected",
    }


@router.post("/documents/{doc_id}/dispatch-outbound")
def dispatch_outbound(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.final_status = "COMPLETED"
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"document_id": doc_id, "dispatched": True}


@router.post("/documents/{doc_id}/reprocess")
async def reprocess_document(doc_id: str, db: Session = Depends(get_db)):
    from app.orchestrator.graph import workflow
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    initial_state = {
        "document_id": doc_id,
        "raw_document": doc.raw_document,
        "source_format": "",
        "transaction_type": "",
        "source_partner": doc.source_partner or "",
        "destination_partner": doc.destination_partner or "",
        "relationship_type": "",
        "direction": "",
        "parsed_data": {},
        "canonical_event": {},
        "mapped_payload": {},
        "validation_errors": [],
        "confidence_score": 0.0,
        "mapping_explanations": [],
        "unmapped_fields": [],
        "current_skill": "",
        "completed_skills": [],
        "hitl_required": False,
        "hitl_corrections": {},
        "final_status": "IN_PROGRESS",
        "error": "",
        "edi_output": "",
    }
    result = await workflow.ainvoke(initial_state)
    doc.source_format = result.get("source_format")
    doc.transaction_type = result.get("transaction_type")
    doc.canonical_event = result.get("canonical_event")
    doc.mapped_payload = result.get("mapped_payload")
    doc.confidence_score = result.get("confidence_score")
    doc.mapping_explanations = result.get("mapping_explanations")
    doc.unmapped_fields = result.get("unmapped_fields")
    doc.validation_errors = result.get("validation_errors")
    doc.hitl_required = result.get("hitl_required", False)
    doc.final_status = result.get("final_status", "COMPLETED")
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _doc_shape(doc)


@router.post("/documents/{doc_id}/create-outbound")
async def create_outbound_from_inbound(doc_id: str, db: Session = Depends(get_db)):
    import asyncio
    from app.orchestrator.outbound_graph import outbound_workflow

    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check if a valid (non-stale) outbound already exists
    existing_outbound_id = (doc.hitl_corrections or {}).get("outbound_transaction_id")
    if existing_outbound_id:
        existing = db.query(TransactionDocument).filter(TransactionDocument.id == existing_outbound_id).first()
        if existing and existing.final_status not in ("IN_PROGRESS", None):
            return {"success": True, "outbound_id": existing_outbound_id, "already_exists": True,
                    "message": "Outbound already exists for this document."}

    # Build raw payload from canonical event
    canonical = doc.canonical_event or {}
    parties = canonical.get("parties") or []
    totals = canonical.get("totals") or {}

    # Extract buyer/supplier — prefer flat fields, fall back to parties array
    buyer = canonical.get("buyer") or next((p["name"] for p in parties if p.get("role") == "buyer"), "") or doc.source_partner or ""
    supplier = canonical.get("supplier") or next((p["name"] for p in parties if p.get("role") == "seller"), "") or doc.destination_partner or ""

    # Document number — try all possible fields
    doc_number = (canonical.get("po_number") or canonical.get("document_number") or
                  canonical.get("invoice_number") or canonical.get("shipment_id") or "")

    tx_type = doc.transaction_type or "PURCHASE_ORDER"
    payload: dict = {
        "buyer": buyer,
        "supplier": supplier,
        "document_date": canonical.get("document_date") or "",
        "items": canonical.get("items") or [],
        "total_amount": totals.get("grand_total") or canonical.get("total_amount") or 0,
        "currency": totals.get("currency") or canonical.get("currency") or "USD",
    }
    if tx_type == "INVOICE":
        payload["invoice_number"] = doc_number
    elif tx_type == "SHIPMENT_NOTICE":
        payload["shipment_id"] = doc_number
        payload["ship_date"] = canonical.get("ship_date") or ""
    else:
        payload["po_number"] = doc_number

    if not doc_number:
        raise HTTPException(status_code=422, detail="Cannot create outbound: inbound document has no document number. Ensure the document was fully processed first.")

    raw_payload = json.dumps(payload)

    # Create outbound doc immediately with IN_PROGRESS so modal can start polling
    outbound_id = str(uuid.uuid4())
    outbound_doc = TransactionDocument(
        id=outbound_id,
        raw_document=raw_payload,
        source_format="JSON",
        transaction_type=doc.transaction_type,
        source_partner=doc.destination_partner,
        destination_partner=doc.source_partner,
        direction="OUTBOUND",
        final_status="IN_PROGRESS",
    )
    db.add(outbound_doc)
    doc.hitl_corrections = {**(doc.hitl_corrections or {}), "outbound_transaction_id": outbound_id}
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Run pipeline in background — modal polls until status changes from IN_PROGRESS
    async def _run_pipeline():
        from app.db.session import SessionLocal as _Session
        state = {**_OUTBOUND_STATE_BASE(outbound_id, raw_payload,
                                         doc.destination_partner or "", doc.source_partner or "")}
        result = await outbound_workflow.ainvoke(state)
        _db = _Session()
        try:
            _doc = _db.query(TransactionDocument).filter(TransactionDocument.id == outbound_id).first()
            if _doc:
                _doc.edi_output = result.get("edi_output")
                _doc.transaction_type = result.get("transaction_type") or doc.transaction_type
                _doc.source_partner = result.get("source_partner") or doc.destination_partner
                _doc.destination_partner = result.get("destination_partner") or doc.source_partner
                _doc.validation_errors = result.get("validation_errors")
                _doc.confidence_score = result.get("confidence_score", 1.0)
                _doc.final_status = result.get("final_status", "COMPLETED")
                _doc.prompt_tokens = result.get("prompt_tokens", 0)
                _doc.completion_tokens = result.get("completion_tokens", 0)
                _doc.total_tokens = result.get("total_tokens", 0)
                _doc.llm_call_count = result.get("llm_call_count", 0)
                _doc.updated_at = datetime.now(timezone.utc)
                _db.commit()
        finally:
            _db.close()

    asyncio.create_task(_run_pipeline())

    return {"success": True, "outbound_id": outbound_id, "already_exists": False,
            "message": f"Outbound pipeline started — doc {outbound_id[:8]}"}


@router.post("/documents/{doc_id}/generate-canonical")
def generate_canonical(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_shape(doc)


@router.post("/documents/{doc_id}/generate-x12")
async def generate_x12_for_doc(doc_id: str, db: Session = Depends(get_db)):
    from app.orchestrator.outbound_graph import outbound_workflow
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # If EDI already exists, return it
    if doc.edi_output:
        return {
            "document_id": doc_id,
            "edi_content": doc.edi_output,
            "edi_output": doc.edi_output,
            "status": "generated",
            "outbound_format": "X12",
            "document_status": "Ready for Dispatch",
        }

    # Generate X12 from canonical event via outbound pipeline
    canonical = doc.canonical_event or {}
    raw_payload = json.dumps({
        "po_number": canonical.get("po_number") or canonical.get("document_number") or "",
        "invoice_number": canonical.get("invoice_number") or "",
        "shipment_id": canonical.get("shipment_id") or "",
        "buyer": canonical.get("buyer") or "",
        "supplier": canonical.get("supplier") or "",
        "document_date": canonical.get("document_date") or "",
        "items": canonical.get("items") or [],
        "total_amount": (canonical.get("totals") or {}).get("grand_total") or canonical.get("total_amount") or 0,
        "currency": (canonical.get("totals") or {}).get("currency") or "USD",
    })

    state = {**_OUTBOUND_STATE_BASE(doc_id, raw_payload,
                                     doc.source_partner or "", doc.destination_partner or "")}
    result = await outbound_workflow.ainvoke(state)
    edi = result.get("edi_output") or ""
    if edi:
        doc.edi_output = edi
        doc.final_status = "APPROVED"
        doc.prompt_tokens = result.get("prompt_tokens", 0)
        doc.completion_tokens = result.get("completion_tokens", 0)
        doc.total_tokens = result.get("total_tokens", 0)
        doc.llm_call_count = result.get("llm_call_count", 0)
        doc.updated_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "document_id": doc_id,
        "edi_content": edi,
        "edi_output": edi,
        "status": "generated" if edi else "failed",
        "outbound_format": "X12",
        "document_status": "Ready for Dispatch" if edi else doc.final_status,
    }


@router.post("/documents/{doc_id}/generate-source-structure")
def generate_source_structure(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document_id": doc_id, "field_mappings": [], "ai_corrections": []}


@router.post("/documents/{doc_id}/set-corrections-resolved")
def set_corrections_resolved(doc_id: str, body: dict, db: Session = Depends(get_db)):
    return {"document_id": doc_id, "resolved": body.get("resolved", True)}


@router.post("/ingestion/generate-x12")
def generate_x12_from_canonical(body: dict):
    return {"edi_output": "", "message": "Use /api/v1/outbound for X12 generation"}


# ── Related documents & transaction data ──────────────────────────────────────

@router.get("/documents/{doc_id}/related")
def get_related_documents(doc_id: str, db: Session = Depends(get_db)):
    """Get transaction details and related documents for a document."""
    from app.db.models import BusinessTransaction, TransactionDocumentLink

    doc = db.query(TransactionDocument).filter(TransactionDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    linked_document = None

    if doc.business_transaction_id:
        # Get all linked documents for this transaction
        links = db.query(TransactionDocumentLink).filter(
            TransactionDocumentLink.business_transaction_id == doc.business_transaction_id
        ).all()

        # Find first related document (not this one)
        for link in links:
            if link.transaction_document_id != doc_id:
                related_doc = db.query(TransactionDocument).filter(
                    TransactionDocument.id == link.transaction_document_id
                ).first()
                if related_doc:
                    linked_document = {
                        "id": related_doc.id,
                        "transaction_type": related_doc.transaction_type,
                        "status": related_doc.final_status,
                    }
                    break

    # Calculate SLA status
    now = datetime.now(timezone.utc)
    sla_status = None
    sla_deadline = None
    if doc.expected_dispatch_by:
        sla_deadline = doc.expected_dispatch_by.isoformat()
        if doc.final_status in ("COMPLETED", "APPROVED", "Ready for Dispatch", "Dispatched", "Delivered"):
            sla_status = "MET"
        elif now > doc.expected_dispatch_by:
            sla_status = "BREACHED"
        else:
            remaining_hours = (doc.expected_dispatch_by - now).total_seconds() / 3600
            sla_status = "AT_RISK" if remaining_hours < 2 else "ON_TIME"

    return {
        "document_id": doc_id,
        "linked_document": linked_document,
        "sla": {
            "status": sla_status,
            "deadline": sla_deadline,
            "hours_allocated": doc.sla_hours,
        } if sla_status else None,
        "item_match": {
            "status": doc.item_match_status or "NA",
            "discrepancies": doc.item_discrepancies or [],
        },
    }


# ── Corrections learning loop ─────────────────────────────────────────────────

@router.post("/corrections")
def create_correction(body: dict):
    return {"id": str(uuid.uuid4()), **body}

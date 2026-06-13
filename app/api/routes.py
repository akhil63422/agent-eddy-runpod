import uuid
import time
from typing import Any
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import TransactionDocument, PartnerProfile
from app.orchestrator.graph import workflow
from app.orchestrator.outbound_graph import outbound_workflow
from app.core.logger import get_logger
from app.services.correlation_service import correlation_service

log = get_logger("api")
router = APIRouter()


# ── Helper functions for PO-Invoice linking and SLA tracking ─────────────────

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


# ── Request / Response models ─────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    raw_document: str


class OutboundRequest(BaseModel):
    raw_document: str
    source_partner: str = ""
    destination_partner: str = ""


class HitlCorrectionRequest(BaseModel):
    corrected_payload: dict[str, Any]
    reviewer_notes: str = ""


# ── Shared helpers ────────────────────────────────────────────────────────────

def _base_state(document_id: str, raw_document: str) -> dict:
    return {
        "document_id": document_id,
        "raw_document": raw_document,
        "source_format": "",
        "transaction_type": "",
        "source_partner": "",
        "destination_partner": "",
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
        "partner_isa_qualifier": "ZZ",
        "partner_isa_id": "",
        "partner_gs_id": "",
        "partner_edi_version": "005010",
        "our_isa_qualifier": "ZZ",
        "our_isa_id": "AGENTEDDY",
        "our_gs_id": "AGENTEDDY",
        "partner_profile": {},
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "llm_call_count": 0,
    }


# ── Inbound: X12 / JSON / CSV / Email → canonical + ERP payload ───────────────

@router.post("/inbound", summary="Inbound: translate EDI/document to canonical JSON + ERP payload")
async def process_inbound(body: ProcessRequest, db: Session = Depends(get_db)):
    document_id = str(uuid.uuid4())
    t0 = time.time()
    log.info("──────────────────────────────────────────")
    log.info(f"[api] INBOUND  doc_id={document_id}  raw_length={len(body.raw_document)}")

    initial_state = _base_state(document_id, body.raw_document)
    result = await workflow.ainvoke(initial_state)
    elapsed = round((time.time() - t0) * 1000)
    log.info(f"[api] INBOUND DONE  status={result.get('final_status')}  elapsed={elapsed}ms")
    log.info(f"[api] DEBUG result has keys: {[k for k in result.keys() if 'token' in k.lower() or 'llm_call' in k.lower()]}")
    log.info(f"[api] DEBUG prompt_tokens={result.get('prompt_tokens')}, completion={result.get('completion_tokens')}, total={result.get('total_tokens')}, calls={result.get('llm_call_count')}")
    log.info("──────────────────────────────────────────")

    doc = TransactionDocument(
        id=document_id,
        raw_document=body.raw_document,
        source_format=result.get("source_format"),
        transaction_type=result.get("transaction_type"),
        source_partner=result.get("source_partner"),
        destination_partner=result.get("destination_partner"),
        relationship_type=result.get("relationship_type"),
        direction=result.get("direction"),
        canonical_event=result.get("canonical_event"),
        mapped_payload=result.get("mapped_payload"),
        confidence_score=result.get("confidence_score"),
        mapping_explanations=result.get("mapping_explanations"),
        unmapped_fields=result.get("unmapped_fields"),
        validation_errors=result.get("validation_errors"),
        hitl_required=result.get("hitl_required", False),
        final_status=result.get("final_status", "COMPLETED"),
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
        total_tokens=result.get("total_tokens", 0),
        llm_call_count=result.get("llm_call_count", 0),
    )
    db.add(doc)
    db.commit()

    try:
        _auto_link_and_sla(doc, db)
        log.info(f"[api] auto_link_and_sla completed for doc {document_id}")
    except Exception as e:
        log.error(f"[api] auto_link_and_sla failed: {str(e)}", exc_info=True)

    # NEW: Correlate document to BusinessTransaction
    try:
        transaction, corr_result = correlation_service.correlate_document(doc, db)
        log.info(f"[api] Document correlated: {corr_result['message']}")
    except Exception as e:
        log.error(f"[api] Correlation failed: {str(e)}", exc_info=True)

    return {
        "document_id": document_id,
        "final_status": result.get("final_status"),
        "transaction_type": result.get("transaction_type"),
        "source_format": result.get("source_format"),
        "source_partner": result.get("source_partner"),
        "destination_partner": result.get("destination_partner"),
        "confidence_score": result.get("confidence_score"),
        "canonical_event": result.get("canonical_event"),
        "mapped_payload": result.get("mapped_payload"),
        "mapping_explanations": result.get("mapping_explanations"),
        "unmapped_fields": result.get("unmapped_fields"),
        "validation_errors": result.get("validation_errors"),
        "hitl_required": result.get("hitl_required"),
        "completed_skills": result.get("completed_skills"),
    }


# ── Outbound: JSON PO → X12 850 EDI ──────────────────────────────────────────

@router.post("/outbound", summary="Outbound: translate JSON PO to X12 850 EDI")
async def process_outbound(body: OutboundRequest, db: Session = Depends(get_db)):
    document_id = str(uuid.uuid4())
    t0 = time.time()
    log.info("──────────────────────────────────────────")
    log.info(f"[api] OUTBOUND  doc_id={document_id}  raw_length={len(body.raw_document)}")

    initial_state = {
        **_base_state(document_id, body.raw_document),
        "direction": "OUTBOUND",
        "source_partner": body.source_partner,
        "destination_partner": body.destination_partner,
    }
    result = await outbound_workflow.ainvoke(initial_state)
    elapsed = round((time.time() - t0) * 1000)
    log.info(f"[api] OUTBOUND DONE  status={result.get('final_status')}  elapsed={elapsed}ms")
    log.info("──────────────────────────────────────────")

    doc = TransactionDocument(
        id=document_id,
        raw_document=body.raw_document,
        source_format=result.get("source_format"),
        transaction_type=result.get("transaction_type"),
        source_partner=result.get("source_partner"),
        destination_partner=result.get("destination_partner"),
        direction="OUTBOUND",
        validation_errors=result.get("validation_errors"),
        edi_output=result.get("edi_output"),
        final_status=result.get("final_status", "COMPLETED"),
        prompt_tokens=result.get("prompt_tokens", 0),
        completion_tokens=result.get("completion_tokens", 0),
        total_tokens=result.get("total_tokens", 0),
        llm_call_count=result.get("llm_call_count", 0),
    )
    db.add(doc)
    db.commit()

    try:
        _auto_link_and_sla(doc, db)
        log.info(f"[api] auto_link_and_sla completed for doc {document_id}")
    except Exception as e:
        log.error(f"[api] auto_link_and_sla failed: {str(e)}", exc_info=True)

    # NEW: Correlate document to BusinessTransaction
    try:
        transaction, corr_result = correlation_service.correlate_document(doc, db)
        log.info(f"[api] Document correlated: {corr_result['message']}")
    except Exception as e:
        log.error(f"[api] Correlation failed: {str(e)}", exc_info=True)

    return {
        "document_id": document_id,
        "final_status": result.get("final_status"),
        "transaction_type": result.get("transaction_type"),
        "source_partner": result.get("source_partner"),
        "destination_partner": result.get("destination_partner"),
        "edi_output": result.get("edi_output"),
        "validation_errors": result.get("validation_errors"),
        "completed_skills": result.get("completed_skills"),
    }


# ── Legacy alias (backward compat) ────────────────────────────────────────────

@router.post("/process", summary="[deprecated] use /inbound", include_in_schema=False)
async def process_document(body: ProcessRequest, db: Session = Depends(get_db)):
    return await process_inbound(body, db)


# ── Document retrieval + HITL correction ─────────────────────────────────────

@router.get("/document/{document_id}", summary="Retrieve a processed document")
def get_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/document/{document_id}/correct", summary="Submit human correction for a HITL document")
def apply_correction(document_id: str, body: HitlCorrectionRequest, db: Session = Depends(get_db)):
    doc = db.query(TransactionDocument).filter(TransactionDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.hitl_required:
        raise HTTPException(status_code=400, detail="Document does not require HITL correction")

    doc.mapped_payload = body.corrected_payload
    doc.hitl_corrections = {
        "corrected_payload": body.corrected_payload,
        "reviewer_notes": body.reviewer_notes,
    }
    doc.hitl_required = False
    doc.final_status = "COMPLETED"
    db.commit()

    return {"document_id": document_id, "final_status": "COMPLETED"}

"""Transaction-related API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from app.db.session import get_db
from app.db.models import (
    BusinessTransaction,
    TransactionDocumentLink,
    TransactionTimeline,
    TransactionDocument,
)
from app.core.logger import get_logger

log = get_logger("transaction_routes")
router = APIRouter(tags=["transactions"])


# ============================================================================
# Response Models (Pydantic schemas)
# ============================================================================

class TransactionTimelineResponse:
    """Timeline event response."""
    def __init__(self, event):
        self.id = event.id
        self.event_type = event.event_type
        self.event_description = event.event_description
        self.source_document_id = event.source_document_id
        self.status_before = event.status_before
        self.status_after = event.status_after
        self.metadata = event.metadata
        self.created_at = event.created_at.isoformat() if event.created_at else None


class TransactionDocumentLinkResponse:
    """Document link response."""
    def __init__(self, link, doc=None):
        self.id = link.id
        self.transaction_document_id = link.transaction_document_id
        self.document_role = link.document_role
        self.correlation_key = link.correlation_key
        self.confidence = link.confidence
        self.validation_status = link.validation_status
        self.validation_errors = link.validation_errors
        self.created_at = link.created_at.isoformat() if link.created_at else None
        # Include linked document summary if available
        if doc:
            self.document = {
                "id": doc.id,
                "transaction_type": doc.transaction_type,
                "source_partner": doc.source_partner,
                "destination_partner": doc.destination_partner,
                "document_reference_number": doc.document_reference_number,
                "final_status": doc.final_status,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            }


class TransactionResponse:
    """Business transaction response."""
    def __init__(self, transaction, include_links=False, include_timeline=False):
        self.id = transaction.id
        self.transaction_id = transaction.transaction_id
        self.po_number = transaction.po_number
        self.order_number = transaction.order_number
        self.reference_number = transaction.reference_number
        self.buyer = transaction.buyer
        self.supplier = transaction.supplier
        self.status = transaction.status
        self.po_count = transaction.po_count
        self.asn_count = transaction.asn_count
        self.invoice_count = transaction.invoice_count
        self.correlation_confidence = transaction.correlation_confidence
        self.ship_by_date = transaction.ship_by_date.isoformat() if transaction.ship_by_date else None
        self.expected_delivery_date = (
            transaction.expected_delivery_date.isoformat()
            if transaction.expected_delivery_date else None
        )
        self.dispatch_deadline = (
            transaction.dispatch_deadline.isoformat()
            if transaction.dispatch_deadline else None
        )
        self.metadata = transaction.metadata
        self.created_at = transaction.created_at.isoformat() if transaction.created_at else None
        self.updated_at = transaction.updated_at.isoformat() if transaction.updated_at else None

        # Optional nested data
        self.links = [] if include_links else None
        self.timeline = [] if include_timeline else None


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/transactions/{transaction_id}")
def get_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    include_links: bool = Query(True),
    include_timeline: bool = Query(True),
):
    """Get transaction by transaction_id with optional nested data."""
    transaction = db.query(BusinessTransaction).filter(
        BusinessTransaction.transaction_id == transaction_id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Build response
    resp = TransactionResponse(
        transaction,
        include_links=include_links,
        include_timeline=include_timeline,
    )

    # Fetch links if requested
    if include_links:
        links = db.query(TransactionDocumentLink).filter(
            TransactionDocumentLink.business_transaction_id == transaction.id
        ).all()
        resp.links = []
        for link in links:
            doc = db.query(TransactionDocument).filter(
                TransactionDocument.id == link.transaction_document_id
            ).first()
            resp.links.append(TransactionDocumentLinkResponse(link, doc).__dict__)

    # Fetch timeline if requested
    if include_timeline:
        events = db.query(TransactionTimeline).filter(
            TransactionTimeline.business_transaction_id == transaction.id
        ).order_by(TransactionTimeline.created_at.asc()).all()
        resp.timeline = [TransactionTimelineResponse(e).__dict__ for e in events]

    return resp.__dict__


@router.get("/transactions/{transaction_id}/timeline")
def get_transaction_timeline(
    transaction_id: str,
    db: Session = Depends(get_db),
):
    """Get timeline events for a transaction."""
    transaction = db.query(BusinessTransaction).filter(
        BusinessTransaction.transaction_id == transaction_id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    events = db.query(TransactionTimeline).filter(
        TransactionTimeline.business_transaction_id == transaction.id
    ).order_by(TransactionTimeline.created_at.asc()).all()

    return {
        "transaction_id": transaction_id,
        "event_count": len(events),
        "events": [TransactionTimelineResponse(e).__dict__ for e in events],
    }


@router.get("/transactions/{transaction_id}/documents")
def get_transaction_documents(
    transaction_id: str,
    db: Session = Depends(get_db),
):
    """Get all documents linked to a transaction."""
    transaction = db.query(BusinessTransaction).filter(
        BusinessTransaction.transaction_id == transaction_id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    links = db.query(TransactionDocumentLink).filter(
        TransactionDocumentLink.business_transaction_id == transaction.id
    ).all()

    documents = []
    for link in links:
        doc = db.query(TransactionDocument).filter(
            TransactionDocument.id == link.transaction_document_id
        ).first()
        if doc:
            documents.append({
                "link_id": link.id,
                "document_id": doc.id,
                "document_type": doc.transaction_type,
                "document_role": link.document_role,
                "reference_number": doc.document_reference_number,
                "source_partner": doc.source_partner,
                "destination_partner": doc.destination_partner,
                "validation_status": link.validation_status,
                "validation_errors": link.validation_errors,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            })

    return {
        "transaction_id": transaction_id,
        "document_count": len(documents),
        "documents": documents,
    }


@router.get("/transactions")
def list_transactions(
    po_number: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """List transactions with optional filters."""
    query = db.query(BusinessTransaction)

    if po_number:
        query = query.filter(BusinessTransaction.po_number == po_number)
    if status:
        query = query.filter(BusinessTransaction.status == status)
    if supplier:
        query = query.filter(BusinessTransaction.supplier == supplier)

    total = query.count()
    transactions = query.order_by(
        BusinessTransaction.created_at.desc()
    ).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "transactions": [TransactionResponse(t).__dict__ for t in transactions],
    }


@router.get("/documents/{doc_id}/transaction")
def get_document_transaction(
    doc_id: str,
    db: Session = Depends(get_db),
):
    """Get the transaction associated with a document."""
    doc = db.query(TransactionDocument).filter(
        TransactionDocument.id == doc_id
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.business_transaction_id:
        return {
            "document_id": doc_id,
            "transaction": None,
            "message": "Document not yet correlated to a transaction",
        }

    transaction = db.query(BusinessTransaction).filter(
        BusinessTransaction.id == doc.business_transaction_id
    ).first()

    return {
        "document_id": doc_id,
        "transaction": TransactionResponse(transaction).__dict__ if transaction else None,
    }

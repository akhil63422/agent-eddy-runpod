# Updated Database Models for Transaction Correlation Refactor
# File: app/db/models.py (additions and modifications)

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, Boolean, DateTime, JSON, Text, UniqueConstraint, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _now():
    return datetime.now(timezone.utc)


# ============================================================================
# NEW: BusinessTransaction Entity
# ============================================================================

class BusinessTransaction(Base):
    """
    Central entity for grouping related documents in a supply chain transaction.

    One BusinessTransaction owns:
    - 1 Purchase Order
    - N ASNs/Shipment Notices
    - N Invoices

    Correlation happens via po_number (primary) or order_number/reference_number (secondary).
    """
    __tablename__ = "business_transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Unique transaction identifier (immutable)
    transaction_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # ─── Correlation Keys (indexed for fast lookup) ───────────────────────
    # Primary: po_number (required)
    po_number: Mapped[str] = mapped_column(String(128), index=True, nullable=False)

    # Secondary: order_number (alternative correlation)
    order_number: Mapped[str] = mapped_column(String(128), index=True, nullable=True)

    # Tertiary: reference_number (fallback correlation)
    reference_number: Mapped[str] = mapped_column(String(128), index=True, nullable=True)

    # ─── Parties Involved ──────────────────────────────────────────────────
    buyer: Mapped[str] = mapped_column(String(256), nullable=True)
    supplier: Mapped[str] = mapped_column(String(256), nullable=True)

    # ─── Transaction Lifecycle Status ──────────────────────────────────────
    status: Mapped[str] = mapped_column(String(32), default="CREATED", index=True)
    # CREATED → PO_RECEIVED → ASN_RECEIVED → PARTIALLY_SHIPPED →
    # FULLY_SHIPPED → INVOICE_RECEIVED → COMPLETED

    # ─── Document Counters (for quick status assessment) ──────────────────
    po_count: Mapped[int] = mapped_column(Integer, default=0)
    asn_count: Mapped[int] = mapped_column(Integer, default=0)
    invoice_count: Mapped[int] = mapped_column(Integer, default=0)

    # ─── Correlation Confidence ───────────────────────────────────────────
    # 1.0 = exact match, < 1.0 = fuzzy match (for future use)
    correlation_confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # ─── SLA Preparation (fields only, logic not yet implemented) ──────────
    ship_by_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatch_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # ─── Metadata & Timestamps ────────────────────────────────────────────
    metadata: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ============================================================================
# NEW: TransactionDocumentLink Entity
# ============================================================================

class TransactionDocumentLink(Base):
    """
    Links a TransactionDocument to a BusinessTransaction.
    Tracks which correlation key was used and validation results.
    """
    __tablename__ = "transaction_document_links"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Foreign keys
    business_transaction_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("business_transactions.id"),
        index=True,
        nullable=False
    )
    transaction_document_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("transaction_documents.id"),
        index=True,
        nullable=False
    )

    # ─── Document Role in Transaction ─────────────────────────────────────
    document_role: Mapped[str] = mapped_column(String(32), nullable=False)
    # PURCHASE_ORDER, ASN, INVOICE

    # ─── Correlation Details ──────────────────────────────────────────────
    # Which key was used to link this document?
    correlation_key: Mapped[str] = mapped_column(String(32), nullable=True)
    # po_number, order_number, reference_number

    # Confidence score (1.0 = exact match, < 1.0 = fuzzy match)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # ─── Validation Results ───────────────────────────────────────────────
    validation_status: Mapped[str] = mapped_column(String(32), nullable=True)
    # VALID, QUANTITY_MISMATCH, AMOUNT_MISMATCH, MISSING_FIELDS, UNKNOWN_ITEM, etc.

    validation_errors: Mapped[list] = mapped_column(JSON, nullable=True)
    # [{"type": "QTY_MISMATCH", "details": "..."}]

    # ─── Timestamps ───────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ============================================================================
# NEW: TransactionTimeline Entity
# ============================================================================

class TransactionTimeline(Base):
    """
    Event log for a BusinessTransaction.
    Creates an immutable audit trail of document arrival and status changes.
    Enables future UI timeline visualization.
    """
    __tablename__ = "transaction_timelines"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Foreign key
    business_transaction_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("business_transactions.id"),
        index=True,
        nullable=False
    )

    # ─── Event Information ────────────────────────────────────────────────
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # PO_RECEIVED, ASN_RECEIVED, PARTIALLY_SHIPPED, FULLY_SHIPPED,
    # INVOICE_RECEIVED, COMPLETED, VALIDATION_FAILED, SLA_AT_RISK, SLA_BREACHED, etc.

    event_description: Mapped[str] = mapped_column(String, nullable=True)
    # Human-readable event description

    # Which document triggered this event?
    source_document_id: Mapped[str] = mapped_column(String, nullable=True)

    # ─── State Transitions ────────────────────────────────────────────────
    status_before: Mapped[str] = mapped_column(String(32), nullable=True)
    status_after: Mapped[str] = mapped_column(String(32), nullable=True)

    # ─── Event Metadata ───────────────────────────────────────────────────
    metadata: Mapped[dict] = mapped_column(JSON, nullable=True)
    # Event-specific data: shipment_id, invoice_amount, quantity shipped, etc.

    # ─── Timestamp ────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ============================================================================
# MODIFIED: TransactionDocument Entity (additions only, keep existing fields)
# ============================================================================

class TransactionDocument(Base):
    """
    Updated to support new BusinessTransaction model.

    Changes:
    - Added business_transaction_id (nullable, FK to BusinessTransaction)
    - Kept linked_document_id (deprecated, for migration period)
    """
    __tablename__ = "transaction_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_document: Mapped[str] = mapped_column(Text)
    source_format: Mapped[str] = mapped_column(String(32), nullable=True)
    transaction_type: Mapped[str] = mapped_column(String(64), nullable=True)
    source_partner: Mapped[str] = mapped_column(String(256), nullable=True)
    destination_partner: Mapped[str] = mapped_column(String(256), nullable=True)
    relationship_type: Mapped[str] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=True)
    canonical_event: Mapped[dict] = mapped_column(JSON, nullable=True)
    mapped_payload: Mapped[dict] = mapped_column(JSON, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=True)
    mapping_explanations: Mapped[list] = mapped_column(JSON, nullable=True)
    unmapped_fields: Mapped[list] = mapped_column(JSON, nullable=True)
    validation_errors: Mapped[list] = mapped_column(JSON, nullable=True)
    hitl_required: Mapped[bool] = mapped_column(Boolean, default=False)
    hitl_corrections: Mapped[dict] = mapped_column(JSON, nullable=True)
    edi_output: Mapped[str] = mapped_column(Text, nullable=True)
    final_status: Mapped[str] = mapped_column(String(32), default="IN_PROGRESS")
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    llm_call_count: Mapped[int] = mapped_column(Integer, default=0)

    # ─── NEW: BusinessTransaction Reference ────────────────────────────
    business_transaction_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("business_transactions.id"),
        nullable=True,
        index=True
    )
    # NULL during initial processing, populated after correlation

    # ─── DEPRECATED (kept for migration period, max 2-3 months) ─────────
    linked_document_id: Mapped[str] = mapped_column(String, nullable=True)

    # ─── Document Reference Number (extracted from canonical) ──────────
    document_reference_number: Mapped[str] = mapped_column(String(128), nullable=True)
    # "PO-2024-12345", "INV-2024-67890", "ASN-2024-98765"

    # ─── Existing SLA Fields (keep as-is) ──────────────────────────────
    expected_dispatch_by: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=True)
    item_match_status: Mapped[str] = mapped_column(String(32), nullable=True)
    item_discrepancies: Mapped[dict] = mapped_column(JSON, nullable=True)

    # ─── Timestamps ────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ============================================================================
# Keep Existing Models (Endpoint, PartnerProfile) - No Changes
# ============================================================================

class Endpoint(Base):
    """A technical integration endpoint for a trading partner (AS2, SFTP, FTP, HTTPS, VAN, AS4)."""
    __tablename__ = "endpoints"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    partner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), default="Both")
    status: Mapped[str] = mapped_column(String(16), default="Inactive")
    config: Mapped[dict] = mapped_column(JSON, nullable=True)
    last_tested: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_result: Mapped[str] = mapped_column(String(16), nullable=True)
    last_test_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class PartnerProfile(Base):
    __tablename__ = "partner_profiles"
    __table_args__ = (UniqueConstraint("partner_id", name="uq_partner_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    partner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    partner_name: Mapped[str] = mapped_column(String(256), nullable=False)
    isa_qualifier: Mapped[str] = mapped_column(String(4), default="ZZ")
    isa_id: Mapped[str] = mapped_column(String(15), nullable=False)
    gs_id: Mapped[str] = mapped_column(String(15), nullable=True)
    edi_version: Mapped[str] = mapped_column(String(16), default="005010")
    transport: Mapped[str] = mapped_column(String(16), nullable=True)
    van_provider: Mapped[str] = mapped_column(String(64), nullable=True)
    document_agreements: Mapped[list] = mapped_column(JSON, default=list)
    sla_hours: Mapped[int] = mapped_column(Integer, default=24)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

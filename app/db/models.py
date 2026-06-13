import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, Boolean, DateTime, JSON, Text, UniqueConstraint, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _now():
    return datetime.now(timezone.utc)


class TransactionDocument(Base):
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
    linked_document_id: Mapped[str] = mapped_column(String, nullable=True)
    document_reference_number: Mapped[str] = mapped_column(String(128), nullable=True)
    expected_dispatch_by: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=True)
    item_match_status: Mapped[str] = mapped_column(String(32), nullable=True)
    item_discrepancies: Mapped[dict] = mapped_column(JSON, nullable=True)

    # NEW: BusinessTransaction reference (for transaction correlation)
    business_transaction_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("business_transactions.id"),
        nullable=True,
        index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ============================================================================
# NEW: Transaction Correlation Models
# ============================================================================

class BusinessTransaction(Base):
    """Central entity for grouping related documents in a supply chain transaction."""
    __tablename__ = "business_transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    transaction_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Correlation Keys
    po_number: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    order_number: Mapped[str] = mapped_column(String(128), index=True, nullable=True)
    reference_number: Mapped[str] = mapped_column(String(128), index=True, nullable=True)

    # Parties
    buyer: Mapped[str] = mapped_column(String(256), nullable=True)
    supplier: Mapped[str] = mapped_column(String(256), nullable=True)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(32), default="CREATED", index=True)

    # Document Counters
    po_count: Mapped[int] = mapped_column(Integer, default=0)
    asn_count: Mapped[int] = mapped_column(Integer, default=0)
    invoice_count: Mapped[int] = mapped_column(Integer, default=0)

    # Confidence
    correlation_confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # SLA Preparation
    ship_by_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatch_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Extra metadata (renamed from 'metadata' — reserved by SQLAlchemy DeclarativeBase)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TransactionDocumentLink(Base):
    """Links a TransactionDocument to a BusinessTransaction."""
    __tablename__ = "transaction_document_links"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

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

    # Role in transaction
    document_role: Mapped[str] = mapped_column(String(32), nullable=False)

    # Correlation details
    correlation_key: Mapped[str] = mapped_column(String(32), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # Validation
    validation_status: Mapped[str] = mapped_column(String(32), nullable=True)
    validation_errors: Mapped[list] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TransactionTimeline(Base):
    """Event log for a BusinessTransaction."""
    __tablename__ = "transaction_timelines"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    business_transaction_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("business_transactions.id"),
        index=True,
        nullable=False
    )

    # Event information
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    event_description: Mapped[str] = mapped_column(String, nullable=True)
    source_document_id: Mapped[str] = mapped_column(String, nullable=True)

    # State transitions
    status_before: Mapped[str] = mapped_column(String(32), nullable=True)
    status_after: Mapped[str] = mapped_column(String(32), nullable=True)

    # Extra metadata (renamed from 'metadata' — reserved by SQLAlchemy DeclarativeBase)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Endpoint(Base):
    """A technical integration endpoint for a trading partner (AS2, SFTP, FTP, HTTPS, VAN, AS4)."""
    __tablename__ = "endpoints"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    partner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)   # AS2 | SFTP | FTP | HTTPS | AS4 | VAN
    direction: Mapped[str] = mapped_column(String(16), default="Both")  # Inbound | Outbound | Both
    status: Mapped[str] = mapped_column(String(16), default="Inactive") # Active | Inactive | Error
    config: Mapped[dict] = mapped_column(JSON, nullable=True)           # Protocol-specific settings
    last_tested: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_result: Mapped[str] = mapped_column(String(16), nullable=True)   # success | failed
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
    transport: Mapped[str] = mapped_column(String(16), nullable=True)       # SFTP | VAN | AS2 | API
    van_provider: Mapped[str] = mapped_column(Text, nullable=True)    # stores rich JSON blob (role, contacts, edi_config, wizard_metadata, etc.)
    document_agreements: Mapped[list] = mapped_column(JSON, default=list)   # [{"type": "850", "enabled": true}]
    sla_hours: Mapped[int] = mapped_column(Integer, default=24)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

# Pydantic Schemas for Transaction Correlation
# File: app/api/schemas/transaction_schemas.py

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


# ============================================================================
# BusinessTransaction Schemas
# ============================================================================

class BusinessTransactionCreate(BaseModel):
    """Create a new BusinessTransaction"""
    po_number: str = Field(..., description="Primary correlation key")
    order_number: Optional[str] = Field(None, description="Alternative correlation key")
    reference_number: Optional[str] = Field(None, description="Fallback correlation key")
    buyer: Optional[str] = Field(None, description="Buyer party name")
    supplier: Optional[str] = Field(None, description="Supplier party name")
    correlation_confidence: float = Field(1.0, description="1.0 = exact match, < 1.0 = fuzzy")
    metadata: Optional[dict] = Field(None, description="Custom metadata")


class BusinessTransactionUpdate(BaseModel):
    """Update an existing BusinessTransaction"""
    status: Optional[str] = Field(None, description="Transaction status")
    ship_by_date: Optional[datetime] = Field(None, description="SLA: Ship by date")
    expected_delivery_date: Optional[datetime] = Field(None, description="SLA: Expected delivery")
    dispatch_deadline: Optional[datetime] = Field(None, description="SLA: Dispatch deadline")
    correlation_confidence: Optional[float] = Field(None, description="Update confidence score")
    metadata: Optional[dict] = Field(None, description="Update metadata")


class BusinessTransactionResponse(BaseModel):
    """Response model for BusinessTransaction"""
    id: str
    transaction_id: str = Field(description="Unique immutable ID")
    po_number: str = Field(description="Primary correlation key")
    order_number: Optional[str] = None
    reference_number: Optional[str] = None
    buyer: Optional[str] = None
    supplier: Optional[str] = None
    status: str = Field(description="CREATED | PO_RECEIVED | ASN_RECEIVED | PARTIALLY_SHIPPED | FULLY_SHIPPED | INVOICE_RECEIVED | COMPLETED")
    po_count: int = Field(description="Number of PO documents linked")
    asn_count: int = Field(description="Number of ASN documents linked")
    invoice_count: int = Field(description="Number of Invoice documents linked")
    correlation_confidence: float = Field(description="Confidence of correlation (0.0-1.0)")
    ship_by_date: Optional[datetime] = None
    expected_delivery_date: Optional[datetime] = None
    dispatch_deadline: Optional[datetime] = None
    metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# TransactionDocumentLink Schemas
# ============================================================================

class TransactionDocumentLinkCreate(BaseModel):
    """Create a link between a document and a transaction"""
    business_transaction_id: str
    transaction_document_id: str
    document_role: str = Field(..., description="PURCHASE_ORDER | ASN | INVOICE")
    correlation_key: Optional[str] = Field(None, description="Which key was used? po_number | order_number | reference_number")
    confidence: float = Field(1.0, description="Correlation confidence (0.0-1.0)")


class TransactionDocumentLinkValidation(BaseModel):
    """Validation results for a linked document"""
    validation_status: str = Field(description="VALID | QUANTITY_MISMATCH | AMOUNT_MISMATCH | MISSING_FIELDS | UNKNOWN_ITEM")
    validation_errors: Optional[List[dict]] = Field(None, description="List of validation errors")


class TransactionDocumentLinkResponse(BaseModel):
    """Response model for TransactionDocumentLink"""
    id: str
    business_transaction_id: str
    transaction_document_id: str
    document_role: str
    correlation_key: Optional[str] = None
    confidence: float
    validation_status: Optional[str] = None
    validation_errors: Optional[List[dict]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# TransactionTimeline Schemas
# ============================================================================

class TransactionTimelineEventCreate(BaseModel):
    """Create a timeline event"""
    event_type: str = Field(..., description="PO_RECEIVED | ASN_RECEIVED | INVOICE_RECEIVED | COMPLETED | VALIDATION_FAILED | SLA_AT_RISK | SLA_BREACHED | etc.")
    event_description: Optional[str] = Field(None, description="Human-readable event description")
    source_document_id: Optional[str] = Field(None, description="Which document triggered this event?")
    metadata: Optional[dict] = Field(None, description="Event-specific data (e.g., quantity shipped, amount invoiced)")


class TransactionTimelineResponse(BaseModel):
    """Response model for TransactionTimeline event"""
    id: str
    business_transaction_id: str
    event_type: str
    event_description: Optional[str] = None
    source_document_id: Optional[str] = None
    status_before: Optional[str] = None
    status_after: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BusinessTransactionTimelineResponse(BaseModel):
    """Complete timeline for a transaction"""
    transaction_id: str
    po_number: str
    events: List[TransactionTimelineResponse] = Field(description="Chronological list of events")

    class Config:
        from_attributes = True


# ============================================================================
# Full Transaction View (for frontend)
# ============================================================================

class DocumentSummary(BaseModel):
    """Summary of a linked document"""
    id: str
    transaction_type: str  # PURCHASE_ORDER | INVOICE | ASN
    document_reference_number: Optional[str] = None
    document_role: str
    validation_status: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BusinessTransactionDetailedResponse(BaseModel):
    """Complete transaction with all details"""
    transaction: BusinessTransactionResponse
    documents: List[DocumentSummary] = Field(description="All documents linked to this transaction")
    timeline: List[TransactionTimelineResponse] = Field(description="Event timeline")
    validation_summary: dict = Field(description="Overall validation status")

    class Config:
        from_attributes = True


# ============================================================================
# Correlation Service Request/Response
# ============================================================================

class CorrelationRequest(BaseModel):
    """Request to correlate a document"""
    document_id: str = Field(..., description="Transaction document ID")
    po_number: Optional[str] = None
    order_number: Optional[str] = None
    reference_number: Optional[str] = None
    buyer: Optional[str] = None
    supplier: Optional[str] = None


class CorrelationResult(BaseModel):
    """Result of correlation attempt"""
    status: str = Field(..., description="CREATED_NEW | LINKED_EXISTING | PENDING | FAILED")
    transaction_id: str = Field(..., description="Transaction ID (new or existing)")
    message: str = Field(..., description="Human-readable result")
    business_transaction: Optional[BusinessTransactionResponse] = None
    validation_errors: Optional[List[str]] = None


# ============================================================================
# Query/Filter Schemas
# ============================================================================

class BusinessTransactionFilterRequest(BaseModel):
    """Filter transactions by criteria"""
    po_number: Optional[str] = None
    status: Optional[str] = None  # CREATED | PO_RECEIVED | COMPLETED | etc.
    supplier: Optional[str] = None
    buyer: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    skip: int = Field(0, description="Pagination skip")
    limit: int = Field(100, description="Pagination limit")


class BusinessTransactionListResponse(BaseModel):
    """List of transactions"""
    total: int
    skip: int
    limit: int
    transactions: List[BusinessTransactionResponse]

    class Config:
        from_attributes = True


# ============================================================================
# Status Transition Schemas
# ============================================================================

class TransactionStatusUpdate(BaseModel):
    """Request to manually update transaction status"""
    new_status: str = Field(..., description="Target status")
    reason: Optional[str] = None
    metadata: Optional[dict] = None


# ============================================================================
# Validation Result Schemas
# ============================================================================

class DocumentValidationResult(BaseModel):
    """Result of document validation within transaction"""
    status: str = Field(..., description="VALID | QUANTITY_MISMATCH | AMOUNT_MISMATCH | MISSING_FIELDS | UNKNOWN_ITEM")
    errors: List[dict] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    metadata: Optional[dict] = None


class TransactionValidationSummary(BaseModel):
    """Overall validation status for a transaction"""
    overall_status: str = Field(..., description="VALID | PARTIAL_MISMATCH | CRITICAL_ERROR")
    documents_validated: int
    documents_with_errors: int
    error_count: int
    warning_count: int
    details: List[dict] = Field(description="Per-document validation details")

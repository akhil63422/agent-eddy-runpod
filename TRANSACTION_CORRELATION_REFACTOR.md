# Transaction Correlation Refactor: Design & Implementation

## Executive Summary

**Current State:** Simple linked_document_id linking (PO ↔ Invoice)  
**Target State:** BusinessTransaction entity that owns PO, ASNs, Invoices  
**Scope:** MVP-ready, scalable design without over-engineering  
**Timeline:** 1-month MVP ready

---

## Problem Statement

### Current Limitations

```
Current Design:
PO (po-uuid-001)
  ├─ linked_document_id → INV (inv-uuid-002)
  └─ linked_document_id → INV (inv-uuid-003)
  
Issues:
1. Invoice-to-PO only (no ASN support)
2. No partial shipment tracking
3. No transaction state management
4. No timeline/lifecycle tracking
5. No centralized correlation logic
```

### Real-World Scenarios Unsupported

```
Scenario 1: Partial Shipments
PO123 for 1000 units
├─ ASN001: 400 units shipped
├─ ASN002: 600 units shipped (remaining)
└─ Expected: Both ASNs linked to same PO + invoice

Scenario 2: Partial Invoicing
PO123 for $1000
├─ INV001: $600 (partial)
├─ INV002: $400 (remainder)
└─ Expected: Both invoices linked to same PO + ASNs

Scenario 3: Multiple Shipments with Consolidated Invoice
PO123
├─ ASN001: 400 units
├─ ASN002: 600 units
└─ INV001: $1000 (consolidates both ASNs)

Current system cannot handle these effectively.
```

---

## Proposed Solution: BusinessTransaction Model

### Core Concept

```
BusinessTransaction
├─ Transaction ID (generated, immutable)
├─ Correlation Keys (po_number, order_number, reference_number)
├─ Linked Documents
│  ├─ 1 Purchase Order
│  ├─ N ASNs/Shipment Notices
│  ├─ N Invoices
│  └─ metadata about each link
├─ Transaction State (CREATED → COMPLETED)
├─ Timeline (events logged)
└─ SLA Fields (prepared, not yet used)
```

### Design Principles

1. **One Source of Truth:** BusinessTransaction is the authoritative grouping
2. **Immutable Correlation:** po_number identifies transaction, never changes
3. **Flexibility:** Support missing documents (PO without Invoice, etc.)
4. **Extensibility:** Timeline events, SLA tracking easy to add later
5. **Simplicity:** No complex state machines, just status tracking

---

## Architecture Overview

### Data Flow

```
Document Arrives
      ↓
Extract Correlation Keys (po_number, order_number, etc.)
      ↓
Query BusinessTransaction table
      ├─ If found: Add document to existing transaction
      └─ If not found: Create new BusinessTransaction
      ↓
Update transaction status based on document type
      ↓
Run correlation/validation logic (quantity matching, etc.)
      ↓
Log transaction event (timeline)
      ↓
Store in database (all as single transaction)
```

### Tables Overview

```
┌─────────────────────────────────┐
│   business_transactions         │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ transaction_id (unique)         │
│ po_number (index, immutable)    │
│ order_number (nullable, index)  │
│ reference_number (nullable)     │
│ status (enum)                   │
│ correlation_confidence (float)  │
│ created_at                      │
│ updated_at                      │
└─────────────────────────────────┘
         │ 1
         │
         │ owns
         │
         ├─────────────┬──────────────┬──────────────┐
         │             │              │              │
         ▼             ▼              ▼              ▼
    transaction_   business_trans_  business_trans_ business_trans_
    documents      asn_links        invoice_links   metadata
```

---

## Database Model Design

### 1. BusinessTransaction Table

```python
class BusinessTransaction(Base):
    __tablename__ = "business_transactions"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    
    # Correlation Keys (immutable, indexed)
    po_number: Mapped[str] = mapped_column(String, index=True, nullable=True)
    order_number: Mapped[str] = mapped_column(String, index=True, nullable=True)
    reference_number: Mapped[str] = mapped_column(String, index=True, nullable=True)
    
    # Parties involved
    buyer: Mapped[str] = mapped_column(String, nullable=True)
    supplier: Mapped[str] = mapped_column(String, nullable=True)
    
    # Transaction Lifecycle
    status: Mapped[str] = mapped_column(String(32), default="CREATED")
    # CREATED → PO_RECEIVED → ASN_RECEIVED → PARTIALLY_SHIPPED → 
    # FULLY_SHIPPED → INVOICE_RECEIVED → COMPLETED
    
    # Document Counters (for quick status checking)
    po_count: Mapped[int] = mapped_column(Integer, default=0)
    asn_count: Mapped[int] = mapped_column(Integer, default=0)
    invoice_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Confidence Score (for multi-key matching)
    correlation_confidence: Mapped[float] = mapped_column(Float, default=1.0)
    
    # SLA Preparation (not yet used)
    ship_by_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatch_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
```

### 2. TransactionDocument Link Table

```python
class TransactionDocumentLink(Base):
    __tablename__ = "transaction_document_links"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    business_transaction_id: Mapped[str] = mapped_column(String, ForeignKey("business_transactions.id"), index=True)
    transaction_document_id: Mapped[str] = mapped_column(String, ForeignKey("transaction_documents.id"), index=True)
    
    # Role in transaction
    document_role: Mapped[str] = mapped_column(String(32))
    # PURCHASE_ORDER, ASN, INVOICE
    
    # Linking metadata
    correlation_key: Mapped[str] = mapped_column(String(32), nullable=True)
    # Which key was used to link? (po_number, order_number, reference_number)
    
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    
    # Validation results
    validation_status: Mapped[str] = mapped_column(String(32), nullable=True)
    # VALID, QUANTITY_MISMATCH, AMOUNT_MISMATCH, MISSING_FIELDS
    
    validation_errors: Mapped[list] = mapped_column(JSON, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
```

### 3. TransactionTimeline Table

```python
class TransactionTimeline(Base):
    __tablename__ = "transaction_timelines"
    
    id: Mapped[str] = mapped_column(String, primary_key=True)
    business_transaction_id: Mapped[str] = mapped_column(String, ForeignKey("business_transactions.id"), index=True)
    
    event_type: Mapped[str] = mapped_column(String(32))
    # PO_RECEIVED, ASN_RECEIVED, INVOICE_RECEIVED, SHIPMENT_CONFIRMED, 
    # VALIDATION_FAILED, DISCREPANCY_FOUND, COMPLETED, etc.
    
    event_description: Mapped[str] = mapped_column(String, nullable=True)
    
    source_document_id: Mapped[str] = mapped_column(String, nullable=True)
    # Which document triggered this event?
    
    status_before: Mapped[str] = mapped_column(String(32), nullable=True)
    status_after: Mapped[str] = mapped_column(String(32), nullable=True)
    
    metadata: Mapped[dict] = mapped_column(JSON, nullable=True)
    # Event-specific data (e.g., quantity shipped, amount invoiced)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

### 4. TransactionDocument (Updated)

```python
class TransactionDocument(Base):
    __tablename__ = "transaction_documents"
    
    # Keep existing fields...
    id: Mapped[str] = mapped_column(String, primary_key=True)
    raw_document: Mapped[str] = mapped_column(Text)
    transaction_type: Mapped[str] = mapped_column(String(64), nullable=True)
    source_format: Mapped[str] = mapped_column(String(32), nullable=True)
    canonical_event: Mapped[dict] = mapped_column(JSON, nullable=True)
    final_status: Mapped[str] = mapped_column(String(32), default="IN_PROGRESS")
    
    # NEW: Reference to BusinessTransaction (not PK, allows null for unlinked docs)
    business_transaction_id: Mapped[str] = mapped_column(
        String, 
        ForeignKey("business_transactions.id"), 
        nullable=True,
        index=True
    )
    
    # DEPRECATED: Keep for migration period, then remove
    linked_document_id: Mapped[str] = mapped_column(String, nullable=True)
    
    # Keep existing SLA fields...
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=True)
    expected_dispatch_by: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    item_match_status: Mapped[str] = mapped_column(String(32), nullable=True)
    item_discrepancies: Mapped[list] = mapped_column(JSON, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
```

---

## Pydantic Schemas

### 1. BusinessTransaction Schema

```python
class BusinessTransactionCreate(BaseModel):
    po_number: str = None
    order_number: str = None
    reference_number: str = None
    buyer: str = None
    supplier: str = None
    correlation_confidence: float = 1.0
    metadata: dict = None

class BusinessTransactionUpdate(BaseModel):
    status: str = None
    ship_by_date: datetime = None
    expected_delivery_date: datetime = None
    dispatch_deadline: datetime = None
    metadata: dict = None

class BusinessTransactionResponse(BaseModel):
    id: str
    transaction_id: str
    po_number: str
    order_number: str
    reference_number: str
    buyer: str
    supplier: str
    status: str
    po_count: int
    asn_count: int
    invoice_count: int
    correlation_confidence: float
    ship_by_date: datetime
    expected_delivery_date: datetime
    dispatch_deadline: datetime
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
```

### 2. TransactionDocumentLink Schema

```python
class TransactionDocumentLinkCreate(BaseModel):
    business_transaction_id: str
    transaction_document_id: str
    document_role: str  # PURCHASE_ORDER, ASN, INVOICE
    correlation_key: str = None  # Which key was used?
    confidence: float = 1.0

class TransactionDocumentLinkResponse(BaseModel):
    id: str
    business_transaction_id: str
    transaction_document_id: str
    document_role: str
    correlation_key: str
    confidence: float
    validation_status: str
    validation_errors: list
    created_at: datetime
    
    class Config:
        from_attributes = True
```

### 3. TransactionTimeline Schema

```python
class TransactionTimelineEvent(BaseModel):
    event_type: str
    event_description: str = None
    source_document_id: str = None
    metadata: dict = None

class TransactionTimelineResponse(BaseModel):
    id: str
    business_transaction_id: str
    event_type: str
    event_description: str
    source_document_id: str
    status_before: str
    status_after: str
    metadata: dict
    created_at: datetime
    
    class Config:
        from_attributes = True
```

---

## Correlation Service

### Design Approach

```python
class TransactionCorrelationService:
    """
    Handles document-to-transaction correlation and linking.
    
    Correlation Priority:
    1. Exact po_number match (highest confidence)
    2. order_number + supplier match
    3. reference_number + buyer + supplier
    """
    
    def correlate_document(self, doc: TransactionDocument, db: Session) -> BusinessTransaction:
        """
        Main entry point: Given a new document, find or create BusinessTransaction.
        
        Flow:
        1. Extract correlation keys from canonical_event
        2. Search for existing BusinessTransaction
        3. If found: Link document to transaction, validate, update status
        4. If not found: Create new transaction, link document
        5. Log timeline event
        6. Return transaction with status
        """
        pass
    
    def extract_correlation_keys(self, canonical: dict) -> dict:
        """
        Extract po_number, order_number, reference_number from document.
        Handles variant field names (po_number vs po, etc.)
        """
        pass
    
    def find_transaction(self, keys: dict, supplier: str, buyer: str, db: Session):
        """
        Search for existing BusinessTransaction using:
        1. po_number (exact match, highest confidence)
        2. order_number + supplier
        3. reference_number + supplier + buyer
        
        Returns: Transaction or None
        """
        pass
    
    def create_transaction(self, keys: dict, supplier: str, buyer: str, db: Session):
        """
        Create new BusinessTransaction from correlation keys.
        """
        pass
    
    def link_document(self, transaction: BusinessTransaction, doc: TransactionDocument, 
                     correlation_key: str, db: Session):
        """
        Create TransactionDocumentLink record.
        Validate document against other documents in transaction.
        """
        pass
    
    def validate_document_in_transaction(self, doc: TransactionDocument, 
                                        transaction: BusinessTransaction, db: Session) -> dict:
        """
        Check document against others in same transaction:
        - Quantity matching (ASN + Invoice vs PO)
        - Amount matching (Invoice vs PO)
        - Item consistency
        
        Returns: validation_status, validation_errors
        """
        pass
    
    def update_transaction_status(self, transaction: BusinessTransaction, db: Session):
        """
        Update BusinessTransaction.status based on documents linked:
        - CREATED (no documents)
        - PO_RECEIVED (PO linked)
        - ASN_RECEIVED (ASN(s) linked)
        - PARTIALLY_SHIPPED (some ASNs, PO qty not reached)
        - FULLY_SHIPPED (ASN qty >= PO qty)
        - INVOICE_RECEIVED (Invoice(s) linked)
        - COMPLETED (all validations passed)
        """
        pass
    
    def log_timeline_event(self, transaction: BusinessTransaction, event: TransactionTimelineEvent, 
                          doc_id: str, db: Session):
        """
        Create TransactionTimeline entry.
        Called after each document linking/validation.
        """
        pass
```

### Implementation Example

```python
def correlate_document(self, doc: TransactionDocument, db: Session) -> BusinessTransaction:
    """
    Correlate a new document with a BusinessTransaction.
    """
    # 1. Extract correlation keys
    canonical = doc.canonical_event or {}
    keys = self.extract_correlation_keys(canonical)
    
    supplier = doc.source_partner
    buyer = doc.destination_partner
    
    # 2. Find or create transaction
    transaction = self.find_transaction(keys, supplier, buyer, db)
    
    if not transaction:
        transaction = self.create_transaction(keys, supplier, buyer, db)
        log.info(f"[correlation] Created BusinessTransaction {transaction.transaction_id}")
    else:
        log.info(f"[correlation] Found existing BusinessTransaction {transaction.transaction_id}")
    
    # 3. Link document
    correlation_key_used = keys.get('matched_key')  # Which key was used?
    link = self.link_document(transaction, doc, correlation_key_used, db)
    
    # 4. Validate document in context
    validation = self.validate_document_in_transaction(doc, transaction, db)
    link.validation_status = validation['status']
    link.validation_errors = validation['errors']
    db.commit()
    
    # 5. Update transaction status
    self.update_transaction_status(transaction, db)
    
    # 6. Log timeline event
    event_type = self._map_doc_type_to_event(doc.transaction_type)
    timeline_event = TransactionTimelineEvent(
        event_type=event_type,
        event_description=f"{doc.transaction_type} {doc.document_reference_number} received",
        source_document_id=doc.id,
        metadata={"validation_status": validation['status']}
    )
    self.log_timeline_event(transaction, timeline_event, doc.id, db)
    
    return transaction
```

---

## Migration Strategy

### Phase 1: Deploy New Model (Week 1)

```
1. Deploy database migrations (add 3 new tables)
2. Deploy updated TransactionDocument model (add business_transaction_id, keep linked_document_id)
3. Deploy CorrelationService (doesn't use old linked_document_id yet)
4. Enable new correlation logic in inbound pipeline
5. Dual-write: Both linked_document_id AND business_transaction_id populated
```

### Phase 2: Backfill Existing Documents (Week 2)

```
1. Migration script: Process all existing TransactionDocuments
   - Extract correlation keys from canonical_event
   - Create BusinessTransaction records
   - Create TransactionDocumentLink records
   - Populate business_transaction_id field
2. Validate: Cross-check linked_document_id vs new relationship
3. Log mismatches for manual review
```

### Phase 3: Switch to New Model (Week 3-4)

```
1. Update all queries to use business_transaction_id
2. Update API endpoints to return BusinessTransaction + links
3. Frontend: Update to show transaction timeline, multiple docs
4. Remove linked_document_id from code (keep in DB for rollback)
5. Testing: Comprehensive scenarios (partial shipments, partial invoicing)
```

### Rollback Plan

```
If critical issues discovered:
1. linked_document_id still in DB, can restore old logic
2. business_transactions tables can be dropped safely
3. New correlations won't affect processing of old documents
```

---

## Example Workflow: PO123 with Multiple Shipments & Invoices

### Scenario

```
PO123: 1000 units, $10,000
├─ ASN001: 400 units (Week 1)
├─ ASN002: 600 units (Week 2)
├─ INV001: $6,000 (partial)
└─ INV002: $4,000 (remainder)
```

### Step-by-Step Processing

#### Step 1: PO Arrives

```
Input: X12 850 with po_number=PO123

1. Extract: po_number="PO123", buyer="RETAILER_ABC", supplier="ACME_CORP"

2. Find Transaction:
   SELECT * FROM business_transactions 
   WHERE po_number='PO123' AND supplier='ACME_CORP'
   → Not found

3. Create Transaction:
   INSERT INTO business_transactions (
     transaction_id='txn-abc123',
     po_number='PO123',
     buyer='RETAILER_ABC',
     supplier='ACME_CORP',
     status='CREATED'
   )

4. Link Document:
   INSERT INTO transaction_document_links (
     business_transaction_id='txn-abc123',
     transaction_document_id='po-doc-001',
     document_role='PURCHASE_ORDER',
     correlation_key='po_number',
     confidence=1.0
   )

5. Update Status:
   UPDATE business_transactions 
   SET status='PO_RECEIVED', po_count=1
   WHERE transaction_id='txn-abc123'

6. Log Event:
   INSERT INTO transaction_timelines (
     business_transaction_id='txn-abc123',
     event_type='PO_RECEIVED',
     event_description='PO PO123 received',
     source_document_id='po-doc-001',
     status_before='CREATED',
     status_after='PO_RECEIVED'
   )

Result: BusinessTransaction created, status=PO_RECEIVED
```

#### Step 2: First ASN Arrives (ASN001 - 400 units)

```
Input: X12 856 with po_number=PO123, shipment_id=ASN001

1. Extract: po_number="PO123", shipment_id="ASN001"

2. Find Transaction:
   SELECT * FROM business_transactions 
   WHERE po_number='PO123' AND supplier='ACME_CORP'
   → Found: txn-abc123

3. Link Document:
   INSERT INTO transaction_document_links (
     business_transaction_id='txn-abc123',
     transaction_document_id='asn-doc-001',
     document_role='ASN',
     correlation_key='po_number',
     confidence=1.0
   )

4. Validate:
   - ASN qty (400) vs PO qty (1000): ✓ Valid partial shipment
   - Item match: ✓ All items match PO
   - Status: VALID

5. Update Status:
   UPDATE business_transactions 
   SET status='ASN_RECEIVED', asn_count=1, po_count=1
   WHERE transaction_id='txn-abc123'

6. Log Event:
   INSERT INTO transaction_timelines (
     event_type='ASN_RECEIVED',
     metadata={'shipment_id': 'ASN001', 'quantity': 400}
   )

Result: First shipment linked, status=ASN_RECEIVED (qty: 400/1000)
```

#### Step 3: Second ASN Arrives (ASN002 - 600 units)

```
Input: X12 856 with po_number=PO123, shipment_id=ASN002

1. Extract: po_number="PO123", shipment_id="ASN002"

2. Find Transaction:
   → Found: txn-abc123 (existing)

3. Link Document:
   INSERT INTO transaction_document_links (
     business_transaction_id='txn-abc123',
     transaction_document_id='asn-doc-002',
     document_role='ASN',
     correlation_key='po_number'
   )

4. Validate:
   - Total ASN qty (400 + 600 = 1000) = PO qty (1000): ✓
   - Status: VALID

5. Update Status:
   UPDATE business_transactions 
   SET status='FULLY_SHIPPED', asn_count=2
   WHERE transaction_id='txn-abc123'

6. Log Event:
   INSERT INTO transaction_timelines (
     event_type='ASN_RECEIVED',
     metadata={'shipment_id': 'ASN002', 'quantity': 600, 'total_shipped': 1000}
   )

Result: All PO qty shipped, status=FULLY_SHIPPED
```

#### Step 4: First Invoice Arrives (INV001 - $6,000)

```
Input: X12 810 with po_number=PO123, invoice_number=INV001

1. Extract: po_number="PO123", invoice_number="INV001"

2. Find Transaction:
   → Found: txn-abc123 (existing with 2 ASNs linked)

3. Link Document:
   INSERT INTO transaction_document_links (
     business_transaction_id='txn-abc123',
     transaction_document_id='inv-doc-001',
     document_role='INVOICE'
   )

4. Validate:
   - Invoice amount ($6000) vs PO amount ($10000): ✓ Partial invoice OK
   - Items in invoice match items in PO: ✓ Valid
   - Status: VALID

5. Update Status:
   UPDATE business_transactions 
   SET status='INVOICE_RECEIVED', invoice_count=1
   WHERE transaction_id='txn-abc123'

6. Log Event:
   INSERT INTO transaction_timelines (
     event_type='INVOICE_RECEIVED',
     metadata={'invoice_number': 'INV001', 'amount': 6000, 'total_invoiced': 6000}
   )

Result: Partial invoice linked, status=INVOICE_RECEIVED (amount: $6k/$10k)
```

#### Step 5: Second Invoice Arrives (INV002 - $4,000)

```
Input: X12 810 with po_number=PO123, invoice_number=INV002

Similar flow to INV001:

4. Validate:
   - Total invoiced ($6000 + $4000 = $10000) = PO amount: ✓
   - All items accounted for: ✓
   - Status: VALID

5. Update Status:
   UPDATE business_transactions 
   SET status='COMPLETED', invoice_count=2
   WHERE transaction_id='txn-abc123'

6. Log Event:
   INSERT INTO transaction_timelines (
     event_type='INVOICE_RECEIVED',
     metadata={'invoice_number': 'INV002', 'amount': 4000, 'total_invoiced': 10000}
   )
   
   + Insert COMPLETED event once all validations pass

Result: All invoices received, qty matched, amount matched
         status=COMPLETED
```

### Final Business Transaction State

```
BusinessTransaction {
  transaction_id: "txn-abc123",
  po_number: "PO123",
  status: "COMPLETED",
  po_count: 1,
  asn_count: 2,
  invoice_count: 2,
  correlation_confidence: 1.0,
  created_at: "2026-06-13T09:00:00Z",
  updated_at: "2026-06-13T17:00:00Z"
}

TransactionDocumentLinks {
  [po-doc-001] → PURCHASE_ORDER (po_number match, confidence=1.0)
  [asn-doc-001] → ASN (po_number match, confidence=1.0)
  [asn-doc-002] → ASN (po_number match, confidence=1.0)
  [inv-doc-001] → INVOICE (po_number match, confidence=1.0)
  [inv-doc-002] → INVOICE (po_number match, confidence=1.0)
}

TransactionTimeline {
  [1] PO_RECEIVED: PO123 at 09:00
  [2] ASN_RECEIVED: ASN001 (400 units) at 10:00
  [3] ASN_RECEIVED: ASN002 (600 units) at 14:00
  [4] FULLY_SHIPPED: Total 1000 units at 14:00
  [5] INVOICE_RECEIVED: INV001 ($6000) at 15:00
  [6] INVOICE_RECEIVED: INV002 ($4000) at 16:30
  [7] COMPLETED: All docs received and validated at 17:00
}
```

### Queries Enabled by This Design

```sql
-- Get all documents for a transaction
SELECT d.* FROM transaction_documents d
JOIN transaction_document_links l ON d.id = l.transaction_document_id
WHERE l.business_transaction_id = 'txn-abc123'
ORDER BY d.created_at;

-- Get all transactions for a PO
SELECT * FROM business_transactions
WHERE po_number = 'PO123';

-- Get transaction timeline
SELECT * FROM transaction_timelines
WHERE business_transaction_id = 'txn-abc123'
ORDER BY created_at ASC;

-- Find incomplete transactions (waiting for documents)
SELECT * FROM business_transactions
WHERE status IN ('PO_RECEIVED', 'ASN_RECEIVED')
AND updated_at < NOW() - INTERVAL '7 days';

-- Track partial invoicing
SELECT bt.*, 
       SUM(CASE WHEN l.document_role='INVOICE' THEN 1 ELSE 0 END) as invoice_count,
       bt.po_amount - COALESCE(SUM(CASE WHEN l.document_role='INVOICE' THEN d.invoice_amount ELSE 0 END), 0) as remaining_to_invoice
FROM business_transactions bt
LEFT JOIN transaction_document_links l ON bt.id = l.business_transaction_id
LEFT JOIN transaction_documents d ON l.transaction_document_id = d.id
WHERE bt.status = 'FULLY_SHIPPED'
GROUP BY bt.id;
```

---

## SLA Preparation (Not Yet Implemented)

### Fields Already In Schema

```
BusinessTransaction {
  ship_by_date,           # When should goods be shipped?
  expected_delivery_date, # When should goods arrive?
  dispatch_deadline       # When should invoice be sent?
}
```

### Future SLA Logic (Pseudocode)

```python
# Not implemented yet, just showing design
def calculate_sla_status(transaction: BusinessTransaction):
    """
    Future: Calculate SLA status per transaction.
    
    Rules:
    - If ASN not received by ship_by_date: BREACHED
    - If Invoice not received by dispatch_deadline: BREACHED
    - If Delivery not confirmed by expected_delivery_date: AT_RISK
    """
    
    if transaction.asn_count == 0 and now() > transaction.ship_by_date:
        return "BREACHED"
    
    if transaction.invoice_count == 0 and now() > transaction.dispatch_deadline:
        return "BREACHED"
    
    # ... more rules
```

### Timeline Integration

```python
# SLA events can be logged like other events:
TransactionTimeline {
  event_type: "SLA_AT_RISK",
  description: "Ship deadline approaching (2 days remaining)"
}

TransactionTimeline {
  event_type: "SLA_BREACHED",
  description: "Invoice deadline exceeded by 5 days"
}
```

---

## Implementation Priority

### Must Have (MVP)

- [x] BusinessTransaction model
- [x] TransactionDocumentLink model
- [x] CorrelationService (po_number matching)
- [x] Update transaction status based on documents
- [x] Support multiple ASNs + Invoices
- [x] Validation (quantity, amount matching)
- [x] Timeline events for UI
- [x] Migration from linked_document_id

### Nice to Have (Post-MVP)

- [ ] order_number + reference_number matching
- [ ] Confidence scoring for fuzzy matches
- [ ] Discrepancy resolution workflow
- [ ] SLA monitoring (fields ready, logic not yet)
- [ ] Advanced analytics (partial shipment trends, etc.)

---

## Backward Compatibility

### Keep During Transition

```python
TransactionDocument {
    business_transaction_id: str (NEW, nullable during migration)
    linked_document_id: str (OLD, deprecated but kept for 1-2 months)
}
```

### API Response (During Transition)

```json
{
  "id": "inv-uuid-002",
  "transaction_type": "INVOICE",
  
  // Old way (still works)
  "linked_document_id": "po-uuid-001",
  
  // New way (preferred)
  "business_transaction_id": "txn-abc123",
  "business_transaction": {
    "transaction_id": "txn-abc123",
    "status": "INVOICE_RECEIVED",
    "po_number": "PO-2024-12345",
    "documents": [...]
  }
}
```

---

## Summary

This design:

✅ **Supports Real Scenarios:** Multiple shipments, partial invoicing  
✅ **Backward Compatible:** Old linked_document_id still works during transition  
✅ **Scalable:** No document count limits, supports complex matching  
✅ **Simple:** 3 new tables, clear correlation logic  
✅ **Extensible:** SLA fields ready, timeline for future features  
✅ **MVP-Ready:** Can be implemented and deployed in 1 month  

**Next Steps:**
1. Review this design
2. Implement database models
3. Implement CorrelationService
4. Test with example workflows
5. Deploy with dual-write migration


# Transaction Correlation Refactor: Implementation Summary

## What's Being Delivered

A scalable BusinessTransaction model that replaces the simple `linked_document_id` approach, enabling support for:
- Multiple shipments (ASNs) per PO
- Multiple invoices per PO
- Partial shipments and invoicing
- Transaction timeline and lifecycle tracking
- SLA field preparation (not yet implemented)

**Scope:** MVP-ready, no over-engineering  
**Complexity:** Medium  
**Implementation Time:** 4 weeks (1 phase per week)

---

## Key Files & Code

### Database Models
**File:** `IMPLEMENTATION_MODELS.py`

New tables:
- `business_transactions` - Central grouping entity
- `transaction_document_links` - Links documents to transactions
- `transaction_timelines` - Event audit trail

Updated table:
- `transaction_documents` - Added `business_transaction_id` column (kept `linked_document_id` for migration)

### Pydantic Schemas
**File:** `IMPLEMENTATION_SCHEMAS.py`

Input/output models for:
- BusinessTransaction CRUD
- TransactionDocumentLink validation
- TransactionTimeline events
- Full transaction view (for frontend)
- Correlation requests/results

### Core Service
**File:** `IMPLEMENTATION_CORRELATION_SERVICE.py`

`TransactionCorrelationService` class with methods:
- `correlate_document()` - Main entry point for document correlation
- `extract_correlation_keys()` - Parse po_number, order_number, reference_number
- `find_transaction()` - Lookup existing BusinessTransaction (priority: po_number > order_number > reference_number)
- `create_transaction()` - Create new transaction from keys
- `link_document()` - Create document-to-transaction link
- `validate_document_in_transaction()` - Check qty/amount mismatches
- `update_transaction_status()` - Update status based on linked documents
- `log_timeline_event()` - Create audit trail entries

### Integration Point
**File:** `app/api/routes.py` (modified)

In `process_inbound()`, after `db.commit()`:

```python
transaction, result = correlation_service.correlate_document(doc, db)
```

---

## Data Model: Core Entities

### BusinessTransaction

```
id (UUID, PK)
transaction_id (unique, immutable)
po_number (index, primary correlation key)
order_number (index, secondary key)
reference_number (index, tertiary key)
buyer, supplier (party tracking)
status (enum: CREATED → COMPLETED)
po_count, asn_count, invoice_count (document counters)
correlation_confidence (1.0 for exact, <1.0 for fuzzy)
ship_by_date, expected_delivery_date, dispatch_deadline (SLA prep)
metadata (JSON for extensibility)
```

### TransactionDocumentLink

```
id (UUID, PK)
business_transaction_id (FK to BusinessTransaction)
transaction_document_id (FK to TransactionDocument)
document_role (PURCHASE_ORDER | ASN | INVOICE)
correlation_key (which key was used: po_number, etc.)
confidence (correlation confidence score)
validation_status (VALID | QUANTITY_MISMATCH | AMOUNT_MISMATCH)
validation_errors (JSON array of errors)
```

### TransactionTimeline

```
id (UUID, PK)
business_transaction_id (FK to BusinessTransaction)
event_type (PO_RECEIVED | ASN_RECEIVED | INVOICE_RECEIVED | COMPLETED)
event_description (human readable)
source_document_id (which doc triggered this)
status_before, status_after (state transition)
metadata (event-specific data)
created_at (immutable audit trail)
```

---

## Correlation Algorithm

### Priority Order

1. **po_number (exact match)** - Highest confidence (1.0)
   - Query: `WHERE po_number = X AND supplier = Y`

2. **order_number + supplier** - Medium confidence (0.9 example)
   - Query: `WHERE order_number = X AND supplier = Y`

3. **reference_number + buyer + supplier** - Lower confidence (0.7 example)
   - Query: `WHERE reference_number = X AND buyer = B AND supplier = S`

### Flow for Each Document

```
1. Extract keys from canonical_event
2. Try to find existing BusinessTransaction (in priority order)
3. If found:
   - Link document to existing transaction
   - Validate document against others
   - Update transaction status
   - Log timeline event
4. If not found:
   - Create new BusinessTransaction
   - Link document
   - Validate (may pass for new transaction)
   - Log timeline event
5. Return (transaction, result_dict)
```

---

## Status Transitions

```
CREATED (initial state, no docs)
  ↓
PO_RECEIVED (PO document linked)
  ↓
ASN_RECEIVED (first ASN linked)
  ├─ Check: qty shipped < PO qty → PARTIALLY_SHIPPED
  └─ Check: qty shipped ≥ PO qty → FULLY_SHIPPED
  ↓
INVOICE_RECEIVED (first Invoice linked)
  ├─ Check: all validations pass → transition to next
  └─ Check: discrepancies found → stay in INVOICE_RECEIVED, flag HITL
  ↓
COMPLETED (all docs received + all validations pass)
```

---

## Validation Rules (During Correlation)

Kept from MVP:
- ✅ Quantity mismatch detection (exact match required)
- ✅ Amount mismatch detection (±$0.01 tolerance)
- ✅ Unknown item detection
- ✅ Missing field detection
- ✅ Confidence scoring
- ✅ HITL integration

---

## Example Workflow: PO123 with 2 ASNs & 2 Invoices

### Step 1: PO Arrives
```
Input: po_number="PO123", qty=1000, amount=$10k
→ Create BusinessTransaction(transaction_id="txn-abc123", po_number="PO123", status="CREATED")
→ Create TransactionDocumentLink(role="PURCHASE_ORDER", correlation_key="po_number")
→ Update status → "PO_RECEIVED"
→ Log event: "PO_RECEIVED"
```

### Step 2: First ASN Arrives
```
Input: po_number="PO123", shipment_id="ASN001", qty=400
→ Find BusinessTransaction by po_number="PO123" → Found!
→ Create TransactionDocumentLink(role="ASN", correlation_key="po_number")
→ Validate: qty 400 < PO qty 1000? → Valid (partial)
→ Update status → "ASN_RECEIVED"
→ Log event: "ASN_RECEIVED", metadata={shipment_id: "ASN001", qty: 400}
```

### Step 3: Second ASN Arrives
```
Input: po_number="PO123", shipment_id="ASN002", qty=600
→ Find BusinessTransaction by po_number="PO123" → Found!
→ Create TransactionDocumentLink(role="ASN")
→ Validate: total qty (400+600) = 1000 = PO qty → Valid
→ Update status → "FULLY_SHIPPED"
→ Log event: "FULLY_SHIPPED", metadata={shipment_id: "ASN002", qty: 600, total: 1000}
```

### Step 4: First Invoice Arrives
```
Input: po_number="PO123", invoice_number="INV001", amount=$6000
→ Find BusinessTransaction by po_number="PO123" → Found!
→ Create TransactionDocumentLink(role="INVOICE")
→ Validate: items match? → Yes
→ Validate: amount $6k < PO $10k → Valid (partial invoice)
→ Update status → "INVOICE_RECEIVED"
→ Log event: "INVOICE_RECEIVED", metadata={invoice: "INV001", amount: 6000}
```

### Step 5: Second Invoice Arrives
```
Input: po_number="PO123", invoice_number="INV002", amount=$4000
→ Find BusinessTransaction by po_number="PO123" → Found!
→ Create TransactionDocumentLink(role="INVOICE")
→ Validate: total amount ($6k+$4k) = $10k = PO → Valid
→ All docs valid? → Yes
→ Update status → "COMPLETED"
→ Log event: "COMPLETED", metadata={invoice: "INV002", amount: 4000, total: 10000}
```

### Final State
```
BusinessTransaction {
  transaction_id: "txn-abc123",
  po_number: "PO123",
  status: "COMPLETED",
  po_count: 1,
  asn_count: 2,
  invoice_count: 2
}

Timeline: [
  PO_RECEIVED (t=09:00),
  ASN_RECEIVED (t=10:00, qty=400),
  ASN_RECEIVED (t=14:00, qty=600),
  FULLY_SHIPPED (t=14:00),
  INVOICE_RECEIVED (t=15:00, amount=$6k),
  INVOICE_RECEIVED (t=16:30, amount=$4k),
  COMPLETED (t=16:30)
]
```

---

## API Endpoints (New)

### Get Transaction Details
```http
GET /api/v1/transactions/{transaction_id}
→ BusinessTransactionResponse with full details
```

### Get Transaction Timeline
```http
GET /api/v1/transactions/{transaction_id}/timeline
→ List of TransactionTimelineResponse (chronological)
```

### List Transactions
```http
GET /api/v1/transactions?po_number=PO123&status=COMPLETED&skip=0&limit=100
→ Paginated list of BusinessTransactionResponse
```

### Get Related Documents (Updated)
```http
GET /api/v1/documents/{doc_id}/related
→ Enhanced to return BusinessTransaction + all linked docs
```

---

## Testing Strategy

### Unit Tests
- `test_extract_correlation_keys()` - Variant field name handling
- `test_find_transaction()` - Priority-order searching
- `test_create_transaction()` - ID generation, defaults
- `test_validate_document_in_transaction()` - Qty/amount matching
- `test_update_transaction_status()` - Status transitions

### Integration Tests
- `test_single_po_single_invoice()` - Simple case (MVP compatibility)
- `test_single_po_multiple_asns()` - Partial shipments
- `test_single_po_multiple_invoices()` - Partial invoicing
- `test_concurrent_document_arrival()` - Race conditions
- `test_backfill_existing_documents()` - Migration safety

### Regression Tests
- Old `linked_document_id` still works
- Old API endpoints still return data
- Old SLA logic unaffected
- HITL flagging still works
- Confidence scoring unchanged

---

## Backward Compatibility

### What Doesn't Change
- Document processing pipeline (still works)
- SLA calculation (still works)
- HITL flagging (still works)
- Old API endpoints (still return data)
- Confidence scoring (still works)

### What Gets Deprecated (Slowly)
- Direct use of `linked_document_id` (replaced by BusinessTransaction)
- Old `/documents/{id}/related` (enhanced with transaction data)

### Migration Window
- **Weeks 1-4:** Dual systems (both old and new working)
- **Weeks 5-8:** Old system optional (new system primary)
- **After Week 12:** Old system removed/archived

---

## SLA Preparation (Not Yet Implemented)

Fields added to BusinessTransaction but logic not activated:
```
ship_by_date       - When should goods ship?
expected_delivery  - When should goods arrive?
dispatch_deadline  - When should invoice arrive?
```

Future implementation will:
1. Calculate SLA deadlines on transaction creation
2. Monitor deadlines during document arrival
3. Flag AT_RISK/BREACHED status
4. Log SLA events to timeline
5. Report SLA compliance metrics

---

## Deployment Steps

### Week 1: Phase 1 (Deploy Models)
1. Run database migration (create tables)
2. Deploy new models.py
3. Deploy new schemas.py
4. Deploy CorrelationService
5. Status: Ready but not yet used

### Week 2: Phase 2 (Enable Dual-Write)
1. Integrate CorrelationService in inbound pipeline
2. Update API responses to include new fields
3. Status: Both old and new working in parallel

### Week 3: Phase 3 (Backfill)
1. Run backfill script for existing documents
2. Verify all documents processed
3. Status: All documents have business_transaction_id

### Week 4: Phase 4 (Switch)
1. Update queries to prefer new model
2. Remove old code references
3. Deprecate linked_document_id from responses
4. Status: New model primary, old deprecated

---

## Success Metrics

✅ **Correctness**
- All documents have business_transaction_id
- TransactionDocumentLink records exist for all docs
- TransactionTimeline events logged correctly
- Status transitions accurate

✅ **Performance**
- Queries fast (< 100ms)
- No N+1 queries
- Backfill completes in reasonable time
- Timeline queries performant

✅ **Reliability**
- No regressions in existing features
- HITL flagging still works
- SLA fields preserved
- Migration is reversible

✅ **User Impact**
- Supports partial shipments
- Supports partial invoicing
- No disruption to existing workflow
- New data available for reports

---

## Known Limitations (Acceptable for MVP)

1. ⚠️ No fuzzy matching yet (exact keys only)
   - Can add later with confidence < 1.0

2. ⚠️ No cross-partner consolidation
   - Each supplier's POs are separate transactions
   - Can add complex matching later if needed

3. ⚠️ SLA monitoring not yet implemented
   - Fields ready, logic postponed
   - Can add in next phase

4. ⚠️ No AI-based matching
   - Using exact keys only
   - Can enhance with ML later

---

## Files Delivered

1. **TRANSACTION_CORRELATION_REFACTOR.md** (this directory)
   - Complete architecture & design
   - Problem statement
   - Solution approach
   - Example workflow

2. **IMPLEMENTATION_MODELS.py**
   - SQLAlchemy models (ready to copy to app/db/models.py)

3. **IMPLEMENTATION_SCHEMAS.py**
   - Pydantic schemas (ready to copy to app/api/schemas/)

4. **IMPLEMENTATION_CORRELATION_SERVICE.py**
   - CorrelationService class (ready to copy to app/services/)

5. **MIGRATION_PLAN.md**
   - Phase-by-phase deployment (this directory)
   - Risk assessment
   - Rollback procedures
   - Timeline & checkpoints

6. **IMPLEMENTATION_SUMMARY.md** (this file)
   - Quick reference
   - How everything fits together

---

## Next Steps

### Immediate (Today)
- [ ] Review this architecture
- [ ] Approve approach
- [ ] Assign implementation lead

### Week 1 (Phase 1)
- [ ] Create database migration
- [ ] Copy models to app/db/
- [ ] Copy schemas to app/api/
- [ ] Copy CorrelationService to app/services/
- [ ] Run tests

### Week 2 (Phase 2)
- [ ] Integrate into inbound pipeline
- [ ] Update API responses
- [ ] Deploy to staging
- [ ] Monitor logs

### Week 3-4
- [ ] Backfill + verify
- [ ] Switch to new model
- [ ] Remove old code
- [ ] Production deployment

---

## Contact & Questions

For questions about:
- **Architecture:** See TRANSACTION_CORRELATION_REFACTOR.md
- **Implementation:** See specific IMPLEMENTATION_* files
- **Deployment:** See MIGRATION_PLAN.md
- **Examples:** See example workflow in TRANSACTION_CORRELATION_REFACTOR.md


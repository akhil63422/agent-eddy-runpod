# Migration Plan: linked_document_id → BusinessTransaction

## Overview

This document outlines how to migrate from the simple `linked_document_id` approach to the new `BusinessTransaction` model **without breaking existing functionality**.

**Timeline:** 4 weeks  
**Phases:** 4  
**Complexity:** Medium (mostly additive, backward compatible)

---

## Phase 1: Deploy New Models (Week 1)

### Objective
Get the new tables and models in place while keeping the old logic working.

### Tasks

#### 1.1 Create Database Migration

```sql
-- File: migrations/003_add_business_transactions.sql

-- NEW TABLE: business_transactions
CREATE TABLE business_transactions (
    id VARCHAR PRIMARY KEY,
    transaction_id VARCHAR UNIQUE NOT NULL,
    po_number VARCHAR NOT NULL,
    order_number VARCHAR,
    reference_number VARCHAR,
    buyer VARCHAR,
    supplier VARCHAR,
    status VARCHAR(32) DEFAULT 'CREATED',
    po_count INTEGER DEFAULT 0,
    asn_count INTEGER DEFAULT 0,
    invoice_count INTEGER DEFAULT 0,
    correlation_confidence FLOAT DEFAULT 1.0,
    ship_by_date TIMESTAMP,
    expected_delivery_date TIMESTAMP,
    dispatch_deadline TIMESTAMP,
    metadata JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_business_transactions_po_number ON business_transactions(po_number);
CREATE INDEX idx_business_transactions_order_number ON business_transactions(order_number);
CREATE INDEX idx_business_transactions_reference ON business_transactions(reference_number);
CREATE INDEX idx_business_transactions_status ON business_transactions(status);

-- NEW TABLE: transaction_document_links
CREATE TABLE transaction_document_links (
    id VARCHAR PRIMARY KEY,
    business_transaction_id VARCHAR NOT NULL,
    transaction_document_id VARCHAR NOT NULL,
    document_role VARCHAR(32) NOT NULL,
    correlation_key VARCHAR(32),
    confidence FLOAT DEFAULT 1.0,
    validation_status VARCHAR(32),
    validation_errors JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (business_transaction_id) REFERENCES business_transactions(id),
    FOREIGN KEY (transaction_document_id) REFERENCES transaction_documents(id)
);

CREATE INDEX idx_transaction_document_links_transaction ON transaction_document_links(business_transaction_id);
CREATE INDEX idx_transaction_document_links_document ON transaction_document_links(transaction_document_id);

-- NEW TABLE: transaction_timelines
CREATE TABLE transaction_timelines (
    id VARCHAR PRIMARY KEY,
    business_transaction_id VARCHAR NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    event_description VARCHAR,
    source_document_id VARCHAR,
    status_before VARCHAR(32),
    status_after VARCHAR(32),
    metadata JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (business_transaction_id) REFERENCES business_transactions(id)
);

CREATE INDEX idx_transaction_timelines_transaction ON transaction_timelines(business_transaction_id);

-- MODIFY TABLE: transaction_documents (add new column, keep old for migration)
ALTER TABLE transaction_documents 
ADD COLUMN business_transaction_id VARCHAR,
ADD COLUMN FOREIGN KEY (business_transaction_id) REFERENCES business_transactions(id);

CREATE INDEX idx_transaction_documents_business_transaction ON transaction_documents(business_transaction_id);
```

#### 1.2 Update SQLAlchemy Models

```
File: app/db/models.py

- Add BusinessTransaction class (see IMPLEMENTATION_MODELS.py)
- Add TransactionDocumentLink class
- Add TransactionTimeline class
- Add business_transaction_id column to TransactionDocument
```

**Status:** DEPLOYED but not yet used

#### 1.3 Add Pydantic Schemas

```
File: app/api/schemas/transaction_schemas.py

- Add all schemas (see IMPLEMENTATION_SCHEMAS.py)
```

**Status:** Ready for use

#### 1.4 Deploy CorrelationService

```
File: app/services/correlation_service.py

- Add TransactionCorrelationService class (see IMPLEMENTATION_CORRELATION_SERVICE.py)
```

**Status:** Ready but not yet called in pipeline

### Deployment Checklist
- [ ] Database migration applied
- [ ] Models deployed
- [ ] Schemas deployed
- [ ] CorrelationService deployed
- [ ] Tests updated (if applicable)
- [ ] Code review complete
- [ ] Ready for Phase 2

---

## Phase 2: Enable Dual-Write (Week 2)

### Objective
Start populating `BusinessTransaction` for new documents while keeping `linked_document_id` working.

### Tasks

#### 2.1 Update Inbound Pipeline

Modify `app/api/routes.py` to call `CorrelationService` after document is saved:

```python
# In process_inbound() after db.commit():

from app.services.correlation_service import correlation_service

doc = TransactionDocument(...)
db.add(doc)
db.commit()

# NEW: Correlate document
try:
    transaction, result = correlation_service.correlate_document(doc, db)
    log.info(f"Correlation result: {result}")
except Exception as e:
    log.error(f"Correlation failed: {e}")
    # Don't fail the whole document processing, just log

# OLD: Keep existing SLA logic
_auto_link_and_sla(doc, db)
```

#### 2.2 Update Response Schemas

Modify document response to include both old and new fields:

```python
class TransactionDocumentResponse(BaseModel):
    # ... existing fields ...
    
    # OLD (deprecated, keep for backward compatibility)
    linked_document_id: Optional[str] = None
    
    # NEW (preferred)
    business_transaction_id: Optional[str] = None
    business_transaction: Optional[BusinessTransactionResponse] = None
```

#### 2.3 Add New API Endpoints (Optional for Phase 2)

These are ready but can be used later:

```python
# app/api/routes/transaction_routes.py

@router.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    # Get BusinessTransaction with all linked documents
    ...

@router.get("/transactions/{transaction_id}/timeline")
def get_transaction_timeline(transaction_id: str, db: Session = Depends(get_db)):
    # Get timeline events
    ...
```

### Testing During Phase 2

```python
# Test: New documents get business_transaction_id
def test_new_document_gets_correlation():
    # Upload document
    # Assert: business_transaction_id is NOT NULL
    # Assert: TransactionDocumentLink record created
    # Assert: TransactionTimeline event logged

# Test: Old linked_document_id still works
def test_old_api_still_works():
    # Query documents
    # Assert: linked_document_id field returned (even if NULL)
    # Assert: /documents/{id}/related endpoint works
```

### Deployment Checklist
- [ ] CorrelationService integrated into inbound pipeline
- [ ] Dual-write working (both linked_document_id and business_transaction_id populated)
- [ ] API responses include both old and new fields
- [ ] Tests passing
- [ ] Monitoring logs show correlation results
- [ ] Ready for Phase 3

---

## Phase 3: Backfill Existing Documents (Week 3)

### Objective
Populate BusinessTransaction for all existing documents that were created before Phase 2.

### Tasks

#### 3.1 Create Backfill Script

```python
# File: scripts/backfill_business_transactions.py

from app.db.session import SessionLocal
from app.db.models import TransactionDocument, BusinessTransaction, TransactionDocumentLink
from app.services.correlation_service import correlation_service

def backfill_existing_documents():
    """
    For each existing document without business_transaction_id:
    1. Call correlation_service.correlate_document()
    2. Verify business_transaction_id was set
    3. Compare with linked_document_id (old way)
    4. Log any discrepancies
    """
    db = SessionLocal()
    
    # Find docs without business_transaction_id
    unprocessed = db.query(TransactionDocument).filter(
        TransactionDocument.business_transaction_id == None
    ).all()
    
    processed = 0
    errors = 0
    
    for doc in unprocessed:
        try:
            transaction, result = correlation_service.correlate_document(doc, db)
            processed += 1
            
            # Optional: Verify against old linked_document_id
            if doc.linked_document_id and result["status"] == "LINKED_EXISTING":
                # Check if they match
                log.info(f"Old link: {doc.linked_document_id}, New: {transaction.id}")
        except Exception as e:
            log.error(f"Backfill error for {doc.id}: {e}")
            errors += 1
    
    log.info(f"Backfill complete: {processed} processed, {errors} errors")

if __name__ == "__main__":
    backfill_existing_documents()
```

#### 3.2 Run Backfill

```bash
# Option 1: Run directly
python scripts/backfill_business_transactions.py

# Option 2: Run as migration (safer)
# Create migration file that calls the backfill function
alembic revision --autogenerate -m "backfill_business_transactions"
# Edit migration file to call backfill_existing_documents()
alembic upgrade head
```

#### 3.3 Verify Backfill

```python
# Script: scripts/verify_backfill.py

def verify_backfill():
    """
    Check:
    1. No documents without business_transaction_id (except new ones from Phase 2)
    2. TransactionDocumentLink records exist for all
    3. Old linked_document_id matches new relationships
    """
    db = SessionLocal()
    
    # Check 1: Any unprocessed?
    unprocessed = db.query(TransactionDocument).filter(
        TransactionDocument.business_transaction_id == None
    ).count()
    
    if unprocessed > 0:
        log.warning(f"{unprocessed} documents still without business_transaction_id")
    else:
        log.info("✓ All documents have business_transaction_id")
    
    # Check 2: Links exist?
    docs_with_links = db.query(TransactionDocumentLink).count()
    total_docs = db.query(TransactionDocument).count()
    
    # Check 3: Comparison
    discrepancies = check_old_vs_new_linking(db)
    if discrepancies:
        log.warning(f"{len(discrepancies)} discrepancies found")
        for disc in discrepancies:
            log.warning(f"  {disc}")
    else:
        log.info("✓ Old and new linking methods match")
```

### Deployment Checklist
- [ ] Backfill script created and tested
- [ ] All existing documents processed
- [ ] Verification complete (no discrepancies)
- [ ] Old and new linking match
- [ ] Ready for Phase 4

---

## Phase 4: Switch to New Model (Week 4)

### Objective
Make BusinessTransaction the primary linking method. Old `linked_document_id` can be removed.

### Tasks

#### 4.1 Update All Queries

Replace queries using `linked_document_id` with new `BusinessTransaction` queries:

```python
# OLD
invoice = db.query(TransactionDocument).filter(
    TransactionDocument.id == doc_id
).first()
po = db.query(TransactionDocument).filter(
    TransactionDocument.id == invoice.linked_document_id
).first()

# NEW
link = db.query(TransactionDocumentLink).filter(
    TransactionDocumentLink.transaction_document_id == doc_id
).first()
transaction = db.query(BusinessTransaction).filter(
    BusinessTransaction.id == link.business_transaction_id
).first()
po_link = db.query(TransactionDocumentLink).filter(
    TransactionDocumentLink.business_transaction_id == transaction.id,
    TransactionDocumentLink.document_role == "PURCHASE_ORDER"
).first()
po = db.query(TransactionDocument).filter(
    TransactionDocument.id == po_link.transaction_document_id
).first()
```

#### 4.2 Update Existing API Endpoints

Modify `/documents/{id}/related` to use new model:

```python
# OLD: Return based on linked_document_id
# NEW: Return based on BusinessTransaction
```

#### 4.3 Deprecate Old Columns

Remove `linked_document_id` from response (still in DB for rollback):

```python
class TransactionDocumentResponse(BaseModel):
    # Remove: linked_document_id
    # Keep: business_transaction_id
```

#### 4.4 Update Frontend

Ensure frontend uses new endpoints:
- `GET /transactions/{transaction_id}` instead of `/documents/{id}/related`
- Display timeline, multiple documents, etc.

### Testing Phase 4

```python
# Comprehensive tests
def test_transaction_workflow():
    # PO arrives → Transaction created
    # ASN arrives → Added to transaction
    # Invoice arrives → Added to transaction
    # Check timeline shows all events
    # Check all documents linked via BusinessTransaction
    # Check SLA fields are prepared (not yet used)
```

### Deployment Checklist
- [ ] All queries updated
- [ ] API endpoints using new model
- [ ] Frontend updated
- [ ] Tests passing
- [ ] Monitoring shows new queries working
- [ ] No regressions
- [ ] Ready to remove old code

---

## Rollback Plan

If critical issues discovered at any phase:

### Phase 1 Rollback
- Drop new tables (backward compatible, nothing using them yet)
- Remove new models/schemas
- No impact to existing documents

### Phase 2 Rollback
- Stop calling CorrelationService in pipeline
- Continue using old `_auto_link_and_sla()` logic
- New documents won't have business_transaction_id, but everything still works

### Phase 3 Rollback
- Stop using backfilled data
- Keep new tables populated (for future use)
- Old linked_document_id still the source of truth

### Phase 4 Rollback
- Revert API changes
- Switch queries back to using linked_document_id
- New data model stays in DB for future migration attempt

---

## Database Cleanup (Post-Phase 4)

After 2-3 months of stable operation:

```sql
-- OPTION 1: Keep linked_document_id for 6 months (safe)
-- No action needed

-- OPTION 2: Remove deprecated column (after confidence increases)
ALTER TABLE transaction_documents DROP COLUMN linked_document_id;
```

---

## Risk Assessment

### High Confidence
- ✅ New tables are isolated, no breaking changes
- ✅ Dual-write allows rollback at any phase
- ✅ Old logic continues working
- ✅ Queries can coexist

### Medium Risk
- ⚠️ Backfill must correctly create BusinessTransactions
- ⚠️ Discrepancies between old and new linking must be resolved
- ⚠️ Query performance (new joins might be slower)

### Mitigation
- Run backfill on staging first
- Verify all documents
- Monitor query performance
- Keep old columns for 3+ months

---

## Success Criteria

✅ Phase 1: New tables exist, no errors  
✅ Phase 2: Dual-write working, both fields populated  
✅ Phase 3: All existing documents backfilled, no discrepancies  
✅ Phase 4: All queries use new model, no regressions  
✅ Final: Old linked_document_id removed or archived  

---

## Timeline Summary

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | 1 | Tables, models, schemas deployed |
| 2 | 2 | Dual-write active, new endpoints optional |
| 3 | 3 | All documents backfilled & verified |
| 4 | 4 | New model primary, old code removed/archived |

**Total Time:** 4 weeks  
**Effort:** Medium (mostly testing & verification)  
**Risk:** Low (backward compatible)


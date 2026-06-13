# PO-Invoice Linking + SLA Tracking: Feature Summary

## Quick Overview

This feature automatically links Purchase Orders (POs) to their corresponding Invoices, validates line item quantities and prices, enforces SLA deadlines per partner, and provides real-time compliance dashboards.

---

## What Problem Does This Solve?

### Before
```
PO Arrives → Stored in DB (standalone)
Invoice Arrives → Stored in DB (standalone)
ASN Arrives → Stored in DB (standalone)

No way to know:
- Which invoices belong to which PO
- If invoice quantities match the PO
- If documents met their deadlines
- Overall compliance with SLA targets
```

### After
```
PO Arrives → Stored with SLA deadline (24h default)
Invoice Arrives → AUTO-LINKED to PO + items validated
Discrepancies Found? → AUTO-FLAGGED for human review
SLA Dashboard → Shows compliance rate, breached items, trends
```

---

## Feature Scope

### What Gets Implemented

✅ **Document Linking**
- Auto-match Invoice to PO via `po_number` field
- Foreign key relationship stored in database
- Many invoices can link to one PO

✅ **Item Matching**
- Compare invoice line items against PO items
- Detect: Quantity mismatch, Price mismatch, Unknown items
- Store discrepancies for review

✅ **SLA Configuration**
- Per-partner dispatch deadline (default 24h)
- Configurable via Partner Portal
- Calculated on document arrival

✅ **SLA Tracking**
- Real-time status: MET, ON_TIME, AT_RISK, BREACHED
- Dashboard metrics: Compliance %, files within/breached SLA
- Average processing time (P95, P99 percentiles)

✅ **HITL Integration**
- Auto-flag invoices with discrepancies
- Errors stored for manual review
- Blocks auto-dispatch until resolved

✅ **Frontend Display**
- Transaction Chain section in Document Detail
- Shows linked document, SLA countdown, discrepancies
- Clickable navigation between linked documents

✅ **Reporting & Analytics**
- SLA dashboard endpoint: `/api/v1/analytics/sla`
- Partner-specific performance metrics
- Breach alerts and compliance trends

### What's NOT in Scope

❌ Automatic invoice payment blocking (HITL allows manual dispatch)
❌ Multi-level approvals (single HITL review)
❌ Complex pricing rules (simple tolerance: ±0.01)
❌ Backfill for historical documents (applies to new docs only)

---

## Data Model Changes

### New Columns in `transaction_documents` Table

| Column | Type | Purpose |
|--------|------|---------|
| `linked_document_id` | String (FK) | Points to related PO/Invoice |
| `document_reference_number` | String(128) | "PO-2024-12345" or "INV-2024-67890" |
| `expected_dispatch_by` | DateTime | Calculated: created_at + sla_hours |
| `sla_hours` | Integer | Hours allocated for dispatch |
| `item_match_status` | String(32) | MATCHED, DISCREPANCY, PENDING, NA |
| `item_discrepancies` | JSON | Array of discrepancy objects |

### New Column in `partner_profiles` Table

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `sla_hours` | Integer | 24 | Hours allowed before dispatch deadline |

---

## Processing Flow

### For PURCHASE_ORDER

```
1. Document arrives
2. Processed through inbound pipeline
3. Saved to transaction_documents table
4. _auto_link_and_sla() called:
   ├─ Extract po_number from canonical
   ├─ Look up partner's sla_hours from partner_profiles
   ├─ Calculate expected_dispatch_by = created_at + sla_hours
   ├─ Set item_match_status = "NA" (not applicable)
   └─ Commit changes
5. Database now has SLA deadline for downstream tracking
```

### For INVOICE

```
1. Document arrives
2. Processed through inbound pipeline
3. Saved to transaction_documents table
4. _auto_link_and_sla() called:
   ├─ Extract po_number from canonical
   ├─ Query for matching PURCHASE_ORDER:
   │  SELECT * FROM transaction_documents 
   │  WHERE transaction_type = 'PURCHASE_ORDER'
   │  AND document_reference_number = po_number
   │  AND source_partner = supplier_name
   │
   ├─ If found:
   │  ├─ Set linked_document_id = PO.id (FOREIGN KEY)
   │  ├─ Call _match_items(po_items, invoice_items)
   │  ├─ Get list of discrepancies
   │  ├─ If discrepancies exist:
   │  │  ├─ Set item_match_status = "DISCREPANCY"
   │  │  ├─ Set final_status = "HITL_REQUIRED"
   │  │  └─ Add error message to validation_errors
   │  │  └─ (STOPS auto-dispatch, waits for human review)
   │  └─ Else:
   │     └─ Set item_match_status = "MATCHED"
   │        └─ (Proceeds to dispatch normally)
   │
   └─ Else (PO not found):
      └─ Set item_match_status = "PENDING"
         └─ (Will link when PO arrives, or flag as orphan)
5. Commit changes
```

### For SHIPMENT_NOTICE (optional)

```
1. Document arrives
2. Processed through inbound pipeline
3. Saved to transaction_documents table
4. _auto_link_and_sla() called:
   ├─ Extract shipment_id from canonical
   ├─ Set item_match_status = "NA" (ASN doesn't validate items)
   └─ Commit changes
```

---

## Foreign Key Relationships

### Database Schema

```sql
CREATE TABLE transaction_documents (
  id UUID PRIMARY KEY,
  linked_document_id UUID,  -- NULLABLE
  FOREIGN KEY (linked_document_id) REFERENCES transaction_documents(id)
);
```

### Query Examples

**Find all invoices for a specific PO:**
```sql
SELECT * FROM transaction_documents
WHERE linked_document_id = 'po-uuid-001'
AND transaction_type = 'INVOICE';
```

**Find the PO for an invoice:**
```sql
SELECT * FROM transaction_documents
WHERE id = (
  SELECT linked_document_id FROM transaction_documents
  WHERE id = 'inv-uuid-002'
);
```

**Get complete transaction chain:**
```sql
WITH chain AS (
  SELECT id, transaction_type, document_reference_number
  FROM transaction_documents
  WHERE id = 'po-uuid-001'
  
  UNION ALL
  
  SELECT id, transaction_type, document_reference_number
  FROM transaction_documents
  WHERE linked_document_id = 'po-uuid-001'
)
SELECT * FROM chain ORDER BY created_at ASC;
```

---

## Item Matching Logic

### Comparison Algorithm

```python
def _match_items(po_canonical, invoice_canonical):
    discrepancies = []
    
    # Build PO item map keyed by product_id
    po_items = {item['product_id']: item for item in po_canonical.get('items', [])}
    
    # Check each invoice item
    for inv_item in invoice_canonical.get('items', []):
        inv_sku = inv_item.get('product_id')
        inv_qty = inv_item.get('quantity')
        inv_price = inv_item.get('unit_price')
        
        # Rule 1: Item exists in PO?
        if inv_sku not in po_items:
            discrepancies.append({
                'type': 'UNKNOWN_ITEM',
                'product_id': inv_sku,
                'msg': f'Product {inv_sku} not in original PO'
            })
            continue
        
        po_item = po_items[inv_sku]
        po_qty = po_item.get('quantity')
        po_price = po_item.get('unit_price')
        
        # Rule 2: Quantity must match exactly
        if po_qty != inv_qty:
            discrepancies.append({
                'type': 'QTY_MISMATCH',
                'product_id': inv_sku,
                'po_qty': po_qty,
                'invoice_qty': inv_qty,
                'msg': f'Quantity mismatch: PO {po_qty} vs Invoice {inv_qty}'
            })
        
        # Rule 3: Price tolerance ±0.01
        if po_price and inv_price:
            if abs(float(po_price) - float(inv_price)) > 0.01:
                discrepancies.append({
                    'type': 'PRICE_MISMATCH',
                    'product_id': inv_sku,
                    'po_price': po_price,
                    'invoice_price': inv_price,
                    'msg': f'Price mismatch: PO ${po_price} vs Invoice ${inv_price}'
                })
    
    return discrepancies
```

### Examples

**Perfect Match:**
```
PO Item: SKU-001, qty=100, price=0.50
Invoice Item: SKU-001, qty=100, price=0.50
Result: ✓ MATCHED
```

**Quantity Mismatch:**
```
PO Item: SKU-002, qty=50, price=1.00
Invoice Item: SKU-002, qty=45, price=1.00
Result: ✗ DISCREPANCY (QTY_MISMATCH)
```

**Price Mismatch (exceeds tolerance):**
```
PO Item: SKU-003, qty=25, price=2.00
Invoice Item: SKU-003, qty=25, price=2.05
Result: ✗ DISCREPANCY (PRICE_MISMATCH)
Note: Difference = $0.05 > $0.01 tolerance
```

**Unknown Item:**
```
PO Items: SKU-001, SKU-002, SKU-003
Invoice Items: SKU-001, SKU-002, SKU-004  ← SKU-004 not in PO
Result: ✗ DISCREPANCY (UNKNOWN_ITEM)
```

---

## SLA Calculation

### Formula

```
expected_dispatch_by = created_at + sla_hours (in hours)

Example:
created_at: 2026-06-13 09:15:00 UTC
sla_hours: 24
expected_dispatch_by: 2026-06-14 09:15:00 UTC
```

### Status Determination

```python
now = datetime.now(timezone.utc)

if final_status in ("COMPLETED", "APPROVED"):
    if updated_at <= expected_dispatch_by:
        sla_status = "MET" ✓
    else:
        sla_status = "BREACHED" ✗
else:  # HITL_REQUIRED, IN_PROGRESS, etc.
    if now > expected_dispatch_by:
        sla_status = "BREACHED" ✗
    else:
        remaining_hours = (expected_dispatch_by - now).total_seconds() / 3600
        if remaining_hours <= 2:
            sla_status = "AT_RISK" ⚠️
        else:
            sla_status = "ON_TIME" ✓
```

### Dashboard Metrics

```
Total Documents Tracked: 50
├─ Met SLA: 47 (94%)
├─ Breached SLA: 2 (4%)
└─ Pending (on-time): 1 (2%)

Compliance Rate = (47 / 50) * 100 = 94%

Average Processing Time:
├─ For completed docs only
├─ Avg = sum(updated_at - created_at) / count
├─ Result: 45 seconds
└─ P95: 120 sec | P99: 180 sec
```

---

## Frontend Components

### Transaction Chain Section (New)

**Location:** DocumentDetail page, below canonical editor

**Contents:**
```
┌─────────────────────────────────────────┐
│ TRANSACTION CHAIN                       │
│                                         │
│ 🟢 SLA ON_TIME                         │
│ ⏱ Deadline: 2026-06-14 09:15:00       │
│                                         │
│ 📄 LINKED DOCUMENT:                     │
│    [PURCHASE_ORDER po-uuid] [MATCHED] │
│                                         │
│ ✓ No discrepancies found               │
└─────────────────────────────────────────┘
```

**For Invoices with Discrepancies:**
```
┌─────────────────────────────────────────┐
│ TRANSACTION CHAIN                       │
│                                         │
│ 🟡 SLA AT_RISK (2h remaining)          │
│ ⏱ Deadline: 2026-06-14 14:23:00       │
│                                         │
│ 📄 LINKED DOCUMENT:                     │
│    [PURCHASE_ORDER po-uuid] [⚠ DISC.] │
│                                         │
│ ⚠️ DISCREPANCIES:                      │
│ • QTY_MISMATCH: SKU-002                │
│   PO: 50 / Invoice: 45                 │
│ • UNKNOWN_ITEM: SKU-004                │
│   Not in original PO                   │
└─────────────────────────────────────────┘
```

### API Response Structure

```javascript
GET /api/v1/documents/{doc_id}/related

{
  "document": { /* full doc details */ },
  "linked_document": { /* PO or Invoice */ },
  "referencing_documents": [ /* invoices for this PO */ ],
  "sla": {
    "status": "ON_TIME",
    "deadline": "2026-06-14T09:15:00Z",
    "hours_allocated": 24
  },
  "item_match": {
    "status": "MATCHED",
    "discrepancies": []
  }
}
```

---

## Configuration

### Partner-Level SLA

**During Partner Setup:**
```
Partner: RETAILER_ABC
sla_hours: 24  (default)

Partner: RETAILER_URGENT
sla_hours: 4   (expedited)

Partner: RETAILER_FLEX
sla_hours: 72  (relaxed)
```

**Change Later:**
```http
PATCH /api/v1/partners/{partner_id}
{
  "sla_hours": 48
}
```

### Item Matching Tolerances (Code Constants)

```python
PRICE_TOLERANCE = 0.01  # ±$0.01
QUANTITY_MATCH = "EXACT"  # Must match exactly
```

---

## API Endpoints

### New Endpoints

```http
GET  /api/v1/documents/{doc_id}/related
     ├─ Returns linked document + SLA + item match status
     └─ Used by frontend Transaction Chain section

GET  /api/v1/analytics/sla?period=7d
     ├─ Returns compliance rate, files within/breached SLA
     └─ Used by SLA Dashboard
```

### Modified Endpoints

```http
PATCH /api/v1/partners/{partner_id}
      ├─ Now accepts "sla_hours" field
      └─ Updates per-partner SLA configuration
```

### Existing Endpoints (Enhanced)

```http
GET  /api/v1/documents/
     ├─ Now includes SLA fields in response
     └─ Can filter by status (e.g., Needs Review for HITL docs)

GET  /api/v1/documents/{doc_id}
     ├─ Now includes linked_document_id, item_match_status
     └─ Frontend calls /related endpoint for full chain info
```

---

## Files Changed

### Backend

```
app/db/models.py
├─ Added 6 columns to TransactionDocument
├─ Added sla_hours to PartnerProfile
└─ Database auto-creates on startup

app/api/routes.py
├─ Added _match_items() function
├─ Added _auto_link_and_sla() function
├─ Calls _auto_link_and_sla() after document save
└─ Applies to both /inbound and /outbound endpoints

app/api/document_routes.py
├─ Added GET /documents/{doc_id}/related endpoint
├─ Returns linked docs + SLA + item match info
└─ Used by frontend for Transaction Chain display

app/api/partner_routes.py
├─ Updated _apply_update() to handle sla_hours
├─ Allows SLA configuration via PATCH endpoint
└─ Includes sla_hours in response serialization

app/api/analytics_routes.py
├─ Implemented real GET /analytics/sla endpoint
├─ Calculates compliance rate, breached SLAs
└─ Returns processing time metrics (avg, P95, P99)
```

### Frontend

```
frontend-ak/src/services/documents.js
├─ Added getRelatedDocuments() function
└─ Fetches linked doc + SLA info for display

frontend-ak/src/pages/DocumentDetail.jsx
├─ Added "related" state for linked doc data
├─ Added useEffect to load related documents
├─ Added "Transaction Chain" section
├─ Displays SLA status, linked doc, discrepancies
└─ Makes linked doc clickable
```

---

## Testing Checklist

### Happy Path
- [ ] Partner created with sla_hours=24
- [ ] PO arrives → expected_dispatch_by calculated correctly
- [ ] Invoice arrives → auto-linked to PO via po_number
- [ ] Items match → item_match_status="MATCHED", final_status="COMPLETED"
- [ ] Frontend shows Transaction Chain with linked PO
- [ ] SLA dashboard shows 100% compliance (doc completed before deadline)

### Error Cases
- [ ] Invoice with qty mismatch → item_match_status="DISCREPANCY"
- [ ] Invoice with qty mismatch → hitl_required=TRUE, final_status="HITL_REQUIRED"
- [ ] Invoice references unknown PO → item_match_status="PENDING"
- [ ] Document exceeds SLA deadline → sla_status="BREACHED"
- [ ] Document within 2 hours of deadline → sla_status="AT_RISK"
- [ ] Frontend shows discrepancies with details

### SLA Dashboard
- [ ] Compliance rate calculated correctly
- [ ] Breached SLAs counted accurately
- [ ] Processing time metrics calculated (avg, P95, P99)
- [ ] Partner-specific performance available

---

## Monitoring & Logs

### Expected Log Messages

```
[auto-link] PO PO-2024-12345 → SLA 24h, deadline 2026-06-14 09:15:00
[auto-link] Invoice linked to PO PO-2024-12345 → items matched
[auto-link] Invoice linked to PO PO-2024-12345 with 2 mismatches → HITL
[auto-link] Invoice references PO PO-2024-99999 but not found in DB
```

### Database Queries for Monitoring

```sql
-- Find invoices pending PO arrival
SELECT id, document_reference_number, item_match_status, created_at
FROM transaction_documents
WHERE transaction_type = 'INVOICE'
AND item_match_status = 'PENDING'
ORDER BY created_at DESC;

-- Find documents approaching SLA deadline
SELECT id, document_reference_number, expected_dispatch_by, 
       now() as current_time
FROM transaction_documents
WHERE expected_dispatch_by IS NOT NULL
AND expected_dispatch_by - now() < '2 hours'::interval
AND final_status NOT IN ('COMPLETED', 'APPROVED');

-- Find recent breaches
SELECT id, document_reference_number, expected_dispatch_by, final_status
FROM transaction_documents
WHERE expected_dispatch_by IS NOT NULL
AND now() > expected_dispatch_by
AND final_status NOT IN ('COMPLETED', 'APPROVED')
ORDER BY expected_dispatch_by DESC;
```

---

## Future Enhancements

### Phase 2 (Potential)
- Automatic email/webhook alerts for breached SLAs
- RCA (Root Cause Analysis) for breaches
- Machine learning to predict processing time per partner
- Quantity variances < 5% auto-approval
- Multi-invoice rollup for partial receipts

### Phase 3 (Potential)
- Three-way match: PO + Invoice + Receipt/ASN
- Payment hold integration
- Vendor scorecards based on SLA compliance
- Automated PO aging reports
- Discrepancy resolution workflow

---

## Support & Documentation

### Reference Documents
- `HAPPY_PATH_WALKTHROUGH.md` - End-to-end flow with examples
- `ARCHITECTURE_DIAGRAMS.md` - Visual diagrams, queries, state machines
- `API_EXAMPLES.md` - Curl commands and JSON request/response samples

### Quick Links
- Partner Portal: Configure SLA hours
- Document Detail: View Transaction Chain
- SLA Dashboard: Monitor compliance metrics
- API Docs: Swagger UI at `/api/v1/docs`


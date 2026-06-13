# PO-Invoice Linking: Architecture & Diagrams

## 1. DOCUMENT FLOW DIAGRAM

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        PARTNER ONBOARDING                                  │
│                                                                            │
│  Admin Portal → Partner Setup → PartnerProfile Record Created             │
│                 └─ sla_hours: 24 (configurable per partner)               │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                      DOCUMENT ARRIVES (INBOUND)                             │
│                                                                            │
│  Partner sends:  PO (X12 850) / Invoice (X12 810) / ASN (X12 856)        │
│                          ↓                                                 │
│                   API: POST /inbound                                       │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                    INBOUND PROCESSING PIPELINE                             │
│                                                                            │
│  1. Format Detection  → X12 / JSON / XML / CSV                            │
│  2. Parser           → Extract transaction_type, po_number, etc.          │
│  3. Relationship     → Determine buyer/seller/direction                   │
│  4. Normalization    → Build canonical_event JSON                         │
│  5. ERP Mapping      → Map to SAP/Oracle fields                           │
│  6. Validation       → Check required fields                              │
│  7. Save to DB       → TransactionDocument created                        │
│  8. [NEW] Auto-Link  → Call _auto_link_and_sla(doc, db)                  │
│                        ↓                                                   │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌───────────┴───────────┐
                        ↓                       ↓
        ┌──────────────────────┐  ┌──────────────────────┐
        │  PURCHASE_ORDER      │  │  INVOICE/ASN         │
        ├──────────────────────┤  ├──────────────────────┤
        │ Extract po_number    │  │ Extract po_number    │
        │ Look up partner SLA  │  │ Query for matching   │
        │ Set sla_hours = 24   │  │ PURCHASE_ORDER       │
        │ Calculate deadline   │  │                      │
        │ expected_dispatch_by │  │ If found:            │
        │ item_match_status=NA │  │  ├─ Link: set FK     │
        │                      │  │  ├─ Match items      │
        │ Commit               │  │  └─ Flag discrepancies
        └──────────────────────┘  │                      │
                                  │ If not found:        │
                                  │  └─ PENDING status   │
                                  │                      │
                                  │ Commit               │
                                  └──────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE STORED                                     │
│                                                                            │
│  TransactionDocument {                                                     │
│    id: po-uuid-001,                                                       │
│    transaction_type: PURCHASE_ORDER,                                      │
│    document_reference_number: "PO-2024-12345",                            │
│    sla_hours: 24,                                                         │
│    expected_dispatch_by: 2026-06-14 09:15:00,                            │
│    item_match_status: NA,                                                 │
│    linked_document_id: NULL,                                              │
│    canonical_event: { po_number: "PO-2024-12345", items: [...] }        │
│  }                                                                         │
│                                                                            │
│  TransactionDocument {                                                     │
│    id: inv-uuid-002,                                                      │
│    transaction_type: INVOICE,                                             │
│    document_reference_number: "INV-2024-67890",                           │
│    linked_document_id: po-uuid-001,  ← FOREIGN KEY LINK                  │
│    item_match_status: MATCHED,                                            │
│    item_discrepancies: [],                                                │
│    canonical_event: { po_number: "PO-2024-12345", items: [...] }        │
│  }                                                                         │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                    FRONTEND DISPLAY (DocumentDetail)                       │
│                                                                            │
│  GET /api/v1/documents/inv-uuid-002/related                               │
│                        ↓                                                   │
│  Response contains:                                                        │
│    {                                                                       │
│      sla: {                                                                │
│        status: "ON_TIME",                                                 │
│        deadline: "2026-06-14T09:15:00",                                  │
│        hours_allocated: 24                                                │
│      },                                                                    │
│      linked_document: {                                                   │
│        id: po-uuid-001,                                                   │
│        transaction_type: PURCHASE_ORDER,                                  │
│        document_reference_number: "PO-2024-12345"                         │
│      },                                                                    │
│      item_match: {                                                        │
│        status: MATCHED,                                                   │
│        discrepancies: []                                                  │
│      }                                                                     │
│    }                                                                       │
│                        ↓                                                   │
│  UI Renders "Transaction Chain" section showing:                          │
│    • Linked PO details (clickable)                                        │
│    • SLA status and countdown                                             │
│    • Item match status and discrepancies                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DATABASE RELATIONSHIPS

### 2.1: Entity-Relationship Diagram

```
┌─────────────────────────────────┐
│    partner_profiles             │
├─────────────────────────────────┤
│ id (PK)                         │
│ partner_id                      │
│ partner_name                    │
│ isa_id                          │
│ sla_hours ← NEW FIELD           │
│ created_at                      │
│ updated_at                      │
└─────────────────────────────────┘
            ↑ references via
            │ source_partner name match
            │
            │
        ┌───┴────────────────────────────────────────┐
        │                                            │
┌───────┴──────────────────────────┐    ┌──────────┴────────────────────┐
│   transaction_documents (PO)     │    │ transaction_documents (Invoice)│
├────────────────────────────────┤    ├──────────────────────────────┤
│ id: po-uuid-001                │    │ id: inv-uuid-002             │
│ transaction_type: PO           │    │ transaction_type: INVOICE    │
│ source_partner: RETAILER_ABC   │    │ source_partner: ACME_CORP    │
│ document_ref_number: PO-123    │    │ document_ref_number: INV-456 │
│ sla_hours: 24 ← SET BY PARTNER │    │ linked_document_id: po-uuid  │
│ expected_dispatch_by: DATE+24h │    │                   ↑          │
│ item_match_status: NA          │    │                   │          │
│ canonical_event: JSON          │    │ item_match_status: MATCHED   │
│ linked_document_id: NULL       │    │ item_discrepancies: []       │
│ created_at: 2026-06-13 09:15   │    │ canonical_event: JSON        │
│ updated_at: 2026-06-13 09:15   │    │ created_at: 2026-06-13 14:23 │
└────────────────────────────────┘    │ updated_at: 2026-06-13 14:23 │
                                       └──────────────────────────────┘
                                                FOREIGN KEY RELATIONSHIP:
                                                inv.linked_document_id 
                                                references po.id
```

### 2.2: SQL Relationships

```sql
-- One-to-Many: One PO can have many Invoices
SELECT DISTINCT
  po.id,
  po.document_reference_number,
  COUNT(inv.id) as invoice_count
FROM transaction_documents po
LEFT JOIN transaction_documents inv
  ON inv.linked_document_id = po.id
  AND inv.transaction_type = 'INVOICE'
WHERE po.transaction_type = 'PURCHASE_ORDER'
GROUP BY po.id
ORDER BY invoice_count DESC;

-- Result:
-- po-uuid-001 | PO-2024-12345    | 3 (three invoices for this PO)
-- po-uuid-002 | PO-2024-12346    | 1
-- po-uuid-003 | PO-2024-12347    | 2
```

---

## 3. STATE MACHINE: DOCUMENT STATUS

```
                        ┌─────────────────────┐
                        │  Document Received  │
                        └──────────┬──────────┘
                                   │
                          ┌────────▼─────────┐
                          │  IN_PROGRESS     │
                          │  (parsing, etc)  │
                          └────────┬─────────┘
                                   │
                   ┌───────────────┴────────────────┐
                   │                                │
         ┌─────────▼────────┐            ┌─────────▼────────┐
         │  COMPLETED       │            │  HITL_REQUIRED   │
         │  ✓ All good      │            │  ⚠️ Needs review │
         │  ✓ Ready for ERP │            │                  │
         └──────────────────┘            │  Triggered if:   │
                 │                       │  • Low confidence│
                 │                       │  • Missing fields│
                 │                       │  • Item mismatch │
                 │                       │  (for invoices)  │
                 │                       └────────┬─────────┘
                 │                                │
                 │                    ┌──────────▼────────┐
                 │                    │  APPROVED         │
                 │                    │ (after human fix) │
                 │                    └────────┬──────────┘
                 │                             │
                 └─────────────┬───────────────┘
                               │
                      ┌────────▼─────────┐
                      │  READY FOR       │
                      │  DISPATCH        │
                      └──────────────────┘

SLA TRACKING OVERLAYS:
┌──────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐  │
│ │ expected_dispatch_by = created_at + sla_hours      │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                          │
│  At any time:                                            │
│  if final_status in COMPLETED/APPROVED:                 │
│    if updated_at ≤ expected_dispatch_by:                │
│      SLA = "MET" ✓                                       │
│    else:                                                 │
│      SLA = "BREACHED" ✗                                  │
│  else if now > expected_dispatch_by:                     │
│    SLA = "BREACHED" ✗                                    │
│  else if (expected_dispatch_by - now) ≤ 2 hours:        │
│    SLA = "AT_RISK" ⚠️                                    │
│  else:                                                   │
│    SLA = "ON_TIME" ✓                                     │
└──────────────────────────────────────────────────────────┘
```

---

## 4. ITEM MATCHING LOGIC

```
┌─────────────────────────────────────────────────────────────────┐
│ INVOICE ARRIVES                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Extract po_number from invoice canonical: "PO-2024-12345"  │
│                          ↓                                      │
│  2. Query for matching PO:                                      │
│     SELECT * FROM transaction_documents                         │
│     WHERE transaction_type = 'PURCHASE_ORDER'                   │
│     AND document_reference_number = 'PO-2024-12345'             │
│     AND source_partner = 'ACME_CORP'                            │
│                          ↓                                      │
│  3. Build comparison maps:                                      │
│                                                                 │
│     PO Items Map:              Invoice Items:                  │
│     SKU-001 → qty:100, p:0.50  SKU-001 → qty:100, p:0.50      │
│     SKU-002 → qty:50, p:1.00   SKU-002 → qty:45, p:1.00   ✗   │
│     SKU-003 → qty:25, p:2.00   SKU-004 → qty:10, p:3.00   ✗   │
│                                                                 │
│  4. Comparison checks:                                          │
│                                                                 │
│     For SKU-001:                                                │
│       ├─ In PO? YES ✓                                           │
│       ├─ Qty match? 100 == 100? YES ✓                          │
│       └─ Price match? |0.50 - 0.50| > 0.01? NO ✓              │
│       → RESULT: MATCHED ✓                                       │
│                                                                 │
│     For SKU-002:                                                │
│       ├─ In PO? YES ✓                                           │
│       ├─ Qty match? 50 == 45? NO ✗ QTY_MISMATCH               │
│       └─ Price match? |1.00 - 1.00| > 0.01? NO ✓              │
│       → RESULT: DISCREPANCY ✗                                   │
│          Adds: {type: QTY_MISMATCH, po_qty: 50, inv_qty: 45}  │
│                                                                 │
│     For SKU-004:                                                │
│       ├─ In PO? NO ✗ UNKNOWN_ITEM                              │
│       → RESULT: DISCREPANCY ✗                                   │
│          Adds: {type: UNKNOWN_ITEM, product_id: SKU-004}       │
│                                                                 │
│  5. Aggregate results:                                          │
│     discrepancies = [QTY_MISMATCH, UNKNOWN_ITEM]               │
│     item_match_status = "DISCREPANCY"                          │
│                                                                 │
│  6. Flag HITL if discrepancies found:                           │
│     hitl_required = TRUE                                        │
│     final_status = "HITL_REQUIRED"                              │
│     validation_errors += "Invoice-PO mismatch: 2 discrepancies"│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. SLA CALCULATION FLOW

```
┌────────────────────────────────────────────────────────────────┐
│ ANALYTICS QUERY: GET /api/v1/analytics/sla?period=7d           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. Calculate date range:                                      │
│     since = now - 7 days                                       │
│     Query all documents where created_at >= since              │
│                                                                │
│  2. Filter: Only documents with expected_dispatch_by set       │
│     (i.e., POs and Invoices with SLA tracking)                 │
│                                                                │
│  3. For each document, calculate SLA status:                   │
│                                                                │
│     ┌─────────────────────────────────────────────────┐       │
│     │ Document: PO-2024-12345                         │       │
│     │ created_at: 2026-06-13 09:15                    │       │
│     │ sla_hours: 24                                   │       │
│     │ expected_dispatch_by: 2026-06-14 09:15          │       │
│     │ final_status: COMPLETED                         │       │
│     │ updated_at: 2026-06-13 18:30                    │       │
│     │                                                 │       │
│     │ Calculation:                                    │       │
│     │ if COMPLETED or APPROVED:                       │       │
│     │   if updated_at ≤ expected_dispatch_by:         │       │
│     │     ✓ WITHIN_SLA                                │       │
│     │   else:                                         │       │
│     │     ✗ BREACHED_SLA                              │       │
│     │                                                 │       │
│     │ Result: ✓ WITHIN_SLA                            │       │
│     │ Count: files_within_sla += 1                    │       │
│     └─────────────────────────────────────────────────┘       │
│                                                                │
│     ┌─────────────────────────────────────────────────┐       │
│     │ Document: INV-2024-67890                        │       │
│     │ created_at: 2026-06-13 14:23                    │       │
│     │ sla_hours: 24                                   │       │
│     │ expected_dispatch_by: 2026-06-14 14:23          │       │
│     │ final_status: IN_PROGRESS                       │       │
│     │ now: 2026-06-14 03:00                           │       │
│     │                                                 │       │
│     │ Calculation:                                    │       │
│     │ if IN_PROGRESS/other:                           │       │
│     │   if now > expected_dispatch_by:                │       │
│     │     ✗ BREACHED_SLA                              │       │
│     │   else:                                         │       │
│     │     ✓ NOT_YET_BREACHED                          │       │
│     │                                                 │       │
│     │ Result: ✓ NOT_YET_BREACHED                      │       │
│     │ Count: (neither within nor breached - pending)  │       │
│     └─────────────────────────────────────────────────┘       │
│                                                                │
│  4. Aggregate metrics:                                         │
│     {                                                          │
│       sla_compliance_rate: (within / total) * 100%,           │
│       files_within_sla: X,                                    │
│       files_breached_sla: Y,                                  │
│       avg_processing_time_ms: avg(updated_at - created_at),  │
│       p95_processing_time_ms: 95th percentile,                │
│       p99_processing_time_ms: 99th percentile                 │
│     }                                                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. FRONTEND COMPONENT FLOW

```
DocumentDetail Component
│
├─ useEffect on mount
│  └─ Load document via getById()
│  └─ Load related documents via getRelatedDocuments()
│     (NEW API endpoint)
│
├─ State Management
│  ├─ doc: TransactionDocument
│  ├─ related: {
│  │    document,
│  │    linked_document,
│  │    referencing_documents,
│  │    sla: { status, deadline, hours_allocated },
│  │    item_match: { status, discrepancies }
│  │  }
│  └─ [other existing state]
│
├─ Render Sections
│  ├─ Header (document title, type, status)
│  │
│  ├─ [EXISTING] Validation Results
│  │
│  ├─ [EXISTING] Canonical Editor
│  │
│  ├─ [EXISTING] Outbound Status
│  │
│  └─ [NEW] Transaction Chain Section
│     │
│     ├─ SLA Status Badge
│     │  └─ Color coded: RED (BREACHED) | YELLOW (AT_RISK) | GREEN (ON_TIME/MET)
│     │  └─ Display deadline countdown
│     │
│     ├─ Linked Document Card
│     │  └─ Clickable to navigate to linked PO/Invoice
│     │  └─ Show transaction type and ID
│     │  └─ Show item_match_status
│     │
│     └─ Discrepancies List
│        └─ For each discrepancy:
│           ├─ Icon: ⚠️
│           ├─ Type: QTY_MISMATCH, PRICE_MISMATCH, UNKNOWN_ITEM
│           ├─ Product ID
│           ├─ Details: PO vs Invoice values
│           └─ Message
│
└─ End Document Detail
```

---

## 7. CONFIGURATION PARAMETERS

### 7.1: SLA Configuration Per Partner

```
Partner: RETAILER_ABC
├─ sla_hours: 24 (default)
│  └─ Used when calculating expected_dispatch_by
│
Partner: RETAILER_XYZ (Premium)
├─ sla_hours: 48 (extended SLA)
│
Partner: RETAILER_URGENT
├─ sla_hours: 4 (critical delivery required)
│
Partner: RETAILER_FLEX
├─ sla_hours: 72 (flexible partner)
```

### 7.2: Item Matching Tolerances

```
_match_items() Configuration:

Price Tolerance: 0.01 (1 cent)
├─ |PO_Price - Invoice_Price| > 0.01 → PRICE_MISMATCH

Quantity Matching: Exact
├─ PO_Qty != Invoice_Qty → QTY_MISMATCH

Unknown Items: Any item in Invoice not in PO
├─ product_id not in PO items → UNKNOWN_ITEM
```

---

## 8. MONITORING & OBSERVABILITY

```
Backend Logs (logs/backend.log):

[auto-link] PO PO-2024-12345 → SLA 24h, deadline 2026-06-14 09:15:00
[auto-link] Invoice linked to PO PO-2024-12345 → items matched
[auto-link] Invoice linked to PO PO-2024-12345 with 2 mismatches → HITL
[auto-link] Invoice references PO PO-2024-99999 but not found in DB

Dashboard Metrics:

GET /api/v1/analytics/sla
├─ sla_compliance_rate: 95.2%
├─ files_within_sla: 38
├─ files_breached_sla: 2
└─ avg_processing_time_ms: 45000

GET /api/v1/analytics/partner-performance?partner_id=RETAILER_ABC
├─ Total Documents: 45
├─ Met SLA: 42 (93.3%)
├─ Breached SLA: 2 (4.4%)
└─ Pending: 1 (2.2%)
```

---

## 9. QUERY EXAMPLES

### 9.1: Find All Documents in Transaction Chain

```sql
-- Get all documents (PO + Invoices + ASN) for a specific PO
WITH chain AS (
  SELECT id, transaction_type, document_reference_number, created_at, final_status
  FROM transaction_documents
  WHERE id = 'po-uuid-001'  -- The PO
  
  UNION ALL
  
  SELECT id, transaction_type, document_reference_number, created_at, final_status
  FROM transaction_documents
  WHERE linked_document_id = 'po-uuid-001'  -- Related documents
)
SELECT 
  transaction_type,
  document_reference_number,
  final_status,
  created_at
FROM chain
ORDER BY created_at ASC;

Result:
transaction_type | document_reference_number | final_status | created_at
PURCHASE_ORDER   | PO-2024-12345            | COMPLETED    | 2026-06-13 09:15
INVOICE          | INV-2024-67890           | COMPLETED    | 2026-06-13 14:23
SHIPMENT_NOTICE  | ASN-2024-98765           | IN_PROGRESS  | 2026-06-13 15:45
```

### 9.2: Find PO without Matching Invoice

```sql
SELECT po.id, po.document_reference_number
FROM transaction_documents po
LEFT JOIN transaction_documents inv
  ON inv.linked_document_id = po.id
  AND inv.transaction_type = 'INVOICE'
WHERE po.transaction_type = 'PURCHASE_ORDER'
AND inv.id IS NULL;
```

### 9.3: Find Invoices with Discrepancies

```sql
SELECT 
  id,
  document_reference_number,
  item_discrepancies,
  final_status
FROM transaction_documents
WHERE transaction_type = 'INVOICE'
AND item_match_status = 'DISCREPANCY'
ORDER BY created_at DESC;
```

### 9.4: SLA Breach Analysis

```sql
SELECT 
  id,
  document_reference_number,
  expected_dispatch_by,
  updated_at,
  final_status,
  EXTRACT(EPOCH FROM (updated_at - expected_dispatch_by)) / 3600 as hours_overdue
FROM transaction_documents
WHERE final_status NOT IN ('COMPLETED', 'APPROVED')
AND now() > expected_dispatch_by
ORDER BY hours_overdue DESC;
```


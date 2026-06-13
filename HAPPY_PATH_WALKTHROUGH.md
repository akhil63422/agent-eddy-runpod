# PO-Invoice Linking Feature: Complete Happy Path

## 1. PARTNER ONBOARDING

### Step 1.1: Partner Portal Setup
```
Admin/Partner Manager creates a new partner profile in Partner Portal
├── Partner Name: "RETAILER_ABC"
├── ISA Qualifier: "ZZ"
├── ISA ID: "RETAILER_ABC_001"
├── GS ID: "RETAILER_ABC"
├── EDI Version: "005010"
├── Transport: "SFTP"
├── SLA Hours: 24  ← NEW FIELD: Default dispatch SLA for this partner
└── Document Agreements: [850, 810, 856]
```

**API Call:**
```http
POST /api/v1/partners
{
  "partner_name": "RETAILER_ABC",
  "isa_qualifier": "ZZ",
  "isa_id": "RETAILER_ABC_001",
  "gs_id": "RETAILER_ABC",
  "edi_version": "005010",
  "transport": "SFTP",
  "sla_hours": 24,
  "document_agreements": [
    {"type": "850", "enabled": true},
    {"type": "810", "enabled": true},
    {"type": "856", "enabled": true}
  ]
}
```

**Database Result (partner_profiles table):**
```
id         | partner_name  | sla_hours | created_at
------     | ------------- | --------- | ----------
uuid-001   | RETAILER_ABC  | 24        | 2026-06-13
```

---

## 2. DOCUMENT INBOUND PIPELINE

### Step 2.1: Purchase Order Arrives

**Document 1: PO (X12 850)**
```
ISA*00*          *00*          *ZZ*RETAILER_ABC     *ZZ*ACME_CORP      *260613*0915*U*00501*000000001*0*P*:~
GS*PO*RETAILER_ABC*ACME_CORP*20260613*0915*1*X*005010~
ST*850*0001~
BEG*00*SA*PO-2024-12345**20260613~
DTM*137*20260613~
N1*BY*RETAILER ABC~
N1*SU*ACME CORP~
PO1*1*100*EA*0.50*UP*SKU-001*VN*PENCILS~
PO1*2*50*EA*1.00*UP*SKU-002*VN*PENS~
PO1*3*25*EA*2.00*UP*SKU-003*VN*SHARPENERS~
CTT*3~
SE*11*0001~
GE*1*1~
IEA*1*000000001~
```

**API Call:**
```http
POST /api/v1/inbound
{
  "raw_document": "<above X12 content>"
}
```

**Processing Flow:**
1. **Format Detection** → Detects X12
2. **Parser** → Extracts:
   - `transaction_type`: PURCHASE_ORDER
   - `po_number`: PO-2024-12345
   - `source_partner`: RETAILER_ABC
   - `destination_partner`: ACME_CORP
   - `items`: [{product_id: SKU-001, qty: 100, price: 0.50}, ...]

3. **Normalization** → Builds canonical JSON:
```json
{
  "transaction_type": "PURCHASE_ORDER",
  "document_number": "PO-2024-12345",
  "po_number": "PO-2024-12345",
  "document_date": "2026-06-13",
  "parties": [
    {"role": "buyer", "name": "RETAILER_ABC"},
    {"role": "seller", "name": "ACME_CORP"}
  ],
  "items": [
    {"product_id": "SKU-001", "quantity": 100, "unit_price": 0.50},
    {"product_id": "SKU-002", "quantity": 50, "unit_price": 1.00},
    {"product_id": "SKU-003", "quantity": 25, "unit_price": 2.00}
  ],
  "totals": {"subtotal": 150.0, "currency": "USD"}
}
```

4. **ERP Mapping** → Maps to SAP/Oracle format
5. **Validation** → Checks required fields
6. **Final Status** → COMPLETED or HITL_REQUIRED

### Step 2.2: NEW - Auto-Link and SLA Processing

**After document is saved to DB, `_auto_link_and_sla()` is called:**

```python
# For PURCHASE_ORDER transaction:
1. Extract po_number from canonical: "PO-2024-12345"
   ↓
2. Look up partner "RETAILER_ABC" in partner_profiles
   ↓
3. Get SLA hours: 24 hours (from partner profile)
   ↓
4. Calculate expected_dispatch_by:
   created_at (2026-06-13 09:15:00 UTC) + 24 hours 
   = 2026-06-14 09:15:00 UTC
   ↓
5. Set fields:
   - document_reference_number: "PO-2024-12345"
   - sla_hours: 24
   - expected_dispatch_by: 2026-06-14 09:15:00 UTC
   - item_match_status: "NA" (not applicable for PO)
   
6. Commit to database
```

**Database Result (transaction_documents table):**
```
id                | transaction_type | document_reference_number | sla_hours | expected_dispatch_by      | item_match_status | linked_document_id
                  |                  |                           |           |                           |                   |
po-uuid-001       | PURCHASE_ORDER   | PO-2024-12345             | 24        | 2026-06-14 09:15:00 UTC   | NA                | NULL
```

**Frontend Display (Document Detail page):**
```
┌─────────────────────────────────────────────────────────────┐
│ TRANSACTION CHAIN                                           │
│                                                             │
│ SLA ON_TIME · Deadline 2026-06-14 09:15:00 UTC            │
│                                                             │
│ (No linked document yet - waiting for invoice)             │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 2.3: Invoice Arrives (5 hours later)

**Document 2: Invoice (X12 810)**
```
ISA*00*          *00*          *ZZ*ACME_CORP       *ZZ*RETAILER_ABC    *260613*1423*U*00501*000000002*0*P*:~
GS*IN*ACME_CORP*RETAILER_ABC*20260613*1423*1*X*005010~
ST*810*0002~
BIG*20260613*INV-2024-67890*20260613~
N1*SU*ACME CORP~
N1*BY*RETAILER ABC~
IT1*1*100*EA*0.50*UP*SKU-001~
IT1*2*50*EA*1.00*UP*SKU-002~
IT1*3*25*EA*2.00*UP*SKU-003~
TDS*150*0*0*150~
SE*11*0002~
GE*1*1~
IEA*1*000000002~
```

**API Call:**
```http
POST /api/v1/inbound
{
  "raw_document": "<above X12 content>"
}
```

**Processing Flow:**
1. **Format Detection** → Detects X12
2. **Parser** → Extracts:
   - `transaction_type`: INVOICE
   - `invoice_number`: INV-2024-67890
   - `po_number`: **PO-2024-12345** ← KEY FIELD
   - `source_partner`: ACME_CORP
   - `destination_partner`: RETAILER_ABC
   - `items`: [{product_id: SKU-001, qty: 100, price: 0.50}, ...]

3. **Normalization** → Builds canonical JSON with po_number field
4. **ERP Mapping** → Maps to SAP/Oracle format
5. **Validation** → Checks required fields

### Step 2.4: NEW - Auto-Link and Item Matching

**After invoice is saved to DB, `_auto_link_and_sla()` is called:**

```python
# For INVOICE transaction:
1. Extract po_number from invoice canonical: "PO-2024-12345"
   ↓
2. Query database for matching PO:
   SELECT * FROM transaction_documents 
   WHERE transaction_type = 'PURCHASE_ORDER'
   AND document_reference_number = 'PO-2024-12345'
   AND source_partner = 'ACME_CORP'
   ↓
3. Found! PO record: po-uuid-001
   ↓
4. Call _match_items(po_canonical, invoice_canonical):
   
   PO Items:
   - SKU-001: qty=100, price=0.50
   - SKU-002: qty=50, price=1.00
   - SKU-003: qty=25, price=2.00
   
   Invoice Items:
   - SKU-001: qty=100, price=0.50 ✓ MATCH
   - SKU-002: qty=50, price=1.00 ✓ MATCH
   - SKU-003: qty=25, price=2.00 ✓ MATCH
   
   Result: discrepancies = [] (empty - no issues)
   ↓
5. Set fields:
   - linked_document_id: "po-uuid-001" ← FOREIGN KEY
   - document_reference_number: "INV-2024-67890"
   - item_match_status: "MATCHED"
   - item_discrepancies: []
   
6. final_status remains: COMPLETED (no discrepancies)
   ↓
7. Commit to database
```

**Database Result (transaction_documents table):**
```
id                | transaction_type | document_reference_number | linked_document_id | item_match_status | item_discrepancies
                  |                  |                           |                    |                   |
inv-uuid-002      | INVOICE          | INV-2024-67890            | po-uuid-001        | MATCHED           | []
```

**Database Relationships (Foreign Key):**
```
transaction_documents
├─ id: inv-uuid-002
├─ transaction_type: INVOICE
├─ document_reference_number: INV-2024-67890
├─ linked_document_id: po-uuid-001 ← POINTS TO
│                                     │
│                                     └─→ po-uuid-001 (PO)
├─ item_match_status: MATCHED
└─ item_discrepancies: []

transaction_documents
├─ id: po-uuid-001
├─ transaction_type: PURCHASE_ORDER
├─ document_reference_number: PO-2024-12345
└─ (records that reference this via linked_document_id:
   - inv-uuid-002 (Invoice)
   - (potentially) asn-uuid-003 (ASN if it comes)
)
```

**Frontend Display (Invoice Detail page):**
```
┌─────────────────────────────────────────────────────────────┐
│ TRANSACTION CHAIN                                           │
│                                                             │
│ SLA ON_TIME · Deadline 2026-06-14 09:15:00 UTC            │
│                                                             │
│ LINKED DOCUMENT:                                            │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ PURCHASE_ORDER  po-uuid-001  [MATCHED ✓]             │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ DISCREPANCIES: None                                         │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 2.5: Optional - Shipment/ASN Arrives

**Document 3: Advanced Ship Notice (X12 856)**
```
[X12 856 content with shipment_id, line items matching PO...]
```

**Processing:**
1. Parsed as SHIPMENT_NOTICE
2. `_auto_link_and_sla()` processes it:
   - Sets `item_match_status: "NA"` (no matching needed for ASN)
   - Sets `document_reference_number: "ASN-2024-98765"`
   
3. **Optional linking:** Could look up related PO/Invoice
4. Database records:
```
asn-uuid-003  | SHIPMENT_NOTICE  | ASN-2024-98765    | NULL or po-uuid-001 | NA
```

---

## 3. FOREIGN KEY LINKAGE DETAILS

### 3.1: One-to-Many Relationship

```
One PO ──────→ Many Invoices/ASNs

PURCHASE_ORDER (po-uuid-001)
│
├─ linked_by → INVOICE (inv-uuid-002)
│             └─ linked_document_id: po-uuid-001
│
└─ linked_by → INVOICE (inv-uuid-003)
              └─ linked_document_id: po-uuid-001
```

### 3.2: Database Queries

**Find all invoices for a PO:**
```sql
SELECT * FROM transaction_documents 
WHERE linked_document_id = 'po-uuid-001'
AND transaction_type = 'INVOICE'
ORDER BY created_at DESC;
```

**Find the PO for an Invoice:**
```sql
SELECT * FROM transaction_documents 
WHERE id = (
  SELECT linked_document_id FROM transaction_documents 
  WHERE id = 'inv-uuid-002'
);
```

**Find complete transaction chain (PO + Invoices + ASN):**
```sql
WITH po_chain AS (
  SELECT id, transaction_type, document_reference_number 
  FROM transaction_documents 
  WHERE id = 'po-uuid-001'  -- The PO
  
  UNION ALL
  
  SELECT id, transaction_type, document_reference_number 
  FROM transaction_documents 
  WHERE linked_document_id = 'po-uuid-001'  -- Related invoices/ASNs
)
SELECT * FROM po_chain 
ORDER BY created_at ASC;
```

**Result:**
```
id          | transaction_type  | document_reference_number | created_at
            |                   |                           |
po-uuid-001 | PURCHASE_ORDER    | PO-2024-12345             | 2026-06-13 09:15:00
inv-uuid-002| INVOICE           | INV-2024-67890            | 2026-06-13 14:23:00
asn-uuid-003| SHIPMENT_NOTICE   | ASN-2024-98765            | 2026-06-13 15:45:00
```

---

## 4. SLA DASHBOARD

### 4.1: What the Dashboard Shows

**API Endpoint:**
```http
GET /api/v1/analytics/sla?period=7d
```

**Response:**
```json
{
  "sla_compliance_rate": 95.2,
  "sla_threshold_ms": 86400000,
  "files_within_sla": 38,
  "files_breached_sla": 2,
  "avg_processing_time_ms": 45000,
  "p95_processing_time_ms": 120000,
  "p99_processing_time_ms": 180000
}
```

### 4.2: How SLA Status is Calculated

```
Current Time: 2026-06-14 08:00:00 UTC

For each document with expected_dispatch_by:

PO (po-uuid-001):
├─ created_at: 2026-06-13 09:15:00
├─ expected_dispatch_by: 2026-06-14 09:15:00 (24h later)
├─ final_status: COMPLETED
├─ updated_at: 2026-06-14 08:30:00
├─ Calculation:
│  └─ Status = COMPLETED before deadline? 
│     └─ 08:30:00 < 09:15:00? YES ✓
│     └─ SLA_STATUS: "MET" ✓
└─ Contribution: +1 to "files_within_sla"

Invoice (inv-uuid-002):
├─ created_at: 2026-06-13 14:23:00
├─ expected_dispatch_by: 2026-06-14 14:23:00 (24h later)
├─ final_status: COMPLETED
├─ updated_at: 2026-06-13 20:45:00
├─ Calculation:
│  └─ Status = COMPLETED before deadline?
│     └─ 20:45:00 < 14:23:00 (next day)? YES ✓
│     └─ SLA_STATUS: "MET" ✓
└─ Contribution: +1 to "files_within_sla"

ASN (asn-uuid-003):
├─ created_at: 2026-06-13 15:45:00
├─ expected_dispatch_by: 2026-06-14 15:45:00
├─ final_status: IN_PROGRESS
├─ Calculation:
│  └─ Status = IN_PROGRESS, now = 08:00:00
│  └─ 08:00:00 < 15:45:00? YES, time remaining ✓
│  └─ Remaining time = 7h 45min > 2h threshold? YES
│     └─ SLA_STATUS: "ON_TIME" ✓
│  └─ If remaining < 2h → SLA_STATUS: "AT_RISK"
└─ Contribution: Not yet breached
```

### 4.3: Dashboard Display (UI)

**SLA Compliance Card:**
```
┌────────────────────────────────────────────────┐
│ SLA COMPLIANCE - LAST 7 DAYS                   │
├────────────────────────────────────────────────┤
│                                                │
│  95.2%                ✓ Met SLA: 38 files     │
│  ╔═════════════════════════════════════╗      │
│  ║░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ║ 95%  │
│  ╚═════════════════════════════════════╝      │
│                                                │
│  ✗ Breached SLA: 2 files                      │
│  ⏱ Average processing time: 45 sec            │
│  P95: 2 min | P99: 3 min                      │
│                                                │
└────────────────────────────────────────────────┘
```

**SLA Status by Document Type:**
```
┌──────────────────────────────────────────────────────────┐
│ DOCUMENT TYPE BREAKDOWN                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ PO (850)        ✓ 38 Met    ✗ 1 Breached    96% ✓      │
│ Invoice (810)   ✓ 37 Met    ✗ 1 Breached    97% ✓      │
│ ASN (856)       ✓ 22 Met    ✗ 0 Breached    100% ✓     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Breached SLA Alert:**
```
┌──────────────────────────────────────────────┐
│ ⚠️  BREACHED SLA ALERTS (Last 7 Days)        │
├──────────────────────────────────────────────┤
│                                              │
│ 1. PO-2024-11999                            │
│    Type: PURCHASE_ORDER                     │
│    Deadline: 2026-06-11 10:30:00            │
│    Status: BREACHED - 62 hours overdue      │
│    Action: Escalate to RETAILER_XYZ         │
│                                              │
│ 2. INV-2024-67100                           │
│    Type: INVOICE                            │
│    Deadline: 2026-06-12 15:45:00            │
│    Status: BREACHED - 38 hours overdue      │
│    Action: Manual review required           │
│                                              │
└──────────────────────────────────────────────┘
```

### 4.4: Partner-Specific SLA Dashboard

**Query:**
```http
GET /api/v1/analytics/partner-performance?partner_id=RETAILER_ABC&days=30
```

**Display:**
```
┌────────────────────────────────────────────────────────────┐
│ SLA PERFORMANCE: RETAILER_ABC                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ SLA Configuration: 24 hours (default)                     │
│                                                            │
│ Last 30 Days:                                              │
│  • Total Documents: 45                                     │
│  • Met SLA: 42 (93.3%)                                     │
│  • Breached SLA: 2 (4.4%)                                  │
│  • Pending: 1 (2.2%)                                       │
│                                                            │
│ Trend:                                                     │
│  • Week 1: 94% compliance                                  │
│  • Week 2: 96% compliance  ↑                               │
│  • Week 3: 92% compliance  ↓                               │
│  • Week 4: 91% compliance  ↓                               │
│                                                            │
│ Recommended Actions:                                       │
│  ⚠️  Compliance trending down - investigate             │
│  📞 Contact partner for process review                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 5. ERROR SCENARIOS (Unhappy Paths)

### 5.1: Invoice Arrives with Quantity Mismatch

**Invoice has 45 units instead of 50 for SKU-002:**

```python
# _match_items() finds:
discrepancies = [
  {
    "type": "QTY_MISMATCH",
    "product_id": "SKU-002",
    "po_qty": 50,
    "invoice_qty": 45,
    "msg": "Quantity mismatch: PO 50 vs Invoice 45"
  }
]

# Result:
- linked_document_id: po-uuid-001 ✓ (linked)
- item_match_status: "DISCREPANCY" ⚠️
- item_discrepancies: [above mismatch object]
- validation_errors: ["Invoice-PO mismatch: 1 discrepancy(s)"]
- hitl_required: TRUE
- final_status: "HITL_REQUIRED"
```

**Frontend Display:**
```
┌─────────────────────────────────────────────────────────────┐
│ TRANSACTION CHAIN                                           │
│                                                             │
│ SLA ON_TIME · Deadline 2026-06-14 14:23:00 UTC            │
│                                                             │
│ LINKED DOCUMENT:                                            │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ PURCHASE_ORDER  po-uuid-001  [⚠️ DISCREPANCY]        │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ DISCREPANCIES:                                              │
│ ⚠️ QTY_MISMATCH: SKU-002                                  │
│    PO: 50 units / Invoice: 45 units                       │
│    "Quantity mismatch: PO 50 vs Invoice 45"               │
│                                                             │
│ ⚠️ STATUS: Needs Review (HITL_REQUIRED)                  │
│    Action: Manual reconciliation required                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**SLA Impact:**
- Invoice is flagged as HITL_REQUIRED but SLA clock still ticks
- If not resolved within 24h → SLA breached
- Dashboard shows as "AT_RISK" once < 2h remaining

### 5.2: Invoice References Unknown PO

**Invoice references PO-2024-99999 which doesn't exist:**

```python
# _auto_link_and_sla() finds:
po = db.query(TransactionDocument).filter(
  TransactionDocument.transaction_type == 'PURCHASE_ORDER',
  TransactionDocument.document_reference_number == 'PO-2024-99999',
  TransactionDocument.source_partner == 'ACME_CORP'
).first()

# Result: po is None (not found)
- linked_document_id: NULL (no link)
- item_match_status: "PENDING"
- item_discrepancies: []
- final_status: remains as-is
- Log: "[auto-link] Invoice references PO PO-2024-99999 but not found in DB"
```

**Frontend Display:**
```
┌─────────────────────────────────────────────────────────────┐
│ TRANSACTION CHAIN                                           │
│                                                             │
│ ⚠️ SLA ON_TIME · Deadline 2026-06-14 14:23:00 UTC         │
│                                                             │
│ ⏳ WAITING FOR LINKED DOCUMENT:                            │
│    References PO: PO-2024-99999                            │
│    Status: PO not found in system                          │
│                                                             │
│    Action: PO may arrive later, or there's a mismatch     │
│    Please verify PO number                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. COMPLETE DATA MODEL

### 6.1: TransactionDocument Table Structure

```
transaction_documents
├── id (UUID, PK)
├── raw_document (TEXT)
├── transaction_type (String: PURCHASE_ORDER, INVOICE, SHIPMENT_NOTICE)
├── document_reference_number (String) ← "PO-2024-12345" or "INV-2024-67890"
├── source_partner (String) ← "RETAILER_ABC"
├── destination_partner (String) ← "ACME_CORP"
├── canonical_event (JSON) ← Normalized document structure
├── final_status (String) ← COMPLETED, HITL_REQUIRED, FAILED, etc.
├── validation_errors (JSON array)
├── 
├── [NEW FIELDS FOR PO-INVOICE LINKING]
├── linked_document_id (String, FK) ← Points to related PO/Invoice
├── sla_hours (Integer) ← 24, 48, etc. hours for this document
├── expected_dispatch_by (DateTime) ← created_at + sla_hours
├── item_match_status (String) ← MATCHED, DISCREPANCY, PENDING, NA
├── item_discrepancies (JSON array) ← [{type, product_id, msg, ...}]
├── 
├── created_at (DateTime)
├── updated_at (DateTime)
└── [other fields like mapped_payload, edi_output, etc.]
```

### 6.2: PartnerProfile Table Structure

```
partner_profiles
├── id (UUID, PK)
├── partner_id (String, Unique)
├── partner_name (String)
├── isa_id (String)
├── gs_id (String)
├── edi_version (String)
├── transport (String) ← SFTP, AS2, VAN, etc.
├── document_agreements (JSON) ← [{type: 850, enabled: true}, ...]
├── 
├── [NEW FIELD FOR SLA]
├── sla_hours (Integer, default=24) ← Hours allocated for dispatch
├── 
├── created_at (DateTime)
└── updated_at (DateTime)
```

---

## 7. KEY API ENDPOINTS

### 7.1: Get Document with Related Information
```http
GET /api/v1/documents/{doc_id}/related

Response:
{
  "document": { /* full document details */ },
  "linked_document": { /* PO or Invoice */ },
  "referencing_documents": [ /* invoices for this PO */ ],
  "sla": {
    "status": "ON_TIME",
    "deadline": "2026-06-14T09:15:00+00:00",
    "hours_allocated": 24
  },
  "item_match": {
    "status": "MATCHED",
    "discrepancies": []
  }
}
```

### 7.2: Update Partner SLA Hours
```http
PATCH /api/v1/partners/{partner_id}

Request:
{
  "sla_hours": 48  ← Change from 24h to 48h
}

Response:
{
  "partner_name": "RETAILER_ABC",
  "sla_hours": 48,
  "updated_at": "2026-06-14T10:00:00+00:00"
}
```

### 7.3: Get SLA Compliance Metrics
```http
GET /api/v1/analytics/sla?period=7d

Response:
{
  "sla_compliance_rate": 95.2,
  "files_within_sla": 38,
  "files_breached_sla": 2,
  "avg_processing_time_ms": 45000
}
```

---

## 8. TIMELINE EXAMPLE

```
HOUR 0: 09:15 UTC
│
├─ PO Arrives: PO-2024-12345
│  └─ Processed, saved with:
│     • document_reference_number: "PO-2024-12345"
│     • sla_hours: 24
│     • expected_dispatch_by: HOUR 24 (09:15 next day)
│     • item_match_status: "NA"
│
├─ HOUR 5: 14:23 UTC
│  └─ Invoice Arrives: INV-2024-67890
│     └─ Processed, auto-linked to PO
│        • linked_document_id: po-uuid-001 ✓
│        • item_match_status: "MATCHED" ✓
│        • final_status: "COMPLETED" ✓
│
├─ HOUR 6.5: 15:45 UTC
│  └─ ASN Arrives: ASN-2024-98765
│     └─ Processed (linked or standalone)
│        • item_match_status: "NA"
│
├─ HOUR 19: 04:15 UTC (next day)
│  └─ Queries/Analytics run
│     └─ All documents COMPLETED before 09:15 deadline
│        • SLA Status: "MET" ✓
│        • Compliance: +3 documents
│
└─ HOUR 24+: After deadline
   └─ Any in-progress/HITL documents now → "BREACHED" ⚠️
```

---

## 9. SUMMARY TABLE

| Aspect | Details |
|--------|---------|
| **Documents Per Partner** | PO, Invoice(s), ASN (optional) |
| **Linking Mechanism** | `po_number` field match + `linked_document_id` FK |
| **Item Matching** | Quantity, Price (±0.01 tolerance) |
| **SLA Configuration** | Per-partner in partner_profiles.sla_hours |
| **SLA Calculation** | created_at + sla_hours = expected_dispatch_by |
| **Foreign Key** | transaction_documents.linked_document_id → transaction_documents.id |
| **Discrepancies** | Stored in item_discrepancies JSON, flags HITL if found |
| **Dashboard Shows** | Compliance %, files within/breached SLA, avg processing time |
| **Status Flow** | PURCHASE_ORDER (SLA set) → INVOICE (linked + matched) → ASN (optional) |
| **HITL Trigger** | Item qty/price mismatch between PO and Invoice |


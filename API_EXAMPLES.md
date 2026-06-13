# PO-Invoice Linking: API Examples & Curl Commands

## 1. PARTNER ONBOARDING

### 1.1: Create Partner with SLA Configuration

```bash
curl -X POST http://localhost:8002/api/v1/partners \
  -H "Content-Type: application/json" \
  -d '{
    "partner_name": "RETAILER_ABC",
    "partner_id": "RETAILER_ABC_001",
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
  }'
```

**Response:**
```json
{
  "id": "partner-uuid-001",
  "partner_id": "RETAILER_ABC_001",
  "partner_name": "RETAILER_ABC",
  "isa_id": "RETAILER_ABC_001",
  "gs_id": "RETAILER_ABC",
  "edi_version": "005010",
  "transport": "SFTP",
  "sla_hours": 24,
  "document_agreements": [
    {"type": "850", "enabled": true},
    {"type": "810", "enabled": true},
    {"type": "856", "enabled": true}
  ],
  "created_at": "2026-06-13T10:00:00Z",
  "updated_at": "2026-06-13T10:00:00Z"
}
```

### 1.2: Update Partner SLA Hours

```bash
curl -X PATCH http://localhost:8002/api/v1/partners/partner-uuid-001 \
  -H "Content-Type: application/json" \
  -d '{
    "sla_hours": 48
  }'
```

**Response:**
```json
{
  "id": "partner-uuid-001",
  "partner_name": "RETAILER_ABC",
  "sla_hours": 48,
  "updated_at": "2026-06-13T10:15:00Z"
}
```

### 1.3: Get Partner Details

```bash
curl -X GET http://localhost:8002/api/v1/partners/partner-uuid-001
```

**Response:**
```json
{
  "id": "partner-uuid-001",
  "partner_name": "RETAILER_ABC",
  "partner_id": "RETAILER_ABC_001",
  "isa_id": "RETAILER_ABC_001",
  "gs_id": "RETAILER_ABC",
  "edi_version": "005010",
  "transport": "SFTP",
  "sla_hours": 48,
  "document_agreements": [
    {"type": "850", "enabled": true},
    {"type": "810", "enabled": true},
    {"type": "856", "enabled": true}
  ]
}
```

---

## 2. DOCUMENT INBOUND PROCESSING

### 2.1: Submit Purchase Order (X12 850)

```bash
cat > po.x12 << 'EOF'
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
EOF

curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"$(cat po.x12 | jq -Rs .)\"}"
```

**Response:**
```json
{
  "document_id": "po-uuid-001",
  "final_status": "COMPLETED",
  "transaction_type": "PURCHASE_ORDER",
  "source_format": "X12",
  "source_partner": "RETAILER_ABC",
  "destination_partner": "ACME_CORP",
  "confidence_score": 0.95,
  "canonical_event": {
    "transaction_type": "PURCHASE_ORDER",
    "document_number": "PO-2024-12345",
    "po_number": "PO-2024-12345",
    "document_date": "2026-06-13",
    "parties": [
      {"role": "buyer", "name": "RETAILER_ABC"},
      {"role": "seller", "name": "ACME_CORP"}
    ],
    "items": [
      {"line_number": 1, "product_id": "SKU-001", "quantity": 100, "unit_price": 0.50},
      {"line_number": 2, "product_id": "SKU-002", "quantity": 50, "unit_price": 1.00},
      {"line_number": 3, "product_id": "SKU-003", "quantity": 25, "unit_price": 2.00}
    ],
    "totals": {"subtotal": 150.0, "currency": "USD"}
  },
  "mapped_payload": {
    "erp_document_type": "Purchase Order",
    "document_number": "PO-2024-12345",
    "line_items": [
      {"material_number": "SKU-001", "quantity": 100, "unit_of_measure": "EA", "net_price": 0.50},
      {"material_number": "SKU-002", "quantity": 50, "unit_of_measure": "EA", "net_price": 1.00},
      {"material_number": "SKU-003", "quantity": 25, "unit_of_measure": "EA", "net_price": 2.00}
    ],
    "total_value": 150.0,
    "currency": "USD"
  }
}
```

**Database State After Processing (via _auto_link_and_sla):**
```sql
SELECT id, transaction_type, document_reference_number, sla_hours, 
       expected_dispatch_by, item_match_status, linked_document_id
FROM transaction_documents WHERE id = 'po-uuid-001';

-- Output:
-- id              | transaction_type | document_reference_number | sla_hours | expected_dispatch_by      | item_match_status | linked_document_id
-- po-uuid-001     | PURCHASE_ORDER   | PO-2024-12345             | 24        | 2026-06-14 09:15:00 UTC   | NA                | NULL
```

### 2.2: Submit Invoice (X12 810)

```bash
cat > invoice.x12 << 'EOF'
ISA*00*          *00*          *ZZ*ACME_CORP       *ZZ*RETAILER_ABC    *260613*1423*U*00501*000000002*0*P*:~
GS*IN*ACME_CORP*RETAILER_ABC*20260613*1423*1*X*005010~
ST*810*0002~
BIG*20260613*INV-2024-67890*20260613~
REF*PO*PO-2024-12345~
N1*SU*ACME CORP~
N1*BY*RETAILER ABC~
IT1*1*100*EA*0.50*UP*SKU-001~
IT1*2*50*EA*1.00*UP*SKU-002~
IT1*3*25*EA*2.00*UP*SKU-003~
TDS*150*0*0*150~
SE*12*0002~
GE*1*1~
IEA*1*000000002~
EOF

curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"$(cat invoice.x12 | jq -Rs .)\"}"
```

**Response:**
```json
{
  "document_id": "inv-uuid-002",
  "final_status": "COMPLETED",
  "transaction_type": "INVOICE",
  "source_format": "X12",
  "source_partner": "ACME_CORP",
  "destination_partner": "RETAILER_ABC",
  "confidence_score": 0.92,
  "canonical_event": {
    "transaction_type": "INVOICE",
    "document_number": "INV-2024-67890",
    "invoice_number": "INV-2024-67890",
    "po_number": "PO-2024-12345",
    "parties": [
      {"role": "buyer", "name": "RETAILER_ABC"},
      {"role": "seller", "name": "ACME_CORP"}
    ],
    "items": [
      {"line_number": 1, "product_id": "SKU-001", "quantity": 100, "unit_price": 0.50},
      {"line_number": 2, "product_id": "SKU-002", "quantity": 50, "unit_price": 1.00},
      {"line_number": 3, "product_id": "SKU-003", "quantity": 25, "unit_price": 2.00}
    ],
    "totals": {"subtotal": 150.0, "currency": "USD"}
  }
}
```

**Database State After Processing (via _auto_link_and_sla):**
```sql
SELECT id, transaction_type, document_reference_number, sla_hours, 
       expected_dispatch_by, item_match_status, linked_document_id, item_discrepancies
FROM transaction_documents WHERE id = 'inv-uuid-002';

-- Output:
-- id              | transaction_type | document_reference_number | sla_hours | expected_dispatch_by      | item_match_status | linked_document_id | item_discrepancies
-- inv-uuid-002    | INVOICE          | INV-2024-67890            | 24        | 2026-06-14 14:23:00 UTC   | MATCHED           | po-uuid-001        | []
```

---

## 3. RELATED DOCUMENTS ENDPOINT (NEW)

### 3.1: Get Related Documents for Invoice

```bash
curl -X GET http://localhost:8002/api/v1/documents/inv-uuid-002/related
```

**Response:**
```json
{
  "document": {
    "id": "inv-uuid-002",
    "status": "Completed",
    "direction": "Inbound",
    "document_type": "810",
    "transaction_type": "INVOICE",
    "source_format": "X12",
    "partner_id": "ACME_CORP",
    "confidence_score": 0.92,
    "canonical_event": {
      "transaction_type": "INVOICE",
      "document_number": "INV-2024-67890",
      "invoice_number": "INV-2024-67890",
      "po_number": "PO-2024-12345",
      "items": [
        {"product_id": "SKU-001", "quantity": 100, "unit_price": 0.50},
        {"product_id": "SKU-002", "quantity": 50, "unit_price": 1.00},
        {"product_id": "SKU-003", "quantity": 25, "unit_price": 2.00}
      ]
    },
    "created_at": "2026-06-13T14:23:00Z",
    "updated_at": "2026-06-13T14:23:00Z"
  },
  "linked_document": {
    "id": "po-uuid-001",
    "status": "Completed",
    "direction": "Inbound",
    "document_type": "850",
    "transaction_type": "PURCHASE_ORDER",
    "source_format": "X12",
    "partner_id": "RETAILER_ABC",
    "confidence_score": 0.95,
    "canonical_event": {
      "transaction_type": "PURCHASE_ORDER",
      "document_number": "PO-2024-12345",
      "po_number": "PO-2024-12345",
      "items": [
        {"product_id": "SKU-001", "quantity": 100, "unit_price": 0.50},
        {"product_id": "SKU-002", "quantity": 50, "unit_price": 1.00},
        {"product_id": "SKU-003", "quantity": 25, "unit_price": 2.00}
      ]
    },
    "created_at": "2026-06-13T09:15:00Z",
    "updated_at": "2026-06-13T09:15:00Z"
  },
  "referencing_documents": [],
  "sla": {
    "status": "ON_TIME",
    "deadline": "2026-06-14T14:23:00Z",
    "hours_allocated": 24
  },
  "item_match": {
    "status": "MATCHED",
    "discrepancies": []
  }
}
```

### 3.2: Get Related Documents for PO (shows linked invoices)

```bash
curl -X GET http://localhost:8002/api/v1/documents/po-uuid-001/related
```

**Response:**
```json
{
  "document": {
    "id": "po-uuid-001",
    "status": "Completed",
    "transaction_type": "PURCHASE_ORDER",
    "canonical_event": {
      "po_number": "PO-2024-12345",
      "items": [...]
    }
  },
  "linked_document": null,
  "referencing_documents": [
    {
      "id": "inv-uuid-002",
      "status": "Completed",
      "transaction_type": "INVOICE",
      "document_reference_number": "INV-2024-67890",
      "created_at": "2026-06-13T14:23:00Z"
    },
    {
      "id": "inv-uuid-003",
      "status": "Completed",
      "transaction_type": "INVOICE",
      "document_reference_number": "INV-2024-67891",
      "created_at": "2026-06-13T16:45:00Z"
    }
  ],
  "sla": {
    "status": "MET",
    "deadline": "2026-06-14T09:15:00Z",
    "hours_allocated": 24
  },
  "item_match": {
    "status": "NA",
    "discrepancies": []
  }
}
```

---

## 4. DISCREPANCY SCENARIOS

### 4.1: Invoice with Quantity Mismatch

**Incoming Invoice:** SKU-002 has 45 units (vs 50 in PO)

```bash
curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"... IT1*2*45*EA*1.00*UP*SKU-002 ...\"}"
```

**Response (after processing):**
```json
{
  "document_id": "inv-uuid-003",
  "final_status": "HITL_REQUIRED",
  "transaction_type": "INVOICE",
  "validation_errors": [
    "Invoice-PO mismatch: 1 discrepancy(s)"
  ],
  "hitl_required": true
}
```

**Related Documents Response:**
```json
{
  "sla": {
    "status": "ON_TIME",
    "deadline": "2026-06-14T14:23:00Z"
  },
  "item_match": {
    "status": "DISCREPANCY",
    "discrepancies": [
      {
        "type": "QTY_MISMATCH",
        "product_id": "SKU-002",
        "po_qty": 50,
        "invoice_qty": 45,
        "msg": "Quantity mismatch: PO 50 vs Invoice 45"
      }
    ]
  }
}
```

**Database Query for Discrepancies:**
```bash
curl -X GET "http://localhost:8002/api/v1/documents/?status=Needs%20Review&transaction_type=INVOICE" | \
jq '.[] | select(.item_match.status == "DISCREPANCY")'
```

### 4.2: Invoice with Unknown Item

**Incoming Invoice:** Contains SKU-004 not in PO

**Related Documents Response:**
```json
{
  "item_match": {
    "status": "DISCREPANCY",
    "discrepancies": [
      {
        "type": "UNKNOWN_ITEM",
        "product_id": "SKU-004",
        "invoice_qty": 10,
        "invoice_price": 3.50,
        "msg": "Product SKU-004 not in original PO"
      }
    ]
  }
}
```

---

## 5. SLA ANALYTICS

### 5.1: Get SLA Compliance for Last 7 Days

```bash
curl -X GET "http://localhost:8002/api/v1/analytics/sla?period=7d"
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

### 5.2: Get Partner Performance

```bash
curl -X GET "http://localhost:8002/api/v1/analytics/partner-performance?partner_id=RETAILER_ABC&days=30"
```

**Response (if implemented):**
```json
{
  "partner_name": "RETAILER_ABC",
  "period_days": 30,
  "total_documents": 45,
  "sla_compliance_rate": 93.3,
  "files_within_sla": 42,
  "files_breached_sla": 2,
  "files_pending": 1,
  "avg_processing_time_ms": 52000,
  "trend": "declining"
}
```

### 5.3: Get Document List with SLA Status

```bash
curl -X GET "http://localhost:8002/api/v1/documents/?direction=Inbound&document_type=850"
```

**Each document in response includes:**
```json
{
  "id": "po-uuid-001",
  "document_reference_number": "PO-2024-12345",
  "transaction_type": "PURCHASE_ORDER",
  "sla_hours": 24,
  "expected_dispatch_by": "2026-06-14T09:15:00Z",
  "status": "Completed",
  "created_at": "2026-06-13T09:15:00Z",
  "updated_at": "2026-06-13T09:15:00Z"
}
```

---

## 6. DOCUMENT LIST WITH FILTERING

### 6.1: Get All Invoices with Discrepancies

```bash
curl -X GET "http://localhost:8002/api/v1/documents/?transaction_type=INVOICE&status=Needs%20Review"
```

### 6.2: Get All POs (for a partner)

```bash
curl -X GET "http://localhost:8002/api/v1/documents/?partner_id=RETAILER_ABC&document_type=850"
```

### 6.3: Get Documents Approaching SLA Deadline

```bash
# This would require a custom endpoint or frontend filtering
# GET /documents/?status=Processing (that have created_at < now - (sla_hours - 2))
```

---

## 7. DATABASE DIRECT QUERIES (for admin)

### 7.1: Check Document Linkage

```bash
# Find all invoices linked to a specific PO
psql postgresql://postgres:postgres@127.0.0.1:5432/agent_eddy << 'SQL'
SELECT inv.id, inv.document_reference_number, inv.item_match_status, inv.final_status
FROM transaction_documents inv
WHERE inv.linked_document_id = 'po-uuid-001'
AND inv.transaction_type = 'INVOICE';
SQL
```

### 7.2: Check SLA Status

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/agent_eddy << 'SQL'
SELECT 
  id,
  document_reference_number,
  expected_dispatch_by,
  now() as current_time,
  CASE 
    WHEN final_status IN ('COMPLETED', 'APPROVED') AND updated_at <= expected_dispatch_by THEN 'MET'
    WHEN now() > expected_dispatch_by THEN 'BREACHED'
    ELSE 'ON_TIME'
  END as sla_status
FROM transaction_documents
WHERE expected_dispatch_by IS NOT NULL
ORDER BY expected_dispatch_by ASC;
SQL
```

### 7.3: Find Documents with Discrepancies

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/agent_eddy << 'SQL'
SELECT 
  id,
  document_reference_number,
  item_match_status,
  item_discrepancies,
  final_status
FROM transaction_documents
WHERE item_match_status = 'DISCREPANCY'
ORDER BY created_at DESC;
SQL
```

---

## 8. BATCH OPERATIONS

### 8.1: Upload Multiple Documents

```bash
# PO
curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"$(cat po1.x12 | jq -Rs .)\"}" \
  -w "\nPO1 Status: %{http_code}\n"

# Invoice 1 (referencing PO1)
curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"$(cat inv1.x12 | jq -Rs .)\"}" \
  -w "\nINV1 Status: %{http_code}\n"

# Invoice 2 (referencing PO1)
curl -X POST http://localhost:8002/api/v1/inbound \
  -H "Content-Type: application/json" \
  -d "{\"raw_document\": \"$(cat inv2.x12 | jq -Rs .)\"}" \
  -w "\nINV2 Status: %{http_code}\n"
```

### 8.2: Update Multiple Partner SLA Hours

```bash
#!/bin/bash

declare -A partners=(
  ["partner-uuid-001"]="24"
  ["partner-uuid-002"]="48"
  ["partner-uuid-003"]="12"
)

for partner_id in "${!partners[@]}"; do
  sla_hours="${partners[$partner_id]}"
  curl -X PATCH http://localhost:8002/api/v1/partners/$partner_id \
    -H "Content-Type: application/json" \
    -d "{\"sla_hours\": $sla_hours}" \
    -w "\nUpdated $partner_id to $sla_hours hours\n"
done
```


# Test Scenarios for Transaction Correlation

## Scenario 1: Basic Flow (Happy Path)
**Tests**: Auto-linking, multi-document transaction, status transitions

### Files
1. `PO_TEST_001.850` or `PO_TEST_001.json`
2. `ASN_TEST_001.856` or `ASN_TEST_001.json`
3. `INVOICE_TEST_001.810` or `INVOICE_TEST_001.json`

### Expected Flow
```
Step 1: Upload PO-TEST-001
  → BusinessTransaction created
  → Status: PO_RECEIVED
  → 1 PO document linked

Step 2: Upload ASN-TEST-001
  → Found existing transaction (via PO-TEST-001)
  → ASN linked to transaction
  → Status: ASN_RECEIVED
  → 1 PO + 1 ASN linked

Step 3: Upload INVOICE-TEST-001
  → Found existing transaction (via PO-TEST-001)
  → Invoice linked to transaction
  → Status: COMPLETED (all docs valid)
  → 1 PO + 1 ASN + 1 Invoice linked
```

### What to Verify
- ✅ All 3 documents link to same transaction
- ✅ Transaction ID consistent across all three
- ✅ Status lifecycle: PO_RECEIVED → ASN_RECEIVED → COMPLETED
- ✅ Timeline shows 3 events in order
- ✅ Item Match: MATCHED (no discrepancies)
- ✅ Frontend displays Transaction Chain correctly

---

## Scenario 2: Price Discrepancy
**Tests**: Item validation, discrepancy detection, HITL flagging

### Files
1. `PO_TEST_001.850` or `PO_TEST_001.json` (PO with prices: SKU-001 @ $10, SKU-002 @ $15)
2. `INVOICE_DISCREPANCY.json` (Invoice with DIFFERENT prices: SKU-001 @ $10.50, SKU-002 @ $14.50)

### Expected Flow
```
Step 1: Upload PO
  → Transaction created
  → Status: PO_RECEIVED

Step 2: Upload INVOICE_DISCREPANCY
  → Found existing transaction
  → Invoice linked
  → DISCREPANCIES DETECTED:
    - SKU-001: PO price $10 vs Invoice $10.50 (+$0.50)
    - SKU-002: PO price $15 vs Invoice $14.50 (-$0.50)
  → Status: INVOICE_RECEIVED (stays, validation pending)
  → Item Match: DISCREPANCY
  → HITL Required: true
```

### What to Verify
- ✅ Price mismatches detected
- ✅ Discrepancies displayed in Transaction Chain
- ✅ Status = INVOICE_RECEIVED (not COMPLETED, due to errors)
- ✅ HITL flagging enabled
- ✅ User sees discrepancy warning in UI

---

## Scenario 3: Multiple ASNs (Partial Shipments)
**Tests**: Multiple documents of same type, partial shipment tracking

### Files
1. `PO_TEST_001.json` (PO: 1000 + 500 = 1500 total units)
2. `ASN_TEST_001.json` (ASN: 400 + 300 = 700 units)
3. Create ASN_TEST_002.json manually (see below)

### ASN_TEST_002.json
```json
{
  "document_type": "SHIPMENT_NOTICE",
  "shipment_id": "ASN-TEST-002",
  "po_number": "PO-TEST-001",
  "vendor_id": "SUPPLIER456",
  "customer_id": "BUYER123",
  "shipment_date": "2026-06-17",
  "line_items": [
    {
      "line_number": 1,
      "product_id": "SKU-001",
      "quantity_ordered": 1000,
      "quantity_shipped": 600,
      "unit": "EA"
    },
    {
      "line_number": 2,
      "product_id": "SKU-002",
      "quantity_ordered": 500,
      "quantity_shipped": 200,
      "unit": "EA"
    }
  ]
}
```

### Expected Flow
```
Step 1: Upload PO
  → Status: PO_RECEIVED

Step 2: Upload ASN_TEST_001
  → Status: ASN_RECEIVED
  → asn_count: 1

Step 3: Upload ASN_TEST_002
  → Status: FULLY_SHIPPED (800 + 500 = 1300 ≥ 1500)
  → asn_count: 2
  → Note: Quantities add up (400+600=1000 for SKU-001, 300+200=500 for SKU-002)
```

### What to Verify
- ✅ Both ASNs link to same transaction
- ✅ asn_count increments correctly
- ✅ Status transitions: PO → ASN → FULLY_SHIPPED
- ✅ Timeline shows both ASN_RECEIVED events

---

## Scenario 4: Wrong PO Number (Correlation Failure)
**Tests**: Non-matching documents, new transaction creation

### Files
1. `PO_TEST_001.json`
2. `INVOICE_TEST_001.json` (modify PO number to `PO-WRONG-999`)

### Expected Flow
```
Step 1: Upload PO-TEST-001
  → Transaction created: txn-111111
  → Status: PO_RECEIVED

Step 2: Upload modified invoice with PO-WRONG-999
  → No match found for PO-WRONG-999
  → NEW transaction created: txn-222222
  → Status: INVOICE_RECEIVED (standalone)
  → NOT linked to first transaction
```

### What to Verify
- ✅ Two separate transactions created
- ✅ Each with their own transaction_id
- ✅ Frontend shows two different Transaction Chains
- ✅ No cross-linking between unrelated documents

---

## Quick Test Commands

### Via API (using curl)
```bash
# Get all transactions
curl http://localhost:8002/api/v1/transactions

# Get specific transaction
curl http://localhost:8002/api/v1/transactions/txn-xxxxxxxx

# Get transaction timeline
curl http://localhost:8002/api/v1/transactions/txn-xxxxxxxx/timeline

# Get document's related transaction
curl http://localhost:8002/api/v1/documents/{doc_id}/related
```

### Via Browser Console
```javascript
// After opening a document, get its transaction chain
const docId = document.location.href.match(/document\/([a-f0-9-]+)/)[1];
fetch(`http://localhost:8002/api/v1/documents/${docId}/related`)
  .then(r => r.json())
  .then(data => {
    console.log("Transaction:", data.transaction);
    console.log("Related Docs:", data.related_documents);
    console.log("Timeline:", data.timeline);
  });
```

---

## Checklist for Full Testing

- [ ] Scenario 1: Basic flow works (3 documents → 1 transaction)
- [ ] Scenario 2: Discrepancies detected and flagged
- [ ] Scenario 3: Multiple ASNs tracked correctly
- [ ] Scenario 4: Non-matching creates separate transaction
- [ ] Frontend: Transaction Chain displays for all scenarios
- [ ] Frontend: Can navigate between linked documents
- [ ] API: All endpoints return correct data
- [ ] API: Timeline events in correct order
- [ ] API: Status transitions as expected
- [ ] Database: All tables populated correctly

---

## Files Summary

| File | Format | Scenario | PO Number | Notes |
|------|--------|----------|-----------|-------|
| PO_TEST_001.850 | X12 EDI | 1,3,4 | PO-TEST-001 | Standard PO |
| PO_TEST_001.json | JSON | 1,2,3,4 | PO-TEST-001 | Same as .850 |
| ASN_TEST_001.856 | X12 EDI | 1,3 | PO-TEST-001 | 700 units |
| ASN_TEST_001.json | JSON | 1,2,3 | PO-TEST-001 | Same as .856 |
| ASN_TEST_002.json | JSON | 3 | PO-TEST-001 | Second shipment |
| INVOICE_TEST_001.810 | X12 EDI | 1 | PO-TEST-001 | Standard invoice |
| INVOICE_TEST_001.json | JSON | 1 | PO-TEST-001 | Same as .810 |
| INVOICE_DISCREPANCY.json | JSON | 2 | PO-TEST-001 | Price mismatches |

---

## Key Test Values

### PO-TEST-001 (Purchase Order)
- Vendor: SUPPLIER456 / SUPPLIER INC
- Customer: BUYER123 / BUYER CORP
- SKU-001: 1,000 units @ $10.00 = $10,000
- SKU-002: 500 units @ $15.00 = $7,500
- **Total**: 1,500 units, $17,500

### ASN-TEST-001 (First Shipment)
- Shipped: 400 SKU-001 + 300 SKU-002 = 700 units
- Remaining: 600 SKU-001 + 200 SKU-002 = 800 units

### ASN-TEST-002 (Second Shipment)
- Shipped: 600 SKU-001 + 200 SKU-002 = 800 units
- Total Shipped: 1,000 SKU-001 + 500 SKU-002 = 1,500 units (100%)

### INVOICE-TEST-001 (Matching Invoice)
- Amount: $7,000
- SKU-001: 400 units @ $10.00 = $4,000
- SKU-002: 300 units @ $15.00 = $4,500

### INVOICE-DISCREPANCY (Mismatched Invoice)
- Amount: $7,150 (higher due to price increases)
- SKU-001: 400 units @ $10.50 = $4,200 (+$200)
- SKU-002: 300 units @ $14.50 = $4,350 (-$150)

---

**Need help?** See `README.md` for detailed step-by-step instructions!

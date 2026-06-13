# Test Documents for Transaction Correlation

This folder contains sample documents to test the Transaction Correlation system.

## 📋 Documents Included

### Format 1: X12 EDI (Electronic Data Interchange)
- `PO_TEST_001.850` — Purchase Order (X12 850 format)
- `ASN_TEST_001.856` — Advanced Shipment Notice (X12 856 format)
- `INVOICE_TEST_001.810` — Invoice (X12 810 format)

### Format 2: JSON
- `PO_TEST_001.json` — Purchase Order (JSON format)
- `ASN_TEST_001.json` — Advanced Shipment Notice (JSON format)
- `INVOICE_TEST_001.json` — Invoice (JSON format)

## 🔗 Key Correlation Field

All three documents reference the **same PO number**: `PO-TEST-001`

This allows them to be automatically linked into a single transaction when uploaded.

## 📊 Document Details

### PO (Purchase Order)
- **PO Number**: PO-TEST-001
- **Order Number**: ORD-456789
- **Total Value**: $16,500.00
- **Line Items**:
  - SKU-001: 1,000 units @ $10.00 = $10,000
  - SKU-002: 500 units @ $15.00 = $7,500

### ASN (Advanced Shipment Notice)
- **Shipment ID**: ASN-TEST-001
- **References PO**: PO-TEST-001
- **Quantities Shipped** (partial):
  - SKU-001: 400 units (of 1,000 ordered)
  - SKU-002: 300 units (of 500 ordered)
- **Total**: 700 units shipped

### Invoice
- **Invoice Number**: INV-TEST-001
- **References PO**: PO-TEST-001
- **Quantities Invoiced** (matches ASN):
  - SKU-001: 400 units @ $10.00 = $4,000
  - SKU-002: 300 units @ $15.00 = $4,500
- **Total**: $7,000 (partial, $9,500 remaining)

## 🚀 How to Test

### Step 1: Upload PO
1. Go to http://localhost:3002 (frontend)
2. Navigate to **Documents → Inbound**
3. Click **Upload Document**
4. Select `PO_TEST_001.850` (or `.json`)
5. Verify upload succeeds
6. Note the **Document ID**

**Expected Result**: 
- ✅ Document processed
- ✅ Status: "Completed"
- ✅ Type: "Purchase Order"

### Step 2: View PO Details
1. Click on the PO document
2. Look for **Transaction Chain** section
3. Should show:
   - Transaction ID: `txn-xxxxxxxx`
   - Status: `PO_RECEIVED`
   - No related documents yet

### Step 3: Upload ASN
1. Return to Documents → Inbound
2. Click **Upload Document**
3. Select `ASN_TEST_001.856` (or `.json`)
4. Verify upload succeeds

**Expected Result**:
- ✅ Document processed
- ✅ Status: "Completed"
- ✅ Type: "Shipment Notice"

### Step 4: View ASN Details
1. Click on the ASN document
2. Look for **Transaction Chain** section
3. Should show:
   - Transaction ID: **Same as PO** (auto-linked!)
   - Status: `ASN_RECEIVED`
   - **Related Documents**: PO document listed

### Step 5: Upload Invoice
1. Return to Documents → Inbound
2. Click **Upload Document**
3. Select `INVOICE_TEST_001.810` (or `.json`)
4. Verify upload succeeds

**Expected Result**:
- ✅ Document processed
- ✅ Status: "Completed"
- ✅ Type: "Invoice"

### Step 6: View Invoice Details
1. Click on the Invoice document
2. Look for **Transaction Chain** section
3. Should show:
   - Transaction ID: **Same as PO & ASN** (auto-linked!)
   - Status: `COMPLETED` (all docs received)
   - **Related Documents**: Both PO and ASN listed
   - **Item Match**: MATCHED (quantities match)

### Step 7: View Transaction Details (API)
Open your browser console and run:

```javascript
// Get the transaction ID from any document's details
const transactionId = "txn-xxxxxxxx";

// View full transaction
fetch(`http://localhost:8002/api/v1/transactions/${transactionId}`)
  .then(r => r.json())
  .then(console.log);

// View timeline events
fetch(`http://localhost:8002/api/v1/transactions/${transactionId}/timeline`)
  .then(r => r.json())
  .then(console.log);

// View all linked documents
fetch(`http://localhost:8002/api/v1/transactions/${transactionId}/documents`)
  .then(r => r.json())
  .then(console.log);
```

## ✅ What You Should See

### Transaction Chain (in UI)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TRANSACTION CHAIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SLA ON_TIME · Deadline Jun 15, 2026, 5:00:00 PM

PURCHASE_ORDER
  bcddd6ad-ff4...  ✓ MATCHED

Advanced Shipment Notice
  5155f7d1-115...  ✓ MATCHED

Invoice
  3a48f764-a7e...  ✓ MATCHED
```

### Timeline Events (in API response)
```json
{
  "events": [
    {
      "event_type": "PO_RECEIVED",
      "description": "PURCHASE_ORDER PO-TEST-001 received",
      "timestamp": "2026-06-15T09:00:00Z"
    },
    {
      "event_type": "ASN_RECEIVED",
      "description": "ASN ASN-TEST-001 received",
      "timestamp": "2026-06-15T09:05:00Z"
    },
    {
      "event_type": "INVOICE_RECEIVED",
      "description": "INVOICE INV-TEST-001 received",
      "timestamp": "2026-06-15T09:10:00Z"
    }
  ]
}
```

### Transaction Status Lifecycle
```
CREATED (initial)
  ↓ (after PO upload)
PO_RECEIVED
  ↓ (after ASN upload)
ASN_RECEIVED
  ↓ (after Invoice upload)
COMPLETED (all docs received + validated)
```

## 🔍 What's Being Tested

✅ **Auto-Linking**: ASN & Invoice automatically linked to PO via `po_number` field  
✅ **Multiple Documents**: Single transaction contains PO + ASN + Invoice  
✅ **Partial Shipment**: ASN shows 700 of 1,500 units  
✅ **Partial Invoice**: Invoice shows $7,000 of $16,500  
✅ **Status Transitions**: PO_RECEIVED → ASN_RECEIVED → COMPLETED  
✅ **Timeline Events**: All document arrivals logged  
✅ **Item Matching**: Quantities & amounts match across documents  

## 🐛 Troubleshooting

### ASN not linking to PO
- **Check**: PO number in ASN must exactly match PO: `PO-TEST-001`
- **Fix**: Re-upload ASN with correct PO number

### Status stays at ASN_RECEIVED (doesn't reach COMPLETED)
- **Check**: Invoice must reference same PO number
- **Check**: Item quantities must match (400 + ? = 1000)
- **Fix**: Upload invoice with matching line items

### Transaction Chain section not showing
- **Check**: Browser console for errors
- **Check**: Backend logs: `tail -f logs/backend.log`
- **Fix**: Hard refresh browser (Ctrl+Shift+R)

### Documents not appearing in UI
- **Check**: Backend running: `http://localhost:8002/health`
- **Check**: Frontend running: `http://localhost:3002`
- **Fix**: Run `bash start.sh` to restart both

## 📝 Notes

- All dates in test documents are intentionally set to 2026-06-13 to 2026-06-15
- Partner IDs (`SUPPLIER456`, `BUYER123`) are for testing only
- Quantities are designed to test partial shipment/invoicing scenarios
- Use X12 format if your system requires EDI; use JSON for simpler testing

## 🎯 Success Criteria

✅ All three documents upload successfully  
✅ Transaction Chain section appears in DocumentDetail UI  
✅ All three documents link to the same transaction  
✅ Status transitions from PO_RECEIVED → ASN_RECEIVED → COMPLETED  
✅ Timeline shows all three document arrivals  
✅ Item discrepancies are correctly identified (none in this case)  

---

**Ready to test?** Start with Step 1 above!

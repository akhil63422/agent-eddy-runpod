# Transaction Linking Architecture

## The Central Hub: `business_transactions` Table

The **`business_transactions` table** is the orchestrator that links all related documents together. It acts as a central record that groups documents by their correlation key (typically `po_number`).

### Key Fields in BusinessTransaction

| Field | Purpose |
|-------|---------|
| `transaction_id` | Unique identifier (txn-{uuid}) |
| `po_number` | Primary correlation key |
| `order_number` | Secondary correlation key |
| `reference_number` | Tertiary correlation key |
| `supplier` | Source party |
| `buyer` | Destination party |
| `status` | Lifecycle: CREATED → PO_RECEIVED → ASN_RECEIVED → INVOICE_RECEIVED → COMPLETED |
| `po_count` / `asn_count` / `invoice_count` | Document type counters |
| `ship_by_date` | SLA deadline for PO |
| `expected_delivery_date` | Promised delivery date |

---

## Two Types of Document Links

### 1. Transaction-Level Link (Primary - THE ORCHESTRATOR)
```
transaction_documents.business_transaction_id → business_transactions.id
```
- **Function**: Groups all documents related to same PO/order
- **Scope**: One transaction contains 10+ documents
- **Lifecycle**: Entire document group moves through one status
- **This is the real interlinking hub** 🎯

**Example:**
```
Transaction: txn-4de979f5529e
├─ PURCHASE_ORDER (ed3bffb3...)
├─ PURCHASE_ORDER (3988315a...)
├─ PURCHASE_ORDER (ee0a91a6...)
├─ SHIPMENT_NOTICE (2c914bf4...)
└─ INVOICE (...)
```

### 2. Document-Level Link (Convenience)
```
transaction_documents.linked_document_id → transaction_documents.id
```
- **Function**: Direct pointer to a related document (usually the first related doc)
- **Scope**: One-to-one relationship between two docs
- **Use case**: UI display of "linked to: PURCHASE_ORDER"
- **Auto-set**: By `correlation_service.link_document()` when documents grouped

---

## Correlation Algorithm (3-Tier Priority)

When a document arrives:

1. **Extract correlation keys** from canonical_event:
   - `po_number`
   - `order_number`
   - `reference_number`

2. **Search business_transactions** (in order):
   ```python
   # Tier 1: PO Number (most specific)
   if po_number:
       find by (po_number + supplier)  # exact match
       if not found: find by (po_number alone)  # handles direction reversal
   
   # Tier 2: Order Number
   elif order_number:
       find by (order_number + supplier)
   
   # Tier 3: Reference Number (least specific)
   elif reference_number:
       find by (reference_number + supplier + buyer)
   ```

3. **Result**:
   - **Found**: Link document to existing transaction
   - **Not found**: Create new BusinessTransaction

---

## Status Lifecycle

```
CREATED
  ↓
PO_RECEIVED (when 1st PO document linked)
  ↓
ASN_RECEIVED (when 1st ASN document linked, optional)
  ↓
INVOICE_RECEIVED (when 1st Invoice document linked)
  ↓
COMPLETED (all documents approved)
```

Updated by `correlation_service.update_transaction_status()` based on document types linked.

---

## Auto-Linking Process (Step-by-Step)

```
Document Uploaded
  ↓
[Parser] Extract correlation keys + canonical_event
  ↓
[Correlation Service] Call correlate_document()
  ↓
[Find Transaction]
  ├─ Search by po_number (primary)
  ├─ Search by order_number (fallback)
  └─ Search by reference_number (last resort)
  ↓
[Decision]
  ├─ FOUND → Link to existing transaction
  └─ NOT FOUND → Create new BusinessTransaction
  ↓
[Link Document]
  ├─ Set business_transaction_id (groups with other docs)
  └─ Set linked_document_id (convenience pointer)
  ↓
[Update Status]
  ├─ Count document types
  └─ Advance transaction status
  ↓
[Timeline]
  └─ Log event: "PO_RECEIVED" / "ASN_RECEIVED" / "INVOICE_RECEIVED"
  ↓
Document now visible in transaction chain ✓
```

---

## Key Insight

**The hub is not the documents — it's the transaction record.**

Documents point TO the transaction via `business_transaction_id`. The transaction is the single source of truth for:
- ✅ Document grouping (all related docs in one place)
- ✅ Status lifecycle (entire group progresses together)
- ✅ SLA deadlines (ship_by_date, expected_delivery_date)
- ✅ Supplier/buyer context
- ✅ Document counts by type (po_count, asn_count, invoice_count)
- ✅ Audit trail (TransactionTimeline events)

This **decouples documents from each other** and centers everything on the transaction record, making the system scalable and audit-friendly.

---

## Database Query Example

See all documents linked to a transaction:

```sql
SELECT 
  td.id,
  td.transaction_type,
  td.final_status,
  td.linked_document_id,
  bt.transaction_id,
  bt.po_number,
  bt.status
FROM transaction_documents td
JOIN business_transactions bt 
  ON td.business_transaction_id = bt.id
WHERE bt.po_number = 'PO-TEST-001'
ORDER BY td.created_at ASC;
```

Result: All documents for that PO, grouped in chronological order, with shared transaction state.

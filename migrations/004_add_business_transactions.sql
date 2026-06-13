-- Migration: Add BusinessTransaction correlation model
-- Created: 2026-06-13
-- Purpose: Enable PO-Invoice-ASN linking with transaction lifecycle tracking

-- NEW TABLE: business_transactions
CREATE TABLE IF NOT EXISTS business_transactions (
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
    correlation_confidence REAL DEFAULT 1.0,
    ship_by_date TIMESTAMP WITH TIME ZONE,
    expected_delivery_date TIMESTAMP WITH TIME ZONE,
    dispatch_deadline TIMESTAMP WITH TIME ZONE,
    metadata JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_business_transactions_po_number ON business_transactions(po_number);
CREATE INDEX IF NOT EXISTS idx_business_transactions_order_number ON business_transactions(order_number);
CREATE INDEX IF NOT EXISTS idx_business_transactions_reference ON business_transactions(reference_number);
CREATE INDEX IF NOT EXISTS idx_business_transactions_status ON business_transactions(status);

-- NEW TABLE: transaction_document_links
CREATE TABLE IF NOT EXISTS transaction_document_links (
    id VARCHAR PRIMARY KEY,
    business_transaction_id VARCHAR NOT NULL,
    transaction_document_id VARCHAR NOT NULL,
    document_role VARCHAR(32) NOT NULL,
    correlation_key VARCHAR(32),
    confidence REAL DEFAULT 1.0,
    validation_status VARCHAR(32),
    validation_errors JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_transaction_id) REFERENCES business_transactions(id),
    FOREIGN KEY (transaction_document_id) REFERENCES transaction_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_document_links_transaction ON transaction_document_links(business_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_document_links_document ON transaction_document_links(transaction_document_id);

-- NEW TABLE: transaction_timelines
CREATE TABLE IF NOT EXISTS transaction_timelines (
    id VARCHAR PRIMARY KEY,
    business_transaction_id VARCHAR NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    event_description VARCHAR,
    source_document_id VARCHAR,
    status_before VARCHAR(32),
    status_after VARCHAR(32),
    metadata JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_transaction_id) REFERENCES business_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_timelines_transaction ON transaction_timelines(business_transaction_id);

-- MODIFY TABLE: transaction_documents
ALTER TABLE transaction_documents
ADD COLUMN IF NOT EXISTS business_transaction_id VARCHAR REFERENCES business_transactions(id);

CREATE INDEX IF NOT EXISTS idx_transaction_documents_business_transaction ON transaction_documents(business_transaction_id);

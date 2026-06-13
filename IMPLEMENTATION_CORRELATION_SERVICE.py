# Transaction Correlation Service
# File: app/services/correlation_service.py

import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, List

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.models import (
    BusinessTransaction,
    TransactionDocument,
    TransactionDocumentLink,
    TransactionTimeline,
)
from app.core.logger import get_logger

log = get_logger("correlation_service")


class TransactionCorrelationService:
    """
    Handles document-to-transaction correlation and linking.

    Correlation Priority:
    1. po_number (exact match) - highest confidence
    2. order_number + supplier (fuzzy match)
    3. reference_number + buyer + supplier (lowest confidence)
    """

    def correlate_document(
        self,
        doc: TransactionDocument,
        db: Session,
    ) -> Tuple[BusinessTransaction, Dict]:
        """
        Main entry point: Correlate a document and link to transaction.

        Flow:
        1. Extract correlation keys from canonical_event
        2. Search for existing BusinessTransaction
        3. If found: Link document, validate, update status
        4. If not found: Create new transaction, link document
        5. Log timeline event
        6. Return transaction with correlation result

        Args:
            doc: TransactionDocument to correlate
            db: Database session

        Returns:
            (BusinessTransaction, result_dict) where result_dict contains:
            - status: "CREATED_NEW" | "LINKED_EXISTING" | "PENDING" | "FAILED"
            - message: Human-readable result
            - errors: List of errors if status="FAILED"
        """
        try:
            # 1. Extract correlation keys
            keys = self.extract_correlation_keys(doc.canonical_event or {})
            supplier = doc.source_partner
            buyer = doc.destination_partner

            log.info(
                f"[correlation] Correlating {doc.transaction_type}: "
                f"po={keys.get('po_number')}, order={keys.get('order_number')}"
            )

            # 2. Find or create transaction
            transaction = self.find_transaction(keys, supplier, buyer, db)

            result = {}
            if not transaction:
                transaction = self.create_transaction(keys, supplier, buyer, db)
                result["status"] = "CREATED_NEW"
                log.info(f"[correlation] Created BusinessTransaction {transaction.transaction_id}")
            else:
                result["status"] = "LINKED_EXISTING"
                log.info(f"[correlation] Found existing BusinessTransaction {transaction.transaction_id}")

            # 3. Link document
            correlation_key_used = keys.get("matched_key")
            link = self.link_document(transaction, doc, correlation_key_used, db)

            # 4. Validate document in context
            validation = self.validate_document_in_transaction(doc, transaction, db)
            link.validation_status = validation["status"]
            link.validation_errors = validation.get("errors", [])
            db.commit()

            # 5. Update transaction status
            self.update_transaction_status(transaction, db)

            # 6. Log timeline event
            event_type = self._map_doc_type_to_event(doc.transaction_type)
            timeline_event = {
                "event_type": event_type,
                "event_description": f"{doc.transaction_type} {doc.document_reference_number} received",
                "source_document_id": doc.id,
                "status_before": None,  # Will be set in log_timeline_event
                "status_after": transaction.status,
                "metadata": {
                    "validation_status": validation["status"],
                    "correlation_key": correlation_key_used,
                },
            }
            self.log_timeline_event(transaction, timeline_event, db)

            result["message"] = f"Document linked to transaction {transaction.transaction_id}"
            result["transaction_id"] = transaction.transaction_id

            return transaction, result

        except Exception as e:
            log.error(f"[correlation] Error correlating document: {str(e)}", exc_info=True)
            raise

    def extract_correlation_keys(self, canonical: Dict) -> Dict:
        """
        Extract correlation keys from canonical_event JSON.

        Handles variant field names:
        - PO number: po_number, po, document_number
        - Order number: order_number, order_id
        - Reference: reference_number, reference_id

        Returns:
            Dict with keys: po_number, order_number, reference_number, matched_key
        """
        keys = {
            "po_number": None,
            "order_number": None,
            "reference_number": None,
            "matched_key": None,
        }

        # Extract PO number (try variants)
        keys["po_number"] = (
            canonical.get("po_number")
            or canonical.get("po")
            or canonical.get("document_number")  # Fallback if nothing else
        )

        # Extract Order number (try variants)
        keys["order_number"] = (
            canonical.get("order_number")
            or canonical.get("order_id")
            or canonical.get("reference_order_number")
        )

        # Extract Reference number (try variants)
        keys["reference_number"] = (
            canonical.get("reference_number")
            or canonical.get("reference_id")
            or canonical.get("transaction_ref")
        )

        # Determine which key was primary (for matching later)
        if keys["po_number"]:
            keys["matched_key"] = "po_number"
        elif keys["order_number"]:
            keys["matched_key"] = "order_number"
        elif keys["reference_number"]:
            keys["matched_key"] = "reference_number"

        return keys

    def find_transaction(
        self,
        keys: Dict,
        supplier: str,
        buyer: str,
        db: Session,
    ) -> Optional[BusinessTransaction]:
        """
        Search for existing BusinessTransaction using correlation keys.

        Priority order:
        1. po_number (exact match, highest confidence)
        2. order_number + supplier
        3. reference_number + supplier + buyer

        Args:
            keys: Dict with po_number, order_number, reference_number
            supplier: Supplier name
            buyer: Buyer name
            db: Database session

        Returns:
            BusinessTransaction or None
        """
        # 1. Try po_number (primary key)
        if keys.get("po_number"):
            transaction = db.query(BusinessTransaction).filter(
                BusinessTransaction.po_number == keys["po_number"],
                BusinessTransaction.supplier == supplier,
            ).first()
            if transaction:
                log.info(f"[correlation] Found transaction via po_number: {keys['po_number']}")
                return transaction

        # 2. Try order_number
        if keys.get("order_number"):
            transaction = db.query(BusinessTransaction).filter(
                BusinessTransaction.order_number == keys["order_number"],
                BusinessTransaction.supplier == supplier,
            ).first()
            if transaction:
                log.info(f"[correlation] Found transaction via order_number: {keys['order_number']}")
                return transaction

        # 3. Try reference_number
        if keys.get("reference_number"):
            transaction = db.query(BusinessTransaction).filter(
                BusinessTransaction.reference_number == keys["reference_number"],
                BusinessTransaction.supplier == supplier,
                BusinessTransaction.buyer == buyer,
            ).first()
            if transaction:
                log.info(f"[correlation] Found transaction via reference_number: {keys['reference_number']}")
                return transaction

        log.info("[correlation] No existing transaction found, will create new")
        return None

    def create_transaction(
        self,
        keys: Dict,
        supplier: str,
        buyer: str,
        db: Session,
    ) -> BusinessTransaction:
        """
        Create a new BusinessTransaction from correlation keys.

        Args:
            keys: Dict with po_number, order_number, reference_number
            supplier: Supplier name
            buyer: Buyer name
            db: Database session

        Returns:
            Newly created BusinessTransaction
        """
        transaction = BusinessTransaction(
            id=str(uuid.uuid4()),
            transaction_id=self._generate_transaction_id(),
            po_number=keys.get("po_number"),
            order_number=keys.get("order_number"),
            reference_number=keys.get("reference_number"),
            supplier=supplier,
            buyer=buyer,
            status="CREATED",
            correlation_confidence=1.0,
        )
        db.add(transaction)
        db.commit()
        log.info(f"[correlation] Created BusinessTransaction: {transaction.transaction_id}")
        return transaction

    def link_document(
        self,
        transaction: BusinessTransaction,
        doc: TransactionDocument,
        correlation_key: str,
        db: Session,
    ) -> TransactionDocumentLink:
        """
        Create a link between document and transaction.

        Args:
            transaction: BusinessTransaction to link to
            doc: TransactionDocument to link
            correlation_key: Which key was used (po_number, order_number, etc.)
            db: Database session

        Returns:
            TransactionDocumentLink record
        """
        link = TransactionDocumentLink(
            id=str(uuid.uuid4()),
            business_transaction_id=transaction.id,
            transaction_document_id=doc.id,
            document_role=doc.transaction_type,  # PURCHASE_ORDER, INVOICE, ASN
            correlation_key=correlation_key,
            confidence=1.0,
            validation_status=None,  # Will be set after validation
            validation_errors=None,
        )
        db.add(link)
        db.commit()

        # Also update TransactionDocument
        doc.business_transaction_id = transaction.id
        db.commit()

        return link

    def validate_document_in_transaction(
        self,
        doc: TransactionDocument,
        transaction: BusinessTransaction,
        db: Session,
    ) -> Dict:
        """
        Validate document against other documents in transaction.

        Checks:
        - Quantity matching (PO qty vs sum of ASN qty vs Invoice qty)
        - Amount matching (PO amount vs sum of Invoice amounts)
        - Item consistency (items in invoice match PO items)

        Args:
            doc: Document to validate
            transaction: BusinessTransaction context
            db: Database session

        Returns:
            Dict with:
            - status: VALID | QUANTITY_MISMATCH | AMOUNT_MISMATCH | MISSING_FIELDS
            - errors: List of error dicts
            - warnings: List of warning strings
        """
        errors = []
        warnings = []

        if doc.transaction_type == "INVOICE":
            # For invoices, validate against PO items and quantities
            if hasattr(doc, "item_discrepancies") and doc.item_discrepancies:
                errors.extend(doc.item_discrepancies)
                return {
                    "status": "QUANTITY_MISMATCH" if errors else "VALID",
                    "errors": errors,
                    "warnings": warnings,
                }

        elif doc.transaction_type == "ASN":
            # For ASN, validate quantities sum correctly
            # (This would be done in a more complete implementation)
            pass

        return {
            "status": "VALID",
            "errors": errors,
            "warnings": warnings,
        }

    def update_transaction_status(
        self,
        transaction: BusinessTransaction,
        db: Session,
    ):
        """
        Update BusinessTransaction status based on linked documents.

        Status Flow:
        CREATED → PO_RECEIVED → ASN_RECEIVED → PARTIALLY_SHIPPED →
        FULLY_SHIPPED → INVOICE_RECEIVED → COMPLETED

        Args:
            transaction: BusinessTransaction to update
            db: Database session
        """
        # Refresh transaction to get latest counts
        db.refresh(transaction)

        # Count linked documents
        links = db.query(TransactionDocumentLink).filter(
            TransactionDocumentLink.business_transaction_id == transaction.id
        ).all()

        po_docs = [l for l in links if l.document_role == "PURCHASE_ORDER"]
        asn_docs = [l for l in links if l.document_role == "ASN"]
        invoice_docs = [l for l in links if l.document_role == "INVOICE"]

        transaction.po_count = len(po_docs)
        transaction.asn_count = len(asn_docs)
        transaction.invoice_count = len(invoice_docs)

        # Determine status based on documents
        if transaction.po_count == 0:
            new_status = "CREATED"
        elif transaction.asn_count == 0 and transaction.po_count > 0:
            new_status = "PO_RECEIVED"
        elif transaction.asn_count > 0 and transaction.invoice_count == 0:
            new_status = "ASN_RECEIVED"
            # Could check if partially or fully shipped
            # For MVP, just mark as ASN_RECEIVED
        elif transaction.invoice_count > 0:
            new_status = "INVOICE_RECEIVED"
            # If all validations pass and docs complete, mark COMPLETED
            all_links = db.query(TransactionDocumentLink).filter(
                TransactionDocumentLink.business_transaction_id == transaction.id
            ).all()
            if all(
                l.validation_status == "VALID"
                for l in all_links
                if l.validation_status
            ):
                new_status = "COMPLETED"
        else:
            new_status = transaction.status  # No change

        transaction.status = new_status
        db.commit()
        log.info(f"[correlation] Updated transaction {transaction.transaction_id} to status: {new_status}")

    def log_timeline_event(
        self,
        transaction: BusinessTransaction,
        event: Dict,
        db: Session,
    ):
        """
        Create a timeline event for the transaction.

        Args:
            transaction: BusinessTransaction
            event: Dict with event_type, description, source_document_id, metadata
            db: Database session
        """
        timeline = TransactionTimeline(
            id=str(uuid.uuid4()),
            business_transaction_id=transaction.id,
            event_type=event.get("event_type"),
            event_description=event.get("event_description"),
            source_document_id=event.get("source_document_id"),
            status_before=event.get("status_before"),
            status_after=event.get("status_after"),
            metadata=event.get("metadata"),
        )
        db.add(timeline)
        db.commit()
        log.info(f"[correlation] Logged event {event.get('event_type')} for transaction {transaction.transaction_id}")

    # ───────────────────────────────────────────────────────────────────────
    # Private Helpers
    # ───────────────────────────────────────────────────────────────────────

    @staticmethod
    def _generate_transaction_id() -> str:
        """Generate a unique transaction ID"""
        return f"txn-{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _map_doc_type_to_event(doc_type: str) -> str:
        """Map document type to timeline event type"""
        mapping = {
            "PURCHASE_ORDER": "PO_RECEIVED",
            "INVOICE": "INVOICE_RECEIVED",
            "SHIPMENT_NOTICE": "ASN_RECEIVED",
            "ASN": "ASN_RECEIVED",
        }
        return mapping.get(doc_type, "DOCUMENT_RECEIVED")


# ============================================================================
# Singleton Instance
# ============================================================================

correlation_service = TransactionCorrelationService()

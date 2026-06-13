from datetime import datetime, timezone

from app.orchestrator.state import WorkflowState
from app.core.logger import get_logger

log = get_logger("skill.normalization")


class NormalizationSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        parsed = state.get("parsed_data", {})
        tx_type = state.get("transaction_type", "UNKNOWN")
        confidence = state.get("confidence_score", 0.0)

        items = parsed.get("items") or parsed.get("line_items") or []
        normalized_items = []
        for i, item in enumerate(items, start=1):
            qty = _to_float(item.get("quantity", 0))
            price = _to_float(item.get("unit_price", 0))
            normalized_items.append({
                "line_number": item.get("line_number", i),
                "product_id": item.get("product_id", ""),
                "description": item.get("description") or item.get("product_id", ""),
                "quantity": qty,
                "unit_price": price,
                "unit": item.get("unit", item.get("unit_of_measure", "EA")),
                "extended_amount": round(qty * price, 2),
            })

        # Resolve buyer/supplier based on transaction type
        if tx_type == "PURCHASE_ORDER":
            buyer    = state.get("source_partner") or parsed.get("buyer", "")
            supplier = state.get("destination_partner") or parsed.get("supplier", "")
        elif tx_type == "LOAD_TENDER":
            buyer    = parsed.get("shipper") or parsed.get("ship_from") or state.get("source_partner", "")
            supplier = parsed.get("carrier") or state.get("destination_partner", "")
        else:
            buyer    = parsed.get("buyer", "")
            supplier = parsed.get("supplier", "")

        # Build structured parties array
        parties = []
        if buyer:
            parties.append({"role": "buyer", "name": buyer, "id": parsed.get("buyer_id") or parsed.get("buyer_code", ""),
                            "address": parsed.get("buyer_address", ""), "city": parsed.get("buyer_city", ""), "state": parsed.get("buyer_state", "")})
        if supplier:
            parties.append({"role": "seller", "name": supplier, "id": parsed.get("supplier_id") or parsed.get("supplier_code", ""),
                            "address": parsed.get("supplier_address", ""), "city": parsed.get("supplier_city", ""), "state": parsed.get("supplier_state", "")})
        if parsed.get("ship_to"):
            parties.append({"role": "shipTo", "name": parsed.get("ship_to", ""), "id": parsed.get("ship_to_code", ""),
                            "address": "", "city": parsed.get("ship_to_city", ""), "state": parsed.get("ship_to_state", "")})
        if parsed.get("carrier_code"):
            parties.append({"role": "carrier", "name": parsed.get("carrier_code", ""), "id": parsed.get("carrier_code", ""),
                            "address": "", "city": "", "state": ""})

        # Build totals block
        total_amount = _to_float(parsed.get("total_amount", 0))
        subtotal = sum(i["extended_amount"] for i in normalized_items) or total_amount
        totals = {
            "subtotal": round(subtotal, 2),
            "discount": _to_float(parsed.get("discount", 0)),
            "tax": _to_float(parsed.get("tax", 0)),
            "grand_total": total_amount or round(subtotal, 2),
            "currency": parsed.get("currency", "USD"),
        }

        # Audit block
        audit = {
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "confidence": confidence,
        }

        canonical: dict = {
            # Core identity
            "transaction_type":    tx_type,
            "document_number":     parsed.get("po_number") or parsed.get("invoice_number") or parsed.get("shipment_id", ""),
            "document_date":       parsed.get("document_date") or parsed.get("po_date") or parsed.get("order_date") or parsed.get("invoice_date", ""),
            # Structured collections
            "parties":             parties,
            "items":               normalized_items,
            "totals":              totals,
            "audit":               audit,
            # Flat fields kept for backward compat with mapper
            "buyer":               buyer,
            "supplier":            supplier,
            "po_number":           parsed.get("po_number", ""),
            "invoice_number":      parsed.get("invoice_number", ""),
            "shipment_id":         parsed.get("shipment_id", ""),
            "load_number":         parsed.get("load_number", ""),
            "ship_date":           parsed.get("ship_date", ""),
            "pickup_date":         parsed.get("pickup_date", ""),
            "delivery_date":       parsed.get("delivery_date", ""),
            "carrier_code":        parsed.get("carrier_code", ""),
            "transport_mode":      parsed.get("transport_mode", ""),
            "ship_from":           parsed.get("ship_from", ""),
            "ship_from_city":      parsed.get("ship_from_city", ""),
            "ship_from_state":     parsed.get("ship_from_state", ""),
            "ship_to":             parsed.get("ship_to", ""),
            "ship_to_city":        parsed.get("ship_to_city", ""),
            "ship_to_state":       parsed.get("ship_to_state", ""),
            "notes":               parsed.get("notes", []),
            "stops":               parsed.get("stops", []),
            "total_amount":        totals["grand_total"],
            "currency":            parsed.get("currency", "USD"),
            "source_format":       state.get("source_format", ""),
            "source_partner":      state.get("source_partner", ""),
            "destination_partner": state.get("destination_partner", ""),
            "relationship_type":   state.get("relationship_type", ""),
            "direction":           state.get("direction", ""),
        }

        log.info(f"[normalization] canonical built  tx={tx_type}  items={len(normalized_items)}  total={totals['grand_total']}  parties={len(parties)}")
        completed = state.get("completed_skills", []) + ["normalization"]
        return {
            **state,
            "canonical_event": canonical,
            "current_skill": "normalization",
            "completed_skills": completed,
        }


def _to_float(value) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0

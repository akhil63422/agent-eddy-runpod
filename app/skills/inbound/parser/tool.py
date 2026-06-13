import json
import csv
import io
from typing import Any


class X12ParserTool:
    """Deterministic X12 EDI parser for 850/856/810/204/211/214."""

    _TRANSACTION_MAP = {
        "850": "PURCHASE_ORDER",
        "856": "SHIPMENT_NOTICE",
        "810": "INVOICE",
        "204": "LOAD_TENDER",       # Motor Carrier Load Tender
        "211": "MOTOR_CARRIER_BOL", # Motor Carrier Bill of Lading
        "214": "SHIPMENT_STATUS",   # Shipment Status
        "855": "PO_ACKNOWLEDGEMENT",
        "997": "FUNCTIONAL_ACK",
    }

    # G62 qualifier → field name
    _G62_DATE_MAP = {
        "11": "pickup_date",
        "54": "delivery_date",
        "10": "ship_date",
        "02": "delivery_date",
        "37": "ship_date",
    }

    # N1 qualifier → role
    _N1_ROLE_MAP = {
        "BY": "buyer",   "SE": "supplier",
        "SF": "ship_from", "ST": "ship_to",
        "BT": "bill_to", "CN": "consignee",
        "SH": "shipper", "CA": "carrier",
    }

    def parse(self, raw: str) -> tuple[str, dict[str, Any]]:
        segments = [s.strip() for s in raw.split("~") if s.strip()]
        data: dict[str, Any] = {"segments": {}, "line_items": [], "stops": [], "notes": []}
        transaction_type = "UNKNOWN"
        current_n1_role = None
        current_stop: dict | None = None

        for seg in segments:
            elements = seg.split("*")
            tag = elements[0]
            e = elements  # shorthand

            # ── Envelope ──────────────────────────────────────────
            if tag == "ISA":
                data["isa_sender_id"]   = e[6].strip() if len(e) > 6 else ""
                data["isa_receiver_id"] = e[8].strip() if len(e) > 8 else ""

            elif tag == "GS":
                data["gs_sender"]   = e[2].strip() if len(e) > 2 else ""
                data["gs_receiver"] = e[3].strip() if len(e) > 3 else ""

            elif tag == "ST":
                tx_set = e[1] if len(e) > 1 else ""
                transaction_type = self._TRANSACTION_MAP.get(tx_set, "UNKNOWN")
                data["transaction_set"] = tx_set

            # ── PO / Invoice header ────────────────────────────────
            elif tag == "BEG":
                data["po_number"]    = e[3] if len(e) > 3 else ""
                data["document_date"] = e[5] if len(e) > 5 else ""

            elif tag == "BIG":  # 810 invoice header
                data["document_date"]   = e[1] if len(e) > 1 else ""
                data["invoice_number"]  = e[2] if len(e) > 2 else ""
                data["po_number"]       = e[4] if len(e) > 4 else ""

            elif tag == "BSN":  # 856 ASN header
                data["shipment_id"]  = e[2] if len(e) > 2 else ""
                data["ship_date"]    = e[3] if len(e) > 3 else ""

            # ── 204 Load Tender header ─────────────────────────────
            elif tag == "B2":
                data["shipper_id"]   = e[2] if len(e) > 2 else ""
                data["shipment_id"]  = e[4] if len(e) > 4 else ""
                data["payment_terms"] = e[6] if len(e) > 6 else ""

            elif tag == "MS3":  # Carrier info
                data["carrier_code"]    = e[1] if len(e) > 1 else ""
                data["routing_service"] = e[2] if len(e) > 2 else ""
                data["transport_mode"]  = e[4] if len(e) > 4 else ""

            elif tag == "L11":  # Reference numbers
                ref_val  = e[1] if len(e) > 1 else ""
                ref_qual = e[2] if len(e) > 2 else ""
                if ref_qual == "LN":
                    data["load_number"] = ref_val
                elif ref_qual == "PO":
                    data["po_number"] = ref_val
                else:
                    data[f"ref_{ref_qual.lower()}"] = ref_val

            elif tag == "NTE":  # Notes
                data["notes"].append(e[2] if len(e) > 2 else "")

            elif tag == "G62":  # Dates
                qualifier = e[1] if len(e) > 1 else ""
                date_val  = e[2] if len(e) > 2 else ""
                time_val  = e[4] if len(e) > 4 else ""
                field = self._G62_DATE_MAP.get(qualifier)
                if field:
                    data[field] = date_val
                    if time_val:
                        data[f"{field}_time"] = time_val

            elif tag == "S5":   # Stop-off segment — opens a new stop block
                current_stop = {
                    "stop_number": e[1] if len(e) > 1 else "",
                    "stop_reason": e[2] if len(e) > 2 else "",
                }
                data["stops"].append(current_stop)

            elif tag == "LAD":  # Lading detail (204)
                data["line_items"].append({
                    "lading_type":   e[1] if len(e) > 1 else "",
                    "quantity":      e[2] if len(e) > 2 else "",
                    "unit":          e[3] if len(e) > 3 else "",
                    "weight":        e[4] if len(e) > 4 else "",
                    "weight_unit":   e[5] if len(e) > 5 else "",
                    "description":   e[7] if len(e) > 7 else "",
                    "product_id":    e[7] if len(e) > 7 else "",
                    "unit_price":    "0",
                })

            # ── PO line items ──────────────────────────────────────
            elif tag == "PO1":
                data["line_items"].append({
                    "line_number": e[1] if len(e) > 1 else "",
                    "quantity":    e[2] if len(e) > 2 else "",
                    "unit":        e[3] if len(e) > 3 else "",
                    "unit_price":  e[4] if len(e) > 4 else "",
                    "product_id":  e[7] if len(e) > 7 else "",
                })

            elif tag == "IT1":  # 810 line item
                data["line_items"].append({
                    "line_number": e[1] if len(e) > 1 else "",
                    "quantity":    e[2] if len(e) > 2 else "",
                    "unit":        e[3] if len(e) > 3 else "",
                    "unit_price":  e[4] if len(e) > 4 else "",
                    "product_id":  e[7] if len(e) > 7 else "",
                })

            elif tag == "TDS":
                data["total_amount"] = e[1] if len(e) > 1 else ""

            # ── Partners ───────────────────────────────────────────
            elif tag == "N1":
                qualifier = e[1] if len(e) > 1 else ""
                name      = e[2] if len(e) > 2 else ""
                current_n1_role = self._N1_ROLE_MAP.get(qualifier, qualifier.lower())
                data[current_n1_role] = name
                id_code = e[4] if len(e) > 4 else ""
                if id_code:
                    data[f"{current_n1_role}_id"] = id_code

            elif tag == "N3" and current_n1_role:
                data[f"{current_n1_role}_address"] = e[1] if len(e) > 1 else ""

            elif tag == "N4" and current_n1_role:
                data[f"{current_n1_role}_city"]    = e[1] if len(e) > 1 else ""
                data[f"{current_n1_role}_state"]   = e[2] if len(e) > 2 else ""
                data[f"{current_n1_role}_zip"]     = e[3] if len(e) > 3 else ""
                data[f"{current_n1_role}_country"] = e[4] if len(e) > 4 else ""

            data["segments"][tag] = e[1:]

        return transaction_type, data


class JSONParserTool:
    def parse(self, raw: str) -> tuple[str, dict[str, Any]]:
        data = json.loads(raw)

        # Infer transaction_type if not explicitly set
        tx_type = (data.get("transaction_type") or "").upper()
        if not tx_type or tx_type == "UNKNOWN":
            if data.get("po_number") or data.get("purchase_order_number"):
                tx_type = "PURCHASE_ORDER"
            elif data.get("invoice_number") or data.get("invoice_no"):
                tx_type = "INVOICE"
            elif data.get("shipment_id") or data.get("asn_number") or data.get("tracking_number"):
                tx_type = "SHIPMENT_NOTICE"
            else:
                tx_type = "UNKNOWN"

        # Flatten nested buyer: {name, code} → flat strings
        buyer = data.get("buyer", "")
        if isinstance(buyer, dict):
            data["buyer"] = buyer.get("name") or buyer.get("code", "")
            data["buyer_code"] = buyer.get("code", "")

        # Normalise seller → supplier
        seller = data.get("seller") or data.get("supplier", "")
        if isinstance(seller, dict):
            data["supplier"] = seller.get("name") or seller.get("code", "")
            data["supplier_code"] = seller.get("code", "")
        elif seller:
            data["supplier"] = seller

        # Map order_date → document_date / po_date
        if not data.get("document_date"):
            data["document_date"] = data.get("order_date") or data.get("invoice_date") or ""

        # Flatten line_items: ensure items key is consistent
        if "line_items" in data and "items" not in data:
            data["items"] = [
                {
                    "line_number": str(i.get("line_number", "")),
                    "product_id": i.get("product_id", ""),
                    "description": i.get("description", i.get("product_id", "")),
                    "quantity": i.get("quantity", 0),
                    "unit_price": float(str(i.get("unit_price", 0)).replace(",", "")),
                    "unit": i.get("unit", ""),
                }
                for i in data["line_items"]
            ]

        return tx_type, data


class CSVParserTool:
    def parse(self, raw: str) -> tuple[str, dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(raw))
        rows = list(reader)
        tx_type = "PURCHASE_ORDER"
        if rows:
            header_keys = [k.lower() for k in rows[0].keys()]
            if any("invoice" in k for k in header_keys):
                tx_type = "INVOICE"
            elif any("ship" in k or "asn" in k for k in header_keys):
                tx_type = "SHIPMENT_NOTICE"
        return tx_type, {"rows": rows}

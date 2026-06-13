from datetime import date


class X12BuilderTool:
    def build(self, data: dict, control_number: str = "0001", transaction_type: str = "PURCHASE_ORDER") -> str:
        if transaction_type == "SHIPMENT_NOTICE":
            return self._build_856(data, control_number)
        if transaction_type == "INVOICE":
            return self._build_810(data, control_number)
        return self._build_850(data, control_number)

    def _build_850(self, data: dict, control_number: str) -> str:
        po_number = data.get("po_number", "UNKNOWN")
        buyer = data.get("buyer", "BUYER")
        buyer_id = data.get("buyer_id", data.get("buyer", "BUYER"))[:15].strip()
        supplier = data.get("supplier", "SUPPLIER")
        supplier_id = data.get("supplier_id", data.get("supplier", "SUPPLIER"))[:15].strip()
        doc_date = data.get("document_date", data.get("order_date", date.today().strftime("%Y%m%d")))
        items = data.get("items", [])
        currency = data.get("currency", "USD")

        segments = []
        segments.append(f"ST*850*{control_number}")
        segments.append(f"BEG*00*NE*{po_number}**{doc_date}")
        segments.append(f"CUR*BY*{currency}")
        segments.append(f"N1*BY*{buyer}*92*{buyer_id}")
        segments.append(f"N1*SE*{supplier}*92*{supplier_id}")

        # Partner-specific qualifiers set by outbound_mapper
        pid_qualifier = data.get("product_id_qualifier", "VP")
        uom_override = data.get("unit_of_measure_code", "")
        ship_to_qualifier = data.get("ship_to_qualifier", "ST")
        ref_segments = data.get("ref_segments", [])

        # REF segments (partner-specific reference numbers)
        for ref in ref_segments:
            q, v = ref.get("qualifier", ""), ref.get("value", "")
            if q:
                segments.append(f"REF*{q}*{v}" if v else f"REF*{q}")

        for i, item in enumerate(items, start=1):
            product_id = item.get("product_id", "")
            qty = item.get("quantity", 0)
            unit = uom_override or item.get("unit", "EA")
            price = item.get("unit_price", 0)
            description = item.get("description", "")
            seg = f"PO1*{i}*{qty}*{unit}*{price}**{pid_qualifier}*{product_id}"
            if description:
                seg += f"*PD*{description}"
            segments.append(seg)

        total_amount = data.get("total_amount", 0)
        total_cents = int(round(float(total_amount) * 100))
        segments.append(f"TDS*{total_cents}")

        segment_count = len(segments) + 1
        segments.append(f"SE*{segment_count}*{control_number}")
        return "~\n".join(segments) + "~"

    def _build_856(self, data: dict, control_number: str) -> str:
        shipment_id = data.get("shipment_id", "SHP-UNKNOWN")
        ship_date = data.get("ship_date", date.today().strftime("%Y%m%d"))
        buyer = data.get("buyer", "BUYER")
        buyer_id = data.get("buyer_id", data.get("buyer", "BUYER"))[:15].strip()
        supplier = data.get("supplier", "SUPPLIER")
        supplier_id = data.get("supplier_id", data.get("supplier", "SUPPLIER"))[:15].strip()
        items = data.get("items", [])
        carrier = data.get("carrier", "")
        tracking = data.get("tracking_number", "")

        # Normalise ship_date to YYYYMMDD
        ship_date_fmt = ship_date.replace("-", "")[:8]

        segments = []
        segments.append(f"ST*856*{control_number}")
        segments.append(f"BSN*00*{shipment_id}*{ship_date_fmt}*0000")
        segments.append(f"DTM*011*{ship_date_fmt}")
        if carrier:
            segments.append(f"TD5****{carrier}")
        if tracking:
            segments.append(f"REF*CN*{tracking}")
        segments.append(f"N1*SF*{supplier}*92*{supplier_id}")
        segments.append(f"N1*ST*{buyer}*92*{buyer_id}")

        # HL shipment level
        segments.append("HL*1**S*1")

        for i, item in enumerate(items, start=1):
            hl_num = i + 1
            product_id = item.get("product_id", "")
            qty = item.get("quantity", 0)
            unit = item.get("unit", "EA")
            description = item.get("description", "")
            segments.append(f"HL*{hl_num}*1*I")
            segments.append(f"LIN*{i}**VP*{product_id}")
            if description:
                segments.append(f"PID*F****{description}")
            segments.append(f"QTY*12*{qty}*{unit}")

        segment_count = len(segments) + 1
        segments.append(f"SE*{segment_count}*{control_number}")
        return "~\n".join(segments) + "~"

    def _build_810(self, data: dict, control_number: str) -> str:
        invoice_number = data.get("invoice_number", "INV-UNKNOWN")
        invoice_date = data.get("invoice_date", date.today().strftime("%Y%m%d"))
        po_number = data.get("po_number", "")
        buyer = data.get("buyer", "BUYER")
        buyer_id = data.get("buyer_id", data.get("buyer", "BUYER"))[:15].strip()
        supplier = data.get("supplier", "SUPPLIER")
        supplier_id = data.get("supplier_id", data.get("supplier", "SUPPLIER"))[:15].strip()
        items = data.get("items", [])
        currency = data.get("currency", "USD")
        payment_terms = data.get("payment_terms", "NET30")

        invoice_date_fmt = invoice_date.replace("-", "")[:8]

        segments = []
        segments.append(f"ST*810*{control_number}")
        big_po = f"*{po_number}" if po_number else ""
        segments.append(f"BIG*{invoice_date_fmt}*{invoice_number}{big_po}")
        segments.append(f"CUR*SE*{currency}")
        segments.append(f"REF*DP*{payment_terms}")
        segments.append(f"N1*SE*{supplier}*92*{supplier_id}")
        segments.append(f"N1*BY*{buyer}*92*{buyer_id}")

        for i, item in enumerate(items, start=1):
            product_id = item.get("product_id", "")
            qty = item.get("quantity", 0)
            unit = item.get("unit", "EA")
            price = item.get("unit_price", 0)
            description = item.get("description", "")
            extended = round(float(qty) * float(price), 2)
            seg = f"IT1*{i}*{qty}*{unit}*{price}**VP*{product_id}"
            if description:
                seg += f"*IN*{description}"
            segments.append(seg)
            segments.append(f"TXI*TX*{extended}")

        total_amount = data.get("total_amount", 0)
        total_cents = int(round(float(total_amount) * 100))
        segments.append(f"TDS*{total_cents}")

        segment_count = len(segments) + 1
        segments.append(f"SE*{segment_count}*{control_number}")
        return "~\n".join(segments) + "~"

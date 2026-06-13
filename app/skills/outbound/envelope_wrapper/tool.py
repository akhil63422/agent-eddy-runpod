from datetime import datetime, timezone


class EnvelopeWrapperTool:
    def wrap(
        self,
        tx_body: str,
        sender: str,
        receiver: str,
        control_number: str = "000000001",
        transaction_type: str = "PURCHASE_ORDER",
        sender_qualifier: str = "ZZ",
        receiver_qualifier: str = "ZZ",
        sender_gs_id: str = "",
        receiver_gs_id: str = "",
        edi_version: str = "005010",
    ) -> str:
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%y%m%d")
        time_str = now.strftime("%H%M")
        ctrl9 = control_number.zfill(9)

        sender_id = f"{sender:<15}"[:15]
        receiver_id = f"{receiver:<15}"[:15]

        sender_gs = (sender_gs_id or sender[:12]).strip()
        receiver_gs = (receiver_gs_id or receiver[:12]).strip()

        # Version: 005010 → 00501 in ISA16, 004010 → 00401
        isa_version = edi_version.replace("0", "", 1) if edi_version.startswith("0") else edi_version
        isa_version = isa_version[:5]

        isa = (
            f"ISA*00*          *00*          *"
            f"{sender_qualifier}*{sender_id}*{receiver_qualifier}*{receiver_id}*"
            f"{date_str}*{time_str}*^*{isa_version}*{ctrl9}*0*P*>"
        )

        _GS_FUNC = {"PURCHASE_ORDER": "PO", "SHIPMENT_NOTICE": "SH", "INVOICE": "IN"}
        gs_code = _GS_FUNC.get(transaction_type, "PO")
        gs = f"GS*{gs_code}*{sender_gs}*{receiver_gs}*{now.strftime('%Y%m%d')}*{time_str}*1*X*{edi_version}"
        ge = "GE*1*1"
        iea = f"IEA*1*{ctrl9}"

        return "~\n".join([isa, gs, tx_body.rstrip("~\n"), ge, iea]) + "~"

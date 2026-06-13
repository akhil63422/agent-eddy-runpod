from app.orchestrator.state import WorkflowState
from app.skills.outbound.envelope_wrapper.tool import EnvelopeWrapperTool
from app.core.logger import get_logger

log = get_logger("skill.envelope_wrapper")
_tool = EnvelopeWrapperTool()


class EnvelopeWrapperSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        parsed = state.get("parsed_data", {})
        tx_body = state.get("edi_output", "")
        doc_id = state.get("document_id", "000000001")

        # Sender = us (the one generating the EDI)
        our_isa_qualifier = state.get("our_isa_qualifier") or "ZZ"
        our_isa_id = state.get("our_isa_id") or "AGENTEDDY      "
        our_gs_id = state.get("our_gs_id") or "AGENTEDDY"

        # Receiver = trading partner (looked up from PartnerProfile)
        partner_isa_qualifier = state.get("partner_isa_qualifier") or "ZZ"
        partner_isa_id = state.get("partner_isa_id") or (
            state.get("destination_partner")
            or parsed.get("supplier_id")
            or parsed.get("supplier", "RECEIVER")
        )
        partner_gs_id = state.get("partner_gs_id") or partner_isa_id[:12].strip()
        edi_version = state.get("partner_edi_version") or "005010"

        control_number = "".join(filter(str.isdigit, doc_id))[:9].zfill(9) or "000000001"
        tx_type = state.get("transaction_type", "PURCHASE_ORDER")

        log.info(
            f"[envelope_wrapper] wrapping  type={tx_type}  "
            f"sender={our_isa_qualifier}:{our_isa_id.strip()}  "
            f"receiver={partner_isa_qualifier}:{partner_isa_id.strip()}  "
            f"version={edi_version}"
        )

        full_edi = _tool.wrap(
            tx_body,
            sender=our_isa_id,
            receiver=partner_isa_id,
            control_number=control_number,
            transaction_type=tx_type,
            sender_qualifier=our_isa_qualifier,
            receiver_qualifier=partner_isa_qualifier,
            sender_gs_id=our_gs_id,
            receiver_gs_id=partner_gs_id,
            edi_version=edi_version,
        )

        completed = state.get("completed_skills", []) + ["envelope_wrapper"]
        return {
            **state,
            "edi_output": full_edi,
            "source_partner": our_isa_id.strip(),
            "destination_partner": partner_isa_id.strip(),
            "final_status": "COMPLETED",
            "current_skill": "envelope_wrapper",
            "completed_skills": completed,
        }

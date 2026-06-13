import json

from app.orchestrator.state import WorkflowState
from app.core.logger import get_logger

log = get_logger("skill.type_detector")

_KEY_MAP = {
    "po_number": "PURCHASE_ORDER",
    "shipment_id": "SHIPMENT_NOTICE",
    "asn_number": "SHIPMENT_NOTICE",
    "invoice_number": "INVOICE",
}


class TypeDetectorSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        # If already set (e.g. from API caller) keep it
        existing = state.get("transaction_type", "")
        if existing and existing != "UNKNOWN":
            log.info(f"[type_detector] transaction_type already set: {existing}")
            return {**state, "current_skill": "type_detector",
                    "completed_skills": state.get("completed_skills", []) + ["type_detector"]}

        raw = state.get("raw_document", "")
        tx_type = "UNKNOWN"
        try:
            data = json.loads(raw)
            for key, detected in _KEY_MAP.items():
                if data.get(key):
                    tx_type = detected
                    break
        except (json.JSONDecodeError, TypeError):
            pass

        log.info(f"[type_detector] detected transaction_type={tx_type}")
        return {
            **state,
            "transaction_type": tx_type,
            "current_skill": "type_detector",
            "completed_skills": state.get("completed_skills", []) + ["type_detector"],
        }

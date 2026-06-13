from app.orchestrator.state import WorkflowState
from app.core.config import HITL_CONFIDENCE_THRESHOLD as _CONFIDENCE_THRESHOLD
from app.core.logger import get_logger

log = get_logger("skill.validator")

_REQUIRED_FIELDS = {
    "PURCHASE_ORDER": ["vendor_id", "customer_id", "document_number", "line_items"],
    "INVOICE": ["vendor_id", "document_number", "total_value"],
    "SHIPMENT_NOTICE": ["vendor_id", "document_number", "line_items"],
}


class ValidatorSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        errors: list[str] = []
        payload = state.get("mapped_payload", {})
        tx_type = state.get("transaction_type", "UNKNOWN")
        confidence = state.get("confidence_score", 0.0)

        required = _REQUIRED_FIELDS.get(tx_type, [])
        for field in required:
            if not payload.get(field):
                errors.append(f"Missing required ERP field: {field}")

        if tx_type == "PURCHASE_ORDER":
            items = payload.get("line_items", [])
            if not items:
                errors.append("Purchase Order must have at least one line item")

        hitl_required = confidence < _CONFIDENCE_THRESHOLD or bool(errors)
        final_status = "HITL_PENDING" if hitl_required else "COMPLETED"

        if errors:
            for e in errors:
                log.warning(f"[validator] ✗ {e}")
        else:
            log.info("[validator] ✓ all required fields present")

        log.info(f"[validator] confidence={confidence:.2f}  threshold={_CONFIDENCE_THRESHOLD}  hitl={hitl_required}  status={final_status}")

        completed = state.get("completed_skills", []) + ["validator"]
        return {
            **state,
            "validation_errors": errors,
            "hitl_required": hitl_required,
            "final_status": final_status,
            "current_skill": "validator",
            "completed_skills": completed,
        }

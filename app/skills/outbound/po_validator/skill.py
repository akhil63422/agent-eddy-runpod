import json

from app.orchestrator.state import WorkflowState
from app.skills.outbound.po_validator.tool import POValidatorTool
from app.core.logger import get_logger

log = get_logger("skill.po_validator")
_tool = POValidatorTool()


def _normalise_po(data: dict) -> dict:
    """Normalise real-world PO variants to the canonical shape po_validator expects."""
    data = dict(data)
    # seller → supplier
    if not data.get("supplier") and data.get("seller"):
        data["supplier"] = data.pop("seller")
    # flatten nested buyer / supplier objects  {"name": ..., "code": ...} → "name"
    for key in ("buyer", "supplier"):
        val = data.get(key)
        if isinstance(val, dict):
            data[f"{key}_id"] = val.get("code") or val.get("id", "")
            data[key] = val.get("name") or val.get("id", key.upper())
    # line_items → items
    if not data.get("items") and data.get("line_items"):
        data["items"] = data.pop("line_items")
    # coerce string unit_price / total_amount to float
    for item in data.get("items", []):
        if isinstance(item.get("unit_price"), str):
            try:
                item["unit_price"] = float(item["unit_price"])
            except ValueError:
                pass
    if isinstance(data.get("total_amount"), str):
        try:
            data["total_amount"] = float(data["total_amount"])
        except ValueError:
            pass
    # sender/receiver → buyer_id/supplier_id if not already set
    if not data.get("buyer_id") and data.get("sender"):
        data["buyer_id"] = data["sender"]
    if not data.get("supplier_id") and data.get("receiver"):
        data["supplier_id"] = data["receiver"]
    return data


class POValidatorSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        raw = state.get("raw_document", "")
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            log.warning("[po_validator] raw_document is not valid JSON")
            completed = state.get("completed_skills", []) + ["po_validator"]
            return {
                **state,
                "parsed_data": {},
                "validation_errors": ["raw_document is not valid JSON"],
                "final_status": "FAILED",
                "current_skill": "po_validator",
                "completed_skills": completed,
            }

        data = _normalise_po(data)
        errors = _tool.validate(data)
        status = "FAILED" if errors else "IN_PROGRESS"

        if errors:
            log.warning(f"[po_validator] validation failed: {errors}")
        else:
            log.info(f"[po_validator] valid PO  po_number={data.get('po_number')}  items={len(data.get('items', []))}")

        completed = state.get("completed_skills", []) + ["po_validator"]
        return {
            **state,
            "parsed_data": data,
            "transaction_type": "PURCHASE_ORDER",
            "source_format": "JSON",
            "validation_errors": errors,
            "final_status": status,
            "current_skill": "po_validator",
            "completed_skills": completed,
        }

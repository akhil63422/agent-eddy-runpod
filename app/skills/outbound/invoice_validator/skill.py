import json

from app.orchestrator.state import WorkflowState
from app.skills.outbound.invoice_validator.tool import InvoiceValidatorTool
from app.core.logger import get_logger

log = get_logger("skill.invoice_validator")
_tool = InvoiceValidatorTool()


def _normalise_invoice(data: dict) -> dict:
    data = dict(data)
    if not data.get("supplier") and data.get("seller"):
        data["supplier"] = data.pop("seller")
    for key in ("buyer", "supplier"):
        val = data.get(key)
        if isinstance(val, dict):
            data[f"{key}_id"] = val.get("code") or val.get("id", "")
            data[key] = val.get("name") or val.get("id", key.upper())
    if not data.get("items") and data.get("line_items"):
        data["items"] = data.pop("line_items")
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
    return data


class InvoiceValidatorSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        raw = state.get("raw_document", "")
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            log.warning("[invoice_validator] raw_document is not valid JSON")
            completed = state.get("completed_skills", []) + ["invoice_validator"]
            return {
                **state,
                "parsed_data": {},
                "validation_errors": ["raw_document is not valid JSON"],
                "final_status": "FAILED",
                "current_skill": "invoice_validator",
                "completed_skills": completed,
            }

        data = _normalise_invoice(data)
        errors = _tool.validate(data)
        status = "FAILED" if errors else "IN_PROGRESS"

        if errors:
            log.warning(f"[invoice_validator] validation failed: {errors}")
        else:
            log.info(f"[invoice_validator] valid invoice  invoice_number={data.get('invoice_number')}  items={len(data.get('items', []))}")

        completed = state.get("completed_skills", []) + ["invoice_validator"]
        return {
            **state,
            "parsed_data": data,
            "transaction_type": "INVOICE",
            "source_format": "JSON",
            "validation_errors": errors,
            "final_status": status,
            "current_skill": "invoice_validator",
            "completed_skills": completed,
        }

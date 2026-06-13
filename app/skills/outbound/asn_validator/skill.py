import json

from app.orchestrator.state import WorkflowState
from app.skills.outbound.asn_validator.tool import ASNValidatorTool
from app.core.logger import get_logger

log = get_logger("skill.asn_validator")
_tool = ASNValidatorTool()


def _normalise_asn(data: dict) -> dict:
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
        if isinstance(item.get("quantity"), str):
            try:
                item["quantity"] = int(item["quantity"])
            except ValueError:
                pass
    return data


class ASNValidatorSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        raw = state.get("raw_document", "")
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            log.warning("[asn_validator] raw_document is not valid JSON")
            completed = state.get("completed_skills", []) + ["asn_validator"]
            return {
                **state,
                "parsed_data": {},
                "validation_errors": ["raw_document is not valid JSON"],
                "final_status": "FAILED",
                "current_skill": "asn_validator",
                "completed_skills": completed,
            }

        data = _normalise_asn(data)
        errors = _tool.validate(data)
        status = "FAILED" if errors else "IN_PROGRESS"

        if errors:
            log.warning(f"[asn_validator] validation failed: {errors}")
        else:
            log.info(f"[asn_validator] valid ASN  shipment_id={data.get('shipment_id')}  items={len(data.get('items', []))}")

        completed = state.get("completed_skills", []) + ["asn_validator"]
        return {
            **state,
            "parsed_data": data,
            "transaction_type": "SHIPMENT_NOTICE",
            "source_format": "JSON",
            "validation_errors": errors,
            "final_status": status,
            "current_skill": "asn_validator",
            "completed_skills": completed,
        }

import json
from pathlib import Path

from app.orchestrator.state import WorkflowState
from app.core.llm import get_llm, call_llm_json
from app.core.logger import get_logger

log = get_logger("skill.relationship")
_PROMPT = (Path(__file__).parent / "prompt.md").read_text()

_TX_DEFAULTS = {
    "PURCHASE_ORDER":    ("buyer",   "supplier", "BUYER_SELLER",    "OUTBOUND"),
    "INVOICE":           ("supplier","buyer",    "BUYER_SELLER",    "OUTBOUND"),
    "SHIPMENT_NOTICE":   ("supplier","buyer",    "SHIPPER_CARRIER", "OUTBOUND"),
    "LOAD_TENDER":       ("shipper", "carrier",  "SHIPPER_CARRIER", "OUTBOUND"),
    "MOTOR_CARRIER_BOL": ("shipper", "carrier",  "SHIPPER_CARRIER", "OUTBOUND"),
    "SHIPMENT_STATUS":   ("carrier", "shipper",  "SHIPPER_CARRIER", "OUTBOUND"),
    "PO_ACKNOWLEDGEMENT":("supplier","buyer",    "BUYER_SELLER",    "OUTBOUND"),
}


class RelationshipSkill:
    def __init__(self):
        self._llm = get_llm()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        parsed = state.get("parsed_data", {})
        tx_type = state.get("transaction_type", "UNKNOWN")

        source, dest, rel_type, direction = self._resolve_deterministic(parsed, tx_type)

        if not source or not dest:
            log.info("[relationship] deterministic resolve incomplete — calling Qwen")
            source, dest, rel_type, direction = await self._resolve_with_llm(parsed, tx_type)
            log.info(f"[relationship] llm resolved  source={source}  dest={dest}")
        else:
            log.info(f"[relationship] deterministic  source={source}  dest={dest}  rel={rel_type}  dir={direction}")

        completed = state.get("completed_skills", []) + ["relationship"]
        return {
            **state,
            "source_partner": source,
            "destination_partner": dest,
            "relationship_type": rel_type,
            "direction": direction,
            "current_skill": "relationship",
            "completed_skills": completed,
        }

    def _resolve_deterministic(self, parsed: dict, tx_type: str):
        defaults = _TX_DEFAULTS.get(tx_type)
        if not defaults:
            return "", "", "UNKNOWN", "UNKNOWN"

        src_key, dst_key, rel, direction = defaults

        source = parsed.get("isa_sender_id") or parsed.get("gs_sender", "")
        dest = parsed.get("isa_receiver_id") or parsed.get("gs_receiver", "")

        if not source:
            source = parsed.get(src_key, "")
        if not dest:
            dest = parsed.get(dst_key, "")

        return source, dest, rel, direction

    async def _resolve_with_llm(self, parsed: dict, tx_type: str):
        context = json.dumps({"transaction_type": tx_type, "parsed_data": parsed}, indent=2)
        data = await call_llm_json(self._llm, _PROMPT, context)
        if data and isinstance(data, dict):
            return (
                data.get("source_partner", "UNKNOWN"),
                data.get("destination_partner", "UNKNOWN"),
                data.get("relationship_type", "BUYER_SELLER"),
                data.get("direction", "OUTBOUND"),
            )
        return "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"

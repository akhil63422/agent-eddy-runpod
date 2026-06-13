import json
from pathlib import Path

import httpx
from openai import APIConnectionError

from app.orchestrator.state import WorkflowState
from app.core.llm import get_llm, call_llm_json, call_llm_json_with_usage
from app.core.logger import get_logger

log = get_logger("skill.outbound_mapper")
_PROMPT = (Path(__file__).parent / "prompt.md").read_text()

_DEFAULTS = {
    "product_id_qualifier": "IN",
    "unit_of_measure_code": "EA",
    "price_qualifier": "PUR",
    "payment_terms_code": "05",
    "ref_segments": [{"qualifier": "VN", "value": ""}],
    "ship_to_qualifier": "ST",
    "edi_notes": "Generic X12 defaults applied",
}


class OutboundMapperSkill:
    def __init__(self):
        self._llm = get_llm()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        parsed = state.get("parsed_data", {})
        partner_profile = state.get("partner_profile", {})

        payload = json.dumps({
            "document": parsed,
            "partner_profile": {
                k: v for k, v in partner_profile.items()
                if k in ("partner_id", "partner_name", "isa_qualifier", "edi_version",
                         "document_agreements", "notes", "edi_config", "erp_context")
            },
        }, indent=2)

        log.info(f"[outbound_mapper] calling LLM for partner-specific X12 mapping  partner={partner_profile.get('partner_id', 'unknown')}")

        try:
            result, usage = await call_llm_json_with_usage(self._llm, _PROMPT, payload)
        except (APIConnectionError, httpx.ConnectError) as e:
            log.warning(f"[outbound_mapper] vLLM unreachable — {e} — using defaults")
            result = None
            usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        if result and isinstance(result, dict):
            enriched = result.get("enriched_data", {})
            notes = result.get("mapping_notes", [])
            confidence = float(result.get("confidence_score", 0.85))
        else:
            enriched = {}
            notes = ["LLM unavailable — applied generic X12 defaults"]
            confidence = 0.75

        # Merge enriched fields into parsed_data, defaults fill any gaps
        enriched_parsed = {
            **parsed,
            **_DEFAULTS,
            **{k: v for k, v in enriched.items() if v is not None},
        }

        log.info(f"[outbound_mapper] confidence={confidence:.2f}  product_id_qualifier={enriched_parsed.get('product_id_qualifier')}  refs={len(enriched_parsed.get('ref_segments', []))}  tokens={usage['total_tokens']}")
        for note in notes:
            log.info(f"[outbound_mapper]   › {note}")

        completed = state.get("completed_skills", []) + ["outbound_mapper"]
        return {
            **state,
            "parsed_data": enriched_parsed,
            "confidence_score": confidence,
            "mapping_explanations": notes,
            "current_skill": "outbound_mapper",
            "completed_skills": completed,
            "prompt_tokens": state.get("prompt_tokens", 0) + usage["prompt_tokens"],
            "completion_tokens": state.get("completion_tokens", 0) + usage["completion_tokens"],
            "total_tokens": state.get("total_tokens", 0) + usage["total_tokens"],
            "llm_call_count": state.get("llm_call_count", 0) + 1,
        }

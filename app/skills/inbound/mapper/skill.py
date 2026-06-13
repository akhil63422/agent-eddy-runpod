import json
from pathlib import Path

import httpx
from openai import APIConnectionError

from app.orchestrator.state import WorkflowState
from app.core.llm import get_llm, call_llm_json, call_llm_json_with_usage
from app.core.logger import get_logger

log = get_logger("skill.mapper")
_PROMPT = (Path(__file__).parent / "prompt.md").read_text()


class MapperSkill:
    def __init__(self):
        self._llm = get_llm()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        canonical = state.get("canonical_event", {})
        log.info("[mapper] calling Qwen for ERP mapping…")
        try:
            result, usage = await call_llm_json_with_usage(self._llm, _PROMPT, json.dumps(canonical, indent=2))
        except (APIConnectionError, httpx.ConnectError) as e:
            log.warning(f"[mapper] vLLM unreachable — {e}")
            completed = state.get("completed_skills", []) + ["mapper"]
            return {
                **state,
                "mapped_payload": {},
                "confidence_score": 0.0,
                "mapping_explanations": [],
                "unmapped_fields": list(canonical.keys()),
                "current_skill": "mapper",
                "completed_skills": completed,
                "error": "vLLM not available — start vLLM and retry",
                "final_status": "FAILED",
            }

        if result and isinstance(result, dict):
            mapped = result.get("mapped_payload", {})
            confidence = float(result.get("confidence_score", 0.5))
            explanations = result.get("mapping_explanations", [])
            unmapped = result.get("unmapped_fields", [])
        else:
            mapped = {}
            confidence = 0.0
            explanations = []
            unmapped = list(canonical.keys())

        log.info(f"[mapper] confidence={confidence:.2f}  mapped_fields={len(mapped)}  unmapped={len(unmapped)}  tokens_captured={usage['total_tokens']} (prompt={usage['prompt_tokens']}, completion={usage['completion_tokens']})")
        for exp in explanations:
            log.info(f"[mapper]   › {exp}")

        completed = state.get("completed_skills", []) + ["mapper"]
        return {
            **state,
            "mapped_payload": mapped,
            "confidence_score": confidence,
            "mapping_explanations": explanations,
            "unmapped_fields": unmapped,
            "current_skill": "mapper",
            "completed_skills": completed,
            "prompt_tokens": state.get("prompt_tokens", 0) + usage["prompt_tokens"],
            "completion_tokens": state.get("completion_tokens", 0) + usage["completion_tokens"],
            "total_tokens": state.get("total_tokens", 0) + usage["total_tokens"],
            "llm_call_count": state.get("llm_call_count", 0) + 1,
        }

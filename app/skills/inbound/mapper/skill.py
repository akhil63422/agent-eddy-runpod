import json
from pathlib import Path

import httpx
from openai import APIConnectionError

from app.orchestrator.state import WorkflowState
from app.core.llm import get_llm, call_llm_json, call_llm_json_with_usage
from app.core.logger import get_logger

log = get_logger("skill.mapper")
_PROMPT = (Path(__file__).parent / "prompt.md").read_text()

def _read_spec_files(spec_files: list) -> str:
    """List specification files available for reference (rules & definitions)."""
    context = ""
    if not spec_files:
        return context

    context += "\n\n# PARTNER EDI SPECIFICATION GUIDELINES (Rules & Definitions)\n"
    context += "The following specification documents are available for reference:\n"

    for spec in spec_files:
        file_name = spec.get("name", "unknown")
        context += f"- {file_name}\n"

    context += "\nThese specification documents define:\n"
    context += "- EDI segment meanings (e.g., N1 = Name, BEG = Beginning)\n"
    context += "- Field definitions and valid values\n"
    context += "- How to interpret each EDI segment\n"
    context += "- Partner-specific formatting rules\n"
    context += "\nUse knowledge of X12 EDI standards and partner specifications to correctly map fields.\n"

    log.info(f"[mapper] registered spec files as reference: {len(spec_files)} documents available")
    return context


def _read_sample_files(sample_files: list) -> str:
    """Read actual EDI sample files from disk and return their contents as context."""
    context = ""
    if not sample_files:
        return context

    context += "\n\n# PARTNER SAMPLE EDI FILES (Ground Truth Reference)\n"
    for sample in sample_files:
        file_path = sample.get("path")
        file_name = sample.get("name", "unknown")

        if not file_path:
            continue

        try:
            content = Path(file_path).read_text(errors="ignore")
            context += f"\n## {file_name}\n```\n{content}\n```\n"
            log.info(f"[mapper] loaded sample file: {file_name} ({len(content)} bytes)")
        except Exception as e:
            log.warning(f"[mapper] could not read sample file {file_name}: {e}")

    context += "\nUse the above sample files as reference for parsing and mapping the current document.\n"
    return context


class MapperSkill:
    def __init__(self):
        self._llm = get_llm()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        canonical = state.get("canonical_event", {})
        partner_profile = state.get("partner_profile", {})

        # Build context with canonical event
        context = json.dumps(canonical, indent=2)
        partner_name = partner_profile.get("partner_name", "")

        if partner_name:
            # Add partner ground truth context to prompt
            wizard_metadata = partner_profile.get("wizard_metadata", {})
            spec_files = wizard_metadata.get("spec_files", [])
            sample_files = wizard_metadata.get("sample_files", [])

            partner_context = f"\n\n# PARTNER-SPECIFIC CONTEXT\nPartner: {partner_name}\n"

            # Read specification PDF guidelines (rules, definitions, format)
            if spec_files:
                spec_content = _read_spec_files(spec_files)
                partner_context += spec_content
            else:
                partner_context += "EDI Specification Documents: None available\n"

            # Read actual sample file contents (examples)
            if sample_files:
                sample_content = _read_sample_files(sample_files)
                partner_context += sample_content
            else:
                partner_context += "Sample EDI Files: None available\n"

            context += partner_context
            log.info(f"[mapper] using partner ground truth for {partner_name}  spec_files={len(spec_files)}  sample_files={len(sample_files)}")

        log.info("[mapper] calling Qwen for ERP mapping…")
        try:
            result, usage = await call_llm_json_with_usage(self._llm, _PROMPT, context)
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

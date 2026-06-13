from pathlib import Path

from app.orchestrator.state import WorkflowState
from app.skills.inbound.parser.tool import X12ParserTool, JSONParserTool, CSVParserTool
from app.core.llm import get_llm, call_llm_json, call_llm_json_with_usage
from app.core.logger import get_logger

log = get_logger("skill.parser")
_PROMPT = (Path(__file__).parent / "prompt.md").read_text()


class ParserSkill:
    def __init__(self):
        self._x12 = X12ParserTool()
        self._json = JSONParserTool()
        self._csv = CSVParserTool()
        self._llm = get_llm()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        fmt = state["source_format"]
        raw = state["raw_document"]

        log.info(f"[parser] strategy={fmt}")

        token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        llm_calls = 0

        if fmt == "X12":
            tx_type, parsed = self._x12.parse(raw)
            confidence = 1.0
        elif fmt == "JSON":
            tx_type, parsed = self._json.parse(raw)
            confidence = 1.0
        elif fmt == "CSV":
            tx_type, parsed = self._csv.parse(raw)
            confidence = 0.9
        else:
            log.info(f"[parser] routing to Qwen for {fmt} extraction")
            tx_type, parsed, confidence, token_usage, llm_calls = await self._llm_parse(raw)

        log.info(f"[parser] tx_type={tx_type}  confidence={confidence:.2f}  items={len(parsed.get('items') or parsed.get('line_items') or [])}  tokens={token_usage['total_tokens']}")
        completed = state.get("completed_skills", []) + ["parser"]
        return {
            **state,
            "transaction_type": tx_type,
            "parsed_data": parsed,
            "confidence_score": confidence,
            "current_skill": "parser",
            "completed_skills": completed,
            "prompt_tokens": state.get("prompt_tokens", 0) + token_usage["prompt_tokens"],
            "completion_tokens": state.get("completion_tokens", 0) + token_usage["completion_tokens"],
            "total_tokens": state.get("total_tokens", 0) + token_usage["total_tokens"],
            "llm_call_count": state.get("llm_call_count", 0) + llm_calls,
        }

    async def _llm_parse(self, raw: str) -> tuple[str, dict, float, dict, int]:
        data, usage = await call_llm_json_with_usage(self._llm, _PROMPT, raw)
        if data and isinstance(data, dict):
            return data.get("transaction_type", "UNKNOWN"), data, 0.75, usage, 1
        return "UNKNOWN", {"raw_llm_output": str(data)}, 0.3, usage, 1

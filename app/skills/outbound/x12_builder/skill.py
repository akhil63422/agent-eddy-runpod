from app.orchestrator.state import WorkflowState
from app.skills.outbound.x12_builder.tool import X12BuilderTool
from app.core.logger import get_logger

log = get_logger("skill.x12_builder")
_tool = X12BuilderTool()


class X12BuilderSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        data = state.get("parsed_data", {})
        doc_id = state.get("document_id", "0001")
        control_number = doc_id[:4].replace("-", "0") if doc_id else "0001"

        tx_type = state.get("transaction_type", "PURCHASE_ORDER")
        log.info(f"[x12_builder] building X12  type={tx_type}  items={len(data.get('items', []))}")
        edi_body = _tool.build(data, control_number=control_number, transaction_type=tx_type)

        completed = state.get("completed_skills", []) + ["x12_builder"]
        return {
            **state,
            "edi_output": edi_body,
            "source_format": "JSON",
            "confidence_score": 1.0,
            "current_skill": "x12_builder",
            "completed_skills": completed,
        }

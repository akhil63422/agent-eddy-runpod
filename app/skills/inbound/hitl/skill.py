from app.orchestrator.state import WorkflowState
from app.core.logger import get_logger

log = get_logger("skill.hitl")


class HitlSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        log.warning(f"[hitl] review required  doc_id={state.get('document_id')}  confidence={state.get('confidence_score', 0):.2f}  errors={state.get('validation_errors', [])}")
        completed = state.get("completed_skills", []) + ["hitl"]
        return {
            **state,
            "hitl_required": True,
            "final_status": "HITL_PENDING",
            "current_skill": "hitl",
            "completed_skills": completed,
        }

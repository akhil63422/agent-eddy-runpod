from app.orchestrator.state import WorkflowState
from app.core.logger import get_logger

log = get_logger("skill.intake")


class IntakeSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        doc_id = state.get("document_id", "?")
        raw_len = len(state.get("raw_document", ""))
        log.info(f"[intake] doc_id={doc_id}  raw_length={raw_len} chars")
        return {
            **state,
            "current_skill": "intake",
            "completed_skills": [],
            "validation_errors": [],
            "mapping_explanations": [],
            "unmapped_fields": [],
            "hitl_required": False,
            "hitl_corrections": {},
            "final_status": "IN_PROGRESS",
            "error": "",
        }

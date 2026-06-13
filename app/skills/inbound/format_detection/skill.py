from app.orchestrator.state import WorkflowState
from app.skills.inbound.format_detection.tool import FormatDetectionTool
from app.core.logger import get_logger

log = get_logger("skill.format_detection")


class FormatDetectionSkill:
    def __init__(self):
        self._tool = FormatDetectionTool()

    async def execute(self, state: WorkflowState) -> WorkflowState:
        source_format = self._tool.detect(state["raw_document"])
        log.info(f"[format_detection] detected={source_format}")
        completed = state.get("completed_skills", []) + ["format_detection"]
        return {
            **state,
            "source_format": source_format,
            "current_skill": "format_detection",
            "completed_skills": completed,
        }

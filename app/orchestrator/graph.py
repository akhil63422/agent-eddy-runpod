from langgraph.graph import StateGraph, END

from app.orchestrator.state import WorkflowState
from app.orchestrator.router import route_after_validator, route_after_format_detection
from app.skills.shared.intake.skill import IntakeSkill
from app.skills.inbound.format_detection.skill import FormatDetectionSkill
from app.skills.inbound.parser.skill import ParserSkill
from app.skills.inbound.relationship.skill import RelationshipSkill
from app.skills.inbound.normalization.skill import NormalizationSkill
from app.skills.inbound.mapper.skill import MapperSkill
from app.skills.inbound.validator.skill import ValidatorSkill
from app.skills.inbound.hitl.skill import HitlSkill


def build_graph() -> StateGraph:
    intake = IntakeSkill()
    format_detection = FormatDetectionSkill()
    parser = ParserSkill()
    relationship = RelationshipSkill()
    normalization = NormalizationSkill()
    mapper = MapperSkill()
    validator = ValidatorSkill()
    hitl = HitlSkill()

    graph = StateGraph(WorkflowState)

    graph.add_node("intake", intake.execute)
    graph.add_node("format_detection", format_detection.execute)
    graph.add_node("parser", parser.execute)
    graph.add_node("relationship", relationship.execute)
    graph.add_node("normalization", normalization.execute)
    graph.add_node("mapper", mapper.execute)
    graph.add_node("validator", validator.execute)
    graph.add_node("hitl", hitl.execute)

    graph.set_entry_point("intake")
    graph.add_edge("intake", "format_detection")
    graph.add_conditional_edges("format_detection", route_after_format_detection)
    graph.add_edge("parser", "relationship")
    graph.add_edge("relationship", "normalization")
    graph.add_edge("normalization", "mapper")
    graph.add_edge("mapper", "validator")
    graph.add_conditional_edges("validator", route_after_validator)
    graph.add_edge("hitl", END)

    return graph.compile()


workflow = build_graph()

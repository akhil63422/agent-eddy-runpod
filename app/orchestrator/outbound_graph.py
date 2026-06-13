from langgraph.graph import StateGraph, END

from app.orchestrator.state import WorkflowState
from app.orchestrator.router import (
    route_after_type_detector,
    route_after_po_validator,
    route_after_asn_validator,
    route_after_invoice_validator,
)
from app.skills.shared.intake.skill import IntakeSkill
from app.skills.outbound.type_detector.skill import TypeDetectorSkill
from app.skills.outbound.po_validator.skill import POValidatorSkill
from app.skills.outbound.asn_validator.skill import ASNValidatorSkill
from app.skills.outbound.invoice_validator.skill import InvoiceValidatorSkill
from app.skills.outbound.partner_lookup.skill import PartnerLookupSkill
from app.skills.outbound.outbound_mapper.skill import OutboundMapperSkill
from app.skills.outbound.x12_builder.skill import X12BuilderSkill
from app.skills.outbound.envelope_wrapper.skill import EnvelopeWrapperSkill


def build_outbound_graph() -> StateGraph:
    intake = IntakeSkill()
    type_detector = TypeDetectorSkill()
    po_validator = POValidatorSkill()
    asn_validator = ASNValidatorSkill()
    invoice_validator = InvoiceValidatorSkill()
    partner_lookup = PartnerLookupSkill()
    outbound_mapper = OutboundMapperSkill()
    x12_builder = X12BuilderSkill()
    envelope_wrapper = EnvelopeWrapperSkill()

    graph = StateGraph(WorkflowState)

    graph.add_node("intake",           intake.execute)
    graph.add_node("type_detector",    type_detector.execute)
    graph.add_node("po_validator",     po_validator.execute)
    graph.add_node("asn_validator",    asn_validator.execute)
    graph.add_node("invoice_validator",invoice_validator.execute)
    graph.add_node("partner_lookup",   partner_lookup.execute)
    graph.add_node("outbound_mapper",  outbound_mapper.execute)
    graph.add_node("x12_builder",      x12_builder.execute)
    graph.add_node("envelope_wrapper", envelope_wrapper.execute)

    graph.set_entry_point("intake")
    graph.add_edge("intake", "type_detector")
    graph.add_conditional_edges("type_detector",    route_after_type_detector)
    # Validators route to partner_lookup on success (not directly to x12_builder)
    graph.add_conditional_edges("po_validator",     route_after_po_validator)
    graph.add_conditional_edges("asn_validator",    route_after_asn_validator)
    graph.add_conditional_edges("invoice_validator",route_after_invoice_validator)
    graph.add_edge("partner_lookup",  "outbound_mapper")
    graph.add_edge("outbound_mapper", "x12_builder")
    graph.add_edge("x12_builder",     "envelope_wrapper")
    graph.add_edge("envelope_wrapper", END)

    return graph.compile()


outbound_workflow = build_outbound_graph()

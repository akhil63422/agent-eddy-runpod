from langgraph.graph import END

from app.orchestrator.state import WorkflowState


def route_after_validator(state: WorkflowState) -> str:
    if state.get("hitl_required"):
        return "hitl"
    return END


def route_after_format_detection(state: WorkflowState) -> str:
    if state.get("source_format") == "UNKNOWN":
        return END
    return "parser"


def route_after_po_validator(state: WorkflowState) -> str:
    if state.get("validation_errors"):
        return END
    return "partner_lookup"


def route_after_asn_validator(state: WorkflowState) -> str:
    if state.get("validation_errors"):
        return END
    return "partner_lookup"


def route_after_invoice_validator(state: WorkflowState) -> str:
    if state.get("validation_errors"):
        return END
    return "partner_lookup"


def route_after_type_detector(state: WorkflowState) -> str:
    tx = state.get("transaction_type", "")
    if tx == "PURCHASE_ORDER":
        return "po_validator"
    if tx == "SHIPMENT_NOTICE":
        return "asn_validator"
    if tx == "INVOICE":
        return "invoice_validator"
    return END

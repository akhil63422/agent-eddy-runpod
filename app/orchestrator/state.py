from typing import Any, TypedDict


class WorkflowState(TypedDict):
    document_id: str
    raw_document: str
    source_format: str          # X12 | JSON | CSV | EMAIL | IDOC | XML | UNKNOWN
    transaction_type: str       # PURCHASE_ORDER | SHIPMENT_NOTICE | INVOICE
    source_partner: str
    destination_partner: str
    relationship_type: str      # BUYER_SELLER | SHIPPER_CARRIER | etc.
    direction: str              # OUTBOUND | INBOUND  (relative to source_partner)
    parsed_data: dict[str, Any]
    canonical_event: dict[str, Any]
    mapped_payload: dict[str, Any]
    validation_errors: list[str]
    confidence_score: float
    mapping_explanations: list[str]
    unmapped_fields: list[str]
    current_skill: str
    completed_skills: list[str]
    hitl_required: bool
    hitl_corrections: dict[str, Any]
    final_status: str           # COMPLETED | HITL_PENDING | FAILED
    error: str
    edi_output: str             # generated X12 EDI string (outbound flow only)
    # Partner profile fields (populated by partner_lookup skill)
    partner_isa_qualifier: str      # e.g. "ZZ", "01", "08", "16"
    partner_isa_id: str             # 15-char ISA ID
    partner_gs_id: str              # GS sender/receiver ID
    partner_edi_version: str        # e.g. "005010" | "004010"
    our_isa_qualifier: str          # our own ISA qualifier
    our_isa_id: str                 # our own ISA ID
    our_gs_id: str                  # our own GS ID
    partner_profile: dict           # full partner profile dict
    prompt_tokens: int              # accumulated prompt tokens from LLM calls
    completion_tokens: int          # accumulated completion tokens from LLM calls
    total_tokens: int               # accumulated total tokens from LLM calls
    llm_call_count: int             # count of LLM calls made in this pipeline run

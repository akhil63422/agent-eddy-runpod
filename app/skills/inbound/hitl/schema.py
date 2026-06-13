from typing import Any
from pydantic import BaseModel


class HitlReviewRequest(BaseModel):
    document_id: str
    canonical_event: dict[str, Any]
    mapped_payload: dict[str, Any]
    confidence_score: float
    mapping_explanations: list[str]
    unmapped_fields: list[str]
    validation_errors: list[str]


class HitlCorrection(BaseModel):
    document_id: str
    corrected_payload: dict[str, Any]
    reviewer_notes: str = ""

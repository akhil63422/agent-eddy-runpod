from typing import Any
from pydantic import BaseModel


class MapperOutput(BaseModel):
    mapped_payload: dict[str, Any]
    confidence_score: float
    mapping_explanations: list[str]
    unmapped_fields: list[str]

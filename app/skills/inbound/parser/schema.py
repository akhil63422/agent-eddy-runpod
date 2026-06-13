from typing import Any
from pydantic import BaseModel


class ParserOutput(BaseModel):
    transaction_type: str        # PURCHASE_ORDER | SHIPMENT_NOTICE | INVOICE
    parsed_data: dict[str, Any]
    confidence_score: float

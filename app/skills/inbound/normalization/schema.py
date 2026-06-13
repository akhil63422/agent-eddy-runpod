from typing import Any
from pydantic import BaseModel


class CanonicalEvent(BaseModel):
    transaction_type: str
    buyer: str
    supplier: str
    po_number: str = ""
    invoice_number: str = ""
    shipment_id: str = ""
    ship_date: str = ""
    delivery_date: str = ""
    items: list[dict[str, Any]] = []
    total_amount: float = 0.0
    currency: str = "USD"
    source_format: str = ""
    source_partner: str = ""
    destination_partner: str = ""
    relationship_type: str = ""
    direction: str = ""

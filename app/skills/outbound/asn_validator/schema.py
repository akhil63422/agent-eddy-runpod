from pydantic import BaseModel
from typing import List, Optional


class ASNItem(BaseModel):
    product_id: str
    quantity: int
    unit: Optional[str] = "EA"
    description: Optional[str] = ""


class ASNDocument(BaseModel):
    shipment_id: str
    ship_date: str
    buyer: str
    supplier: str
    items: List[ASNItem]
    carrier: Optional[str] = ""
    tracking_number: Optional[str] = ""

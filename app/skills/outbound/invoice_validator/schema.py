from pydantic import BaseModel
from typing import List, Optional


class InvoiceItem(BaseModel):
    product_id: str
    quantity: int
    unit_price: float
    unit: Optional[str] = "EA"
    description: Optional[str] = ""


class InvoiceDocument(BaseModel):
    invoice_number: str
    invoice_date: str
    buyer: str
    supplier: str
    items: List[InvoiceItem]
    total_amount: Optional[float] = 0.0
    currency: Optional[str] = "USD"
    po_number: Optional[str] = ""
    payment_terms: Optional[str] = "NET30"

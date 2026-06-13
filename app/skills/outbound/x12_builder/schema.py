from pydantic import BaseModel


class X12BuilderOutput(BaseModel):
    edi_output: str
    transaction_type: str
    confidence_score: float

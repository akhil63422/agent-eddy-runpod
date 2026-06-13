from pydantic import BaseModel


class EnvelopeWrapperOutput(BaseModel):
    edi_output: str
    final_status: str

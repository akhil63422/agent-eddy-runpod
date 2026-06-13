from pydantic import BaseModel


class FormatDetectionOutput(BaseModel):
    source_format: str   # X12 | JSON | CSV | EMAIL | IDOC | XML | UNKNOWN

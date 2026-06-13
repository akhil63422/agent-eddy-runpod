from pydantic import BaseModel


class POValidatorOutput(BaseModel):
    parsed_data: dict
    validation_errors: list[str]
    final_status: str

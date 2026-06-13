from pydantic import BaseModel


class ValidatorOutput(BaseModel):
    validation_errors: list[str]
    hitl_required: bool
    final_status: str

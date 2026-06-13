from pydantic import BaseModel


class IntakeInput(BaseModel):
    document_id: str
    raw_document: str


class IntakeOutput(BaseModel):
    document_id: str
    raw_document: str
    current_skill: str
    completed_skills: list[str]
    final_status: str

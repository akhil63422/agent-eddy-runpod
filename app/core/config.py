import os
from dotenv import load_dotenv

load_dotenv()

# vLLM / self-hosted Qwen
LLM_BASE_URL: str = os.getenv("SELF_HOSTED_BASE_URL", "http://localhost:8080/v1")
LLM_MODEL: str = os.getenv("SELF_HOSTED_MODEL", "/workspace/models/Qwen2.5-7B-Instruct")

# Thresholds
HITL_CONFIDENCE_THRESHOLD: float = float(os.getenv("HITL_CONFIDENCE_THRESHOLD", "0.75"))

# DB
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/agent_eddy",
)

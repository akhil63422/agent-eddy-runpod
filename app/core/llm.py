"""
Single factory for the LLM client. All skills import from here.
vLLM exposes an OpenAI-compatible endpoint, so ChatOpenAI works unchanged —
just point base_url at localhost:8080 and pass a dummy api_key.
"""
import json
import re
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.config import LLM_BASE_URL, LLM_MODEL


def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=LLM_BASE_URL,
        api_key="not-needed",          # vLLM doesn't check the key
        model=LLM_MODEL,
        temperature=temperature,
    )


async def call_llm_json_with_usage(llm: ChatOpenAI, system_prompt: str, user_content: str) -> tuple[Any, dict]:
    """Call the LLM and extract the first valid JSON object from the response, returning token usage."""
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]
    response = await llm.ainvoke(messages)
    usage = response.response_metadata.get("token_usage") or {}
    token_data = {
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }
    return _extract_json(response.content), token_data


async def call_llm_json(llm: ChatOpenAI, system_prompt: str, user_content: str) -> Any:
    """Call the LLM and extract the first valid JSON object from the response."""
    data, _ = await call_llm_json_with_usage(llm, system_prompt, user_content)
    return data


def _extract_json(raw: str) -> Any:
    if not raw:
        return None
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    if "```" in raw:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        if m:
            try:
                return json.loads(m.group(1).strip())
            except json.JSONDecodeError:
                pass
    for pattern in [r"\{[\s\S]*\}", r"\[[\s\S]*\]"]:
        m = re.search(pattern, raw)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None

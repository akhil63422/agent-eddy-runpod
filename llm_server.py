#!/usr/bin/env python3
"""
Simple OpenAI-compatible LLM server for Qwen model
"""
import os
import json
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
from contextlib import asynccontextmanager

# Model config
MODEL_ID = "/workspace/models/Qwen2.5-7B-Instruct"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Global model and tokenizer
model = None
tokenizer = None

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: list[Message]
    temperature: float = 0.7
    max_tokens: int = 512

class ChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list
    usage: dict

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, tokenizer
    print(f"Loading model from {MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
    ).to(DEVICE)
    print(f"✅ Model loaded on {DEVICE}")
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

@app.get("/v1/models")
async def list_models():
    return {"data": [{"id": "qwen", "object": "model"}]}

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    global model, tokenizer

    try:
        # Build conversation
        text = tokenizer.apply_chat_template(
            [{"role": m.role, "content": m.content} for m in request.messages],
            tokenize=False,
            add_generation_prompt=True
        )

        # Tokenize
        inputs = tokenizer(text, return_tensors="pt").to(DEVICE)

        # Generate with temperature handling (minimum 0.01 for do_sample=True)
        temp = request.temperature if request.temperature > 0.01 else 0.01
        do_sample = temp >= 0.01
        outputs = model.generate(
            **inputs,
            max_new_tokens=request.max_tokens,
            temperature=temp,
            do_sample=do_sample,
        )

        # Decode
        response_text = tokenizer.decode(outputs[0][inputs.input_ids.shape[-1]:], skip_special_tokens=True)

        # Count tokens
        prompt_tokens = inputs.input_ids.shape[-1]
        completion_tokens = outputs.shape[-1] - prompt_tokens

        return {
            "id": "chatcmpl-local",
            "object": "chat.completion",
            "created": int(__import__('time').time()),
            "model": "qwen",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": int(prompt_tokens),
                "completion_tokens": int(completion_tokens),
                "total_tokens": int(prompt_tokens + completion_tokens),
            }
        }
    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"❌ ERROR in chat_completions: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

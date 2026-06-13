# Agent Eddy — Project Context

**Last updated:** 2026-05-20

Agent Eddy is an AI-native supply chain transaction interoperability platform at `/workspace/eldho/agent-eddy-new`.

**Goal:** Investor-ready MVP demonstrating semantic understanding of EDI/logistics transactions across formats, canonical normalization, AI ERP mapping, and human-in-the-loop correction.

## Stack

- Python 3.11, FastAPI, LangGraph, Pydantic v2
- vLLM self-hosted Qwen2.5-7B-Instruct (AI skills: mapper, relationship fallback, email parser)
- PostgreSQL + SQLAlchemy ORM
- venv at `.venv/`
- Next.js frontend (App Router) at `frontend/`

## Pipeline (LangGraph)

```
intake → format_detection → parser → relationship → normalization → mapper → validator → (hitl | END)
```

## Transaction Types

| Type | EDI |
|---|---|
| PURCHASE_ORDER | X12 850 |
| SHIPMENT_NOTICE | X12 856 |
| INVOICE | X12 810 |

## Format Support

| Format | Method |
|---|---|
| X12 | Deterministic |
| JSON | Direct |
| CSV | Lightweight |
| Email/Text | LLM |
| IDoc | SAP |
| XML | Oracle/OAG |

## Key Files

| File | Purpose |
|---|---|
| `app/orchestrator/state.py` | WorkflowState TypedDict (single source of truth) |
| `app/orchestrator/graph.py` | LangGraph compiled workflow |
| `app/skills/*/skill.py` | async execute(state) → state pattern |
| `app/db/models.py` | TransactionDocument SQLAlchemy model |
| `app/api/routes.py` | POST /api/v1/process, GET /document/{id}, POST /document/{id}/correct |
| `app/core/llm.py` | LLM client factory — ChatOpenAI pointed at vLLM |
| `START.md` | Full startup guide for the team |
| `start.sh` | One-command pod restart script |

## Build Status (2026-05-20)

- Foundation complete: all 8 skill skeletons, orchestrator, DB models, FastAPI routes
- 9/9 deterministic tests passing
- vLLM running with Qwen2.5-7B-Instruct — end-to-end pipeline working
- Frontend built and live at :3000
- mapper skill has graceful error handling if vLLM is unreachable (returns FAILED instead of 500)

## Rules

- Always scaffold skills with 4-file structure: `skill.py`, `tool.py`, `prompt.md`, `schema.py`
- Use `WorkflowState` TypedDict as the single state object through the pipeline
- HITL triggered when `confidence_score < 0.75` (env: `HITL_CONFIDENCE_THRESHOLD`)
- uvicorn runs with `--reload-dir app` — do NOT remove this or log writes spam the reloader

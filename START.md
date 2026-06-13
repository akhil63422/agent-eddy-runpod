# Agent Eddy — Start Guide

This guide covers everything needed to bring the full stack up after a pod restart or on a fresh session.

---

## Environment

We run on a **RunPod GPU instance** with an RTX 4090 (CUDA 12.4 driver). The `/workspace` directory is a persistent volume — code, models, Python packages, and Node.js survive pod restarts. PostgreSQL is the only thing that needs reinstalling each time (system-level apt package).

| Service | URL | Notes |
|---|---|---|
| vLLM inference | http://localhost:8080 | Qwen2.5-7B-Instruct |
| FastAPI backend | http://localhost:8002 | Auto-reload on `app/` only |
| API docs | http://localhost:8002/docs | Swagger UI |
| Frontend | http://localhost:3000 | Next.js dev server |

---

## Step 1 — Run the startup script

Open a terminal and run:

```bash
cd /workspace/eldho/agent-eddy-new
bash start.sh
```

This takes about **10–15 seconds** and does the following automatically:

1. Loads Node.js 20 from the workspace nvm install
2. Installs PostgreSQL via apt, starts it, creates the `agent_eddy` database
3. Starts the **vLLM** model server in the background (port 8080)
4. Starts the **FastAPI backend** in the background (port 8002)

Expected output:
```
=== [1/3] Loading Node.js (from workspace nvm) ===
Node v20.20.2 ready
=== [2/3] Installing & starting PostgreSQL ===
PostgreSQL ready — agent_eddy database OK
=== [3/3] Starting services (background) ===
vLLM starting on :8080 — logs: logs/vllm.log
Backend starting on :8002 — logs: logs/backend.log

=== Frontend ===
Run manually in a separate terminal:
  cd /workspace/eldho/agent-eddy-new/frontend && npm run dev

=== Done ===
  vLLM:    http://localhost:8080/v1/models
  Backend: http://localhost:8002/docs
  Logs:    /workspace/eldho/agent-eddy-new/logs/
```

---

## Step 2 — Start the frontend

Open a **second terminal** and run:

```bash
cd /workspace/eldho/agent-eddy-new/frontend
npm run dev
```

Frontend will be available at http://localhost:3000.

---

## Step 3 — Wait for vLLM to load

vLLM takes **2–3 minutes** to load the Qwen2.5-7B model into GPU memory after the script finishes. The backend will return `final_status: "FAILED"` on AI-powered requests until it's ready.

Check when it's ready:
```bash
curl http://localhost:8080/v1/models
```

You should see the model listed in the JSON response. Or tail the log:
```bash
tail -f /workspace/eldho/agent-eddy-new/logs/vllm.log
```

Look for: `INFO: Application startup complete.`

---

## Verify everything is up

```bash
# vLLM
curl http://localhost:8080/v1/models

# Backend
curl http://localhost:8002/docs

# Database
psql postgresql://postgres:postgres@127.0.0.1:5432/agent_eddy -c "\dt"
```

---

## Logs

All background service logs are written to `logs/`:

```bash
tail -f logs/vllm.log       # vLLM model server
tail -f logs/backend.log    # FastAPI backend
```

---

## What persists vs what gets wiped on pod restart

| Item | Location | Survives restart? |
|---|---|---|
| Python venv + all packages (incl. vLLM) | `/workspace/eldho/agent-eddy-new/.venv/` | ✅ Yes |
| Node.js + npm | `/workspace/eldho/nvm/` | ✅ Yes |
| node_modules | `/workspace/eldho/agent-eddy-new/frontend/node_modules/` | ✅ Yes |
| Model weights (Qwen2.5-7B) | `/workspace/models/Qwen2.5-7B-Instruct/` | ✅ Yes |
| All source code | `/workspace/eldho/agent-eddy-new/` | ✅ Yes |
| PostgreSQL binaries | System (apt) | ❌ Wiped — reinstalled by `start.sh` |
| PostgreSQL data | System (`/var/lib/postgresql/`) | ❌ Wiped — schema recreated automatically by SQLAlchemy on backend start |

---

## Environment variables

The `.env` file at the project root is already configured:

```
SELF_HOSTED_BASE_URL=http://localhost:8080/v1
SELF_HOSTED_MODEL=/workspace/models/Qwen2.5-7B-Instruct
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agent_eddy
HITL_CONFIDENCE_THRESHOLD=0.75
```

No changes needed unless you're pointing to a different model or database.

---

## Pinned dependency versions (DO NOT change without testing)

The venv has specific versions that are required for CUDA 12.4 compatibility on this pod. These were resolved through debugging and must not be upgraded blindly.

| Package | Pinned version | Why |
|---|---|---|
| `torch` | `2.6.0+cu124` | Only cu124 build works with driver 550.127 (CUDA 12.4). cu130 builds fail. |
| `vllm` | `0.8.5` | Last version requiring torch 2.6.0. vLLM 0.21.0+ requires torch 2.11.0 (cu130 only). |
| `transformers` | `4.57.6` | transformers 5.x removed `all_special_tokens_extended` — breaks Qwen tokenizer. |

If the venv ever gets corrupted or packages accidentally upgraded, run this to restore:

```bash
source /workspace/eldho/agent-eddy-new/.venv/bin/activate

# Remove any conflicting packages from newer vLLM installs
pip uninstall torch_c_dlpack_ext -y 2>/dev/null || true

# Install correct torch for CUDA 12.4
pip install "torch==2.6.0" --index-url https://download.pytorch.org/whl/cu124

# Install correct vLLM
pip install "vllm==0.8.5" --extra-index-url https://download.pytorch.org/whl/cu124

# Pin transformers to 4.x
pip install "transformers<5.0"
```

Verify everything is correct:
```bash
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available())"
# Expected: 2.6.0+cu124 / CUDA: True
```

---

## Troubleshooting vLLM

If `logs/vllm.log` shows errors, check the table below:

| Error in log | Cause | Fix |
|---|---|---|
| `NVIDIA driver too old (found version 12040)` | torch compiled for CUDA 13.0 | Reinstall torch for cu124 (see above) |
| `Qwen2Tokenizer has no attribute all_special_tokens_extended` | transformers 5.x installed | `pip install "transformers<5.0"` |
| `undefined symbol: _ZNK3c106Device3strB5cxx11Ev` | `torch_c_dlpack_ext` leftover from vLLM 0.21 | `pip uninstall torch_c_dlpack_ext -y` |
| `Engine core initialization failed` | Check line above it in the log for root cause | See rows above |
| Port 8080 already in use | Previous vLLM process still running | `pkill -f vllm.entrypoints` |

---

## Quick reference — full startup in 2 commands

**Terminal 1:**
```bash
cd /workspace/eldho/agent-eddy-new && bash start.sh
```

**Terminal 2:**
```bash
cd /workspace/eldho/agent-eddy-new/frontend && npm run dev
```

Wait ~2–3 min for vLLM to load, then open http://localhost:3000.

# Dev Environment

## Infrastructure

- **Platform:** RunPod GPU instance
- **GPU:** RTX 4090
- **NVIDIA driver:** 550.127.05
- **CUDA version:** 12.4 (driver supports up to CUDA 12.4 only)

## Persistent volume

`/workspace` is a persistent volume. Everything inside survives pod restarts:
- `/workspace/eldho/agent-eddy-new/` — all project code
- `/workspace/eldho/agent-eddy-new/.venv/` — Python venv + all packages
- `/workspace/eldho/nvm/` — Node.js 20 via nvm
- `/workspace/eldho/agent-eddy-new/frontend/node_modules/` — frontend deps
- `/workspace/models/Qwen2.5-7B-Instruct/` — model weights (4 shards)

System-level apt installs (PostgreSQL, etc.) are wiped on restart.

## After every pod restart

Run one command:
```bash
cd /workspace/eldho/agent-eddy-new && bash start.sh
```

Then in a second terminal:
```bash
cd /workspace/eldho/agent-eddy-new/frontend && npm run dev
```

Full details in `START.md`.

## Pinned dependency versions (CUDA 12.4 constraint)

These versions are the result of debugging and must not be changed without testing:

| Package | Version | Reason |
|---|---|---|
| `torch` | `2.6.0+cu124` | Only cu124 build is compatible with CUDA 12.4 driver. cu130 builds (torch 2.7+) fail. |
| `vllm` | `0.8.5` | Requires torch 2.6.0. vLLM 0.9+ requires torch 2.7+ (cu130 only). |
| `transformers` | `4.57.6` (< 5.0) | transformers 5.x removed `all_special_tokens_extended`, breaking Qwen tokenizer. |

## Known vLLM crash causes and fixes

| Error | Cause | Fix |
|---|---|---|
| `NVIDIA driver too old (found version 12040)` | Wrong torch build (cu130 installed) | `pip install "torch==2.6.0" --index-url https://download.pytorch.org/whl/cu124` |
| `Qwen2Tokenizer has no attribute all_special_tokens_extended` | transformers 5.x | `pip install "transformers<5.0"` |
| `undefined symbol: _ZNK3c106Device3strB5cxx11Ev` | `torch_c_dlpack_ext` leftover from vLLM 0.21 | `pip uninstall torch_c_dlpack_ext -y` |

## Venv restore (if packages get corrupted)

```bash
source /workspace/eldho/agent-eddy-new/.venv/bin/activate
pip uninstall torch_c_dlpack_ext -y 2>/dev/null || true
pip install "torch==2.6.0" --index-url https://download.pytorch.org/whl/cu124
pip install "vllm==0.8.5" --extra-index-url https://download.pytorch.org/whl/cu124
pip install "transformers<5.0"
```

## Service ports

| Service | Port |
|---|---|
| vLLM | 8080 |
| FastAPI backend | 8002 |
| Next.js frontend | 3000 |
| PostgreSQL | 5432 |

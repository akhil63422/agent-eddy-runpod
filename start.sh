#!/bin/bash
set -e

WORKSPACE="/workspace/eldho/agent-eddy-new"
mkdir -p "$WORKSPACE/logs"

# ── Kill anything already on our ports ─────────────────────────────────────
echo "=== [0/4] Killing old processes on ports 3000 8002 ==="
fuser -k 3000/tcp 2>/dev/null && echo "  killed :3000" || true
fuser -k 8002/tcp 2>/dev/null && echo "  killed :8002" || true
sleep 1

# ── Node.js ─────────────────────────────────────────────────────────────────
echo "=== [1/4] Loading Node.js ==="
export NVM_DIR="/workspace/eldho/nvm"
source "$NVM_DIR/nvm.sh"
nvm use 20 --silent
echo "Node $(node --version) ready"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
echo "=== [2/4] Starting PostgreSQL ==="
apt-get install -y postgresql postgresql-contrib > /dev/null 2>&1
service postgresql start
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\"" > /dev/null 2>&1
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='agent_eddy'\" | grep -q 1 || psql -c \"CREATE DATABASE agent_eddy OWNER postgres\"" > /dev/null 2>&1
echo "PostgreSQL ready"

# ── Backend ──────────────────────────────────────────────────────────────────
echo "=== [3/4] Starting backend on :8002 ==="
source "$WORKSPACE/.venv/bin/activate"
cd "$WORKSPACE"
nohup uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8002 \
  --reload \
  --reload-dir app > "$WORKSPACE/logs/backend.log" 2>&1 &
echo "  Backend PID $! — logs/backend.log"

# Wait until backend is accepting connections (max 20s)
for i in $(seq 1 20); do
  curl -s http://localhost:8002/health > /dev/null 2>&1 && break
  sleep 1
done
echo "  Backend ready"

# ── Frontend (original - port 3000) ──────────────────────────────────────────
echo "=== [4/5] Starting original frontend on :3000 ==="
cd "$WORKSPACE/frontend"
nohup npm run dev > "$WORKSPACE/logs/frontend.log" 2>&1 &
echo "  Frontend PID $! — logs/frontend.log"

# ── Frontend-AK (new UI - nginx:3002 → app:3004 + api:8002) ─────────────────
echo "=== [5/5] Starting frontend-ak on :3004 (nginx on :3002 proxies UI+API) ==="
kill $(lsof -ti:3004 2>/dev/null) 2>/dev/null || true
sleep 1
cd "$WORKSPACE/frontend-ak"
PORT=3004 HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true BROWSER=none nohup npm start > "$WORKSPACE/logs/frontend-ak.log" 2>&1 &
echo "  Frontend-AK PID $! — logs/frontend-ak.log"
# Reload nginx to ensure it has port 3002 (kills any stale node on that port)
nginx -s reload 2>/dev/null || true

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Original UI:  https://${RUNPOD_POD_ID}-3000.proxy.runpod.net"
echo "  New UI (AK):  https://${RUNPOD_POD_ID}-3002.proxy.runpod.net"
echo "  API docs:     http://localhost:8002/docs"
echo "  Logs:         $WORKSPACE/logs/"
echo "  vLLM:         $(curl -s http://localhost:8080/v1/models | python3 -c 'import sys,json; m=json.load(sys.stdin); print(m["data"][0]["id"])' 2>/dev/null || echo 'check logs/vllm.log')"
echo "============================================"

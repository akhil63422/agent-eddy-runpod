# Agent Eddy Frontend (Standalone)

Standalone React frontend extracted from the Agentic EDI Platform.

## Prerequisites

- Node.js 20+
- npm 10+
- A running backend API URL (FastAPI)

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Start dev server:
   - `npm start`

App runs on `http://localhost:3000` by default.

## Runtime Config Priority

The app resolves backend URL in this order:

1. `public/config.json` -> `backendUrl`
2. `REACT_APP_BACKEND_URL` from environment
3. Local fallback (`http://localhost:8000/api/v1`)

WebSocket URL resolves in this order:

1. `REACT_APP_WS_URL`
2. `public/config.json` -> `wsUrl`
3. Derived from resolved API URL (`https` -> `wss`, `http` -> `ws`) + `/ws`

## Environment Variables

- `REACT_APP_BACKEND_URL` (required in split deployment)
- `REACT_APP_WS_URL` (optional override)

## Deploy (Split Frontend/Backend)

- Host frontend as static app (Netlify/Vercel/Cloudflare Pages/S3+CDN).
- Point `REACT_APP_BACKEND_URL` to backend API root (example: `https://api.example.com/api/v1`).
- Ensure backend CORS includes frontend domain.
- Ensure backend websocket endpoint is reachable on `/api/v1/ws` or set `REACT_APP_WS_URL`.

#!/usr/bin/env bash
# Start Postgres, apply migrations and run the API (8000) and the front end (3000).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
[ -f frontend/.env.local ] || cp frontend/.env.example frontend/.env.local
[ -d .venv-back ] || python3 -m venv .venv-back
# shellcheck disable=SC1091
. .venv-back/bin/activate
pip install -q -r backend/requirements-dev.txt

[ -d frontend/node_modules ] || npm --prefix frontend ci
docker compose up -d --wait db
python -m backend.app.shared.migrate

trap 'kill 0' EXIT
uvicorn backend.app.api.main:app --reload --port 8000 &
npm --prefix frontend run dev:front

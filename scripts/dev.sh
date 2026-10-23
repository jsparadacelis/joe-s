#!/usr/bin/env bash
# Start Postgres, apply migrations and run the API (8000) and the front end (3000).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
[ -d .venv-back ] || python3 -m venv .venv-back
# shellcheck disable=SC1091
. .venv-back/bin/activate
pip install -q -r requirements.txt

[ -d node_modules ] || npm ci
docker compose up -d --wait db
python -m backend.app.shared.migrate

trap 'kill 0' EXIT
uvicorn backend.app.api.main:app --reload --port 8000 &
npm run dev:front

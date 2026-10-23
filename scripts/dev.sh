#!/usr/bin/env bash
# Levanta Postgres, aplica migraciones y arranca la API (8000) y el front (3000).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
[ -d .venv-back ] || python3 -m venv .venv-back
# shellcheck disable=SC1091
. .venv-back/bin/activate
pip install -q -r requirements-dev.txt

[ -d node_modules ] || npm ci
docker compose up -d --wait db
python -m backend.app.shared.migrate

trap 'kill 0' EXIT
uvicorn backend.app.api.main:app --reload --port 8000 &
npm run dev:front

#!/usr/bin/env bash
# Seed the fictitious demonstration study (RGB-7) into the LOCAL database.
# Starts Postgres, applies the migrations and runs the seed. It refuses any non-local database,
# and always refuses ENVIRONMENT=production and Supabase hosts (see docs/despliegue.md).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
[ -d .venv-back ] || python3 -m venv .venv-back
# shellcheck disable=SC1091
. .venv-back/bin/activate
pip install -q -r backend/requirements-dev.txt

docker compose up -d --wait db
python -m backend.app.shared.migrate
python -m backend.app.shared.seed_demo "$@"

cat <<'MSG'

Para entrar en la demo, en .env (AUTH_MODE=dev) pon:
  DEV_STUDY_ID=00000000-0000-0000-0000-00000000de00
  DEV_USER_ID=demo-partner  DEV_ROLE=partner  DEV_QUALIFICATIONS=sponsor
Otras personas y roles: docs/despliegue.md, sección «Datos de demostración».
MSG

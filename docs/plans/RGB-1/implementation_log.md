# RGB-1 · implementation_log

Rama: `feat/RGB-1-baseline-backend`. Flujo TDD: tests en rojo (`ModuleNotFoundError`), implementación mínima, verde.

## Qué se hizo

- Backend FastAPI en `backend/` con `create_app()` y `/api/health`; CORS configurable.
- `Settings` (pydantic-settings): `DATABASE_URL` y `CORS_ORIGINS` (lista separada por comas).
- Migrador propio (`backend/app/shared/migrate.py`): archivos `NNN_*.sql` en orden, una transacción por archivo, tabla `schema_migrations`, idempotente.
- Migración `001_baseline.sql`: función `app_estudio_id()` para las políticas RLS (RGB-3).
- `docker-compose.yml` (Postgres 16 en el puerto 54329), `scripts/dev.sh`, `npm run dev` (todo) y `npm run dev:front` (solo front).
- `railway.toml` (migra y arranca uvicorn), `.env.example`, `pyproject.toml` (pytest y ruff).
- CI en GitHub Actions: front (lint, tipos, tests, build) y backend (ruff y pytest con Postgres 16).
- Test de arquitectura: falla si `domain` o `application` importan hacia fuera, o si `domain` importa librerías externas. Comprobado a mano con un `import fastapi` en un dominio de prueba.

## Verificación local

- `pytest`: 10 en verde. `ruff check` y `ruff format --check`: limpios.
- Front: `lint`, `typecheck`, 185 tests y `build` en verde.
- `npm run dev` levantó Postgres, aplicó la migración, y respondieron la API (`/api/health` 200) y el front (`/cartera` 200).

## Pendiente / no verificado

- El workflow de CI no se ha ejecutado en GitHub todavía; se valida al abrir el PR.
- Despliegue real en Railway, Supabase y Vercel: lo crea una persona con las cuentas.
- Local usa `postgres:16`, no la imagen de Supabase; las extensiones propias de Supabase no están. Hoy no se usa ninguna.
- Python local 3.10, CI y Railway 3.11.

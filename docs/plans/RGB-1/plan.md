# RGB-1 · Baseline del backend, base de datos y CI

Tarea de Notion: https://app.notion.com/p/3fd444f747b381a8bc43c2123d9df317
Tipo: Infra · Épica E0 · P0 · Tamaño M. Sin dependencias.

## Alcance de esta entrega

Lo que RGB-6 no cubrió y lo que cambia la arquitectura ([arquitectura.md](../../arquitectura.md)): backend Python/FastAPI, Postgres local con migraciones, un solo comando de desarrollo y CI. Sin autenticación.

Fuera de alcance: modelos de negocio (RGB-3 en adelante), autenticación (RGB-2), despliegue real en Railway y Vercel (se deja la configuración lista, la cuenta la crea una persona).

## Estructura

```
backend/
  app/
    api/main.py            # create_app() con /api/health
    shared/config.py       # Settings (pydantic-settings), DATABASE_URL
    shared/migrate.py      # aplica migraciones numeradas en una tabla de control
  migrations/001_baseline.sql
  tests/
    api/test_health.py
    shared/test_config.py
    shared/test_migrate.py          # integración (Postgres real)
    test_architecture.py            # regla de dependencias entre capas
docker-compose.yml         # Postgres 16 local
scripts/dev.sh             # levanta BD, migra, arranca API y front
railway.toml, requirements.txt, pyproject.toml (pytest + ruff), .env.example
.github/workflows/ci.yml   # front (lint, tipos, tests, build) + backend (ruff, pytest con Postgres)
```

## Migración 001

Crea el esquema de apoyo, sin tablas de negocio:

- Tabla de control `schema_migrations`.
- Función `app_study_id()` que lee `current_setting('app.study_id', true)`, base de todas las políticas RLS futuras.

## Orden TDD

1. Tests en rojo: health, config, migrador (aplica en orden, es idempotente, no reaplica) y arquitectura.
2. Implementación mínima hasta verde.
3. `scripts/dev.sh`, `docker-compose.yml`, Railway y CI.
4. `npm run dev` pasa a ejecutar `scripts/dev.sh`.

## Criterios de aceptación

- [ ] `npm run dev` levanta la base de datos, aplica migraciones, arranca la API y el front.
- [ ] CI en verde con lint, tipos y tests de front y backend.
- [ ] `CLAUDE.md` contiene las reglas del PRD (ya cumplido) más DDD y TDD.
- [ ] `pytest` y `ruff` en verde; el test de arquitectura falla si `domain` importa de otra capa.
- [ ] Sin datos reales de clientes.

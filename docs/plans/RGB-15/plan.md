# RGB-15 · Plantillas de semanas por tipología y factor de escala

Tarea de Notion: https://app.notion.com/p/3fd444f747b38163b64ee0efcc0bbad0
Tipo: Datos · Épica E2 · P0 · Tamaño S. Depende de RGB-3 (mergeada). Bloquea RGB-16 y RGB-20.

## Alcance

- `make_plan(project_type, scale)`: semanas activas de las fases 1 a 7 = plantilla de la tipología × factor de escala, **redondeo half-up** y **mínimo 1 semana** por fase. Con `Decimal` para que 6,5 sea 7 y no 6 (el redondeo bancario de Python daría 6).
- Valores del PRD como **valores por defecto en el dominio**: seis tipologías y factores pequeña 0,8, media 1, grande 1,3.
- **Editables por estudio:** la base solo guarda lo que el estudio cambia (`plan_templates`, `scale_factors`, con RLS); el servicio mezcla los cambios sobre los valores por defecto. Así un estudio nuevo funciona sin sembrar nada.
- API: `GET /api/plan?project_type=&scale=`, `GET /api/settings/plan`, `PUT /api/settings/plan/templates/{project_type}` y `PUT /api/settings/plan/scale-factors/{scale}`. Cada cambio de ajustes queda en la auditoría con el valor anterior y el nuevo.

Fuera de alcance: la pantalla de Ajustes (front) y el permiso para editar (RGB-4: hoy cualquier usuario del estudio puede).

## Archivos

```
backend/migrations/005_plan_settings.sql
backend/app/opportunity/domain/{plan,ports,errors}.py
backend/app/opportunity/application/plan_settings.py
backend/app/opportunity/infrastructure/postgres_plan_settings.py
backend/app/api/plan_routes.py, dependencies.py, main.py
backend/tests/opportunity/...  backend/tests/api/test_plan_routes.py
```

## Criterios de aceptación

- [ ] Industrial grande da 3-3-5-7-10-52-5.
- [ ] Las seis plantillas y los tres factores coinciden con el PRD.
- [ ] Un estudio edita sus plantillas y factores sin afectar a otros (RLS); los valores inválidos se rechazan.
- [ ] pytest, ruff y CI en verde.

# RGB-15 · implementation_log

Rama: `feat/RGB-15-week-templates`, desde `main` con RGB-9 mergeada. TDD: tests de dominio, aplicación, Postgres y API en rojo (módulos inexistentes), implementación, verde a la primera.

## Qué se hizo

- Dominio (`backend/app/opportunity/domain`): `ProjectType`, `Scale`, `DEFAULT_TEMPLATES`, `DEFAULT_SCALE_FACTORS`, `Plan` y `make_plan()`, más `validate_weeks` y `validate_factor` con errores en español (`InvalidWeeks`, `InvalidFactor`).
- Aplicación: `PlanSettingsService` (`get_settings`, `make_plan`, `update_template`, `update_scale_factor`), que audita cada cambio con el valor anterior y el nuevo.
- Infraestructura: `PostgresPlanSettings` con `INSERT ... ON CONFLICT DO UPDATE`; el `study_id` sale de `app_study_id()`.
- Migración `005_plan_settings.sql`: `plan_templates` y `scale_factors`, con RLS (plantilla de RGB-3) y restricciones (7 semanas, mínimo 1, factor entre 0 y 10).
- API: `GET /api/plan`, `GET /api/settings/plan`, `PUT /api/settings/plan/templates/{project_type}` y `PUT /api/settings/plan/scale-factors/{scale}`.

## Decisiones

- **Redondeo half-up con `Decimal`.** El criterio (industrial grande = 3-3-5-7-10-52-5) exige que 6,5 dé 7; `round()` de Python redondea al par y daría 6. Un test lo fija.
- **Solo se guardan los cambios del estudio.** Los valores del PRD viven en el dominio; el servicio mezcla las modificaciones encima. Un estudio nuevo funciona sin sembrar datos, y recalibrar los valores por defecto no exige migración.
- **Tipologías con nombre inglés:** `single_family_house`, `rehabilitation`, `multi_family`, `facility`, `industrial`, `renovation_interiors` (vivienda unifamiliar, rehabilitación, plurifamiliar, equipamiento, industrial, reforma o interiorismo).
- **Factor máximo 10:** límite razonable propio, no del PRD; evita que un error de tecleo (por ejemplo 130) rompa los planes.
- **Quién puede editar:** hoy cualquier usuario del estudio. El permiso corresponde a RGB-4.

## Verificación

- pytest 274 en verde; ruff limpio.
- Mutación: con redondeo bancario fallan 4 tests, sin el mínimo de 1 semana falla 1, y sin RLS en `scale_factors` fallan 10.
- Probado con Postgres real: valores por defecto, cambios guardados, una sola fila al editar dos veces, decimales del factor, auditoría con antes y después, y aislamiento entre estudios.

## No cubierto

- La pantalla de Ajustes (front).
- El permiso para editar los ajustes (RGB-4).

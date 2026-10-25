# RGB-17b · Ficha del proyecto: edición, guardado y recálculo del plan (full-stack)

Segunda parte de RGB-17 (la lectura es 17a, PR #42, ya en `main`). Misma regla de flujo: contrato primero, Escritor de tests, Desarrollador, Tester, Juez, PR con pantallazos (claro y oscuro, datos ficticios). Plan de 17a y bloques: [plan.md](plan.md).

## Criterios de aceptación

- [ ] Los campos obligatorios vacíos se marcan (ya en 17a) y al rellenarlos la ficha lo refleja al guardar.
- [ ] Cada bloque indica si está completo o cuántos faltan (se actualiza al guardar).
- [ ] Cambiar tipología o escala recalcula el plan (con confirmación).
- [ ] Sin cambios de estado del proyecto; cada guardado queda en la auditoría.

## Supuestos provisionales

1. **Qué se edita.** Los campos `manual` de la ficha (los de la tabla de 17a) y, en Identificación, tipología y escala. `code`, `name`, `client`, `location` y `traffic_light` no se editan aquí.
2. **Dónde se guarda.** Contenido del entregable de salida de la fase 1 (`exit_deliverables`, `phase = 1`), sin tabla nueva ni migración: claves planas por campo manual y, si se cambió tipología o escala, una clave `plan` `{project_type, scale, weeks, total}`.
3. **Plan base inmutable.** La línea base de RGB-16 (`project_plans`) es de solo inserción y no se toca. El plan recalculado vive en el contenido de la ficha y gana sobre la línea base al leer (`project_type`, `scale` y `confirmed_plan` de la ficha). El histórico queda en la línea base y en la auditoría.
4. **Quién y cuándo.** Solo con autoridad de la fase 1 (`lifecycle.domain.phases`, socio o director) y solo mientras el proyecto está en la fase 1. En fases posteriores la ficha es de solo lectura (la versión congelada llega con RGB-19). Rechazos de negocio auditados y devueltos, como en RGB-9/16.
5. **Valores.** Texto de hasta 2000 caracteres (alcances, riesgo) o 200 (resto); espacios recortados; vacío borra el valor; fechas ISO `YYYY-MM-DD` válidas; la ruta del repositorio es texto libre. Semanas del plan: siete enteros 1–520 (`validate_weeks`).
6. **Guardado parcial por bloque.** El front guarda un bloque a la vez; la API acepta cualquier subconjunto de campos. Última escritura gana (sin control de versión; seguimiento).
7. **Permisos por rol reales:** RGB-2 y RGB-4.

## Contrato

`PUT /api/projects/{code}/sheet` · cuerpo:

```json
{
  "fields": { "sponsor": "…", "contract_signed_on": "2026-11-03", "team": "" },
  "plan": { "project_type": "rehabilitation", "scale": "large", "weeks": [3, 4, 6, 8, 9, 40, 5] }
}
```

- `fields` y `plan` son opcionales (al menos uno). Claves de `fields`: solo campos manuales; una clave desconocida o no editable da 422 `unknown_field`.
- 200: la ficha completa con la forma de `GET /sheet` (para refrescar la pantalla sin otra llamada).
- 403 `no_authority`; 404 `project_not_found`; 409 `sheet_not_editable` (el proyecto no está en la fase 1); 422 `invalid_field` (con `field` y mensaje), `invalid_weeks`, `invalid_scale`, `invalid_project_type`, `invalid_request`.
- Cada guardado escribe un evento de auditoría (`entity: "project_sheet"`, `action: "update"`, valores anteriores y nuevos de los campos tocados; `action: "recalculate_plan"` si cambió el plan). Los rechazos también.
- `GET /api/plan?project_type=…&scale=…` (ya existe) da el plan propuesto para el recálculo.

## Archivos

**Back** (`backend/`)
- `app/opportunity/domain/project_sheet.py`: campos editables, validación de valores (`validate_sheet_fields`), aplicación del `plan` guardado sobre la línea base al construir la ficha.
- `app/opportunity/domain/errors.py`: `SheetNotEditable`, `UnknownSheetField`, `InvalidSheetField`.
- `app/opportunity/domain/ports.py`: el puerto `ProjectSheets` gana `save_content(project_id, content)` (fusiona sobre el contenido existente).
- `app/opportunity/application/update_project_sheet.py`: caso de uso (proyecto, fase 1, autoridad, validación, guardado, auditoría de aciertos y rechazos).
- `app/opportunity/infrastructure/postgres_project_sheets.py`, `app/api/opportunity_routes.py`, `app/api/dependencies.py`.
- `tests/`: dominio puro, caso de uso con `create_autospec`, rutas (200/403/404/409/422), infraestructura con Postgres real (RLS, fusión de contenido), auditoría y arquitectura DDD.

**Front** (`frontend/`)
- `lib/sheet.ts`: `saveProjectSheet(code, body)` y errores en español.
- `components/project/sheet/`: edición por bloque (botón «Editar», formulario con etiquetas, errores por campo, «Guardar»/«Cancelar», foco y `aria-live`), selector de tipología y escala con recálculo (muestra el plan propuesto editable, confirmación explícita) y estado de guardado.
- `app/projects/[code]/phase/[phase]/page.tsx`: pasa `editable` solo si la fase vista y la actual son la 1.
- `__tests__/` y pantallazos en `docs/plans/RGB-17/screenshots/` (los de 17b con prefijo `edit-`).

**Docs:** `implementation_log.md` (sección 17b), `docs/estado.md`, Notion y el artifact.

## Fuera de alcance

Congelar la ficha v1 y promover a Briefing (RGB-19), control de versiones/concurrencia, permisos por rol (RGB-4), semáforo (tiempos), bloque Calidad.

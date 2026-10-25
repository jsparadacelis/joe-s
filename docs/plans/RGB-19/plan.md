# RGB-19 · Completitud de la ficha y promoción a Briefing, ficha v1 (full-stack)

Tarea full-stack (P0, M, E3). Depende de RGB-17 (ficha, en `main`) y RGB-9 (servicio de promoción). Flujo: contrato primero, Escritor de tests, Desarrollador, Tester, Juez, PR único con pantallazos (claro y oscuro, datos ficticios).

Fuente: página RGB-19 del Backlog de Notion. Con la ficha al 100 %, socio o director promueven a Briefing y la ficha queda congelada como versión 1.

## Criterios de aceptación

- [ ] El botón se activa solo con todos los obligatorios rellenos y para socio o director.
- [ ] La ficha v1 se ve en solo lectura al navegar a la fase 1 desde fases posteriores.

## Supuestos provisionales

1. **Completa = 100 %.** Todos los campos obligatorios de la ficha (20) rellenos; el semáforo es opcional (RGB-17). La definición es la de `build_sheet`, no una nueva.
2. **Autoridad.** La de la fase 1 en `lifecycle.domain.phases` (socio o director). Rechazos auditados y devueltos, como en RGB-9/16.
3. **Qué se congela.** Al promover, el contenido del entregable de la fase 1 pasa a incluir `sheet`: la ficha completa ya resuelta (bloques, campos y valores, incluidos los precargados y el plan vigente) tal como la ve la persona. El servicio de promoción congela ese contenido como versión 1 (`frozen_versions`, solo inserción). Nada se recalcula después.
4. **Marcas del entregable.** Antes de delegar en `PromotionService.promote`, el caso de uso marca el entregable de la fase 1 como completo y aprobado (la aprobación es el acto de promover, igual que en la fase 0 de RGB-16). Todo en una sola transacción: si algo falla, no queda nada a medias.
5. **Ficha v1 en solo lectura.** Con el proyecto en fase > 1, `GET /sheet` devuelve la versión congelada (no la reconstruye) con `frozen_version: 1`. `PUT /sheet` sigue dando 409 `sheet_not_editable`.
6. **Permisos calculados por el servidor.** `GET` y `PUT /sheet` devuelven `permissions: { can_edit, can_promote }`: `can_edit` = fase 1 y autoridad; `can_promote` = `can_edit` y ficha al 100 %. El front no conoce roles: pinta botones según estos booleanos (el servidor sigue siendo la barrera). Hasta RGB-2/4 el rol sale del contexto de desarrollo.
7. **Los campos semanales** que siguen vivos sobre la ficha (RGB-45+) quedan fuera.

## Contrato

`POST /api/projects/{code}/sheet/promote` (sin cuerpo)
- 200: `{ code, action: "promote", previous_phase: 1, current_phase: 2, frozen_version: 1, sheet }` con `sheet` en la forma de `GET /sheet`.
- 403 `no_authority`; 404 `project_not_found`; 409 `sheet_not_editable` (el proyecto no está en la fase 1); 422 `incomplete_deliverable` con la lista `missing` de campos obligatorios sin rellenar (etiquetas en español).
- Todo rechazo de negocio queda en la auditoría; el éxito lo audita `PromotionService` (promote) más un evento `project_sheet`/`freeze` con la versión.

`GET /api/projects/{code}/sheet` y `PUT /api/projects/{code}/sheet` añaden a la forma de 17a: `frozen_version: number | null` (v1 cuando está congelada) y `permissions: { can_edit: boolean, can_promote: boolean }`. Con fase > 1 → `frozen_version: 1`, ambos permisos `false`.

## Archivos

**Back** (`backend/`)
- `app/opportunity/domain/project_sheet.py`: permisos y marca de congelación en el modelo de la ficha; función pura que lista los obligatorios sin rellenar con su etiqueta.
- `app/opportunity/domain/ports.py`: `ProjectSheets` gana `finalize_content(project_id, content)` (guarda el contenido con `sheet`, completo y aprobado) y `get_frozen(project_id, phase)` (contenido congelado).
- `app/opportunity/application/promote_project_sheet.py`: caso de uso (proyecto → fase 1 → autoridad → completitud → finalizar → `PromotionService.promote`, con auditoría de rechazos); `get_project_sheet.py` y `update_project_sheet.py` devuelven permisos y la versión congelada.
- `app/opportunity/infrastructure/postgres_project_sheets.py`, `app/api/opportunity_routes.py`, `app/api/dependencies.py`.
- `tests/`: dominio puro, caso de uso con `create_autospec`, rutas (200/403/404/409/422), Postgres real (RLS, versión 1 inmutable, fase 2 abierta, auditoría) y arquitectura.

**Front** (`frontend/`)
- `lib/sheet.ts`: `permissions` y `frozen_version` en el tipo, `promoteProjectSheet(code)` y errores en español.
- `components/project/sheet/PromotePanel.tsx`: panel con porcentaje, faltantes por bloque y botón «Promover a 2 · Briefing y concepto» (deshabilitado con razón visible hasta `can_promote`; confirmación; errores 403/409/422 accesibles; éxito con enlace a la fase 2 y foco al aviso).
- `components/project/sheet/ProjectSheet.tsx` y `SheetBlock.tsx`: «Editar» según `permissions.can_edit`; aviso «Ficha v1 congelada · solo lectura» con `frozen_version`.
- `app/projects/[code]/phase/[phase]/page.tsx`: deja de decidir `editable` por la fase y usa los permisos del servidor.
- `__tests__/` y pantallazos `promote-*` y `frozen-*` en `docs/plans/RGB-19/screenshots/`.

**Docs:** `implementation_log.md`, `docs/estado.md`, Notion y el artifact de estado.

## Fuera de alcance

Brief manual y promoción a Anteproyecto (RGB-25 y siguientes), roles reales (RGB-2/4), campos semanales, control de concurrencia, desplegar en producción (se pide aparte).

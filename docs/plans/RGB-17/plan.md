# RGB-17 · Ficha del proyecto: bloques y campos obligatorios (full-stack)

Tarea full-stack (P0, L, E3). Depende de RGB-16 (en `main` y desplegada). Bloquea RGB-19 (completitud y promoción a Briefing). Se entrega en **dos PRs** para que se vea antes:

- **RGB-17a (este plan, PR 1):** ficha de solo lectura en la fase 1: bloques, obligatorios vacíos marcados, completitud por bloque y datos precargados con la etiqueta «del scoring».
- **RGB-17b (PR 2):** edición de los campos manuales, guardado y recálculo del plan al cambiar tipología o escala.

Flujo: contrato primero, Escritor de tests, Desarrollador, Tester, Juez, PR con pantallazos (claro y oscuro, datos ficticios).

Fuente: página RGB-17 del Backlog de Notion y tabla «Fase 1 · Inicio» del PRD.

## Criterios de aceptación

- [ ] Los campos obligatorios vacíos se marcan.
- [ ] Cada bloque indica si está completo o cuántos faltan.

## Bloques y campos

Etiqueta «del scoring» = el dato ya existe en la oportunidad, el plan o el scoring y se precarga. «Manual» = lo rellena la persona (RGB-17b); en 17a aparece vacío y marcado.

| Bloque (`block`) | Campos obligatorios | Opcionales |
|---|---|---|
| `identification` | `code` (automático), `name`, `client` (del scoring), `location` (del scoring), `cadastral_reference` (manual), `project_type` (del scoring), `scale` (del scoring) | |
| `engagement` | `scope_included`, `scope_excluded`, `contract_signed_on` (manuales) | |
| `governance` | `sponsor`, `project_director`, `technical_lead` (manuales) | `team`, `external_collaborators` |
| `client_contact` | `contact` (manual) | |
| `timing` | `confirmed_plan` (del plan confirmado en RGB-16), `next_milestone`, `next_milestone_on` (manuales) | |
| `risk` | `main_risk`, `risk_owner` (manuales) | |
| `information` | `repository_path` (manual) | |
| `status` | | `traffic_light` (semáforo del proyecto, automático: llega vacío al promover) |

Nota de cambio (tras el Tester): el semáforo es opcional y `source: "auto"`. Un proyecto recién promovido siempre lo tiene vacío (lo calcula el consumo de tiempos, tarea posterior); exigirlo haría imposible completar la ficha y frenaría RGB-19. Total de obligatorios: 20; el bloque `status` tiene 0 obligatorios y cuenta como completo.

Calidad se rellena desde la fase 2: no entra. Sin honorarios ni forma de pago en el MVP.

## Supuestos provisionales

1. **Dónde se guarda.** La ficha es el contenido del entregable de salida de la fase 1 (`exit_deliverables`, `phase = 1`, `content jsonb`); no hay tabla nueva. Los campos «del scoring» no se copian ahí: se leen de la oportunidad, el plan confirmado y el scoring (fuente única) y solo los manuales viven en `content`.
2. **Completitud.** Un campo obligatorio cuenta como relleno si no es nulo ni solo espacios. El porcentaje y los faltantes por bloque los calcula el dominio (no el front). El validador de la fase 1 de RGB-9 se reutiliza o se extiende con esta definición; RGB-19 lo usa para activar «Promover».
3. **Solo lectura en 17a.** Sin escritura no hay migración ni cambio de estado. No hay IA ni transiciones, así que no se audita nada nuevo.
4. **Ficha vacía antes de promover.** Un proyecto en fase 0 no tiene ficha: `GET .../sheet` da 404 `sheet_not_found`. Desde la fase 1 siempre existe (aunque con todo por rellenar).
5. **Permisos por rol:** RGB-2 y RGB-4. Hoy el rol sale del contexto de desarrollo; leer no exige autoridad.

## Contrato (17a)

`GET /api/projects/{code}/sheet` · 200:

```json
{
  "code": "PRY-2026-001",
  "phase": 1,
  "completion": { "filled": 7, "required": 20, "percent": 35 },
  "blocks": [
    {
      "block": "identification",
      "filled": 5, "required": 7, "complete": false,
      "fields": [
        { "field": "client", "required": true, "value": "…", "source": "scoring" },
        { "field": "cadastral_reference", "required": true, "value": null, "source": "manual" }
      ]
    }
  ]
}
```

- `source`: `"scoring"` (precargado, con etiqueta en la UI), `"auto"` (código) o `"manual"`.
- 404 `project_not_found`; 404 `sheet_not_found` (el proyecto aún no está en la fase 1 o posterior).
- Claves JSON en inglés; los textos de la interfaz (nombres de bloque y campo, etiquetas) viven en el front, en español.

## Archivos (17a)

**Back** (`backend/`)
- `app/opportunity/domain/project_sheet.py`: definición de bloques y campos, `build_sheet(...)` puro (precargado + manuales → bloques con `filled`/`required`/`complete`).
- `app/opportunity/application/get_project_sheet.py`: caso de uso de lectura (oportunidad, plan confirmado y contenido del entregable de fase 1).
- `app/api/opportunity_routes.py` y `app/api/dependencies.py`: ruta y composición.
- `tests/`: dominio puro (completitud, bordes: espacios, nulos, opcionales), caso de uso con `create_autospec`, rutas (200/404), infraestructura con Postgres real si hay consulta nueva, y arquitectura DDD.

**Front** (`frontend/`)
- `lib/sheet.ts`: cliente de `GET /sheet`, tipos y etiquetas en español de bloques y campos.
- `components/project/sheet/`: `ProjectSheet` (resumen de completitud), `SheetBlock` (estado «Completo» o «Faltan N», campos con etiqueta «del scoring» y marca «Obligatorio, falta»), accesible (sin depender del color, encabezados, `aria-live` en el resumen).
- `app/projects/[code]/phase/[phase]/page.tsx`: monta la ficha en la fase 1 de proyectos reales; los de ejemplo mantienen su vista actual.
- `__tests__/`: contrato del cliente con la forma literal del back, componentes (axe, teclado), página.
- Pantallazos en `docs/plans/RGB-17/screenshots/`.

**Docs:** `implementation_log.md`, `docs/estado.md`, Notion y el artifact de estado.

## Fuera de alcance (17a)

Edición y guardado (17b), recálculo del plan al cambiar tipología o escala (17b), promoción a Briefing y ficha v1 congelada (RGB-19), bloque Calidad, permisos por rol (RGB-4).

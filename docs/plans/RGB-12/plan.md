# RGB-12 · Por promover (parte de servidor)

Vista transversal del estado del entregable de salida de cada proyecto. Esta parte hace solo el
servidor: `GET /api/to-promote`, de solo lectura y abierta a cualquier persona del estudio. El
contador de la barra lateral (`ready_count`) se enlaza en la parte de front.

## Reglas de estado (para revisar con RGB)

- Se listan los proyectos de las fases 0 a 6. Quedan fuera la fase 7 (Cierre: no hay fase
  siguiente a la que promover) y los descartados («no perseguir», decisión registrada en
  `promotions`).
- `blocked`: el proyecto está en pausa. `reason` lleva la fecha prevista de reanudación.
- `ready`: no está en pausa y los requisitos de su fase pasarían hoy, reutilizando las reglas
  existentes:
  - fase 0: existe un scoring guardado (lo mismo que exige `StartProject`);
  - fase 1: la ficha tiene todos los campos obligatorios (`build_sheet` + `missing_required_labels`);
  - fase 2: el brief está completo (`completeness(...).blockers()`: campos, datos técnicos y
    aprobación del cliente);
  - fases 3 a 6: entregable completo y aprobado y `VALIDATORS_BY_PHASE` de la fase.
  En las fases 0 a 2 las marcas `complete/approved` solo se escriben al promover, por eso se
  evalúan las reglas de contenido y no las marcas.
- `in_progress`: el resto; `reason` resume lo que falta.
- Orden: listos, en curso, bloqueados; dentro de cada grupo, antigüedad en la fase (más antiguo
  primero; la entrada en la fase es la última promoción registrada, o la creación del proyecto) y
  después código.
- `can_promote` sale de `can(PROMOTE)` con los roles del estudio y las funciones de la persona en
  cada proyecto.

## Diseño

Contexto nuevo `to_promote` (DDD): `domain` (valoración pura y puertos), `application`
(`missing_for` por fase y el caso de uso `ToPromoteQueue`) e `infrastructure` (Postgres con RLS:
4 consultas masivas más 1 de funciones, sin N+1). Nada escribe.

## Archivos

- `backend/app/to_promote/{domain,application,infrastructure}/...`
- `backend/app/api/to_promote_routes.py`, `backend/app/api/dependencies.py`, `backend/app/api/main.py`
- Tests en `backend/tests/to_promote/...` y `backend/tests/api/test_to_promote_routes*.py`
- `docs/plans/RGB-12/implementation_log.md` (contrato exacto)

# RGB-12b: vista «Por promover» y contador de la barra lateral

Notion: https://app.notion.com/p/3fd444f747b381eea1d6c27cedae3c62 · Servidor: RGB-12a (PR #71, desplegado). Contrato exacto de la API en `docs/plans/RGB-12/implementation_log.md`.

## Objetivo
Sustituir el estado vacío de `/to-promote` por la lista real: una fila por proyecto con su fase, entregable de salida, estado (listo, en curso, bloqueado) y quién promueve; listos primero (el orden lo da el servidor). Y mostrar en la barra lateral, junto a «Por promover», el contador de proyectos listos (`ready_count`).

## Front
- `lib/to-promote.ts`: tipos del contrato, etiquetas de estado en español («Listo para promover», «En curso», «Bloqueado»), `fetchToPromote` con `createApiClient` (patrón de `lib/portfolio.ts`/`lib/technical-data-api.ts`), respuesta mal formada → `invalid_to_promote_response`, errores `ApiError` propagados.
- `components/to-promote/ToPromoteTable.tsx`: tabla accesible (encabezados, nombre de la tabla), código del proyecto como enlace a `/projects/{code}`, fase con su nombre, entregable, `StatusChip` por estado (solo tokens de color; el estado nunca solo por color), motivo bajo el estado cuando existe, «Quién promueve» y una marca «Puedes promover» cuando `can_promote`; estados cargando, vacío («No hay proyectos por promover»), error de carga con «Reintentar» (403/401/503 con el mensaje del servidor); sin botones que promuevan (la promoción se hace en la ficha del proyecto).
- Página `/to-promote`: carga en servidor (como las otras páginas de lista que leen la API) o en cliente según el patrón existente; los proyectos de ejemplo `PRY-EJ-*` no entran (no existen en el servidor).
- Barra lateral: contador de listos junto a «Por promover» (badge con `aria-label` «N proyectos listos para promover»; oculto si 0 o si no se ha podido cargar; no rompe la barra si falla). Se actualiza al navegar. Solo en modo supabase con sesión o en modo dev (la misma condición con la que el resto de la app llama a la API).
- Textos en español, solo tokens de color, accesibilidad como criterio (roles, foco, contraste en claro y oscuro).

## Fuera de alcance
Promover desde la lista (la acción sigue en la ficha de cada proyecto) y filtros.

## Flujo
Escritor de tests → Desarrollador → Tester (build real + API real con Postgres local y la semilla de demostración RGB-7: 2 listos, 4 en curso, 2 bloqueados; pantallazos claro y oscuro en `docs/plans/RGB-12/screenshots-12b/`) → Juez → PR → merge → despliegue.

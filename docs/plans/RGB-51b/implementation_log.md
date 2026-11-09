# RGB-51b · Registro de implementación (Desarrollador)

## Qué se hizo

- `lib/alerts-api.ts` (`Alert`, `fetchAlerts`) y `lib/capacity-api.ts` (`CapacityAnswer`, `fetchCapacity`):
  validación estricta del JSON del servidor (502 `invalid_alerts_response` / `invalid_capacity_response`);
  la capacidad pasa de snake_case a la `Capacity` del front.
- `lib/technical-data-api.ts`: `TechnicalDataApi` gana `alerts` y `capacity`; `refresh` devuelve
  `unavailable` (solo `inspire`, `open_meteo`, `pvgis`, comprobado con `Object.hasOwn`); exporta
  `SOURCE_LABELS` (nombres en español). La API de ejemplo devuelve `[]` de alertas y calcula la capacidad en local.
- `AlertsPanel` (nuevo): lista con texto de gravedad («Aviso» / «Información»), mensaje, sugerencia y datos
  afectados por etiqueta; sin alertas no pinta nada.
- `CapacityPanel`: props `missing`, `loading`, `failed`; «Calculando…» y fallo con `role="status"`,
  «Rellena: …» con etiquetas; en fallo no se muestran cifras (ni obsoletas).
- `TechnicalDataEditor`: carga alertas y capacidad cuando hay datos y las recarga (un solo contador de versión)
  tras guardar, restaurar, verificar, verificar todo y consultar. Un fallo de alertas es un aviso discreto que no
  bloquea; los `PRY-EJ-*` (`isSampleProject`) siguen con el cálculo local y no piden capacidad al servidor.
  Aviso `unavailable` (`Notice` warn, `role="status"`), que se limpia al volver a consultar o pasar a entrada manual.
- `ToPromoteView`: `role="status"` en «Cargando…».

## Decisiones

- `RefreshResult.unavailable` es opcional en el tipo (el servidor/parseo siempre lo rellena): los tests
  ya existentes de `TechnicalDataEditorConnected` construyen resultados sin él y no compilarían de otro modo.
- Mientras se recarga tras un cambio se mantienen las cifras anteriores; «Calculando…» solo en la primera carga.
- Ids desconocidos en `missing`/`fields` se muestran tal cual en lugar de ocultarse.

## Tests existentes corregidos (mínimo cambio, justificado)

- `TechnicalDataEditor.test.tsx`: `mount` usaba `PRY-2026-001` (real) para probar el cálculo local de capacidad;
  ese cálculo ahora es solo de los proyectos de ejemplo, así que usa `PRY-EJ-001`. Las aserciones no cambian.
- `TechnicalDataEditorConnected.test.tsx` («a real project loads…»): esperaba exactamente 1 petición; ahora
  tras cargar se leen también `/alerts` y `/capacity`. Se comprueba la primera y que las otras dos son esas rutas.

## Resultado

Tests: 2815 / 2815 en verde (124 suites; 30 nuevos en rojo del Escritor ahora en verde, más 7 ya existentes
afectados corregidos como arriba). `lint` (0 errores, 3 avisos previos), `typecheck` y `build` en verde.
Pendiente del Tester: pantallazos en `docs/plans/RGB-51b/screenshots/`.

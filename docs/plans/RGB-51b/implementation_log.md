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

# RGB-51b · Tester

Veredicto del Tester: **APROBADO**, sin bloqueantes. Sin cambios en código de producción ni en tests. Datos ficticios.

## Comprobaciones

- `npm run build`: verde. `next start` (3010) contra un servidor simulado en el 8000 (proyecto `PRY-T-001`, fase 2, con respuestas ajustables de `/alerts`, `/capacity` y `/refresh`). Pantallazos con Chrome real en claro y oscuro (`screenshots/`): `01-capacity-server` (144 m²t, limita la edificabilidad, caso del PRD), `02-unavailable-sources` (aviso de fuentes), `03-alerts` (aviso, información y una alerta con HTML), `04-error-state` (alertas y capacidad con 503), `05-capacity-loading` («Calculando…»).
- axe-core en navegador (claro y oscuro, estados 01-04): 0 violaciones. Tras «Volver a consultar» el foco queda en el botón. El aviso desaparece tras una consulta correcta.
- Criterios del plan: aviso `unavailable` con nombres en español; alertas con texto de gravedad, mensaje, sugerencia y datos por etiqueta, recargadas tras guardar/restaurar/verificar/consultar, un fallo no bloquea; capacidad del servidor en proyectos reales y local en `PRY-EJ-*`; `role="status"` en «Cargando…» de Por promover. Todo cumple.

## Intentar romper (pruebas desechables, no incluidas en el repo; todas en verde)

- Respuestas mal formadas de `/alerts` y `/capacity` (null, `{}`, tipos erróneos, severidad desconocida, NaN, falta `meets_min_plot`): error 502 de contrato; los campos extra se descartan.
- 401/403/404/503 en ambos endpoints: la pantalla sigue operativa, con avisos discretos.
- Carreras: una respuesta antigua de alertas o de capacidad que llega tarde NO pisa la nueva.
- XSS en mensaje y sugerencia: se pinta como texto (sin `<img>`/`<script>`, sin diálogos). 200 alertas con textos de 500 caracteres: axe limpio.
- Ids desconocidos (`nope`, `__proto__`, `constructor`) en `fields`: se muestran tal cual, sin romper.

## Cobertura de los dos tests modificados

- `TechnicalDataEditor.test.tsx` (mount a `PRY-EJ-001`): cambio justificado; esos tests cubren el cálculo local, que ahora es solo de los ejemplos. No se pierde cobertura: el cálculo de un proyecto real con servidor lo cubren `TechnicalDataEditorFollowups.test.tsx` (caso del PRD 144 m²t, `missing`, fallo, recarga tras guardar) y `capacity-api.test.ts`.
- `TechnicalDataEditorConnected.test.tsx`: la petición única pasa a «la primera es technical-data y las otras dos son exactamente `/alerts` y `/capacity`»; igual de estricta. La aserción del texto «Rellena edificabilidad, ocupación…» pasó a `/^Rellena: /` (más débil: ya no fija qué etiquetas faltan en ese caso); las etiquetas concretas sí se cubren en Followups.

## Hallazgos (no bloqueantes)

- Baja: `AlertsPanel` usa `alert.code` como `key`; si el servidor repitiera un código, React avisa de claves duplicadas (solo consola). Hoy los códigos del backend son únicos por regla.
- Baja: un id de campo desconocido se muestra en crudo («Datos afectados: nope»); decisión documentada del Desarrollador.
- Informativo: la carrera «guardar dos veces seguidas» no se probó en navegador; la lógica (contador de versión y limpieza con `cancelled`) la cubren las pruebas de carrera anteriores.

# RGB-51b · Juez

Veredicto: **RECHAZADO** (un único motivo, de corrección rápida).

## Motivo

- `TechnicalDataEditorConnected.test.tsx` («data without a value…»): la aserción original
  «Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.» pasó a `/^Rellena: /`.
  Es una debilitación no justificada: en ese caso la API simulada (`fakeTechnicalDataApi`) devuelve
  `missing = [buildability, maxOccupancy, floors]` (FILLED no los tiene), así que se puede aseverar lo mismo
  de forma específica sin romper el contrato. Restaurar como
  `findByText("Rellena: Edificabilidad, Ocupación máxima, Número de plantas")` (o regex equivalente).
  Que Followups cubra etiquetas en otro caso no compensa: este test dejaba fijado qué falta en el caso base.

## Resto verificado (conforme)

- Criterios del plan, código en inglés, UI en español, solo tokens de color, el cliente solo lee (GET) y no cambia estado.
- Todo código nuevo tiene test (alerts-api, capacity-api, AlertsPanel, CapacityPanel, Followups, unavailable, ToPromote).
- `TechnicalDataEditor.test.tsx` (mount a `PRY-EJ-001`) y la petición única → «primera + /alerts + /capacity»: cambios justificados y equivalentes.
- Pantallazos: 10 archivos existen (claro/oscuro); vistos 02 claro y 03 oscuro, corresponden al cambio.

### Juez · cierre del rechazo
Restaurada la aserción específica de «data without a value…» en `TechnicalDataEditorConnected.test.tsx`
(`"Rellena: Edificabilidad, Ocupación máxima, Número de plantas."`); el archivo pasa (64 de 64). Era la
única condición del Juez, que había dicho que con eso el veredicto pasaba a **aprobado**. La
comprobación la hizo quien orquesta, no una segunda pasada del Juez; los checks de CI cubren la suite
completa.

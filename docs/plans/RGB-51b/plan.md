# RGB-51b · Seguimientos de la pantalla de datos técnicos (front)

Seguimientos de RGB-51 anotados en `docs/estado.md` (RGB-24/25/26, RGB-30 y RGB-31). El servidor ya
lo da todo: este plan solo toca el front. Sin tarea propia en Notion: se cuelga de RGB-51.

## Alcance

1. **Fuentes no disponibles.** `POST /refresh` devuelve `unavailable` (orígenes `inspire`,
   `open_meteo`, `pvgis`) cuando una fuente externa falla; hoy el front lo ignora y la persona cree
   que se rellenó todo. Se parsea y se muestra un aviso con la ruta manual.
2. **Alertas de cruce (RGB-31).** `GET /api/projects/{code}/alerts` → `{alerts: [{code, severity,
   message, suggestion, fields}]}`. Se muestran encima de los datos, solo informan.
3. **Capacidad desde el servidor (RGB-30).** `GET /api/projects/{code}/capacity` →
   `{capacity|null, missing[]}`. `CapacityPanel` deja de calcular en el cliente en los proyectos
   reales y pinta lo que devuelve el servidor; los `PRY-EJ-*` siguen con el cálculo local.

Fuera de alcance: `AlertConfig` por estudio, cablear las tablas de RGB-27, mostrar el aviso en
otras pantallas.

## Contrato

- `RefreshResult` gana `unavailable: string[]` (ids de origen; los desconocidos se ignoran).
- Aviso (`Notice`, tono de advertencia, `role="status"`): «No se pudo consultar: <Polígono INSPIRE ·
  Altitud y pendiente · Producción fotovoltaica>. Se conservan los datos que ya había; introdúcelos
  a mano.» Se limpia al volver a consultar con éxito o al pasar a entrada manual.
- Alertas: `lib/alerts-api.ts` (`fetchAlerts`, validación estricta del JSON → error de contrato).
  Componente `AlertsPanel`: lista con texto de gravedad además de color (`warning` / `info`),
  mensaje, sugerencia y los datos afectados por nombre de campo. Sin alertas: no se pinta nada.
  Si la petición falla: no bloquea la pantalla (las alertas son accesorias), aviso discreto.
  Se recargan tras cada guardado, restauración, verificación y consulta.
- Capacidad: `lib/capacity-api.ts` (`fetchCapacity`) y mapeo a `Capacity`; `missing` se traduce a
  «Rellena: …» con las etiquetas de los datos. Mientras carga, «Calculando…»; si falla, aviso y
  vuelve a mostrarse el cálculo local no, para no enseñar dos cifras distintas.

## Archivos

Nuevos: `frontend/lib/alerts-api.ts`, `frontend/lib/capacity-api.ts`,
`frontend/components/project/technical-data/AlertsPanel.tsx`.
Modificados: `frontend/lib/technical-data-api.ts`, `frontend/components/project/technical-data/
{TechnicalDataEditor,CapacityPanel}.tsx`, `frontend/lib/capacity.ts` (tipo y mapeo).
Tests: `frontend/__tests__/lib/{alerts-api,capacity-api}.test.ts`,
`__tests__/components/project/technical-data/{AlertsPanel,CapacityPanel}.test.tsx` y casos nuevos
en los tests del editor (aviso `unavailable`, alertas tras guardar, capacidad del servidor).

## Criterios

- Con `unavailable` no vacío se ve el aviso con los nombres en español; vacío, no hay aviso.
- Las alertas aparecen con texto de gravedad, mensaje y sugerencia; desaparecen al corregir el dato
  (se recargan); un fallo del servidor de alertas no rompe la pantalla.
- La capacidad de un proyecto real es la del servidor (caso del PRD: 96 m², 1,5, 70 %, PB+2 →
  144 m²t, limita la edificabilidad); `PRY-EJ-*` sin cambios.
- Todo texto en español, código en inglés, solo tokens de color, axe sin violaciones en claro y
  oscuro, foco gestionado. Pantallazos en `docs/plans/RGB-51b/screenshots/` (datos ficticios).
- Aprovecha para añadir `role="status"` a «Cargando…» de «Por promover» (seguimiento de RGB-12b).

## Flujo

Escritor de tests → Desarrollador → Tester (build real, pantallazos, intentar romper) → Juez → PR.

# RGB-26: registro de implementación (backend)

Altitud, pendiente y producción fotovoltaica. Plan e investigación en [plan.md](plan.md). Todo con TDD (cada pieza tras un test en rojo), sin llamadas reales en CI.

## Qué se hizo

- **Dominio** (`backend/app/external_data/domain/`):
  - `terrain.py`: categorías, regla de la pendiente, `TerrainProfile`.
  - `pv.py`: `PvLocation` (redondeo a 3 decimales, clave de la caché), `PvYield`, constantes `PEAK_POWER_KWP = 1`, `SYSTEM_LOSS_PCT = 14`, `LOCATION_DECIMALS = 3`.
  - `plot.py` gana `vertices`, `horizontal_distance_m` y `farthest_vertices` (en el plano UTM de RGB-25).
  - `errors.py` gana `ExternalServiceUnavailable` (`external_service_unavailable`, «No se pudo consultar el servicio externo. Introduce el dato a mano.»). Hereda de `CadastreError` para que las rutas la contesten con 503 sin tocar `_rejected`.
  - Puertos `ElevationGateway`, `TerrainCache`, `PvGateway`, `PvCache`.
- **Aplicación**: `GetTerrainProfile` y `GetPvYield` (caché de 30 días por estudio, transacciones cortas y ninguna conexión abierta mientras se llama a un servicio).
- **Infraestructura**: `HttpElevationGateway` (Open-Meteo, lotes de 100), `HttpPvGateway` (PVGIS `PVcalc`: `peakpower=1`, `loss=14`, `optimalangles=1`, `outputformat=json`; constantes con nombre), analizadores con lista blanca (`elevation_parser`, `pvgis_parser`, lectura JSON estricta en `json_support`: `NaN`/`Infinity` se rechazan), cachés `PostgresTerrainCache` y `PostgresPvCache`. `http_retry.get_body` acepta ahora la excepción a lanzar (por defecto la del Catastro, así que RGB-24/25 no cambian).
- **Migración `015_terrain_pv_cache.sql`** (la 014 ya existía): `terrain_cache (study_id, reference[14])` y `pv_cache (study_id, location "lat,lon" redondeada)`, ambas con `protect_study_table` (RLS forzada), upsert y `REVOKE DELETE, TRUNCATE`. Hay que aplicarla en producción antes de desplegar la API.
- **API**: `GET /api/cadastre/{reference}/terrain` → `{altitude_m, slope_pct, slope_category, estimated: true}`; `GET /api/cadastre/{reference}/pv` → `{annual_kwh_per_kwp, assumptions: {peak_power_kwp, system_loss_pct, optimal_angles, slope_deg, azimuth_deg}}`. Errores como RGB-18/25: 422, 404 `plot_not_found`, 503 `cadastre_unavailable` o `external_service_unavailable`.
- **Conexión con RGB-28**: `RefreshTechnicalData` rellena `polygonPlotArea` (`inspire`), `altitude` (`open_meteo`), `slope` y `slopeType` (`calculated`) y `pvProduction` (`pvgis`). Cableado en `refresh_technical_data_unit_of_work`.

## Decisiones

- **Regla de la pendiente.** Se toman los dos vértices más alejados del centroide (distancia horizontal en el plano UTM, al centímetro; un vértice repetido cuenta una vez y los empates conservan el orden del contorno). De los dos se usa el de mayor diferencia de altura absoluta con el centroide (el primero si empatan) y la pendiente es esa diferencia / su distancia horizontal, en %, redondeada a 1 decimal. Un vértice a distancia 0 no dice nada y se ignora; si no queda ninguno, la pendiente es `null` (sin categoría). Solo se piden 3 elevaciones por parcela (centroide + 2 vértices): el lote de 100 del cliente es una protección general, no se llega a usar con este flujo.
- **Categorías y límites** (igualdad exacta con las opciones de `slopeType`, probada contra el catálogo de RGB-28): menos de 3 % Llana; de 3 a menos de 10 Suave; de 10 a menos de 20 Moderada; de 20 a 35 **inclusive** Pronunciada; más de 35 Muy pronunciada. Las etiquetas del front dicen «< 3» y «> 35» (estrictos); en 10 y 20 el texto es ambiguo y se eligió el límite inferior inclusivo. La categoría se calcula sobre la pendiente ya redondeada a 1 decimal, para que nunca contradiga el valor mostrado, y es derivada: no se guarda (la caché guarda solo la altitud y la pendiente).
- **Límites de precisión de la malla de 90 m.** Open-Meteo devuelve la elevación de un modelo de ~90 m. En la parcela de prueba (2.900 m², fixture grabada) el centroide da 45 m y los vértices 29 y 33 m: 16 m de desnivel en 46 m, 34,6 %, cuando el terreno real de una parcela así rara vez pasa de unos pocos %. Con parcelas menores que la celda, los puntos caen en celdas vecinas y la pendiente es un orden de magnitud, no una medida; con parcelas que caben en una sola celda saldría 0 %. Por eso la respuesta lleva `estimated: true` y el front debe presentarla como estimada y editable. No se intenta suavizar ni interpolar (sería falsa precisión); el topográfico real llega por edición manual.
- **Caché.** Terreno por referencia de parcela (14 posiciones, como el contorno); un acierto de la caché no necesita ni el contorno. PVGIS por ubicación redondeada a 3 decimales (~110 m, la malla de radiación es mucho más gruesa): la ubicación sale del centroide del contorno (que va a su vez por su caché) y es exactamente lo que se pide a PVGIS, así que el valor cacheado corresponde a la clave. Una entrada caducada nunca sirve de reserva.
- **Hipótesis de PVGIS** (constantes con nombre y devueltas en `assumptions`): 1 kWp, pérdidas 14 % (valor por defecto de PVGIS), ángulos óptimos de inclinación y azimut (PVGIS los devuelve: p. ej. 35° y -3°). Se acepta un rendimiento entre 0 y 8.760 kWh/kWp·año (las horas de un año); fuera de eso, no disponible.
- **Errores del servicio.** Cualquier 4xx (400 con `error: true` de Open-Meteo o con `message`/`status` de PVGIS, 429), JSON inválido, `NaN`/`Infinity`, nº de elevaciones distinto, red, tiempo de espera y 5xx dan `ExternalServiceUnavailable`. Un reintento solo en red/tiempo/5xx (política de `http_retry`, 10 s).
- **Formato de los datos**: coma decimal y sin ceros finales: superficie del polígono y altitud y pendiente con hasta 1 decimal, producción FV entera. Los valores pasan por las reglas de RGB-28 (rango de pendiente 0-100 %, de altitud -500 a 9.000 m, opciones de `slopeType`): lo que no cabe no se escribe y se lista en `unmapped`.
- **Refresco, fuente por fuente.** Patrón de tres pasos (autoridad y fase → Catastro y después INSPIRE, Open-Meteo, PVGIS **sin conexión abierta** → escritura que vuelve a comprobar la fase). El Catastro sigue siendo obligatorio (si falla no se escribe nada, como en RGB-28). Cada una de las demás falla por separado: sus datos se quedan como estaban y se listan en `unavailable` (`inspire`, `open_meteo`, `pvgis`; también en la auditoría, junto a `unmapped`). El terreno y la FV necesitan el contorno: si INSPIRE falla, se declaran las tres no disponibles **sin volver a pedirlo** (repetiría la misma espera lenta); es una simplificación asumida (el PVGIS podría pedirse con las coordenadas del Catastro, pero no se hizo). `unmapped` solo cuenta los campos de las fuentes que sí respondieron, así que una fuente caída no se anota dos veces. Las reglas de RGB-28 no cambian: lo editado y lo manual se conservan, lo no editado se sustituye y pierde la verificación si cambia, todo auditado.
- `RefreshTechnicalData` recibe las tres fuentes como argumentos opcionales de solo palabra clave (`get_plot`, `get_terrain`, `get_pv`; sin ellas no se consultan). Así los tests de RGB-28 siguen intactos; la composición real las pasa siempre.

## Cambios a tests de RGB-28 (solo ampliar)

No se modificó ni se debilitó ninguna aserción. Se ampliaron `test_refresh_technical_data.py` (18 funciones de test nuevas), `test_technical_data_routes.py` (2: `unavailable`) y `test_technical_data_routes_postgres.py` (5 nuevos). Un único ajuste inevitable en este último: su fixture `client_for` ahora también simula los puertos de INSPIRE, Open-Meteo y PVGIS (`plot_gateway`, `elevation_gateway`, `pv_gateway`); sin eso el refresco llamaría a los servicios reales en CI. El resto de aserciones antiguas siguen valiendo tal cual (con todas las fuentes respondiendo, `unmapped == []`).

## Nota sobre la respuesta de `/refresh` (documentación de RGB-28)

`POST /api/projects/{code}/technical-data/refresh` devuelve ahora, además de la hoja y `unmapped`, `unavailable: string[]` (`inspire`, `open_meteo`, `pvgis`; vacío si todo respondió). `unmapped` incluye también los campos externos que una fuente que sí respondió no pudo rellenar (p. ej. `slope` y `slopeType` sin pendiente estimable). El cambio es aditivo: el cliente del front (RGB-51, `lib/technical-data-api.ts`) ignora claves desconocidas, así que no hay ajuste obligatorio; mostrar un aviso con `unavailable` queda para una tarea de front. No se reescribe `docs/plans/RGB-28/implementation_log.md`.

## Fixtures grabadas (solo lectura, 2026-11-01)

`pvgis_ok.json` (38,640 / 0,039), `pvgis_bad_request.json` (400), `open_meteo_ok.json` (centroide y los dos vértices más lejanos de `wfs_parcel_ok.xml`: 45, 29 y 33 m) y `open_meteo_error.json` (400 con `error: true`). Son coordenadas de la parcela de prueba, sin datos de clientes.

## Resultados

- `ruff check backend` y `ruff format backend`: limpios.
- `pytest backend` completo con Postgres real (`DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`): **2798 passed** en 7 min 48 s, sin omitidos. Tests nuevos de RGB-26: 157 funciones (varias parametrizadas).
- Front: `npm --prefix frontend run typecheck` sin errores y `npm --prefix frontend run test` con 102 suites / 2302 tests en verde, sin tocar el front (el cambio de `/refresh` es aditivo).

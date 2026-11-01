# RGB-25: registro de implementación (backend)

Rama `rgb-25/inspire-plot`. TDD estricto: cada pieza de producción se escribió tras un test en rojo (error de importación o aserción fallida) y se pasó a verde sin debilitar tests.

## Qué se hizo
- **Dominio** (`backend/app/external_data/domain/`):
  - `utm.py`: proyección Transversa de Mercator (UTM, WGS84) en Python puro, series de Krüger de orden 4 (directa e inversa), husos 28 a 31 (`UnsupportedZone` fuera de ellos).
  - `plot.py`: `PlotPolygon` (anillo exterior e interiores en `(lon, lat)`, validados: cerrados, al menos 4 posiciones, finitos, dentro del globo, con área), `PlotGeometry` (GeoJSON `Polygon`/`MultiPolygon`, exterior antihorario y huecos horarios, ida y vuelta) y `Plot` (referencia de 14 caracteres, geometría y superficie catastral oficial). `Plot` calcula `computed_area_m2`, `boundary_lengths_m`, `centroid` (lon, lat), `difference_pct` (con signo, sobre la oficial) y `area_warning` (|diferencia| > 3 %). `to_dict()` es la forma de la API; `from_dict()` lee solo las entradas (geometría y superficie oficial) y descarta lo demás. Sin ningún campo de titularidad.
  - `errors.py`: `PlotNotFound` (subclase de `CadastreNotFound`, código `plot_not_found`). `ports.py`: `PlotGateway` y `PlotCache`.
- **Aplicación** `get_plot_geometry.py`: `GetPlotGeometry` valida con `validate_cadastral_reference`, usa los 14 primeros caracteres, caché de 30 días por estudio y referencia, transacciones cortas con la llamada externa sin conexión abierta, sin usar entradas caducadas.
- **Infraestructura**:
  - `plot_parser.py`: `defusedxml`, lista blanca (`areaValue`, `exterior`/`interior` de cada `PolygonPatch`), intercambio lat,lon a lon,lat; `ExceptionReport` «No se ha encontrado la parcela» o colección vacía: no encontrada; el resto de informes de excepción, XML inválido, anillos mal formados o fuera de los husos 28 a 31: no disponible.
  - `http_plot_gateway.py`: GET a `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` con `STOREDQUERY_ID=GetParcel`, `refcat` de 14 caracteres y siempre `srsname=EPSG::4326`.
  - `http_retry.py`: el criterio de red de RGB-24 (10 s, un reintento en red, tiempo agotado y 5xx; 4xx sin reintento) extraído a un módulo compartido; `HttpCadastreGateway` lo usa ahora (sin cambio de comportamiento, sus tests siguen en verde). `cadastre_parser._root` pasa a llamarse `parse_xml` para reutilizarlo.
  - `postgres_plot_cache.py` + migración **014_plot_cache.sql** (la 013 ya existía): tabla `plot_cache (study_id, reference de 14 caracteres, payload jsonb, fetched_at)`, clave `(study_id, reference)`, `protect_study_table` (RLS forzada), upsert, `REVOKE DELETE, TRUNCATE`.
- **API**: `GET /api/cadastre/{reference}/plot` en `cadastre_routes.py`; `plot_gateway` y `plot_unit_of_work` en `dependencies.py`. 200 con `{reference, geometry, computed_area_m2, cadastral_area_m2, difference_pct, area_warning, boundary_lengths_m, centroid}`; 422 (mensajes de RGB-18), 404 `plot_not_found` («No se encontró la parcela en el Catastro.») y 503 `cadastre_unavailable`.

## Decisiones
- **Pedir siempre `EPSG::4326`** y medir con una proyección local propia (UTM del huso del centro del recuadro de la parcela). No se añade pyproj a los requisitos: los valores esperados de los tests se calcularon una vez con pyproj 3.3.0 fuera del repo y están fijados como constantes.
- **Superficie plana en el plano UTM** (sin corregir el factor de escala): es el mismo tipo de plano con el que el Catastro calcula la oficial; la corrección elipsoidal sería hasta un 0,08 %, por debajo del error de redondeo de las coordenadas.
- **Origen local en los productos del área y del centroide**: con northings UTM de 4,5e6 los productos cruzados pierden centímetros (el centroide del cuadrado de prueba salía 1,7 cm desplazado); se restan las coordenadas del primer vértice antes de sumar.
- **Lindes**: segmentos de cada anillo exterior y, a continuación, los de sus huecos (también son lindes con otras parcelas), en el orden del servicio. `centroid` va como `[lon, lat]`.
- **Huso**: el del centro del recuadro de longitudes de los anillos exteriores; una parcela fuera de los husos 28 a 31 no se puede medir y se trata como no disponible (ruta manual).
- **HTTPS**: el plan indicaba `http://`; el servicio responde también por `https://` (probado) y es lo que usa RGB-24, así que se usa HTTPS.
- Una colección sin parcelas (`numberMatched="0"`) cuenta como no encontrada; cualquier otro `ExceptionReport` (p. ej. «Invalid length of REFCAT parameter») como no disponible, para no mostrar un «no existe» ante un fallo del servicio.
- La caché guarda el JSON del modelo (entradas y medidas), nunca el GML; al leer se recalculan las medidas desde las entradas.

## Fixtures
`backend/tests/external_data/infrastructure/fixtures/`: `wfs_parcel_ok.xml` (parcela de prueba 4714805BC6841S en 4326, grabada con `curl` de solo lectura el 2026-11-01, sin modificar: geometría pública sin titularidad), `wfs_parcel_not_found.xml` y `wfs_exception_invalid.xml` (informes de excepción reales). `recorded.py` deriva de la grabada las variantes sintéticas (con hueco, con segundo parche, con campos de titular inyectados).

## Precisión medida
- Referencia independiente: pyproj sobre las mismas coordenadas grabadas (6 decimales) da 2905,9936 m² en EPSG:32631; nuestra proyección coincide con ese valor a menos de 0,01 m² y las coordenadas UTM con una precisión de un milímetro en 11 puntos de los husos 28 a 31.
- Frente a la superficie oficial (2.908 m²): **2.905,99 m², error de 0,07 % (unos 2 m²)**. Con las coordenadas en 25830 sin redondear el propio Catastro da 2.907,85 m²; la diferencia restante viene de usar el plano de un huso local sobre coordenadas WGS84 de resolución ~11 cm.
- **Tolerancia del test: 0,25 %** (unos 7 m²): 3,5 veces el error observado y diez veces por debajo del umbral de aviso (3 %).
- El centroide calculado coincide con el `cp:referencePoint` del servicio a menos de 2e-5 grados (2 m).

## Resultados
Ver el final de este archivo (se rellena al terminar la suite).

- `ruff check backend` y `ruff format backend`: limpios.
- Tests nuevos: 147 (36 de UTM, 33 del modelo, 14 del caso de uso, 25 del analizador, 13 del gateway, 12 de la caché con Postgres real, 6 de rutas con dobles y 8 de rutas con Postgres real, incluida la prueba de pool de una conexión).
- `pytest backend` completo con Postgres real: **2565 passed** (8 min). Migración nueva: **014**.

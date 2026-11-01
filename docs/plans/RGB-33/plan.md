# RGB-33: servicio de relieve (MDT de 5 m del IGN por ventana recortada)

Notion: https://app.notion.com/p/3fd444f747b381f28f44ca857b6aa55a · Depende de RGB-25 (perímetro INSPIRE, hecho). Alimentará el visor 3D (RGB-34, hoy con terreno sintético en `frontend/lib/relief.ts`).

## Investigación previa (2026-11-01)
Probado a mano contra el servicio público (solo lectura, parcela de prueba 4714805BC6841S0001FY):
- **WCS de la IDEE:** `GET https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=Elevacion4258_5&CRS=EPSG:4258&BBOX=<lon_min,lat_min,lon_max,lat_max>&WIDTH=<n>&HEIGHT=<n>&FORMAT=ArcGrid`, sin clave, ~0,25 s. **El formato se llama `ArcGrid`** (`ASCII_GRID` y `ASC` no existen: error `Unrecognized value for the FORMAT parameter`); también ofrece `GEOTIFFINT16`. `DescribeCoverage` anuncia el MDT de toda España (`low 0 0 / high 513872 361818` a ~5 m) y `nativeFormat="COG"`.
- **Respuesta ArcGrid** (`application/asc`): cabecera `ncols nrows xllcorner yllcorner dx dy` (en grados, EPSG:4258 ≈ WGS84) y filas de alturas en metros, **de norte a sur**. Para una ventana de unos 200 × 150 m con `WIDTH=20 HEIGHT=15` devolvió 300 valores de 18 a 68 m. Los errores del servicio llegan como `ServiceExceptionReport` XML con HTTP 200: no hay que fiarse del código HTTP.
- **Resolución:** `WIDTH`/`HEIGHT` son libres; para respetar los 5 m nativos se piden `ceil(ancho_m / 5)` × `ceil(alto_m / 5)` celdas (con tope).
- **Hallazgo de paso:** con 5 m el relieve real de esta parcela es muy superior al que veía Open-Meteo (malla de 90 m). Una pendiente calculada sobre el MDT de 5 m sería mucho mejor que la de RGB-26: queda como seguimiento (no se toca RGB-26 aquí).

## Alcance
- Entrada: referencia catastral, margen (0, 10, 25, 50, 100 m) y lado máximo (100, 200, 300, 500 m); cualquier otro valor → 422.
- Ventana = caja de la parcela (de `GetPlotGeometry`, RGB-25) + margen; si algún lado supera el lado máximo, la ventana se **centra en el centroide** con ese lado y se marca `clipped: true`. Cálculo de la ventana en metros con la proyección local de RGB-25 y paso de vuelta a grados.
- Petición WCS solo de esa ventana (nunca el territorio completo), rejilla de ~5 m con tope de celdas razonable y documentado.
- Salida: `{reference, window {min_lon, min_lat, max_lon, max_lat, width_m, height_m}, grid {ncols, nrows, cell_size_m, values (norte→sur), min_m, max_m}, outline (perímetro recortado a la ventana, GeoJSON), clipped, parcel_clipped}`; `parcel_clipped` indica si la parcela quedó cortada por la ventana.
- Caché por referencia y ventana (30 días, por estudio, con RLS, tabla nueva y siguiente migración libre), sin conexión de la base abierta durante la llamada externa; cliente httpx (15 s, un reintento), parser ArcGrid propio (sin dependencias nuevas), errores `ExceptionReport` → no disponible.
- API: `GET /api/cadastre/{reference}/relief?margin=&max_side=`; 422 (mensajes de RGB-18 y parámetros), 404 `plot_not_found`, 503 `relief_unavailable` («No se pudo obtener el relieve. Puedes seguir sin el visor 3D.»); lectura abierta al estudio.

## Criterios de aceptación
- Una parcela rústica de 9 ha con lado 200 m devuelve una ventana de 200 × 200 m y marca «recortada».
- Tests con respuesta WCS grabada (sin llamadas reales en CI); la fixture ArcGrid es la grabada de la parcela de prueba (geometría y alturas públicas).

## Fuera de alcance
Conectar el visor 3D del front (`frontend/lib/relief.ts` sigue sintético hasta una tarea de front posterior, RGB-34b), pendiente calculada con el MDT.

## Flujo
Back: TDD, `ruff`, suite completa con Postgres real, PR, merge, migración en producción y despliegue de la API.

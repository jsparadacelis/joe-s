# RGB-33: registro de implementación (backend)

Servicio de relieve: MDT de 5 m del IGN por ventana recortada. Plan e investigación del WCS en [plan.md](plan.md). Todo con TDD (cada pieza tras un test en rojo), sin llamadas reales en CI. El front (`frontend/lib/relief.ts`) no se ha tocado: sigue sintético hasta RGB-34b.

## Qué se hizo

- **Dominio** (`backend/app/external_data/domain/`):
  - `clipping.py`: `Rectangle` y `clip_ring_to_rectangle` (Sutherland–Hodgman sobre un anillo cerrado, en metros), `ring_area`. Conserva la orientación y el vértice de partida; devuelve `[]` si no queda área.
  - `relief.py`: `ReliefOptions` (margen y lado máximo validados, `cache_key`), `ReliefWindow` (grados + metros, `grid_size`), `plan_relief_window` → `WindowPlan` (ventana, perímetro recortado, `clipped`, `parcel_clipped`), `ElevationGrid` (valores, `min_m`, `max_m`) y `Relief` (lo que se cachea y se sirve).
  - `plot.py` gana la propiedad pública `utm_zone` (antes privada); el cálculo de la ventana usa la misma proyección UTM local que RGB-25/26.
  - `errors.py`: `ReliefUnavailable` (`relief_unavailable`, «No se pudo obtener el relieve. Puedes seguir sin el visor 3D.»), hereda de `CadastreError` para que las rutas la contesten con 503 sin tocar `_rejected`.
  - `ports.py`: `ReliefGateway` y `ReliefCache`.
- **Aplicación**: `GetRelief` (misma forma que `GetTerrainProfile`: caché de 30 días, transacciones cortas, ninguna conexión abierta durante la llamada al WCS ni al INSPIRE; un acierto de caché no necesita ni la parcela).
- **Infraestructura**: `HttpReliefGateway` (WCS 1.0.0 `GetCoverage`), `arcgrid_parser.py` (lector propio, sin dependencias), `PostgresReliefCache`. `http_retry.build_client` acepta ahora un tiempo de espera (por defecto sigue en 10 s, así que los demás clientes no cambian); el WCS usa 15 s con un reintento.
- **Migración `016_relief_cache.sql`** (la 015 ya existía): `relief_cache (study_id, reference[14], window_key, payload, fetched_at)`, clave primaria `(study_id, reference, window_key)`, `window_key` con `CHECK` de las combinaciones válidas (`m<margen>-s<lado>`), `protect_study_table` (RLS forzada), upsert y `REVOKE DELETE, TRUNCATE`. **Hay que aplicarla en producción antes de desplegar la API.**
- **API**: `GET /api/cadastre/{reference}/relief?margin=&max_side=` en `cadastre_routes.py`, cableado en `dependencies.py` (`relief_gateway`, `relief_unit_of_work`).
- **Fixtures** (`backend/tests/external_data/infrastructure/fixtures/`, grabadas en solo lectura el 2026-11-01): `wcs_arcgrid_ok.asc` (la ventana de la parcela de prueba 4714805BC6841S con margen 25 y lado 300: 25 × 27 celdas, de 18,2 a 54,0 m) y `wcs_service_exception.xml` (`ServiceExceptionReport` real de pedir un `FORMAT` inexistente).

## Contrato de la API

`GET /api/cadastre/{reference}/relief?margin=25&max_side=300`

- `reference`: 20 caracteres (como el resto de rutas de `/api/cadastre`); si son solo 14, 422 `plot_reference_only`.
- `margin` (m, por defecto **25**): 0, 10, 25, 50 o 100. `max_side` (m, por defecto **300**): 100, 200, 300 o 500. Cualquier otro entero: 422 `invalid_relief_margin` («El margen debe ser 0, 10, 25, 50 o 100 metros.») o `invalid_relief_max_side` («El lado máximo debe ser 100, 200, 300 o 500 metros.»). Un valor que no es entero: 422 `invalid_request` (mensaje genérico de la API).
- Lectura abierta a cualquier miembro del estudio (como el resto de `/api/cadastre`).
- Errores, siempre `{"detail": {"code", "message"}}`: 422 (referencia, `margin`, `max_side`), 404 `plot_not_found`, 503 `cadastre_unavailable` (no hay perímetro) o **503 `relief_unavailable`** («No se pudo obtener el relieve. Puedes seguir sin el visor 3D.»), 401 sin sesión.

Respuesta 200 (los `values` se acortan aquí; son `ncols × nrows`):

```json
{
  "reference": "4714805BC6841S",
  "window": {
    "min_lon": 0.03866314, "min_lat": 38.63959584,
    "max_lon": 0.04014612, "max_lat": 38.64081273,
    "width_m": 125.0, "height_m": 131.18
  },
  "grid": {
    "ncols": 25, "nrows": 27, "cell_size_m": 5,
    "values": [36.752, 37.142, 37.002, 37.0, 37.247, 39.804, "..."],
    "min_m": 18.222, "max_m": 54.039
  },
  "outline": {
    "type": "Polygon",
    "coordinates": [[[0.038965, 38.64042], [0.039031, 38.640357], "...", [0.038965, 38.64042]]]
  },
  "clipped": false,
  "parcel_clipped": false,
  "plot_area_m2": 2905.99
}
```

- `window`: caja en grados (lon/lat, EPSG:4258 ≈ WGS84) que cubre la ventana, y su tamaño en metros (`width_m` × `height_m`, 2 decimales). Es el rectángulo de la ventana en el plano UTM de la parcela; la caja en grados lo envuelve (difiere en unos metros como mucho en 500 m por la convergencia de meridianos), así que `width_m`/`height_m` son los lados «nominales» y la rejilla cubre exactamente la caja en grados.
- `grid.values`: alturas en metros, `nrows` filas de `ncols`, **la primera fila es el norte** y dentro de la fila de oeste a este (fila 0 = norte, como `Relief.heights` del front). Un elemento es `null` si el modelo no tiene dato en esa celda (`NODATA_value`); `min_m`/`max_m` se calculan solo con las celdas con dato. Si ninguna celda tiene dato, 503.
- `grid.cell_size_m`: siempre 5 (resolución nativa del MDT, nominal; con `ceil` la celda real puede ser algo menor).
- `outline`: GeoJSON `Polygon` o `MultiPolygon` en `[lon, lat]`, el perímetro INSPIRE recortado a la ventana (exterior antihorario, huecos horarios); `null` si ninguna parte de la parcela cae dentro de la ventana (solo ocurre con una parcela de varias partes o cóncava, ventana centrada en el centroide).
- `clipped`: la ventana se limitó al lado máximo (algún lado de parcela + margen lo superaba) y se centró en el centroide. `parcel_clipped`: algún vértice de la parcela quedó fuera, es decir, el perímetro se cortó (puede haber `clipped` sin `parcel_clipped` cuando solo el margen excede el lado).
- `plot_area_m2`: superficie calculada de la **parcela entera** (no del trozo recortado), para `polygonSurface`.

### Equivalencias con `Relief` del visor (`frontend/lib/relief.ts`), para la tarea de front

| Visor | API |
|---|---|
| `viewWindow` (m locales) | `window` (grados) + `width_m`/`height_m`; el front proyecta con su origen local |
| `columns`, `rows` | `grid.ncols`, `grid.nrows` |
| `heights` (fila 0 = norte) | `grid.values` (igual orden; pueden venir `null`) |
| `perimeter` (m) | `outline` (GeoJSON en grados; a proyectar) |
| `polygonSurface` | `plot_area_m2` |
| `clamped` | `clipped` |
| `plotClipped` | `parcel_clipped` |
| `source` | no viene; el front pondrá «MDT 5 m, IGN» |

Los nombres de las claves JSON siguen el plan (`clipped`, `parcel_clipped`), no los del tipo del front; el cliente RGB-34b hará la traducción (a metros locales, etc.).

## Decisiones

- **Ventana.** Se calcula en metros en el plano UTM de la zona de la parcela (`Plot.utm_zone`): caja de todos los vértices exteriores + margen; si el lado resultante (redondeado al centímetro) supera el lado máximo, ese eje se centra en el **centroide ponderado por área** de la parcela (no la media de vértices del mock del front) con exactamente el lado máximo. Los ejes se deciden por separado. La caja en grados es el envolvente de las cuatro esquinas pasadas a lon/lat, con 8 decimales (~1 mm).
- **Tope de celdas.** `ceil(lado_m / 5)` por eje, mínimo 2 y **máximo 100** (`MAX_CELLS_PER_SIDE`). Con el lado máximo permitido de 500 m el tope no se alcanza nunca (500/5 = 100): es una red de seguridad por si algún día se admiten lados mayores, y limita la respuesta a 10.000 valores. Pedir `ceil` y no `round` evita que la ventana quede sin cubrir; la celda real mide ≤ 5 m.
- **Tamaño típico de la respuesta.** Parcela de prueba (2.906 m², margen 25): 25 × 27 = 675 celdas, 6 KB de JSON. Valores por defecto con una finca grande (300 × 300 m): 60 × 60 = 3.600 valores, unos 30 KB. Máximo (500 m): 10.000 valores con 3 decimales, unos 78 KB, más el perímetro. Es la caché la que guarda ese JSON tal cual (`payload`).
- **Clave de la caché.** `(estudio, referencia de parcela de 14 caracteres, window_key)` donde `window_key = m<margen>-s<lado>`. Las opciones fijan la ventana dado el perímetro, así que no hace falta la parcela para buscar en la caché (un acierto no toca INSPIRE, igual que el terreno). Consecuencia asumida: si el perímetro cambiase en Catastro dentro de los 30 días, la ventana en caché no se actualiza (misma ventana de 30 días que el resto de cachés; una entrada caducada nunca sirve de reserva). Las combinaciones válidas son 5 × 4 = 20 filas como máximo por parcela y estudio, sin borrado (`REVOKE DELETE`), como las otras cachés.
- **Recorte.** Sutherland–Hodgman sobre cada anillo. Con un anillo cóncavo cortado por la ventana puede dejar puentes de ancho cero por el borde de la ventana (el área es correcta y un renderizador relleno lo pinta bien); el mock del front hace lo mismo. Los huecos se recortan por separado: uno que cae fuera se descarta; uno que cruza el borde queda como anillo recortado (en reglas par-impar el resultado es correcto). Los anillos de menos de 0,01 m² se descartan. `parcel_clipped` mira si **algún vértice exterior** quedó fuera de la ventana (exacto para un rectángulo convexo).
- **Parser ArcGrid.** Cabecera con lista blanca (`ncols`, `nrows`, `xllcorner`/`yllcorner`/`xllcenter`/`yllcenter`, `cellsize`, `dx`, `dy`, `NODATA_value`, sin distinguir mayúsculas; clave repetida o desconocida → no disponible), `ncols`/`nrows` deben ser **los pedidos**, tantos valores como `ncols × nrows`, números finitos, alturas entre −500 y 9.000 m (como Open-Meteo), `NODATA_value` → `null`, cuerpo de hasta 1 MB. Cualquier cosa que no sea una rejilla (un `ServiceExceptionReport` con HTTP 200, HTML de mantenimiento, JSON) falla en la cabecera. La respuesta real no trae `NODATA_value`; el soporte está por si la ventana toca el mar o el borde del modelo.
- **Cliente.** `GET https://servicios.idee.es/wcs-inspire/mdt/?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=Elevacion4258_5&CRS=EPSG:4258&BBOX=…&WIDTH=…&HEIGHT=…&FORMAT=ArcGrid`, `BBOX` en notación fija de 8 decimales (nunca `1e-07`). La barra final antes de `?` la escribe httpx con ruta vacía; el servicio responde lo mismo (comprobado en vivo). 15 s y un reintento solo ante red, tiempo de espera y 5xx; cualquier 4xx, cuerpo ilegible o rejilla de otro tamaño → `relief_unavailable`.
- **Caché y conexiones.** Igual que RGB-25/26: transacciones cortas por acceso a la caché, ninguna conexión durante INSPIRE ni WCS. Hay una prueba con pool de una sola conexión y un WCS que espera: otra petición se completa mientras tanto.
- **Opciones inválidas antes que nada.** La ruta construye `ReliefOptions` antes de abrir la unidad de trabajo: una opción mal escrita nunca toca la caché ni los servicios.
- **Fuera de alcance (sin tocar).** Conectar el visor 3D, pendiente calculada con el MDT (seguimiento anotado en el plan), cambios en RGB-26.

## Cambios a código existente

`Plot.utm_zone` (propiedad pública nueva), `http_retry.build_client(…, timeout_seconds=10.0)` (parámetro opcional), `ports.py`, `errors.py`, `cadastre_routes.py` (`_rejected` también contesta 422 para `InvalidReliefOptions`) y `dependencies.py`. No se modificó ni debilitó ningún test existente.

## Resultados

- `ruff check backend` y `ruff format backend`: limpios.
- `pytest backend` completo con Postgres real (`DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`): **3456 passed** en 10 min 11 s, sin omitidos (2798 antes de RGB-33 en la tarea 26; el resto son de tareas intermedias y de esta).

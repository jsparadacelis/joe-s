# RGB-25: perímetro INSPIRE y geometría de la parcela

Notion: https://app.notion.com/p/3fd444f747b381218093f03c1e41d2d4 · Depende de RGB-24 (cliente del Catastro, hecho).

## Investigación previa (2026-11-01)
Probado a mano contra el servicio público (solo lectura, parcela de prueba 4714805BC6841S0001FY del propio criterio de aceptación):
- **`GET http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature&STOREDQUERY_ID=GetParcel&refcat=<14 o 20 caracteres>&srsname=EPSG::<n>`** responde 200 GML 3.2 (ISO-8859-1) **sin certificado**: `cp:CadastralParcel` con `cp:areaValue uom="m2"` (2908 para la parcela de prueba), `gml:MultiSurface` → `Surface` → `PolygonPatch` → `exterior/LinearRing/posList` (y `interior` para huecos si los hay) e `inspireId`. Con `numberMatched="1"`.
- **Sistemas de coordenadas:** solo `EPSG::25830` (UTM 30N, x y) y `EPSG::4326` (latitud, longitud; **orden lat lon**, 6 decimales ≈ 11 cm) se reconocen; otro valor se ignora y devuelve 4326. Con 25830 una parcela de otro huso (Canarias) da error «No se ha encontrado la parcela … para el huso 25830». **Decisión: pedir siempre `EPSG::4326`** (vale para todo el territorio y es lo que necesita GeoJSON, que va en lon/lat: invertir el orden) y calcular longitudes y superficie en metros con una proyección local (UTM del huso del centroide) en Python puro.
- **Precisión:** el área por la fórmula del polígono sobre las coordenadas en 25830 da 2907,85 m² (criterio: «unos 2.908 m²»). Con 4326 redondeado a 6 decimales el error esperado es del orden de ±0,5 %; el test fija una tolerancia explícita y la comparación con la superficie catastral (aviso al superar el 3 %) no se ve afectada.
- **Errores:** referencia sin parcela → HTTP 200 con `<ExceptionReport>` (`ExceptionText`: «No se ha encontrado la parcela …»); no hay que fiarse del código HTTP. La referencia de 14 posiciones (parcela) y la de 20 devuelven lo mismo (se usan los 14 primeros).

## Alcance
- Dominio `external_data`: `PlotGeometry` (anillo exterior e interiores en lon/lat, GeoJSON `Polygon`/`MultiPolygon` válido y cerrado), superficie calculada en m², superficie catastral oficial (`areaValue`), diferencia en % y aviso si supera el 3 %, longitudes de lindes (m) por tramo, centroide (lon, lat). Cálculo geodésico/proyectado en dominio puro, con tests de valores conocidos (UTM huso 28–31).
- Puerto `PlotGateway`, caso de uso `GetPlotGeometry` (valida con `validate_cadastral_reference`, usa los 14 primeros caracteres, caché de 30 días por referencia y estudio, llamada externa **sin conexión de la base abierta**, como RGB-24).
- Infraestructura: cliente HTTP (httpx, 10 s, un reintento), analizador GML con `defusedxml` (lista blanca de campos), `PostgresPlotCache` (tabla nueva con RLS, siguiente migración libre).
- API: `GET /api/cadastre/{reference}/plot` → 200 `{reference, geometry (GeoJSON), computed_area_m2, cadastral_area_m2, difference_pct, area_warning, boundary_lengths_m, centroid}`; 422 con los mensajes de RGB-18; 404 `plot_not_found`; 503 `cadastre_unavailable` («No se pudo consultar el Catastro. Introduce los datos a mano.»). Lectura abierta a cualquier persona del estudio.

## Criterios de aceptación
- Con la parcela 4714805BC6841S0001FY la superficie calculada da unos 2.908 m² (tolerancia fijada en el test).
- Tests con respuestas grabadas (sin llamadas reales en CI); la fixture conserva la geometría pública de la parcela de prueba (dato catastral no protegido, sin titularidad ni cliente).
- Sin titularidad en ninguna respuesta ni en la base de datos.

## Fuera de alcance
Conectar este resultado al dato técnico «Sup. de parcela (polígono)» y al visor (seguimiento junto con RGB-26, que añade altitud y pendiente: se cablearán las fuentes calculadas de una vez), dibujar el polígono en el front.

## Flujo
Back: TDD, `ruff`, suite completa con Postgres real, PR, merge, migración en producción y despliegue de la API.

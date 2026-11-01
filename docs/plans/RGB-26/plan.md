# RGB-26: altitud, pendiente y producción fotovoltaica

Notion: https://app.notion.com/p/3fd444f747b381fcabd5f2cdbcaf2cb9 · Depende de RGB-25 (polígono INSPIRE, hecho) y usa RGB-24 y RGB-28.

## Investigación previa (2026-11-01)
Probado a mano (solo lectura, coordenadas de la parcela de prueba 4714805BC6841S0001FY):
- **Open-Meteo Elevation**: `GET https://api.open-meteo.com/v1/elevation?latitude=a,b,c&longitude=x,y,z` → `{"elevation":[…]}` en metros, sin clave. **Máximo 100 coordenadas por petición** (400 `{"error":true,"reason":…}` si se supera). La malla es de ~90 m: puntos contiguos de una parcela de 2.900 m² devuelven 33 y 45 m, así que **la pendiente de parcelas pequeñas es una estimación gruesa**; se documenta y se muestra como «estimada».
- **PVGIS**: `GET https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=&lon=&peakpower=1&loss=14&outputformat=json` → `outputs.totals.fixed.E_y` en kWh/kWp·año (1.381,86 en la parcela de prueba), sin clave, ~0,8 s. **Por defecto asume paneles horizontales** (`slope 0`); decisión: pedir `optimalangles=1` (inclinación y orientación óptimas) con pérdidas del sistema 14 % (valor por defecto de PVGIS), que es la cifra de referencia habitual para comparar emplazamientos; los dos parámetros quedan documentados y son constantes con nombre.

## Alcance
- Dominio `external_data`: `Elevations` (centroide y vértices del polígono exterior), `Slope` (pendiente en % y categoría que **coincide con las opciones del catálogo del front/RGB-28**: «Llana (< 3 %)», «Suave (3–10 %)», «Moderada (10–20 %)», «Pronunciada (20–35 %)», «Muy pronunciada (> 35 %)», con los límites exactos del catálogo) y `PvYield`. Pendiente por la regla del PRD: diferencia máxima de altura entre los **dos vértices más alejados del centroide** y el centroide, partida por la distancia horizontal (metros, proyección de RGB-25), en %.
- Puertos `ElevationGateway` y `PvGateway`; casos de uso `GetTerrainProfile` (altitud, pendiente y categoría) y `GetPvYield`, con caché de 30 días por estudio (tabla nueva con RLS, siguiente migración libre; claves: referencia de 14 posiciones para el terreno, redondeo de la ubicación a 3 decimales para PVGIS), llamadas externas **sin conexión de la base abierta**.
- Infraestructura: clientes httpx (10 s, un reintento; lotes de ≤ 100 coordenadas), analizadores con lista blanca de campos; tests con respuestas grabadas y `httpx.MockTransport`, sin llamadas reales en CI.
- API: `GET /api/cadastre/{reference}/terrain` → `{altitude_m, slope_pct, slope_category, estimated: true}` y `GET /api/cadastre/{reference}/pv` → `{annual_kwh_per_kwp, assumptions}`; 422 con los mensajes de RGB-18, 404 `plot_not_found`, 503 `external_service_unavailable` («No se pudo consultar el servicio externo. Introduce el dato a mano.»).
- **Conexión con el dato técnico (RGB-28):** `RefreshTechnicalData` rellena además `altitude` (origen `open_meteo`), `slope` y `slopeType` (`calculated`), `pvProduction` (`pvgis`) y `polygonPlotArea` (`inspire`, de RGB-25). Cada fuente falla por separado: si INSPIRE, Open-Meteo o PVGIS no responden, **los datos del Catastro se guardan igual** y la respuesta lista las fuentes no disponibles (`unavailable`) sin tocar los campos afectados. Se mantienen las reglas de RGB-28 (editado y manual se conservan; lo no editado se sustituye y pierde la verificación si cambia; todo auditado). Las fuentes externas se piden fuera de la transacción.

## Criterios de aceptación
Todo con caché y tests con respuestas grabadas; el refresco con una fuente caída guarda las demás; categorías en los límites exactos (3, 10, 20 y 35 %).

## Fuera de alcance
Tablas del CTE y NCSE (RGB-27), capacidad edificable (RGB-30), alertas de cruce (RGB-31), dibujar nada en el front (la pantalla de RGB-51 ya muestra estos campos cuando tienen valor).

## Flujo
Back: TDD, `ruff`, suite completa con Postgres real, PR, merge, migración en producción y despliegue de la API.

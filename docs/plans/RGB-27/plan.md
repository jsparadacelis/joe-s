# RGB-27: tablas CTE y NCSE (zona climática, sismo, viento, nieve)

Notion: https://app.notion.com/p/3fd444f747b381cb8e9de13918a46a5d · Depende de RGB-28 (catálogo de datos técnicos).

## Alcance de esta entrega
Transcripción **determinista, sin IA y solo de lo leído en el documento oficial**, de **Barcelona (08) y Valencia (46)**, más funciones de dominio y tests. **No se cablea** en `RefreshTechnicalData` ni en rutas: la tarea exige revisión humana de la transcripción antes de pasar a Hecho; el cableado es una tarea posterior. Todo lo que no se pudo leer o es dudoso queda fuera o marcado `verify` y se lista en `implementation_log.md`.

## Fuentes (descargadas y leídas el 2026-11-01)
| Dato | Documento | URL | Dónde |
|---|---|---|---|
| Zona climática | CTE DB-HE, texto consolidado 14-06-2022 (RD 450/2022, corr. BOE 02-02-2023) | https://www.codigotecnico.org/pdf/Documentos/HE/DBHE.pdf | Anejo B, tabla a-Anejo B (p. 46 del PDF, 46 impresa) |
| Aceleración sísmica ab y K | NCSE-02, RD 997/2002 (BOE 244, 11-10-2002) | https://www.boe.es/boe/dias/2002/10/11/pdfs/A35898-35967.pdf | Anejo 1 (BOE p. 35949 y ss.; Barcelona p. 35955-35957, Valencia p. 35961-35963) |
| Zona de viento | CTE DB-SE-AE (portada «Abril 2009») | https://www.codigotecnico.org/pdf/Documentos/SE/DBSE-AE.pdf | Anejo D.1, figura D.1 (p. 27 del PDF): **mapa**, no tabla |
| Zona de clima invernal (nieve) | CTE DB-SE-AE | misma | Anejo E, figura E.2 (p. 46 del PDF): **mapa**, no tabla |
| Código INE de municipio | INE, relación de municipios a 1-1-2026 + tablas de modificaciones (cambios de denominación) | https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx y `.../codmun{AA}/{AA}codmunmod.htm` | para pasar los nombres de 2002 de la NCSE a código de 5 dígitos |

Hallazgo que cambia el enfoque: en el DB-SE-AE vigente la zona de viento y la de nieve **no son tablas por provincia/municipio sino mapas**. Se leen del mapa a nivel de provincia y se marcan `verify` (no son una lectura de tabla).

## Estructura de los datos (`backend/app/technical_data/tables/`)
Cada JSON lleva `meta`: `source` (`cte`/`ncse`, como el catálogo), `table` (texto citable), `document`, `url`, `version`, `transcribed_on`, `pages`, `sha256` del PDF leído, `notes`. Cada entrada lleva `status`: `ok` | `verify`.
- `climate_zones.json`: `provinces[<cpro>] = {name, status, bands: [{max_altitude_m, zone}]}` (última banda `max_altitude_m: null`).
- `seismic.json`: `provinces[<cpro>] = {name, municipality_codes: [...], below_threshold_status}`, `municipalities[<cpro+cmun>] = {name, name_in_source, ab, k, status, page}` y `unresolved[]` (entradas de la NCSE sin código INE).
- `wind_zones.json` y `snow_zones.json`: `provinces[<cpro>] = {name, value, status, note}`.

## Dominio (`backend/app/technical_data/domain/normative_tables.py`, Python puro)
`NormativeValue(value, source, table, status)` y `climate_zone(province_code, altitude_m)`, `seismic_acceleration(ine_code)`, `seismic_k(ine_code)`, `wind_zone(province_code)`, `snow_zone(province_code)`. Devuelven `None` si no está transcrito; nunca un valor por defecto, salvo la regla de la NCSE-02 («< 0,04 g» si el municipio no figura en el Anejo 1) para municipios que **existen** en una provincia transcrita; si en la provincia queda alguna entrada de la NCSE sin código INE, ese valor por defecto sale con `status: verify`. K solo existe cuando ab ≥ 0,04 g.
Altitud: la tabla está en metros enteros; se redondea al metro más cercano (decisión documentada, `verify`).

## Tests (rojo primero)
Esquema de los JSON (metadatos, `status`, tipos, bandas contiguas), casos conocidos leídos en la fuente (límites de altitud, municipios, municipio inexistente, provincia no transcrita), paridad con el catálogo de RGB-28 (todo valor devuelto ∈ opciones de `climateZone`, `seismicAcceleration`, `kCoefficient`, `windZone`, `snowZone`; `source` = el del catálogo) y test de arquitectura (el dominio sigue sin importar de fuera).

## Fuera de alcance
Cablear en `RefreshTechnicalData`/API, el resto de provincias, la revisión humana de la transcripción.

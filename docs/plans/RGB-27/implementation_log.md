# RGB-27: implementation_log

Fecha: 2026-11-01. Rama `rgb-27/technical-tables`. **Pendiente de revisión humana de la transcripción** antes de pasar la tarea a Hecho. No se ha cableado nada en `RefreshTechnicalData` ni en rutas (hay un test de arquitectura que lo impide hasta que se decida).

## Qué se hizo
- Datos en `backend/app/technical_data/tables/`: `climate_zones.json`, `seismic.json`, `wind_zones.json`, `snow_zones.json`, cada uno con `meta` (`source`, `table`, `document`, `url`, `version`, `transcribed_on`, `pages`, `sha256` del PDF leído, `notes`) y `status` `ok`|`verify` por entrada.
- Dominio puro `backend/app/technical_data/domain/normative_tables.py`: `climate_zone(province_code, altitude_m)`, `seismic_acceleration(ine_code)`, `seismic_k(ine_code)`, `wind_zone(province_code)`, `snow_zone(province_code)`, `all_codes()`. Devuelven `NormativeValue(value, source, table, status)` o `None`. `source` es el del catálogo (`cte`/`ncse`).
- Tests: `test_normative_tables.py` (casos leídos en la fuente, límites de altitud, municipio inexistente, provincia no transcrita, paridad con las opciones y la fuente del catálogo de RGB-28), `test_normative_tables_schema.py` (metadatos, estado por entrada, bandas, opciones, recuento de entradas) y un test en `test_architecture.py` (nada importa las tablas). Un test se ajustó tras escribirlo: la comprobación de `status` por entrada no se aplica a `provinces` de `seismic.json`, que solo agrupa municipios (su marca es `below_threshold_status`, con test propio); no se debilitó ninguna aserción sobre valores.
- Resultado: `ruff check` y `ruff format` limpios; `pytest backend` completo con Postgres real: **2859 passed** (7 min 42 s).

## Documentos leídos (descargados con curl el 2026-11-01, texto extraído con `pdftotext`)
1. **CTE DB-HE**, https://www.codigotecnico.org/pdf/Documentos/HE/DBHE.pdf, consolidado 14-06-2022 (sha256 en `meta`). Anejo B, tabla a-Anejo B, PDF p. 46. El texto extraído solo da el orden de los valores; **los límites de banda se obtuvieron de la geometría vectorial de las celdas (SVG de `pdftocairo`) y de la imagen de la página**: ver «Método».
2. **NCSE-02**, RD 997/2002, BOE 244 de 11-10-2002, https://www.boe.es/boe/dias/2002/10/11/pdfs/A35898-35967.pdf. Anejo 1 (BOE p. 35949 y ss.); Barcelona p. 35955-35957, Valencia/València p. 35961-35963.
3. **CTE DB-SE-AE** (portada «Abril 2009»), https://www.codigotecnico.org/pdf/Documentos/SE/DBSE-AE.pdf: Anejo D.1 (figura D.1, PDF p. 27) y Anejo E (figura E.2, PDF p. 46); también la tabla 3.8 (nieve por capitales) y las tablas E.1/E.2 (no usadas: dan temperatura y sobrecarga, no zona).
4. **INE**, `diccionario26.xlsx` (relación de municipios a 1-1-2026: 311 en Barcelona, 266 en Valencia) y las páginas de modificaciones `https://www.ine.es/daco/daco42/codmun/codmunAA/AAcodmunmod.htm` (AA = 01…26) para los cambios de denominación.

No hubo documentos inaccesibles. Lo que no existe en los documentos es una tabla por provincia/municipio para viento y nieve (ver límites).

## Qué se transcribió
| Tabla | Entradas | `ok` | `verify` |
|---|---|---|---|
| Zona climática | 2 provincias (Barcelona: C2 ≤250 m, D2 ≤450, D1 ≤750, E1 ≥751; Valencia: B3 ≤50, C3 ≤500, D2 ≤950, E1 ≥951) | 2 | 0 |
| Sismo ab y K | 511 entradas del Anejo 1 (290 Barcelona + 221 Valencia, cuadradas contra el recuento de «ab» y «K» del PDF; todas K = 1,0). 510 con código INE | 510 | 1 (sin código INE) |
| Sismo por defecto «< 0,04 g» | 22 municipios de Barcelona y 45 de Valencia que existen en el INE y no figuran en el Anejo 1 | 45 (Valencia) | 22 (Barcelona, ver abajo) |
| Viento | 2 provincias (Barcelona C, Valencia A) | 0 | 2 |
| Nieve | 2 provincias (Barcelona 2, Valencia 5) | 0 | 2 |

## Método y decisiones
- **Zona climática:** la tabla tiene celdas combinadas; el texto plano no dice cuántas columnas cubre cada valor. Se leyeron los bordes de columna y los rectángulos de cada celda del PDF y se contrastó con la imagen renderizada y con la posición del texto (centrado en su celda). Cabecera con errata impresa «111» (por 151). La altitud se redondea al metro (la tabla es en metros enteros): decisión nuestra, no de la norma.
- **Sismo:** el Anejo 1 está a dos columnas; se extrajo por coordenadas de palabra y se unieron los nombres partidos en dos líneas. Los nombres son los de 2002. Código INE: coincidencia por nombre normalizado (489 casos exactos) y, para 21 nombres cambiados, por las tablas oficiales de cambios de denominación del INE (campo `ine_match`; p. ej. Alfarp→Alfarb, Cabrera d'Igualada→Cabrera d'Anoia, Santa Maria de Corcó→L'Esquirol, Villanueva de Castellón→Castelló). Valores: `0,04`→`0,04 g`, etc.; K como en el catálogo («1,0»).
- «< 0,04 g» por defecto: solo para un código INE que existe en una provincia transcrita y no figura en el Anejo 1 (NCSE-02, 2.1). K no se devuelve en ese caso.
- Viento y nieve: **son mapas**, no tablas. Se lee la zona de la provincia a simple vista (Barcelona entera dentro de la C y de la zona 2; Valencia entera en la A y en la zona 5). Por eso todo es `verify`.

## Qué falta / pendiente de verificar
1. **Resto de provincias** de zona climática, sismo, viento y nieve (solo se hicieron Barcelona y Valencia). Ceuta, Melilla, Canarias y Baleares tienen reglas propias (p. ej. α3).
2. **Sant Joan de Mediona** (Barcelona, ab 0,05, K 1,0; BOE p. 35957): figura en el Anejo 1 pero el INE no tiene un municipio con ese nombre ni un cambio de denominación que lo lleve a un código actual (existen «Mediona», que también figura con 0,04, y «Sant Quintí de Mediona»). Está en `unresolved` y **no se puede consultar**. Mientras siga sin resolverse, el «< 0,04 g» por defecto de los 22 municipios de Barcelona no listados sale con `status: verify`, porque alguno podría ser el que corresponde a esa entrada.
3. **Viento y nieve de ambas provincias** (mapa de baja resolución): comprobar con un mapa oficial de mayor resolución o con el criterio de la Comunidad Autónoma. En Valencia, el sur de la provincia queda cerca del límite de la zona B de viento.
4. **Redondeo de la altitud** (decisión nuestra) y el caso de un emplazamiento cuya altitud sea el de la capital de provincia frente al del municipio: el DB-HE da la zona por provincia y altitud; si hay un documento reconocido de la Comunidad Autónoma que fije la zona por municipio, prevalece (el propio Anejo B lo permite) y no está transcrito.
5. **Actualizaciones posteriores** del Anejo 1 de la NCSE-02: no se ha comprobado de forma exhaustiva que no exista modificación; la ficha de la BOE solo cita referencias posteriores a otras normas (NCSP-07). La versión vigente del DB-SE-AE publicada hoy en codigotecnico.org es la de portada «Abril 2009»; tampoco se ha verificado si el texto lleva modificaciones posteriores.
6. **Municipios nuevos o fusionados** desde 2002: se mapean por el INE a 1-1-2026; un cambio de código INE no registrado en las tablas de denominación no se detectaría.
7. **Revisión humana** (criterio de la tarea): contrastar una muestra amplia de `seismic.json` con el BOE y las 4 bandas de cada provincia con el PDF del DB-HE, y el campo `ine_match` de las 21 entradas con cambio de nombre.

## Límites
Esto no sustituye al criterio técnico: son valores normativos con consecuencias técnicas y legales y siguen sin revisión humana. Nada se usa aún en la aplicación.

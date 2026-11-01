# RGB-24: cliente del Catastro en servidor con caché

Notion: https://app.notion.com/p/3fd444f747b381a885e9f039cc8bcc1e · Depende de RGB-18 (validación de la referencia, hecha).

## Investigación previa (2026-11-01)
Probado a mano contra el servicio público (solo lectura, referencia de ejemplo de la documentación del Catastro, sin datos de clientes):
- **`GET https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=<20 caracteres>`** responde 200 XML **sin certificado** (el servicio WCF documentado de Sede sí lo exige; este no). Trae `bico/bi`: identificación (`idbi/rc`), dirección (`dt`, `ldt`), provincia y municipio (`np`, `nm`), clase (`cn`: UR urbano / RU rústico), uso (`debi/luso`), superficie (`sfc`), año de construcción (`ant`) y `lcons/cons` con uso (`lcd`), planta (`dt/lourb/loint/pt`) y superficie (`dfcons/stl`). **No contiene titularidad** (ningún campo de nombre, NIF ni titular).
- **`.../OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=<14 caracteres>`** devuelve las coordenadas de la parcela (exige la referencia de 14 posiciones: los 14 primeros caracteres de la de 20).
- Los errores llegan como **HTTP 200** con `<lerr><err><cod>/<des>` (p. ej. 4 «no está correctamente formada», 17 y 18 de longitud); no hay que fiarse del código HTTP.
- La variante JSON (`OVCWcfCallejero/COVCCallejero.svc/json/...`) no se usó: respondió por parámetros distintos y sin documentación fiable; el XML es el contrato estable.
- Sin límite documentado oficialmente; una fuente de terceros menciona topes de uso. Por eso hay caché de 30 días, tiempo máximo de espera y un solo reintento.

## Alcance
- Dominio `external_data`: `CadastralProperty` (dirección, municipio, provincia, clase, uso, año de construcción, superficie construida, superficie de parcela, unidades constructivas `{uso, planta, m²}`, coordenadas WGS84) y puerto `CadastreGateway`. Errores `CadastreNotFound` y `CadastreUnavailable`. **Ninguna titularidad en el modelo.**
- Aplicación `GetCadastralProperty`: valida con `validate_cadastral_reference` (RGB-18), mira la caché (30 días por referencia), consulta el Catastro, guarda y devuelve. Si el servicio falla y hay una caché caducada, no la usa (los datos deben ser frescos o ausentes) y responde con la ruta manual.
- Infraestructura: cliente HTTP (httpx, tiempo máximo 10 s, un reintento en errores de red) y analizador XML con `defusedxml`; `PostgresCadastreCache` en tabla `cadastral_cache` por estudio con RLS (`protect_study_table`), clave `(study_id, reference)`, carga útil JSON del modelo de dominio (no el XML crudo).
- API: `GET /api/cadastre/{reference}` → 200 con el modelo; 422 `invalid_cadastral_reference` / `plot_reference_only` / `cadastral_reference_required` (mensajes de RGB-18); 404 `cadastral_reference_not_found`; 503 `cadastre_unavailable` con mensaje «No se pudo consultar el Catastro. Introduce los datos a mano.» Cualquier persona del estudio puede leer (acción READ).

## Criterios de aceptación
- Tests con respuestas grabadas (sin llamadas reales en CI); las respuestas grabadas llevan direcciones ficticias.
- Ningún dato de titularidad en la respuesta ni en la base de datos (test que lo comprueba sobre una respuesta grabada con campos de titular inyectados).

## Fuera de alcance
Perímetro INSPIRE (RGB-25), altitud (RGB-26), guardar los datos en el modelo de dato técnico (RGB-28) y conectar la pantalla de datos técnicos (seguimiento posterior).

## Flujo
Back: TDD rojo → verde → refactor, `ruff`, suite completa con Postgres real, PR, merge, migración en producción y despliegue de la API.

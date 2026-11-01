# RGB-24: registro de implementación (backend)

Rama `rgb-24/cadastre-client`. TDD estricto: cada pieza de producción se escribió tras un test en rojo.

## Qué se hizo
- **Dominio** `backend/app/external_data/domain/`: `CadastralProperty`, `BuildingUnit`, `PropertyClass` (`cadastral_property.py`, con `to_dict`/`from_dict` de lista blanca), errores `CadastreNotFound` (404) y `CadastreUnavailable` (503) en `errors.py`, puertos `CadastreGateway` y `CadastreCache` en `ports.py`. Sin titularidad en ningún modelo (test que revisa los campos).
- **Aplicación** `get_cadastral_property.py`: valida y normaliza con `validate_cadastral_reference`, caché de 30 días (`CACHE_MAX_AGE`), consulta, guarda y devuelve. Reloj inyectable. Una entrada caducada cuenta como ausente y nunca se usa de reserva.
- **Infraestructura**:
  - `cadastre_parser.py`: `defusedxml`, lista blanca de campos; quita los espacios de nombres; rechaza DTD/entidades.
  - `http_cadastre_gateway.py`: httpx, 10 s, un reintento (errores de red, tiempos agotados y 5xx), dos llamadas (`Consulta_DNPRC` con 20 caracteres y `Consulta_CPMRC` con los 14 primeros, `EPSG:4326`).
  - `postgres_cadastre_cache.py` + migración **012_cadastral_cache.sql**.
- **API**: `GET /api/cadastre/{reference}` (`cadastre_routes.py`), cableado en `dependencies.py` (`cadastre_gateway`, `cadastre_unit_of_work`) y `main.py`. Cualquier persona autenticada del estudio puede leer (no pasa por la política de acciones: es lectura de datos públicos).
- `httpx` pasa de `requirements-dev.txt` a `requirements.txt` y se añade `defusedxml`.

## Decisiones
- **XML y no JSON**: el XML (`OVCCallejero.asmx` / `OVCCoordenadas.asmx`) es el contrato documentado y estable; la variante JSON del WCF no tiene documentación fiable (ver el plan).
- **Errores como HTTP 200**: decide el cuerpo (`<lerr>`). Códigos «no existe» (9) y «mal formada» (4), verificados contra el servicio, más la descripción, dan `CadastreNotFound`; cualquier otro error del servicio, XML inválido, 4xx, 5xx o red dan `CadastreUnavailable`.
- **Fallo en la segunda llamada**: si el inmueble se encontró pero las coordenadas fallan (incluso con «no existe»), se responde `CadastreUnavailable`: no se cachea un resultado incompleto durante 30 días.
- **Caché por estudio** (`study_id, reference`) y no global: respeta la RLS y el aislamiento entre estudios sin tablas excepcionales; el coste es una consulta repetida por estudio. Guarda el JSON del modelo de dominio, nunca el XML.
- **Upsert, sin DELETE**: es un dato derivado y recuperable, no un registro de auditoría; una entrada caducada se sobrescribe. `REVOKE DELETE, TRUNCATE` para `rgb_app`; sí tiene UPDATE (necesario para el upsert).
- **Caducidad**: `fetched_at >= reloj - 30 días` (el límite exacto aún vale). El adaptador toma un reloj inyectable para tests deterministas.
- La llamada HTTP se hace dentro de la transacción del estudio (conexión ocupada hasta ~20 s en el peor caso); aceptable por el volumen y porque la caché va en la misma transacción. Una mejora posible: separar la transacción de lectura de la de escritura.
- Un solo `httpx.Client` por proceso (`lru_cache`) para reutilizar conexiones.

## Fixtures
`backend/tests/external_data/infrastructure/fixtures/*.xml`: grabadas con `curl` de solo lectura (2026-11-01) con la referencia de ejemplo de la documentación del Catastro y **sustituyendo** calle, número, código postal, municipio, provincia y coordenadas por valores ficticios («CL EJEMPLO 1», «MUNICIPIO DE EJEMPLO», 38.5 / -3.5). `recorded.py` las carga e inyecta campos de titular (`<titular>`, `<nif>`, `<nom>`) para el test de no filtración (parser, gateway y base de datos).

## Pendiente de verificar
- `plot_area_m2` se lee de `bico/lspr/spr/dspr/ssp` (suma de subparcelas), estructura conocida por la documentación pero **no vista en las respuestas reales probadas** (la del ejemplo urbano no la trae): el test usa un XML sintético. Si no aparece en producción, el campo queda `null`.
- Códigos de error adicionales de «no existe» podrían aparecer; el texto de la descripción actúa de red de seguridad.

## Resultados
- `ruff check backend` y `ruff format backend`: limpios.
- Tests nuevos: 101 en `external_data` + gateway/parser/caché, 7 + 4 de rutas, 1 de arquitectura (ver el total en el informe).
- `pytest backend` completo con Postgres real: **2183 passed** (6 min 58 s).

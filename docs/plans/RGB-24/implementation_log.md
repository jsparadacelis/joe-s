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
- **Transacciones cortas, sin conexión durante la llamada al Catastro** (corrección posterior): `GetCadastralProperty` recibe `open_cache`, una fábrica de unidades de trabajo cortas. Lee la caché y cierra la transacción; si no hay entrada fresca, llama al Catastro sin ninguna conexión abierta; y abre otra transacción solo para guardar. Con un pool pequeño (4), unas pocas consultas lentas (hasta ~20 s) habrían bloqueado toda la API. `cadastre_unit_of_work` ya no toma conexión: cada `open_cache()` abre su `study_transaction`. Tests: un doble que registra apertura/cierre comprueba `open, close, fetch, open, close` y que un error del servicio no abre la de escritura; y una prueba de ruta con pool de tamaño 1 en la que otra petición (respondida desde la caché) termina mientras el gateway espera (falla con el diseño anterior). Coste: dos transacciones en un fallo de caché; dos consultas concurrentes de la misma referencia pueden consultar el Catastro ambas (el upsert lo tolera).
- Un solo `httpx.Client` por proceso (`lru_cache`) para reutilizar conexiones.

## Fixtures
`backend/tests/external_data/infrastructure/fixtures/*.xml`: grabadas con `curl` de solo lectura (2026-11-01) con la referencia de ejemplo de la documentación del Catastro y **sustituyendo** calle, número, código postal, municipio, provincia y coordenadas por valores ficticios («CL EJEMPLO 1», «MUNICIPIO DE EJEMPLO», 38.5 / -3.5). `recorded.py` las carga e inyecta campos de titular (`<titular>`, `<nif>`, `<nom>`) para el test de no filtración (parser, gateway y base de datos).

## Pendiente de verificar
- `plot_area_m2` se lee de `bico/lspr/spr/dspr/ssp` (suma de subparcelas), estructura conocida por la documentación pero **no vista en las respuestas reales probadas** (la del ejemplo urbano no la trae): el test usa un XML sintético. Si no aparece en producción, el campo queda `null`.
- Códigos de error adicionales de «no existe» podrían aparecer; el texto de la descripción actúa de red de seguridad.

## Resultados
- `ruff check backend` y `ruff format backend`: limpios.
- Tests nuevos: 117 en `backend/tests/external_data` y las rutas del Catastro (12 de ellos con Postgres real, se omiten sin `DATABASE_URL`), más 1 de arquitectura.
- `pytest backend` completo con Postgres real: **2187 passed** (5 min).

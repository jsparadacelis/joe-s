# RGB-30: cálculo de capacidad edificable (backend)

Depende de RGB-28 (datos técnicos guardados). La regla vigente hoy es la del front (RGB-29,
`frontend/lib/capacity.ts`); este plan la lleva al servidor sin cambiarla y la fija con un JSON de
casos compartido.

## Alcance

- Dominio puro `compute_capacity` (aritmética exacta con `Decimal`, sin redondeo: el front tampoco
  redondea, solo formatea al mostrar).
- Entrada: los valores guardados por id de dato. Superficie de cálculo según `calcArea`:
  `Polígono` -> `polygonPlotArea`; `Catastral`, `Topográfico` o vacío -> `cadastralPlotArea`
  (el catálogo no tiene superficie topográfica; igual que el front).
- Salida: techo por edificabilidad, huella máxima, huella por plantas, techo máximo, condición
  limitante (empate -> edificabilidad), existente, porcentaje usado por lo existente, parcela
  mínima y su cumplimiento. Si falta un dato obligatorio no se inventa nada: se devuelve la lista
  de datos que faltan.
- Caso de uso `GetCapacity` y ruta de lectura `GET /api/projects/{code}/capacity` (cualquier
  persona del estudio; 404 si el proyecto no existe). Sin migración, sin escritura, sin auditoría.
- Se recalcula en cada lectura, así que cualquier cambio de planeamiento o superficie se refleja.

## Fuera de alcance (seguimiento)

- v1.1: envolvente edificable con el retranqueo más restrictivo (`streetSetback`,
  `boundarySetback`). Esta versión no usa los retranqueos.

## Paridad con el front

`backend/tests/technical_data/domain/capacity_cases.json`, leído por el test de back y por el
nuevo `frontend/__tests__/lib/capacity-parity.test.ts`.

## Archivos

- Nuevos: `backend/app/technical_data/domain/capacity.py`,
  `backend/app/technical_data/application/get_capacity.py`,
  `backend/tests/technical_data/domain/{capacity_cases.json,test_capacity.py}`,
  `backend/tests/technical_data/application/test_get_capacity.py`,
  tests de API de la ruta, `frontend/__tests__/lib/capacity-parity.test.ts`,
  `docs/plans/RGB-30/implementation_log.md`.
- Editados: `backend/app/api/technical_data_routes.py` (o ruta nueva), `dependencies.py`,
  `main.py`, `docs/arquitectura.md` si procede.

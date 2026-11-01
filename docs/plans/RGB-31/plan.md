# RGB-31: alertas de cruce entre datos (backend)

Depende de RGB-28 (datos técnicos guardados) y de la ficha del proyecto (RGB-17a). Las alertas
INFORMAN: nunca cambian datos ni estado, no escriben en base de datos ni en auditoría.

## Alcance

Dominio puro `evaluate_alerts(data, facts, config)` con una función por regla. Sin dato (vacío,
ausente o no numérico) no hay alerta. Se evalúa sobre el valor vigente (el editado, si lo hay).

1. `area_mismatch`: `cadastralPlotArea` frente a `polygonPlotArea`, diferencia relativa a la
   catastral > 3 % -> levantamiento topográfico.
2. `use_mismatch`: `use` frente al tipo de proyecto de la ficha -> posible cambio de uso.
3. `pre_1980_building`: `year` < 1980 -> estructura, amianto y normativa del edificio existente.
4. `steep_slope`: `slope` > 10 % -> topográfico y contenciones.
5. `municipality_mismatch`: `municipality` («MUNICIPIO (PROVINCIA)») frente a la ubicación de la
   ficha -> posible incoherencia.

`AlertConfig` (objeto con valores por defecto): umbral de diferencia de superficie (3 %), pendiente
(10 %), año (1980) y tabla de usos incompatibles por tipo de proyecto. Reglas de negocio «para
revisar con RGB». El almacenamiento de la configuración por estudio queda como seguimiento
(sin migración en esta tarea).

## Lectura

Caso de uso `GetAlerts` y `GET /api/projects/{code}/alerts` (cualquier persona del estudio, 404 si
no existe, sin auditoría). Se recalcula en cada lectura. Los datos de la ficha (tipo y ubicación)
vienen de un puerto nuevo `ProjectFactsReader` (LEFT JOIN a `opportunities`: un proyecto sin
oportunidad simplemente no tiene esos datos y esas reglas no saltan).

## Fuera de alcance

La visualización en el front («encima de los datos técnicos») es una tarea posterior.

## Archivos

- Nuevos: `backend/app/technical_data/domain/alerts.py`,
  `backend/app/technical_data/application/get_alerts.py`,
  `backend/app/technical_data/infrastructure/postgres_project_facts.py`,
  `backend/app/api/alerts_routes.py`, tests de dominio, aplicación, infraestructura y ruta
  (simulada y con Postgres), `docs/plans/RGB-31/implementation_log.md`.
- Editados: `domain/ports.py` (puerto), `application/use_cases.py`, `api/dependencies.py`,
  `api/main.py`, y los tests que construyen `TechnicalDataUseCases`.

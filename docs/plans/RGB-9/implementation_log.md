# RGB-9 · implementation_log

Rama: `feat/RGB-9-service-promotion`, desde `main` con RGB-8 mergeada. TDD: tests de dominio, aplicación, Postgres y API en rojo (módulos inexistentes), implementación, verde a la primera.

## Qué se hizo

- Dominio: `has_authority` / `who_can`, `ExitDeliverable.missing()`, errores de negocio con mensajes en español, puertos `LifecycleRepository` y `DeliverableValidator`. `RequestContext` gana `qualifications`; `Proyecto` gana `id`.
- Aplicación: `PromotionService` con `promote`, `hold` y `do_not_pursue`; devuelve una `Transicion`.
- Infraestructura: `PostgresLifecycle` (lee el proyecto con `FOR UPDATE`).
- API: rutas `POST /api/projects/{code}/promote`, `/hold` y `/do-not-pursue`; la dependencia `unit_of_work` abre una transacción por petición.
- Configuración de desarrollo: `DEV_ROL` y `DEV_HABILITACIONES`.
- Test de arquitectura: ningún paquete `ia` o `report` puede importar el ciclo de vida.

## Decisiones

- **Rechazos devueltos, no lanzados.** Si el servicio lanzara, la transacción se deshace y el intento rechazado se perdería de la auditoría. La API responde con el error después de confirmar.
- **Autoridad = rol o habilitación** (propuesta tomada por defecto mientras RGB-4 no existe): `socio_director` y `director_de_proyecto` por rol; `firmante_habilitado`, `direccion_facultativa` y `sponsor` por habilitación del usuario. Cambiar el criterio es tocar `authority.py`.
- **Orden de comprobaciones:** última fase / acción permitida → autoridad → entregable (o motivo). La autoridad va antes que el entregable para no revelar el estado a quien no puede actuar.
- **Rechazos solo en `audit_events`** (`resultado = rechazado`, con el código del error); `promotions` guarda solo acciones efectivas.
- **`do_not_pursue` solo registra la decisión**; qué hace la cartera con una oportunidad descartada es de RGB-16.
- **Validadores por fase:** el mapa `VALIDATORS_BY_PHASE` está vacío; cada tarea de fase registra el suyo. Hoy solo se exigen `complete` y `approved`.
- **Concurrencia:** `FOR UPDATE` serializa promociones simultáneas del mismo proyecto. No hay un test de concurrencia real; la garantía descansa en el bloqueo y en la unicidad `(project, phase, version)`.

## Verificación

- pytest 216 en verde; ruff limpio.
- Mutación: sin comprobar autoridad fallan 6, sin comprobar entregable 5, sin abrir la fase siguiente 3 y sin auditar rechazos 3.
- Probado contra Postgres real: efecto completo de promover, fallo a mitad que deshace todo, rechazos auditados, y que otro estudio no ve ni promueve el proyecto.

## No cubierto

- Lecturas para el front (`listarProyectos`, `obtenerProyecto`, `obtenerEntregable`): no estaban en RGB-9; llegan con la cartera (RGB-11).
- El contexto de desarrollo es ficticio hasta RGB-2.

## Código en inglés (mismo PR)

Por regla del proyecto, todo el backend pasó a inglés: paquetes (`study`, `audit`, `lifecycle`), clases, funciones, tablas y columnas (`studies`, `projects`, `phase_config`, `frozen_versions`, `promotions`, `audit_events`...), rutas (`/api/projects/{code}/promote|hold|do-not-pursue`), claves JSON, valores guardados (`promote`, `hold`, `do_not_pursue`, `rejected`, `green|amber|red`), comentarios, docstrings y tests.

- Se reescribieron en el sitio las migraciones 002 a 004 (`002_multistudy.sql`, `003_audit.sql`, `004_lifecycle.sql`) porque no hay ninguna base desplegada. **Quien tenga una base local debe recrearla:** `docker compose down -v`.
- Siguen en español los textos que ve la persona usuaria: mensajes de error de la API, etiquetas de «quién puede» y de «lo que falta», y los nombres y entregables de las fases (datos del PRD).
- Verificación tras el cambio: pytest 216 en verde, ruff limpio, Postgres recreado desde cero.

# RGB-9 · implementation_log

Rama: `feat/RGB-9-servicio-promocion`, desde `main` con RGB-8 mergeada. TDD: tests de dominio, aplicación, Postgres y API en rojo (módulos inexistentes), implementación, verde a la primera.

## Qué se hizo

- Dominio: `tiene_autoridad` / `quien_puede`, `EntregableDeSalida.faltantes()`, errores de negocio con mensajes en español, puertos `CicloDeVidaRepositorio` y `ValidadorDeEntregable`. `ContextoDeSolicitud` gana `habilitaciones`; `Proyecto` gana `id`.
- Aplicación: `ServicioDePromocion` con `promover`, `retener` y `no_perseguir`; devuelve una `Transicion`.
- Infraestructura: `PostgresCicloDeVida` (lee el proyecto con `FOR UPDATE`).
- API: rutas `POST /api/proyectos/{codigo}/promover`, `/retener` y `/no-perseguir`; la dependencia `unidad_de_trabajo` abre una transacción por petición.
- Configuración de desarrollo: `DEV_ROL` y `DEV_HABILITACIONES`.
- Test de arquitectura: ningún paquete `ia` o `reporte` puede importar el ciclo de vida.

## Decisiones

- **Rechazos devueltos, no lanzados.** Si el servicio lanzara, la transacción se deshace y el intento rechazado se perdería de la auditoría. La API responde con el error después de confirmar.
- **Autoridad = rol o habilitación** (propuesta tomada por defecto mientras RGB-4 no existe): `socio_director` y `director_de_proyecto` por rol; `firmante_habilitado`, `direccion_facultativa` y `sponsor` por habilitación del usuario. Cambiar el criterio es tocar `autoridad.py`.
- **Orden de comprobaciones:** última fase / acción permitida → autoridad → entregable (o motivo). La autoridad va antes que el entregable para no revelar el estado a quien no puede actuar.
- **Rechazos solo en `eventos_auditoria`** (`resultado = rechazado`, con el código del error); `promociones` guarda solo acciones efectivas.
- **`no_perseguir` solo registra la decisión**; qué hace la cartera con una oportunidad descartada es de RGB-16.
- **Validadores por fase:** el mapa `VALIDADORES_POR_FASE` está vacío; cada tarea de fase registra el suyo. Hoy solo se exigen `completo` y `aprobado`.
- **Concurrencia:** `FOR UPDATE` serializa promociones simultáneas del mismo proyecto. No hay un test de concurrencia real; la garantía descansa en el bloqueo y en la unicidad `(proyecto, fase, version)`.

## Verificación

- pytest 216 en verde; ruff limpio.
- Mutación: sin comprobar autoridad fallan 6, sin comprobar entregable 5, sin abrir la fase siguiente 3 y sin auditar rechazos 3.
- Probado contra Postgres real: efecto completo de promover, fallo a mitad que deshace todo, rechazos auditados, y que otro estudio no ve ni promueve el proyecto.

## No cubierto

- Lecturas para el front (`listarProyectos`, `obtenerProyecto`, `obtenerEntregable`): no estaban en RGB-9; llegan con la cartera (RGB-11).
- El contexto de desarrollo es ficticio hasta RGB-2.

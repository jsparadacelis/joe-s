# RGB-8 · implementation_log

Rama: `feat/RGB-8-modelo-ciclo-de-vida`, apilada sobre `feat/RGB-5-auditoria`. TDD: tests en rojo (módulos y tablas inexistentes), implementación, verde.

## Qué se hizo

- Migración `004_ciclo_de_vida.sql`: `fases_config` (8 fases sembradas con los textos del PRD, solo lectura), `proyectos`, `entregables_salida`, `versiones_congeladas`, `promociones` e `hitos_internos`, todas con `estudio_id` y la plantilla de RGB-3.
- Dominio en `backend/app/ciclo_de_vida/domain`: `FASES`, `Proyecto`, `VersionCongelada` y `Promocion`, con las mismas reglas que la base de datos.
- Un test compara `fases_config` con `FASES` para que no se desincronicen.

## Reglas y cómo se garantizan

| Regla | Dónde |
| --- | --- |
| Un proyecto solo está en una fase | `fase_actual NOT NULL` con FK a `fases_config` |
| «Activo» exige responsable, próximo hito, semáforo y fase | `CHECK activo_exige_datos` y `Proyecto` (error con lo que falta) |
| Versión congelada inmutable | Sin `UPDATE`/`DELETE`/`TRUNCATE` para `rgb_app` y disparador `rechazar_alteracion()` para el propietario |
| Promover va a la fase siguiente; retener y no perseguir exigen motivo; no perseguir solo en la fase 0 | `CHECK accion_coherente` y `Promocion` |
| Aprobado exige completo | `CHECK` en `entregables_salida` |
| Un hijo no cuelga de un proyecto de otro estudio | FK compuesta `(estudio_id, proyecto_id)` |

## Decisiones

- **Autoridad como clave** (`socio_director`, `director_de_proyecto`, `firmante_habilitado`, `direccion_facultativa`, `sponsor`), tal como el PRD. No coinciden con los seis `Rol`; el mapeo rol → clave queda para RGB-9 y RGB-4.
- **`promociones` también es solo inserción**, igual que las versiones: es un historial.
- **Una `CHECK` con `a_fase = de_fase + 1` no bastaba:** con `a_fase` nulo evalúa a NULL y pasa; se añadió `a_fase IS NOT NULL` (lo detectó la prueba de mutación).
- **Sin repositorios todavía:** el servicio de promoción (RGB-9) los define con lo que necesite.
- Hitos internos sin catálogo cerrado de tipos: el PRD los lista como ejemplos y no fija un conjunto.

## Verificación

- pytest 147 en verde; ruff limpio. Los tests de esquema tardan ~20 s porque cada uno aplica las migraciones en un esquema propio.
- Mutación: sin la regla de activo fallan 2, sin el disparador 3, sin el `REVOKE` 4, y sin `a_fase IS NOT NULL` 1.

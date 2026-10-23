# RGB-8 · Modelo Proyecto, Fase, Entregable de salida y Promoción

Tarea de Notion: https://app.notion.com/p/3fd444f747b381d99edee728ec45567d
Tipo: Datos · Épica E1 · P0 · Tamaño M. Depende de RGB-3 (mergeada) y RGB-5 (PR #12, apilada sobre su rama).

## Alcance

Migración `004_lifecycle.sql` y las reglas de dominio que la espejan. Sin servicio de promoción (RGB-9) ni repositorios.

| Tabla | Contenido | Reglas |
| --- | --- | --- |
| `phase_config` | Las 8 fases: nombre, entregable de salida y clave de autoridad. Configuración global, solo lectura para `rgb_app` | Sembrada por la migración con los textos del PRD (los mismos de `lib/phases.ts`) |
| `projects` | Código, nombre, fase actual, semáforo, próximo hito, responsable, en pausa, activo | Una sola fase (`current_phase NOT NULL`, FK a `phase_config`). «Activo» exige responsable, próximo hito y semáforo |
| `exit_deliverables` | Una fila por proyecto y fase; contenido jsonb, completo, aprobado | Único por proyecto y fase; aprobado exige completo |
| `frozen_versions` | Versión inmutable del entregable al promover | Solo inserción: permisos y disparador |
| `promotions` | De, a, acción (promover, retener, no perseguir), quién, cuándo, resultado, motivo | Solo inserción; retener y no perseguir exigen motivo; promover va a la fase siguiente; no perseguir solo desde la fase 0 |
| `internal_milestones` | Hitos dentro de una fase (contrato, arranque, licencia, visado, recepción) | No son estados |

Todas con `study_id` y la plantilla de RGB-3 (la tabla de configuración tiene política de solo lectura). Las tablas hijas referencian `(study_id, project_id)`, así un hijo no puede colgar de un proyecto de otro estudio.

Dominio (`backend/app/lifecycle/domain`): `PHASES` y `PhaseDefinition`, `Proyecto` con `Semaforo`, `FrozenVersion` y `Promocion`. Un test comprueba que `PHASES` coincide con `phase_config`.

## Decisión a confirmar

La autoridad por fase queda como **clave** (`socio_director`, `director_de_proyecto`, `firmante_habilitado`, `direccion_facultativa`, `sponsor`), tal como la define el PRD. Tres de esas claves («firmante habilitado», «dirección facultativa», «sponsor») no coinciden con los seis `Rol` de RGB-3. El mapeo rol → clave se resuelve en RGB-9 (política `AutoridadPorFase`) y RGB-4.

## Archivos

```
backend/migrations/004_lifecycle.sql
backend/app/lifecycle/domain/{phases,project,frozen_version,promotion}.py
backend/tests/lifecycle/domain/test_*.py
backend/tests/lifecycle/infrastructure/test_schema.py
```

## Criterios de aceptación

- [ ] Un proyecto solo puede estar en una fase.
- [ ] Las versiones congeladas no se pueden modificar (ni `rgb_app` ni el propietario).
- [ ] «Activo» exige responsable, fase, próximo hito y semáforo.
- [ ] Aislamiento por estudio en todas las tablas; `tables_without_rls()` vacía.
- [ ] pytest, ruff y CI en verde.

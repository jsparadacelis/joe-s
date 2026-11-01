# RGB-7: semillas de ejemplo ficticias y entorno de pruebas

Depende de los contextos ya construidos (study, opportunity, lifecycle, timing, technical_data,
briefing, access). Deja la app local en un estado de demostración reproducible.

## Alcance

`python -m backend.app.shared.seed_demo [--force]` (y `bash scripts/seed-demo.sh`) siembra:

- **1 estudio** «Estudio de demostración (ficticio)» con id propio y fijo
  (`00000000-0000-0000-0000-00000000de00`), distinto de `Settings.dev_study_id`.
- **9 personas** (`study_members`, estado `active`, `user_id` ficticio, correos `@example.com`):
  socio, director, director de proyecto, líder técnico, arquitecta, colaborador de obra,
  administración, un arquitecto firmante habilitado y una arquitecta con dirección facultativa;
  el socio además es sponsor. Sin cuentas de Supabase.
- **8 proyectos** ficticios: dos en fase 0 (uno con nota alta y otro bajo el umbral) y uno en cada
  fase de la 1 a la 6. Uno con pausa activa (fase 2) y otro con pausa vencida (fase 4); el resto
  con semáforo verde, ámbar o rojo.
- Asignaciones por proyecto (`project_members`) para las funciones de las fases 2 a 6.
- Referencias catastrales de 20 caracteres que pasan `validate_cadastral_reference` pero **no
  existen**: prefijo `FICT` (una real empieza por 7 dígitos), así que quedan marcadas y no pueden
  coincidir con una parcela real. Sin ningún dato de titularidad.

## Seguridad (innegociable, con tests)

1. `assert_demo_target` reutiliza `assert_local_database` y además se niega **siempre**, incluso con
   `--force`, si `ENVIRONMENT` es producción o el host parece Supabase/pooler. El mensaje nunca
   lleva la URL ni credenciales.
2. Usa un `study_id` propio. Si ese estudio existe con otro nombre, o coincide con
   `dev_study_id`, aborta. Toda la siembra corre como `rgb_app` con la RLS del estudio de
   demostración: no puede ver ni tocar otro estudio.
3. Solo correos `@example.com`, nombres inventados.
4. Quien actúa es la persona `seed` (`user_id = "seed"`) en promociones, scoring, pausas,
   asignaciones y auditoría. Nada de IA.

## Diseño

Usa los **casos de uso reales** con un `RequestContext` de `seed` (socio con todas las
cualificaciones) y una sola transacción (todo o nada):
`ManageMembers.invite` + activación por `resolve_member`, `CreateOpportunity`, `ScoringService`,
`StartProject`, `UpdateProjectSheet`/`PromoteProjectSheet`, datos técnicos con
`PostgresTechnicalData`, `UpdateBrief`/`PromoteBrief`, `PromotionService.promote`,
`ManageProjectMembers.assign`, `PauseService.pause` (con reloj inyectado para la pausa vencida).

Inserciones directas, justificadas: las fases 3, 4 y 5 aún no tienen casos de uso, así que su
entregable de salida se marca completo y aprobado con un contenido ficticio y se promueve con el
`PromotionService` real (congela la versión, registra la promoción y audita). Los campos de
seguimiento del proyecto (`responsible_id`, `next_milestone`, `traffic_light`, `active`) aún no
tienen caso de uso; se actualizan con un UPDATE y su evento de auditoría de `seed`.
El `PromotionService` necesita las funciones de proyecto de quien promueve: un lector
`SeedProjectRoles` entrega todas, igual que `DevProjectRoles` en modo `dev`.

**Idempotencia.** Los códigos de proyecto dependen del año, así que el control es de conjunto: si
el estudio de demostración ya tiene proyectos no se escribe nada. La auditoría es inalterable, así
que no hay «reset»: para reiniciar se recrea la base local (`docker compose down -v`).

**Arquitectura.** Los tests exigen que solo `api/dependencies.py` importe los adaptadores Postgres.
La siembra es un segundo punto de composición (un script de entrada): se declara en el test de
arquitectura como `COMPOSITION_ROOTS`, sin quitar ninguna regla.

## Archivos

- Nuevos: `backend/app/shared/demo_data.py` (datos puros), `backend/app/shared/seed_demo.py`
  (guardián, cableado, CLI), `scripts/seed-demo.sh`, tests en `backend/tests/shared/`,
  `docs/plans/RGB-7/implementation_log.md`.
- Editados: `backend/tests/test_architecture.py` (puntos de composición),
  `docs/despliegue.md` (sección «Datos de demostración»), `README.md`, `docs/estado.md`.

## Entrar a la demo

`AUTH_MODE=dev` con `DEV_STUDY_ID=00000000-0000-0000-0000-00000000de00`, `DEV_USER_ID`, `DEV_ROLE`
y `DEV_QUALIFICATIONS` de la persona elegida (tabla en `docs/despliegue.md`).

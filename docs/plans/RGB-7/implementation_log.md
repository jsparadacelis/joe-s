# RGB-7 · Registro de implementación

Rama `rgb-7/demo-seeds`. Semillas de demostración ficticias para el entorno local. TDD estricto: cada pieza nació de un test en rojo (guardián, datos puros, siembra sobre Postgres real, línea de órdenes, arquitectura).

## Qué se hizo

- `backend/app/shared/seed_demo.py`: guardián `assert_demo_target`, cableado de los casos de uso reales (punto de composición), `seed_demo()` y la CLI `python -m backend.app.shared.seed_demo [--force]`.
- `backend/app/shared/demo_data.py`: datos puros (estudio, 9 personas, 8 proyectos, 26 datos técnicos inventados, referencias catastrales ficticias, equipo por fase). Sin base de datos ni otros contextos.
- `scripts/seed-demo.sh`: Postgres local + migraciones + siembra, e imprime cómo entrar.
- `docs/despliegue.md` (sección «Datos de demostración»), `README.md`, `docs/estado.md`.
- Sin migración: la demostración usa las tablas existentes.

## Decisiones

1. **Casos de uso reales, una transacción.** Alta de oportunidad, scoring, `StartProject`, ficha (`UpdateProjectSheet`/`PromoteProjectSheet`), brief (`UpdateBrief`/`PromoteBrief`), `PromotionService`, `ManageProjectMembers`, `PauseService` e invitación de miembros (`ManageMembers` + `resolve_member`, la ruta real de acceso). Todo con un `RequestContext` de `seed` y bajo `study_transaction` (rol `rgb_app`, RLS del estudio de demostración). Si algo falla no queda nada; el test lo comprueba.
2. **Inserciones directas, solo donde no hay caso de uso:** el entregable de salida de las fases 3, 4 y 5 (marcado completo y aprobado con contenido ficticio y promovido después con el `PromotionService` real) y los campos de seguimiento del proyecto (`responsible_id`, `next_milestone`, `traffic_light`, `active`). Cada una deja un evento de auditoría de `seed` (`seed_finalize`, `seed_tracking`).
3. **`SeedProjectRoles`:** el servicio de promoción pregunta por las funciones de proyecto de quien actúa; `seed` no es una persona, así que las tiene todas (mismo patrón que `DevProjectRoles`). Las asignaciones reales de `project_members` se hacen aparte con `ManageProjectMembers` (que exige miembro activo y la cualificación de las funciones de firma).
4. **Pausa vencida:** `PauseService` recibe un reloj movido 40 días atrás para abrirla con fecha prevista pasada (la validación impide fechas anteriores a «hoy» del servicio).
5. **Idempotencia de conjunto.** Los códigos `PRY-AAAA-NNN` dependen del año, así que el control es «el estudio ya tiene proyectos». La auditoría es inalterable: no hay reset; se recrea la base local.
6. **Guardián en dos niveles.** `ENVIRONMENT` fuera de la lista de desarrollo y hosts con `supabase`/`pooler` se rechazan siempre (también con `--force`, también en listas de hosts y en `hostaddr`); después `assert_local_database`. Una URL ilegible se rechaza sin repetirla. Lista blanca y no lista negra: «desconocido» se trata como inseguro (por eso `staging` o un valor vacío también se rechazan).
7. **Arquitectura:** los tests exigían que solo `api/dependencies.py` importara los adaptadores Postgres. La siembra es un segundo punto de composición (script de entrada), así que se introdujo `COMPOSITION_ROOTS = ("api/dependencies.py", "shared/seed_demo.py")` en `test_architecture.py` (6 comprobaciones) y un test nuevo que fija que ese es el único añadido y que nada de la aplicación (API incluida) importa `seed_demo`. No se quitó ninguna regla.
8. **Test corregido, con motivo:** un caso del guardián (`host:notaport` con `--force`) esperaba una excepción, pero el guardián decide por host y no valida el puerto (un puerto inválido falla al conectar, no es un destino prohibido); se eliminó el caso, no se relajó ninguna comprobación.
9. **Fase 2 = borrador.** El proyecto en fase 2 tiene ficha v1 congelada, datos técnicos (parte sin verificar) y un brief sin aprobación del cliente, coherente con su pausa «Respuesta del cliente al brief».
10. **Entrar sin cuentas reales:** `AUTH_MODE=dev` con `DEV_STUDY_ID` y el `DEV_*` de la persona (tabla en `docs/despliegue.md`). En modo `dev` la autoridad por fase sale del rol de `.env`, no de `project_members`.

## Referencias catastrales

`FICT` + 4 dígitos + `DEMO` + los mismos 4 dígitos + `ZZZZ` (20 caracteres). Pasan `validate_cadastral_reference` y `is_fictitious_reference` las reconoce. Una referencia real empieza por 7 dígitos, así que nunca pueden coincidir con una parcela existente. No se consulta el Catastro ni se guarda titularidad alguna.

## Verificación

- Tests nuevos: guardián y CLI (`test_seed_demo_guard.py`), datos puros (`test_demo_data.py`), siembra sobre Postgres real (`test_seed_demo.py`: conteos, idempotencia, atomicidad, aislamiento RLS frente al estudio de desarrollo, auditoría solo de `seed`, `@example.com`, referencias marcadas, coherencia del ciclo de vida, pausas y semáforo, equipo, API de cartera) y `test_architecture.py`.
- `tables_without_rls()` sigue vacío después de sembrar.
- Suite completa de back: 3564 tests en verde (con Postgres real), `ruff check` y `ruff format` limpios.

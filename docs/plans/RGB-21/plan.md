# RGB-21 · Pausas con motivo, fecha prevista y reanudación (full-stack)

Tarea full-stack (P0, M, E4). Depende de RGB-20 (hecha: funciones puras del reloj en `backend/app/timing`). Desbloquea «en pausa» real en la cartera y, después, el reporte semanal (RGB-42). Orquestada como en RGB-13: contrato primero ([contract.md](contract.md)), dos frentes en paralelo, Integrador y Juez sobre la rama integrada. Ver [huecos-backend.md](../../huecos-backend.md).

Fuente: página RGB-21 del Backlog de Notion. Alcance: pausar con motivo (espera del cliente, espera de organismo, decisión interna, otra) y fecha prevista de reanudación; reanudar; aviso al director de proyecto si se pasa la fecha prevista. Criterios: solo el director de proyecto o la dirección pueden pausar o reanudar; la cartera muestra «en pausa» y la fecha prevista.

## Alcance

**Back (`backend/`)**
- Migración `007_pauses.sql`: tabla `pauses` (motivo, fecha de inicio, fecha prevista, fecha de reanudación, quién la abrió y quién la cerró), con RLS y una única pausa abierta por proyecto.
- Contexto `timing`: entidad `Pause` (reutiliza `PauseReason` de `timing/domain`), autoridad (project_director, director y partner), casos de uso `pause_project` y `resume_project` en una transacción con RLS que mantiene `projects.paused` y escribe auditoría (también los rechazos de permiso, como la promoción).
- `POST /api/projects/{code}/pause`, `POST /api/projects/{code}/resume`, `GET /api/projects/{code}/pauses`.
- `GET /api/portfolio` gana el campo aditivo `pause` por proyecto.

**Front (`frontend/`)**
- Cartera: la fila en pausa muestra «En pausa», la fecha prevista de reanudación y «Vencida» (con los días de retraso) si se pasó.
- «Plan y tiempos» de un proyecto real: panel de pausa activa e historial, botones «Pausar proyecto» (formulario con motivo y fecha prevista) y «Reanudar», con el 403 en español. Corrige de paso el texto de un proyecto real con fase mayor que 0: «Sin calcular», no «Sin plan hasta promover» (seguimiento del Juez de RGB-13).
- Los `PRY-EJ-00N` de ejemplo mantienen sus pausas de ejemplo y no muestran los botones (no existen en la base).

## Supuestos provisionales

1. «Dirección» = `director` y `partner`; la autoridad por rol real llega con RGB-2/RGB-4.
2. Una oportunidad (fase 0) no se puede pausar: aún no tiene reloj; se puede desde la fase 1.
3. Fechas en UTC; la fecha prevista no puede ser anterior a hoy.
4. **El aviso diario al director de proyecto queda fuera de este PR**: no existe canal de avisos (correo, notificaciones) ni planificador. Lo que sí se entrega: el indicador «Vencida» con los días de retraso en la API, la cartera y «Plan y tiempos». Queda como seguimiento.
5. Sin plan base confirmado (RGB-16) no hay semanas planificadas: «Plan y tiempos» de un proyecto real solo muestra la pausa e historial, con las semanas «Sin calcular».

## Criterios de aceptación

- [ ] Solo `project_director`, `director` y `partner` pueden pausar y reanudar; otro rol recibe 403 en español y queda auditado.
- [ ] Pausar valida motivo y fecha (422 con `field`), no permite pausar dos veces ni una oportunidad; reanudar cierra la pausa; `projects.paused` queda coherente; todo en una transacción con RLS (aislamiento A/B) y auditoría.
- [ ] La cartera muestra «En pausa» y la fecha prevista; si se pasó, «Vencida» con los días.
- [ ] «Plan y tiempos» de un proyecto real muestra la pausa activa y el historial, y permite pausar/reanudar con errores accesibles; textos de proyecto real con fase > 0 corregidos.
- [ ] Back: TDD/DDD, `ruff` y `pytest backend` en verde. Front: `lint`, `typecheck`, `test`, `build` en verde. Accesible, español, solo tokens, sin datos reales.
- [ ] Prueba de punta a punta con la API real y el build real: alta de oportunidad → promoción por API a fase 1 → pausar → cartera en pausa → reanudar; 403 con otro rol; contra Cloud Run solo lectura.
- [ ] Pantallazos en `docs/plans/RGB-21/screenshots/` (claro y oscuro).

Fuera de alcance: aviso diario (ver supuesto 4), semanas planificadas por proyecto (RGB-16), editar una pausa cerrada, pausar fases futuras, roles reales (RGB-4).

## Flujo

Skill de orquestación (borrador local): contrato → frentes en worktrees (`feat/RGB-21-back`, `feat/RGB-21-front`) → Integrador (`feat/RGB-21-integration`) → Juez (Opus) → PR único con pantallazos, merge con checks en verde (autorizado hasta nuevo aviso), documentos, Notion, memoria y página de estado.

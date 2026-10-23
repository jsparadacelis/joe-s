# RGB-20 · implementation_log

Rama: `feat/RGB-20-active-clock`. TDD: tests en rojo (módulo inexistente), implementación, verde.

## Qué se hizo
- `backend/app/timing/domain/time_tracking.py`: funciones puras `summarize_time` y `phase_spans_from_entries`, `to_weeks`, `PhaseSpan`, `PauseSpan`, `PauseSegment`, `PhaseTime`, `TimeSummary`, `PauseReason` y errores `InvalidSpan` / `OverlappingPauses`.
- 43 tests en `backend/tests/timing`, incluido el ejemplo del PRD (3 + 4 + 5: 8 semanas activas en 12 de calendario) y la pausa que cruza un cambio de fase (se reparte entre las dos).

## Decisiones (ver plan)
Se calcula en días con tramos semiabiertos y se informa en semanas con un decimal half-up. Desviación: fases cerradas con signo y la fase en curso solo por su exceso. Fase 0 sin reloj. Pausas y fases solapadas se rechazan.

## Verificación
pytest 317 en verde (con Postgres); ruff limpio. Mutaciones: sin restar la pausa fallan 6, sin repartir entre fases 3, con crédito de la fase en curso 4, y con redondeo hacia abajo 2 (este último lo detectó solo tras añadir casos 4 y 6 días).

## No cubierto
Persistencia y ruta HTTP: llegan con RGB-21 (pausas). El plan de cada proyecto lo aporta RGB-16.

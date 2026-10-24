# RGB-20 · Reloj activo por fase y calendario

Tarea de Notion: https://app.notion.com/p/3fd444f747b381c699f5d745a5a64e70
Tipo: Backend · Épica E4 · P0 · Tamaño M. Depende de RGB-9 y RGB-15 (mergeadas). Bloquea RGB-21.

## Alcance

Funciones puras (sin base de datos) en `backend/app/timing/domain/time_tracking.py`:

- **Entradas:** tramos de fase (`PhaseSpan`: fase, inicio, fin o abierto), tramos de pausa (`PauseSpan`: inicio, fin o abierta, motivo), las semanas del plan (7 valores, fases 1 a 7) y la fecha de referencia `as_of` para los tramos abiertos.
- **`summarize_time(...)`** devuelve, por fase, días y semanas activas y de pausa frente al plan; el reparto de cada pausa por fase y motivo; total activo, total de pausa, calendario total y desviación.
- **`phase_spans_from_entries(...)`** deriva los tramos de fase a partir de las fechas de entrada en cada fase (las promociones de RGB-9).

El reloj activo para: las pausas restan días activos, no días de calendario. Una pausa que cruza un cambio de fase se reparte entre las dos fases.

Fuera de alcance: guardar y gestionar pausas (RGB-21), calcular las semanas del plan de cada proyecto (RGB-16) y la ruta HTTP que lo expone (se cablea en RGB-21, cuando existan las pausas). El front (RGB-22) ya consume este contrato con datos de ejemplo.

## Decisiones

- **Se calcula en días y se informa en semanas con un decimal** (días / 7, half-up). Las sumas se hacen en días para que los totales cuadren; el redondeo solo se aplica al presentar.
- **Los tramos son semiabiertos** `[inicio, fin)`: la fase siguiente empieza el día en que termina la anterior, sin contar ese día dos veces.
- **Tramos abiertos** terminan en `as_of`. Una fecha de inicio posterior a `as_of` se rechaza (dato incoherente).
- **Fase 0 sin reloj:** el plan cubre las fases 1 a 7; los tramos de la fase 0 y las pausas fuera de cualquier fase 1 a 7 no cuentan.
- **Desviación** (positivo = retraso): suma de (activas − plan) de las fases ya cerradas, más el exceso de la fase en curso sobre su plan, nunca un crédito. Una fase sin terminar no compensa un retraso anterior. Es una decisión propia: el PRD solo dice «desviación frente al plan». Los datos de ejemplo del front no siguen una regla única (por ejemplo, +1 en PRY-EJ-001 saldría +2), y se sustituyen por la API.
- **Zona horaria:** el cálculo trabaja con fechas. Al leer las promociones se convertirá `created_at` a la fecha en `Europe/Madrid` (RGB-21).
- **Pausas solapadas** y tramos de fase solapados o repetidos se rechazan con un error.
- **Motivos de pausa:** `client_wait`, `authority_wait`, `internal_decision`, `other`. RGB-21 los reutiliza.

## Archivos

```
backend/app/timing/domain/time_tracking.py
backend/tests/timing/domain/test_time_tracking.py
```

## Criterios de aceptación

- [ ] Test del ejemplo 3 + 4 + 5 = 8 semanas activas y 12 de calendario.
- [ ] Una pausa que cruza un cambio de fase se reparte correctamente.
- [ ] pytest, ruff y CI en verde.

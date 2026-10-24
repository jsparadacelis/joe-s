# RGB-14 · Registro de la integración

Rama `feat/RGB-14-integration` (de `main`, con `feat/RGB-14-back` y `feat/RGB-14-front` fusionadas sin conflictos). Contrato: [contract.md](contract.md). Registros por frente: [backend-log.md](backend-log.md), [front-log.md](front-log.md).

Honestidad sobre los roles: en el back y en el front, los cuatro roles (Escritor de tests, Desarrollador, Tester y verificación) los ejecutó una sola sesión por frente, en secuencia, sin subagentes independientes. La integración la hizo otra sesión. No hay Juez independiente: el veredicto sigue pendiente.

## Discrepancias halladas y corregidas (tests primero)

1. **Mensaje 422 de pesos.** El front decía «Cada peso debe ser un número mayor que 0 y como máximo 10, con hasta 2 decimales.» y la API «Los 7 pesos son obligatorios y deben ser números mayores que 0 y de hasta 10, con un máximo de 2 decimales.». El mensaje del umbral ya coincidía. El front adopta el de la API (la API manda); los dos tests del front que fijaban el texto antiguo se actualizaron al nuevo (corrección de una constante, no se debilitaron). Test nuevo en el back, `test_scoring_front_parity.py`, que comprueba que `frontend/lib/scoring.ts` contiene los mensajes exactos de `InvalidWeights` e `InvalidThreshold`. El front sigue mostrando tal cual el mensaje del servidor cuando este rechaza.
2. **Redondeo.** El servidor usa `Decimal` con half-up. El cliente usaba `Math.round` sobre un producto en coma flotante. Fixture compartido `backend/tests/opportunity/domain/score_cases.json` (44 casos: 14 empates exactos como 56,25 y 30 más, con pesos como 0,05, 0,07 o 0,33, generados con la fórmula del servidor). Lo leen el test del back y `scoring.test.ts`. La fórmula antigua del cliente difería en 1 de los 44 casos (error de coma flotante). `computeScore` pasa a aritmética entera en centésimas (`floor((2n + t) / 2t)` sobre décimas): empates half-up y sin error de flotante. El servidor es la referencia.

## Verificación

- `ruff check backend` y `ruff format --check backend`: limpios (149 archivos).
- `pytest backend` con Postgres local (migraciones hasta la 008): 910 passed (865 de la rama back + 45 nuevos de paridad).
- Front: `lint` y `typecheck` sin avisos; `jest`: 67 suites, 1479 tests (1435 de la rama front + 44 de paridad); `build` en verde con `/projects/[code]/scoring`.

## Prueba de punta a punta

Postgres local `back-db-1` (sin `down -v`), migraciones hasta la 008, API uvicorn en el 8000 y `next build` + `next start` en el 3000 con `NEXT_PUBLIC_API_URL=http://localhost:8000`. Playwright, `es-ES`, claro y oscuro, datos ficticios. Flujo:

1. Alta de oportunidad en `/opportunities/new` (código `PRY-2026-001`); ficha de fase 0 con el enlace «Puntuar oportunidad» que lleva a `/projects/PRY-2026-001/scoring`.
2. Puntuar 4-4-3-5-3-4-3: en vivo 74,3 y «perseguir»; guardar: versión 1, nota 74,3, pesos 1 y umbral 60.
3. En `/settings`: peso de Presupuesto 9 y umbral 90 (204).
4. Scoring anterior sin cambios (versión 1: 74,3, pesos 1, umbral 60, comprobado por API y en pantalla).
5. Mismas valoraciones con los ajustes nuevos: versión 2, nota 88,0, «no perseguir» (umbral 90); historial v2, v1.
6. 422 reales del servidor (cuerpo alterado en el navegador): pesos (`invalid_weights`, mensaje de la API en pantalla) y rating de Plazo = 9 (`invalid_ratings`, «La puntuación de «Plazo» debe ser un entero entre 1 y 5.» junto al campo). El servidor no guardó nada (2 filas tras el 422).
7. 409 real: con `PRY-2026-002` abierta en fase 0 se promovió a fase 1 por SQL local y se guardó: «Solo se puede puntuar una oportunidad (fase 0).». Al recargar, la página pide fase 0. Por API: 409 `not_an_opportunity`, 422 de pesos y de umbral y 404 `project_not_found`, con los mensajes del contrato.

Pantallazos: [screenshots/](screenshots/), sufijo `-real` (`opportunity-created`, `phase0-link`, `scoring-empty`, `scoring-live`, `scoring-saved`, `settings-scoring-before`, `settings-scoring-saved`, `scoring-old-unchanged`, `scoring-live-new-weights`, `scoring-history`, `settings-scoring-422`, `scoring-422`, `scoring-409`, `scoring-past-phase`), claro y oscuro, página completa a 1280 px. Los anteriores (sin `-real`) son del stub del frente.

Cloud Run: no se tocó (ni lectura de estas rutas: aún no tiene el back de RGB-14).

## Limpieza local

Base local vaciada de `opportunity_scorings`, `scoring_settings`, `opportunities` y los dos proyectos de prueba en transacciones únicas que desactivan y reactivan los triggers de usuario de esas tablas, solo en local; nada en código de producción. `audit_events` no se tocó. Servidores parados.

## Decisiones

- El servidor manda en mensajes y redondeo; el cliente solo anticipa.
- El 422 de pesos del servidor no nombra el criterio, así que el front marca los siete (se ve en `settings-scoring-422-real-*`).

## Seguimientos

- Desplegar migración 008 en Supabase y el backend en Cloud Run.
- Permisos por rol (RGB-2, RGB-4).
- Veredicto independiente del Juez (no hecho).
- Opcional: que el 422 de pesos incluya `field` para marcar solo el peso afectado.
- Recomendación de scoring en RGB-16/17; no cambia el estado del proyecto.
- No verificado: Supabase/Cloud Run, anchos móviles de los pantallazos reales (solo 1280 px; el frente verificó 1024 y 800 con stub).

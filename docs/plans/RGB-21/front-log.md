# Registro del frente FRONT · RGB-21 Pausas

Rama `feat/RGB-21-front` (sobre `feat/RGB-21`). Contrato: [contract.md](contract.md), sin cambios. Solo se tocó `frontend/` y este directorio. Los roles (Escritor de tests, Desarrollador, Tester) se hicieron en secuencia en una sola sesión (no había herramienta de subagentes): tests en rojo (commit `0be1b8e`) y después la implementación.

## Qué se hizo

- `frontend/lib/pauses.ts`: tipos (`ProjectPause`, `ProjectPauses`, `PauseSummary`), `fetchPauses`, `pauseProject`, `resumeProject` sobre `lib/api.ts`, mapeo snake_case a camelCase y de `client_wait` a `client-wait` (el vocabulario de `lib/timing.ts`; un motivo desconocido se muestra como «Otra»), `validatePause` con los mismos mensajes del contrato (se permite la fecha de hoy), `overdueText` («Vencida hace N día(s)»), `todayUtc`.
- `frontend/components/timing/PauseManager.tsx` (cliente): panel «Pausa activa» (motivo, desde, reanudación prevista, chip «Vencida hace N días») con «Reanudar»; confirmación dentro de la página (`role="group"`, foco en «Confirmar reanudación», «Cancelar» devuelve el foco; sin `confirm()`); «Pausar proyecto» abre el formulario (Motivo, Fecha prevista de reanudación); historial de pausas cerradas. Errores de campo (validación en cliente y 422 con `field`) con `role="alert"`, `aria-invalid`, `aria-describedby` y foco en el campo; 403/409/422 sin campo y red en un aviso `role="alert"` enfocado junto a la acción; «Guardando…», botón deshabilitado y doble envío protegido; avisos de éxito (`role="status"`) y foco tras pausar (encabezado «Pausa activa») y tras reanudar (botón «Pausar proyecto»). El estado local se actualiza con la respuesta de la API (no hay `router.refresh`).
- `app/projects/[code]/plan-and-timing/page.tsx`: un proyecto real (no `PRY-EJ-00N`) con fase mayor que 0 muestra «Semanas del plan: Sin calcular» y el `PauseManager`; solo la fase 0 muestra «Sin plan hasta promover» (defecto del Juez de RGB-13 corregido). Si `GET .../pauses` falla se muestra su mensaje en un aviso y el resto de la página sigue. Los `PRY-EJ-00N` no cambian ni tocan la red. `lib/projects.ts` exporta `isSampleProject`.
- Cartera: `PortfolioRow.pause` (`null` si falta o es nulo, también con `status` paused). La fila en pausa muestra el chip «En pausa», «Reanudación prevista el dd/mm/aaaa» y, si `overdue`, «Vencida hace N día(s)» en texto (color `bad` más texto). Resumen y filtros no cambian (el contrato no lo implica). La región con scroll y los enlaces se mantienen.
- `components/ui/Button.tsx`: acepta `ref` (React 19 lo pasa como prop).

## Tests

- Nuevos: `lib/pauses`, `lib/portfolio-pause`, `PauseManager` (estructura, validación, errores, doble envío, confirmación, historial, axe), `PortfolioTablePause`, `app/plan-and-timing-real`.
- Ajustados (justificado): los fixtures de la cartera (`portfolio-rows`, `portfolio-sample`) ganan `pause` (el contrato añade el campo; `PRY-EJ-003` lleva su pausa de ejemplo) y el test de forma exacta de `fetchPortfolio` incluye la clave nueva. Ningún test se debilitó.
- Resultado: `npm --prefix frontend run lint`, `typecheck`, `test` (63 suites, 1344 tests) y `build` en verde.

## Prueba en navegador real

Build real (`next start`, puerto 3000) contra un stub FUERA del repo que implementa el contrato (GET `/api/portfolio`, GET `/api/projects/{code}`, `pauses`, `pause`, `resume`, CORS, y proyectos de ficción que provocan 403 al pausar, 409 al pausar, 403 al reanudar, 422 con `field`, pausa vencida y pausa sin fila). Playwright con `locale: "es-ES"`, claro y oscuro, axe sin violaciones en cada estado (cartera, sin pausa, formulario, errores, 422, guardando, pausa activa, confirmación, reanudada con historial, 403/409, vencida). Comprobado: cartera con «En pausa», fecha prevista y «Vencida hace 4 días», pausa con `pause` nulo solo con el chip, foco al abrir el formulario y al primer error, un único POST con doble clic, sin `window.confirm`, fase 0 con «Sin plan hasta promover» y sin botones, `PRY-EJ-003` con su muestra y sin botones. Pantallazos en [screenshots/](screenshots/) (`front-*.png`).

## Desviaciones del contrato y decisiones

- Ninguna desviación. El front usa `current_phase` de `GET /api/projects/{code}` para decidir fase 0 y no llama a `/pauses` en ese caso (el back respondería 422 al pausar).
- Se valida en cliente que la fecha no sea anterior a hoy con la fecha UTC del navegador; el back sigue mandando (puede haber desfase de huso cerca de medianoche UTC y el mensaje del servidor se muestra tal cual).
- El `Pause` de `lib/timing.ts` (muestra de PRY-EJ) y `ProjectPause` conviven; no se unificaron para no tocar el plan de ejemplo.
- Reanudar y pausar actualizan solo la página; la cartera se vuelve a pedir al entrar (es dinámica en cliente).

## No verificado / seguimientos

- Nada contra el back real ni Cloud Run: solo el stub. Repetir el recorrido en la integración (en especial los mensajes 403/409/422 reales y CORS).
- Las semanas planificadas de un proyecto real siguen en «Sin calcular» hasta RGB-16.
- El aviso diario al director de proyecto queda fuera (supuesto 4 del plan).

# RGB-12 · Por promover (servidor) · registro de implementación

Parte de servidor hecha con TDD (rojo, verde, refactor). El front (tabla y contador de la barra
lateral) queda para la parte de front.

## Contrato de la API

`GET /api/to-promote` · solo lectura (otros métodos: 405) · abierta a cualquier persona del
estudio · 401 sin token · el estudio sale de la sesión (RLS): nunca se ve otro estudio.

```json
{
  "ready_count": 2,
  "projects": [
    {
      "code": "PRY-2026-001",
      "name": "Vivienda unifamiliar Los Almendros (demo)",
      "phase": 0,
      "phase_name": "Oportunidad",
      "deliverable": "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas",
      "state": "ready",
      "reason": null,
      "promoter": "Socio o director",
      "can_promote": true
    },
    {
      "code": "PRY-2026-003",
      "name": "Rehabilitación Casa del Molino (demo)",
      "phase": 1,
      "phase_name": "Inicio",
      "deliverable": "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)",
      "state": "in_progress",
      "reason": "Falta: Referencia catastral, Alcance incluido, Alcance excluido y 10 más.",
      "promoter": "Socio o director",
      "can_promote": true
    },
    {
      "code": "PRY-2026-004",
      "name": "Edificio de 12 viviendas Calle Muestra (demo)",
      "phase": 2,
      "phase_name": "Briefing y concepto",
      "deliverable": "Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada",
      "state": "blocked",
      "reason": "En pausa; reanudación prevista el 21/11/2026.",
      "promoter": "Director de proyecto",
      "can_promote": false
    }
  ]
}
```

Campos de cada elemento de `projects` (todos siempre presentes):

| Campo | Tipo | Significado |
| --- | --- | --- |
| `code`, `name` | texto | Proyecto. |
| `phase`, `phase_name` | número 0 a 6, texto | Fase actual y su nombre. |
| `deliverable` | texto | Entregable de salida de la fase (texto del PRD, `phase_config`). |
| `state` | `"ready"`, `"in_progress"`, `"blocked"` | Estado, ver reglas. |
| `reason` | texto o `null` | `null` si está listo; si no, por qué no (Spanish, breve). |
| `promoter` | texto | Quién promueve la fase: «Socio o director» (0-1), «Director de proyecto» (2-3), «Firmante habilitado» (4-5), «Dirección facultativa» (6). |
| `can_promote` | booleano | Si la persona que consulta puede promover ese proyecto hoy, según `can(PROMOTE)` (rol en el estudio y funciones en el proyecto). No depende del estado del entregable. |

`ready_count` es el número de elementos con `state = "ready"` y es lo que debe mostrar el
contador de la barra lateral (también con la lista vacía: `{"ready_count": 0, "projects": []}`).

### Orden

1. `ready`, después `in_progress`, después `blocked`.
2. Dentro de cada grupo, antigüedad en la fase: primero el que lleva más tiempo (entrada en la
   fase = última promoción registrada con resultado correcto hacia esa fase; si no hay, la
   creación del proyecto).
3. Empate: por `code`.

### Textos de `reason`

- En curso: `Falta: A, B, C.` (hasta tres elementos) o `Falta: A, B, C y N más.`
  - Fase 0: `Scoring de la oportunidad`.
  - Fase 1: etiquetas de los campos obligatorios sin valor de la ficha (por ejemplo `Referencia catastral`).
  - Fase 2: etiquetas del brief (`Necesidades`, `Programa`, `Condicionantes`, `Presupuesto objetivo`, `Plazo`) y `Datos técnicos obtenidos`, `Aprobación del cliente registrada`.
  - Fases 3 a 6: `entregable de salida`, `entregable de salida completo`, `aprobación del entregable` y lo que devuelva el validador de la fase.
- Bloqueado: `En pausa; reanudación prevista el DD/MM/AAAA.`, con ` (vencida)` antes del punto si la fecha ya pasó, o `En pausa.` si no hay fecha.

## Reglas de estado (para revisar con RGB)

1. Se listan las fases 0 a 6. Quedan fuera la fase 7 (Cierre: no hay fase siguiente) y los
   proyectos con una decisión «no perseguir» registrada.
2. `blocked`: el proyecto está en pausa (prevalece sobre todo lo demás).
3. `ready`: sin pausa y los requisitos de la fase pasarían hoy, reutilizando las reglas existentes
   sin duplicarlas:
   - fase 0: hay un scoring guardado (lo que exige `StartProject`; no se mira la recomendación);
   - fase 1: la ficha tiene todos sus campos obligatorios (`build_sheet` + `missing_required_labels`);
   - fase 2: `completeness(...).blockers()` vacío (campos del brief, datos técnicos obtenidos,
     aprobación del cliente registrada);
   - fases 3 a 6: entregable completo y aprobado (`ExitDeliverable.missing`) y el validador de
     `VALIDATORS_BY_PHASE` si lo hay.
   En las fases 0 a 2 las marcas `complete/approved` solo se escriben al promover, por eso allí se
   evalúan las reglas de contenido y no las marcas.
4. `in_progress`: el resto.
5. Ninguna ruta de esta vista escribe, audita ni promueve.

## Estructura

- Dominio: `backend/app/to_promote/domain/{readiness,candidate,ports}.py`
- Aplicación: `backend/app/to_promote/application/{missing,queue}.py`
- Infraestructura: `backend/app/to_promote/infrastructure/{postgres_candidates,postgres_role_directory,dev_role_directory}.py`
- Ruta y composición: `backend/app/api/to_promote_routes.py`, `dependencies.py`, `main.py`
- Consultas por petición: 4 lecturas en bloque (proyectos con pausa, antigüedad y entregable;
  fichas de la fase 1; datos técnicos y última consulta de la fase 2) y 1 de funciones por
  proyecto de la persona. No crece con el número de proyectos (test con 35 proyectos).
- En `AUTH_MODE=dev` las funciones salen del rol de estudio y las cualificaciones ficticias, como
  en `DevProjectRoles`; en `supabase`, de las asignaciones reales.

## Pruebas

Ver el recuento al final de este archivo. Datos propios más la semilla de demostración (RGB-7):
con ella salen 8 proyectos (2 listos en fase 0, 4 en curso, 2 bloqueados por pausa).

## Recuento

106 pruebas nuevas (dominio 30, casos de uso 16 + 15, Postgres 17, rutas 12 con dobles + 14 con Postgres).
Suite completa del backend: 3670 pruebas en verde con `DATABASE_URL` local; `ruff check` y
`ruff format` limpios.

## Tester (RGB-12b, front)

Verificación sobre la rama `rgb-12b/to-promote-screen` (sin tocar código de producción ni tests).

### Resultado de las comprobaciones

- `tsc --noEmit`: limpio. `npm run lint`: 0 errores (3 avisos previos en tests ajenos). `npm run build`: correcto, `/to-promote` se genera como estática.
- `npm test` (jest, suite completa): 118 suites, 2736 pruebas en verde. En esta pasada no apareció el fallo intermitente de `TechnicalDataEditorConnected` (ver abajo).
- Pantallazos de `screenshots-12b/` revisados: corresponden a la interfaz real (contador «2», 8 filas en el orden del servidor, chips con texto además de color, motivo bajo el estado, «(vencida)», marca «Puedes promover» solo en las filas con `can_promote`; la vista de arquitecto no muestra la marca). Claro y oscuro presentes y legibles. No se regeneraron.

### Criterios del plan contra el código

| Criterio | Resultado |
| --- | --- |
| `fetchToPromote`, tipos, etiquetas, `invalid_to_promote_response`, `ApiError` propagado | Cumple |
| Tabla con encabezados y título, código como enlace a `/projects/{code}`, fase con nombre, entregable | Cumple |
| Chip por estado (texto + tono), motivo bajo el estado, «Quién promueve», marca «Puedes promover» | Cumple |
| Vacío, carga y error con «Reintentar» (mensaje del servidor) | Cumple |
| Sin botones que promuevan | Cumple |
| Contador junto a «Por promover» con `aria-label`, oculto con 0 o error, no rompe la barra, se actualiza al navegar | Cumple |
| Solo con sesión supabase o en modo dev | Cumple (`canCallApi`) |
| Solo tokens de color, textos en español, código en inglés | Cumple |

### Intentos de romperla

- XSS: nombre, entregable, motivo y promotor se pintan como texto de React (sin `dangerouslySetInnerHTML`); el código del proyecto va en `href` bajo `/projects/` (no puede formar `javascript:`). Sin hallazgo.
- Estado desconocido: etiqueta «Estado desconocido» y tono neutro; `Object.hasOwn` evita claves como `constructor`/`__proto__`. Sin hallazgo.
- Respuesta mal formada (campos ausentes, tipos erróneos, `projects` no array): 502 `invalid_to_promote_response` con mensaje en español. Sin hallazgo.
- 401/403/503 y fallo de red: aviso con el mensaje del servidor o el genérico, y «Reintentar» funciona; el contador queda oculto sin romper la barra.
- Lista vacía y `ready_count` 0: estado vacío y sin badge. Texto muy largo: `break-words` y región con desplazamiento horizontal y foco por teclado. Lista larga: sin paginación, solo filas simples (el servidor ya la acota por estudio).
- Teclado y lector: enlaces con foco visible, región enfocable con nombre, `th` y `caption`, badge con `aria-label` singular/plural.

### Defectos y observaciones

1. Baja. El estado «Cargando…» de `ToPromoteView` es un `<p>` sin `role="status"`/`aria-live`; el lector no anuncia ni la carga ni el cambio a la tabla o al error. Sugerencia: `role="status"` en el párrafo y `role="alert"` ya implícito en `Notice` si lo tiene.
2. Baja. Si `ready_count` no coincide con los elementos `ready` de la lista (servidor), el badge y la tabla discreparían; es contrato del servidor, no del front.
3. Cosmética. En los pantallazos de página completa la barra lateral termina a la altura del viewport (comportamiento de captura, no defecto de la interfaz).
4. Cobertura de pantallazos: faltan los casos vacío, error y móvil. No bloquean (el vacío y el error tienen pruebas); regenerar solo si el Juez lo exige.

### Prueba intermitente `TechnicalDataEditorConnected`

No pertenece a esta rama: el diff contra `main` no toca `technical-data` ni su componente. En la suite completa de esta rama pasó; aislada, pasa. Se intentó confirmarlo en `main` con un `git worktree` en el scratchpad (suite completa en serie); resultado: en `main`, en serie, 112 suites y 2646 pruebas en verde (el fallo no se reprodujo ni en `main` ni en esta rama, ni aislado), así que solo se observa bajo carga en paralelo. Es un problema de temporización bajo carga.

### Recomendación

Aprobar. Sin defectos de severidad media o alta; el punto 1 es una mejora menor opcional.

## Juez (RGB-12b, front)

Veredicto: APROBADO.

- Verificación propia: `jest` sobre to-promote, ReadyCountBadge y Sidebar: 7 suites, 94 pruebas en verde; `tsc --noEmit` limpio.
- Criterios del plan contra el código: cumplidos (lib con validación e `invalid_to_promote_response`, tabla accesible con enlace, chips con texto, motivo, marca «Puedes promover», vacío/carga/error con «Reintentar», contador con `aria-label`, oculto con 0 o fallo, se actualiza con `pathname`, condición `canCallApi`).
- Cobertura: cada archivo de producción nuevo (`lib/to-promote.ts`, `ToPromoteTable`, `ToPromoteView`, `ReadyCountBadge`, cambio en `Sidebar` y `page.tsx`) tiene tests escritos antes. El único test existente modificado (`pages.test.tsx`) excluye «Por promover» de los placeholders con justificación, y la página tiene su propio test; no se debilita nada.
- Reglas de CLAUDE.md: código en inglés, UI en español, solo tokens de color, la vista solo hace GET (no promueve ni escribe).
- Pantallazos: existen en `screenshots-12b/` (claro y oscuro, vista de socio, arquitecto y director) y corresponden al cambio (contador «2», 8 filas, chips, motivos, marca).
- Observaciones no bloqueantes: «Cargando…» sin `role="status"`; faltan pantallazos de vacío/error/móvil (cubiertos por tests).

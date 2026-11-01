# RGB-32 · Registro de implementación (parte de servidor)

Rama `rgb-32/brief-and-promotion`. Parte de backend de la tarea full-stack: el brief manual de la fase 2 y su promoción a 3 · Anteproyecto. TDD estricto (rojo, verde, refactor) por capa: dominio puro, casos de uso con `create_autospec`, Postgres real (RLS, carrera, atomicidad) y rutas con dobles y con Postgres real. **Sin migración** (el borrador vive en `exit_deliverables.content` de la fase 2; la última migración sigue siendo la 015).

## Qué se hizo

- Nuevo contexto `backend/app/briefing/{domain,application,infrastructure}`.
  - `domain/brief.py`: campos, validación (`validate_brief_update`), `Completeness`, permisos, `ProjectBrief`. `domain/errors.py`, `domain/ports.py` (`Briefs`), `domain/validator.py` (`BriefDeliverableValidator`).
  - `application/`: `GetBrief`, `UpdateBrief`, `PromoteBrief`, `technical_snapshot.py` (fotografía de los datos técnicos, reutiliza el puerto `TechnicalDataRepository` de RGB-28) y `view.py`.
  - `infrastructure/postgres_briefs.py`: proyecto con `FOR UPDATE`, borrador, finalizar y congelado.
- `api/brief_routes.py`, tres unidades de trabajo en `api/dependencies.py` y el router en `api/main.py`.
- `lifecycle/application/validators.py` registra el validador de la fase 2: la ruta genérica `POST /api/projects/{code}/promote` tampoco puede saltarse el brief (ni siquiera con el entregable marcado completo y aprobado).
- Ninguna ruta ni caso de uso de IA toca el brief; `tests/test_architecture.py` prohíbe que `ai`/`report` importen `briefing`, y que el adaptador se cablee fuera de `dependencies`.

## Orden de comprobaciones y auditoría

Proyecto (con `FOR UPDATE`) → fase 2 (409) → autoridad (403) → validación o completitud (422). Todo rechazo de negocio se devuelve y se audita (`project_brief`, acción `update` o `promote`, resultado `rejected`, `new_value {"error": code}`). El éxito de la edición audita `project_brief/update` (valores antiguos y nuevos); el de la promoción, `project/promote` (servicio) más `project_brief/freeze` con la versión. Todo en una sola transacción: si algo falla, no queda nada a medias. La carrera de dos o más promociones simultáneas (8 en el test): una gana (200) y el resto recibe 409 `brief_not_editable`, auditadas, con una sola versión 1.

## Contrato exacto de la API (para el front)

Todas las rutas bajo `/api/projects/{code}/brief`. Errores siempre `{"detail": {"code", "message", ...}}` con el mensaje en español.

### Forma de un brief (GET, PUT y `brief` en la promoción)

```json
{
  "code": "PRY-2026-001",
  "phase": 2,
  "frozen_version": null,
  "fields": {
    "needs": "Vivienda unifamiliar para una familia de cuatro personas",
    "program": "4 dormitorios, estudio y garaje",
    "constraints": "Retranqueo de 3 m a lindero",
    "target_budget": 250000,
    "deadline": "2027-06-30",
    "topographic_survey": null,
    "alignment": null,
    "client_approval": "email"
  },
  "completeness": {
    "missing": [],
    "technical_data_obtained": true,
    "technical_data_queried": true,
    "client_approval_recorded": true,
    "complete": true
  },
  "technical_data": {
    "cadastral_reference": "0000000AA0000A0000AA",
    "queried_at": "2026-11-01T09:00:00Z",
    "unverified": ["year"],
    "data": [
      {"id": "address", "value": "Calle Ejemplo 1", "source": "catastro", "original": "Calle Ejemplo 1", "edited": false, "verified": true},
      {"id": "year", "value": "1990", "source": "manual", "original": null, "edited": false, "verified": false}
    ]
  },
  "permissions": {"can_edit": true, "can_promote": true}
}
```

- `fields`: siempre las 8 claves, en este orden: `needs` (Necesidades), `program` (Programa), `constraints` (Condicionantes), `target_budget` (Presupuesto objetivo), `deadline` (Plazo), `topographic_survey` (Levantamiento topográfico), `alignment` (Alineación), `client_approval` (Aprobación del cliente). Los cinco primeros son obligatorios. Un campo vacío es `null`; la aprobación vacía es `"pending"`.
- `client_approval`: `"pending"` (pendiente), `"email"` (por correo), `"meeting"` (en reunión), `"signed"` (con firma). Cualquiera distinto de `pending` cuenta como registrada.
- `technical_data` (los datos de partida): la fotografía de los 26 datos del catálogo en su orden, con valor (`""` si está vacío), origen (`catastro`, `inspire`, `open_meteo`, `calculated`, `cte`, `ncse`, `pvgis`, `manual`), valor original (`null` si lo escribió una persona), `edited` y `verified`. `unverified` lista los ids con valor sin verificar (no bloquean). `cadastral_reference` y `queried_at` (UTC, `AAAA-MM-DDTHH:MM:SSZ`) son `null` si no hubo consulta. En fase 2 es la fotografía viva; con la fase > 2, la congelada.
- `completeness.missing`: etiquetas en español de los obligatorios sin rellenar, en orden. `complete` es `true` solo si no falta ningún obligatorio, hay datos técnicos y la aprobación no es `pending`.
- `permissions` los calcula el servidor: `can_edit` = fase 2 y director de proyecto de ese proyecto; `can_promote` = `can_edit` y `completeness.complete`. Con la fase > 2 ambos son `false`. El front no conoce roles.
- `frozen_version`: `1` cuando se devuelve la versión congelada (fase > 2); `null` en la fase 2.

### `GET /api/projects/{code}/brief`

Lectura abierta a cualquier miembro del estudio.
- 200: la forma anterior. Fase 2: borrador vivo. Fase > 2: el brief y los datos técnicos congelados en la versión 1 (solo lectura, `permissions` a `false`).
- 404 `project_not_found` («No existe el proyecto PRY-2026-999.»); 404 `brief_not_found` («El proyecto aún no tiene brief: se redacta en la fase 2 (Briefing).») con la fase 0 o 1.

### `PUT /api/projects/{code}/brief`

Cuerpo: `{"fields": {"needs": "…", "target_budget": 250000, "alignment": null}}`. Solo se envían los campos que cambian; `null` o texto en blanco borra el campo. Respuesta 200: la forma de un brief (con `permissions` ya recalculados).

Validación:
- Texto (`needs`, `program`, `constraints`, `topographic_survey`, `alignment`): cadena, se recorta, hasta 2000 caracteres, sin NUL ni sustitutos aislados.
- `target_budget`: número JSON (no texto, no booleano) en euros, `> 0`, `<= 1000000000`, como mucho 2 decimales. Un entero se guarda como entero.
- `deadline`: fecha real `AAAA-MM-DD` entre los años 2000 y 2100 (fecha objetivo de entrega).
- `client_approval`: `pending`, `email`, `meeting` o `signed`.

Errores:

| Estado | `code` | Cuándo |
| --- | --- | --- |
| 403 | `no_authority` (+ `allowed: ["Director de proyecto"]`) | No es el director de proyecto de ese proyecto |
| 404 | `project_not_found` | No existe (o es de otro estudio) |
| 409 | `brief_not_editable` («El brief solo se puede editar o promover mientras el proyecto está en la fase 2.») | El proyecto no está en la fase 2 |
| 422 | `unknown_field` (+ `field`) | Clave que no existe: «El campo «x» no existe o no se puede editar aquí.» |
| 422 | `invalid_field` (+ `field`) | Valor inválido: «El campo «Plazo» no es válido: debe ser una fecha con el formato AAAA-MM-DD.» |
| 422 | `invalid_request` | `fields` ausente, vacío o no es un objeto, o cuerpo mal formado |

Todo 403, 409 y 422 de negocio queda en la auditoría y no guarda nada.

### `POST /api/projects/{code}/brief/promote`

Sin cuerpo. Solo el director de proyecto de ese proyecto (política RGB-4: la fase 2 la promueve él; socio y director del estudio no).
- 200:
```json
{"code": "PRY-2026-001", "action": "promote", "previous_phase": 2, "current_phase": 3, "frozen_version": 1, "brief": { "...forma de un brief con phase 3, frozen_version 1 y permissions a false..." }}
```
- 403 `no_authority` (+ `allowed`); 404 `project_not_found`; 409 `brief_not_editable` (no está en la fase 2, también la segunda promoción); 422 `incomplete_deliverable` con `missing`: la lista de lo que falta, en este orden, con etiquetas en español: los obligatorios del brief («Necesidades», «Programa», «Condicionantes», «Presupuesto objetivo», «Plazo»), «Datos técnicos obtenidos» y «Aprobación del cliente registrada». El mensaje solo cuenta («El brief no está listo para promover: falta 1 requisito.» / «faltan N requisitos.»); las etiquetas viajan en `missing` para que el front no las repita.
- Efectos en una transacción: el contenido del entregable de la fase 2 pasa a `{brief, technical_data}` (completo y aprobado), se congela como **una sola** versión 1 de la fase 2 en `frozen_versions` (inmutable), el proyecto pasa a la fase 3, se abre su entregable y se audita.

## Decisiones de negocio — para revisar con RGB

1. **Datos técnicos obtenidos** = al menos un dato técnico con valor, venga de una consulta o de la entrada manual (la ruta manual cuenta). Una consulta registrada sin ningún valor no cuenta. `completeness.technical_data_queried` informa aparte de si hubo consulta.
2. **Sin verificar no bloquea**: se marcan en la versión congelada (`verified: false` por dato y lista `unverified`).
3. **Formato del plazo**: fecha objetivo de entrega `AAAA-MM-DD` (año 2000 a 2100). Alternativa no elegida: semanas; no hay validación contra hoy ni contra el plan de semanas.
4. **Formato del presupuesto**: número en euros, `> 0`, hasta 1.000 millones, 2 decimales como máximo; el texto («250.000 €») se rechaza.
5. **«Con firma» no exige adjunto** (la plataforma aún no almacena archivos); basta registrar `signed`. Quién y cuándo la registró queda en la auditoría (`project_brief/update`). Pendiente decidir con RGB si exige el documento firmado.
6. **Autoridad**: solo el director de proyecto de ese proyecto edita y promueve en la fase 2 (en modo `dev`, el rol de estudio `project_director` lo representa). Socio y director no pueden, ni siquiera para editar.
7. **Levantamiento topográfico y alineación** son opcionales y de texto libre (2000 caracteres).
8. **Orden de rechazos**: fase (409) antes que autoridad (403), como en RGB-19.
9. **Sin migración**: el borrador comparte la fila de `exit_deliverables` de la fase 2 (clave `brief`); si RGB prefiere una tabla propia con historial de ediciones, hace falta una migración 016.

## Verificación

- `pytest backend` completo con `DATABASE_URL=postgresql://rgb:rgb@localhost:54329/rgb`: **3253 pasan, 0 fallos** (8 min 10 s). De ellos, **261 tests nuevos** de RGB-32 (dominio 78, casos de uso 40, Postgres de infraestructura 21, rutas con dobles 28, rutas con Postgres real 75, más el validador de la fase 2 y la arquitectura).
- `ruff check backend` y `ruff format backend` limpios.
- Un test del Escritor se corrigió con justificación: `test_unverified_lists_only_data_with_a_value_that_are_not_verified` esperaba `["year", "use"]` pero el orden del catálogo es `use`, `year` (el orden de la fotografía es el del catálogo); no se debilitó ninguna aserción.

# RGB-32b · Tester

Rama `rgb-32b/brief-screen`. Veredicto del Tester: **APROBADO**, sin bloqueantes. Hay hallazgos de gravedad media y baja (abajo); ninguno corrompe datos, se salta un permiso ni rompe la promoción. Pantallazos en [`screenshots-32b/`](screenshots-32b/) (50 ficheros, claro y oscuro, 1280 px página completa salvo `50-320px-*`, `51-320px-*` y `41-*`). Datos ficticios `@example.com`. No se tocó código de producción ni tests.

## Resultados de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint` | 0 errores, **4 avisos**: los 3 preexistentes y uno nuevo de esta rama (hallazgo 8) |
| `npm run typecheck` | verde |
| `npx jest` (suite completa) | 110 suites, **2557 tests** en verde |
| `npm run build` | verde (`NEXT_PUBLIC_API_URL=http://localhost:8000`, `NEXT_PUBLIC_AUTH_MODE=dev`) |

## Entorno

`next build` + `next start` (3010) contra uvicorn real y Postgres local `back-db-1` en una base propia `rgb32b` (migraciones 001-015 + `seed_dev`; borrada al terminar), nunca producción. El API corre en **`AUTH_MODE=supabase`** contra un JWKS falso local (9200, tokens ES256 firmados con una clave de prueba) para que las funciones sean por proyecto: `dir@example.com` (rol de estudio `architect`, asignado como «Director de proyecto» en los proyectos de prueba), `out@example.com` (`architect`, sin asignación), `partner@example.com` (socio), `dir2@example.com` (director de proyecto solo de `PRY-B-007`), un director de estudio y una persona con rol de estudio `project_director` sin asignación. Un proxy local en el 8000 inyecta el `Authorization` de la persona elegida (cambia de identidad en caliente), añade latencia o fabrica errores (422/500 con y sin cuerpo). El Catastro va simulado con las respuestas grabadas (`launcher.py`, sin red); no se llamó a INSPIRE, Open-Meteo ni PVGIS. Playwright (Chrome, `es-ES`), claro y oscuro, axe-core con todas las reglas. Proyectos `PRY-B-001..032` insertados en la base (fases 0, 1, 2 y 3).

## Verificación de `/projects/<code>/phase/2` (brief)

- **Director asignado (UI y API):** edita, guarda y ve el panel de promoción. Vacío: «Faltan 7 requisitos» con la razón visible y enlazada (`aria-describedby`) al botón deshabilitado (`01-*`). Guardado parcial (necesidades y presupuesto): una sola petición `PUT` con solo los campos cambiados y recortados, `role=status` «Brief guardado» con el foco, el servidor devuelve el brief completo y la lista de requisitos se recalcula (`03-*`). Guardar sin cambios: «No hay cambios que guardar» y ninguna petición. Con los cinco obligatorios: «Faltan 2 requisitos» (datos técnicos y aprobación) (`04-*`). Con aprobación «Por correo» y datos técnicos: botón habilitado (`06-*`).
- **Validaciones de cliente** (sin ninguna petición, error junto al campo con `aria-invalid`, foco en el primer campo inválido, `02-*`): presupuesto `250.000 €`, `0`, `-5`, `10,123`, `1e3`, `abc`, `250000,5` («debe ser un número mayor que 0, con punto decimal y hasta 2 decimales»), `1000000001` («no puede superar 1.000.000.000 €»), 2001 caracteres, NUL. Se aceptan `0.01`, `250000.50`, `1000000000`, plazo `2000-01-01` y `2100-12-31`.
- **Validaciones de servidor** (API directa, 27 casos; todas con `field` y mensaje en español): presupuesto texto, 0, negativo, > 1.000 millones, 3 decimales, booleano; plazo `2027-02-30`, `30/06/2027`, `1999-12-31`, `2101-01-01`; 2001 caracteres, NUL, sustituto aislado, número en un texto; aprobación `verbal`; clave desconocida (`unknown_field`); cuerpos `{}`, `{"fields":{}}`, `{"fields":[]}` y JSON mal formado (`invalid_request`). Un 422 inyectado con `field: deadline` se muestra bajo «Plazo», con `aria-invalid` y el foco en el campo, y reintentar funciona (`31-*`).
- **Qué falta para promover:** `422 incomplete_deliverable` con `missing` en orden y etiquetas en español («faltan 5 / 2 requisitos», «falta 1 requisito»). En pantalla (promover con un campo vaciado a espaldas de la pantalla): el aviso lista «Necesidades» y «Aprobación del cliente registrada» con el foco (`33-*`); Escape cierra la confirmación y devuelve el foco al botón. Los datos técnicos obtenidos desde el editor existente de la misma página **no** actualizan el panel hasta recargar (hallazgo 3); tras recargar pasa de «Falta» a «Cumplido».
- **Sin autoridad (UI):** persona sin asignación, socio y director de *otro* proyecto ven solo lectura (`dl`, sin formulario), «Solo lectura.», la lista de requisitos cumplida, el botón deshabilitado con «Solo el director de proyecto de este proyecto puede promover» (`20-*`). En API: `PUT` y `promote` dan 403 `no_authority` «…Pueden hacerlo: Director de proyecto.» para la persona sin asignación, el socio, el director del otro proyecto, el director del estudio y el rol de estudio `project_director` sin asignación; `permissions` a `false` para todos. Si la identidad cambia con la pantalla abierta: el `PUT` da 403, aviso con el foco y la pantalla pasa a solo lectura (`30-*`); el `promote` da 403 con el foco en el aviso (`34-*`).
- **Promoción de extremo a extremo (UI, `PRY-B-001`):** brief completo + referencia catastral (Catastro simulado) con 7 datos con valor y ninguno verificado → «Promover a 3 · Anteproyecto» → confirmación con foco en «Confirmar promoción» (`07-*`) → «Promoviendo…» (`08-*`) → `role=status` «El brief v1 quedó congelado y el proyecto pasó a Anteproyecto» con el foco, enlace «Ir a Anteproyecto» (`/projects/PRY-B-001/phase/3`) y cabecera/ficha refrescadas a la fase 3 sin recargar (`09-*`). `/phase/2` pasa a «Brief v1 congelado · solo lectura» con el brief y la tabla «Datos técnicos congelados» (origen, original, editado, verificado; «7 datos técnicos sin verificar: Dirección, Municipio, …» y «Sin verificar» en la celda) (`10-*`). Mismo recorrido en oscuro con `PRY-B-008`. Con 2 datos verificados a mano (`PRY-B-002`, API) quedan 5 sin verificar y la fotografía lo refleja.
- **Fase equivocada (409):** `PUT` y `promote` en fases 0, 1, 3 y la segunda promoción dan 409 `brief_not_editable`. En pantalla, con la fase cambiada a espaldas: promover → aviso con foco y «Recargar», que muestra el brief congelado sin panel de promoción (`35-*`); guardar → aviso con foco y «Recargar» (`36-*`).
- **Fases 0 y 1:** `GET /brief` da 404 `brief_not_found`; `/phase/0` y `/phase/1` no hacen ninguna llamada a `/brief`; `/phase/2` de un proyecto en fase 0 o 1 hace una llamada y muestra «Todavía no hay brief para este proyecto.» (`21-*`).
- **Ejemplos `PRY-EJ-001` y `PRY-EJ-002`:** **cero** llamadas a `/brief` (registro del proxy), sin panel de brief.
- **`/phase/3`:** no muestra el brief (la versión congelada se ve en `/phase/2` y su enlace «Volver a la fase actual»). Es lo que dice el plan; se anota por si la persona espera verla en la fase 3.

## Base de datos (`audit_events`, `frozen_versions`, `exit_deliverables`)

- 12 proyectos promovidos (UI y API): cada uno con **una sola** fila en `frozen_versions` (`phase 2`, `version 1`, `frozen_by` el director), con `content` = `{brief, technical_data}` en la **misma** versión, 26 datos y `unverified` = exactamente los ids con valor y sin verificar (comprobado programáticamente: 0 incoherentes). `exit_deliverables` de la fase 2: `complete` y `approved` verdaderos; se abre el de la fase 3 (12). `projects.current_phase = 3`. Los campos opcionales vacíos no se guardan en la versión y se leen como `null`.
- Auditoría (todo el recorrido): `project_brief/update` ok 47 y rechazado 32 (403 y 409 con `new_value {"error": code}`), `project_brief/promote` rechazado 18, `project/promote` ok 12 y `project_brief/freeze` ok 12 (con versión 1), cada evento con el `user_id` de quien lo hizo.
- **Ruta genérica `POST /api/projects/{code}/promote`:** vacía → 422 («falta entregable de salida»); con el entregable marcado completo y aprobado en BD pero brief vacío o `{}` → 422 con las 7 etiquetas del brief; con brief y datos técnicos completos pero sin marcar el entregable → 422 («entregable de salida completo, aprobación del entregable, Datos técnicos obtenidos»). No se salta el brief y no se creó ninguna versión congelada ni cambió la fase.
- Dos pestañas promoviendo a la vez (`PRY-B-016`): una gana, la otra 409; una sola versión.

## Intentar romper

- **Doble envío:** doble clic en «Guardar brief» (y con 1,2 s de latencia, clic más Enter más clic forzado): una única `PUT`. Doble clic en «Confirmar promoción» con 1,5 s de latencia: un único `POST /brief/promote`.
- **Recarga durante la promoción** (3 s de latencia, recarga a los 0,4 s): el servidor termina, hay una versión 1 y, al volver, la pantalla muestra el brief congelado.
- **XSS** (`<img src=x onerror=alert(1)>"><script>alert(2)</script>` en necesidades y levantamiento): se guarda y se devuelve literal, se ve como texto en el formulario y en la versión congelada, sin diálogos ni nodos inyectados, y la BD lo guarda tal cual.
- **Valores extremos:** 2000 caracteres, multilínea, emoji, CJK y árabe se guardan y se muestran; presupuesto `1000000000` y `0.01`, plazos en los límites. Un texto de 2000 caracteres **sin espacios** rompe la vista de solo lectura (hallazgo 2).
- **Teclado:** el orden de tabulación recorre los campos; Enter en el presupuesto guarda y el foco va al estado; Enter en «Promover» lleva el foco a «Confirmar», Tab a «Cancelar», Escape cierra y devuelve el foco; tras confirmar el foco queda en el estado y Tab llega a «Ir a Anteproyecto». Tras un 422 de campo el foco va al campo; tras 403/409/500 al aviso.
- **Lector de pantalla** (`ariaSnapshot`, no uno real): `form "Brief"` con `textbox`/`combobox` con nombre, «Obligatorio/Opcional» enlazado con `aria-describedby`, `region "Promoción a Anteproyecto"`, lista «Requisitos» con «Cumplido/Falta» en texto (no solo color), `role=status` y `role=alert`.
- **axe** (todas las reglas, incluido contraste), claro y oscuro: 0 violaciones en vacío, errores de cliente, listo para promover, confirmación, 403, 422 de servidor, 422 y 409 de promoción, 409 de guardado, solo lectura (sin autoridad, socio, director de otro proyecto) y formulario con XSS. Excepción: hallazgo 5.
- **320 px:** la columna principal queda en ~38 px por la barra lateral de 232 px del shell (`scrollWidth` 586 frente a 453 de `/portfolio`); el formulario y la lista de requisitos se aplastan por esa causa, no por el brief (`50-*`, `51-*`). Plataforma de escritorio; ya conocido (RGB-16, RGB-48, RGB-49, RGB-51).

## Último commit (3e6bcd1, «consulta del test acotada a la nota…»)

No debilita nada. El test seguía exigiendo que la instantánea congelada nombre los datos sin verificar; solo cambia la consulta de `/sin verificar/i` (que casaba con la nota y con la celda «Sin verificar») a `/1 dato técnico sin verificar/i`, **más estricta** (exige el recuento). Se revierte además un apaño de producción (partir «Sin verificar» en dos `<span>` para esquivar la consulta), que dejaba el nombre accesible de la celda «Sin verificar» troceado; el texto actual es una sola cadena y las pruebas de axe y de lectura la ven entera. Ninguna aserción se elimina ni se relaja.

## Hallazgos

1. **Media. Un proyecto en fase ≥ 3 sin versión congelada muestra un brief vacío con el panel de promoción.** `GET /brief` devuelve 200 con `frozen_version: null` y campos vacíos (p. ej. un proyecto que pasó a la fase 3 antes de RGB-32 o con la ruta genérica). La pantalla decide `frozen` solo por `frozen_version !== null`, así que enseña «Solo lectura.», la lista «Falta» ×7 y «Promover a 3 · Anteproyecto … Faltan 7 requisitos» en un proyecto ya en Anteproyecto (`22-*`). Repro: insertar un proyecto con `current_phase = 3` sin fila en `frozen_versions` y abrir `/projects/<code>/phase/2`. Sugerencia: tratar `phase > 2` como congelado (sin panel de promoción) y avisar «Sin versión congelada».
2. **Media. Un texto largo sin espacios desborda la vista de solo lectura y la versión congelada.** Con 2000 caracteres seguidos en «Condicionantes», el documento mide 28.279 px de ancho a 1280 px y aparece scroll horizontal de página (`41-*`); el `dd` tiene `whitespace-pre-line` pero no `break-words` / `min-w-0`. En el formulario (textarea) no pasa. Repro: guardar 2000 `W` en un campo de texto y abrir la pantalla como persona sin autoridad o tras promover. Sugerencia: `break-words` (o `[overflow-wrap:anywhere]`) en el `dd`.
3. **Baja. Obtener datos técnicos en el editor de la misma página no actualiza el panel de promoción.** Tras «Obtener datos técnicos» el panel sigue con «Falta Datos técnicos obtenidos» y el botón deshabilitado hasta recargar (`05-*`). Repro: brief completo sin datos técnicos, obtener la referencia, mirar el panel. Sugerencia: `router.refresh()` al terminar el editor o recalcular al guardar el brief.
4. **Baja. Tras «Recargar» por un 409 al guardar, el aviso rojo y el botón «Recargar» siguen visibles en la versión ya congelada** (`BriefForm` conserva su estado; `37-*`): contradice «Brief v1 congelado». Tras promover, además, el «Brief guardado» anterior sigue encima de la versión congelada (`09-*`). Sugerencia: limpiar avisos al recibir un brief congelado.
5. **Baja, preexistente (RGB-51 hallazgo 2).** axe `scrollable-region-focusable` (2 nodos: `#datum-address` y `#datum-municipality`) en `/phase/2` con la fase cerrada o solo lectura: inputs deshabilitados con valor largo del editor de datos técnicos, no del brief. El brief y la versión congelada no dan violaciones.
6. **Info. El presupuesto exige punto decimal** (`250000,5` se rechaza con un mensaje claro, `250.000` también); para una persona española puede sorprender. Es decisión de negocio 4 del servidor (número en euros).
7. **Info. El selector de fecha** usa `input type=date` (el formato lo pone el navegador; en Chrome `mm/dd/yyyy` con el idioma por defecto del navegador de pruebas); el valor viaja como `AAAA-MM-DD`.
8. **Info. Aviso nuevo de lint en `frontend/lib/brief.ts:198`:** «Unused eslint-disable directive (no-control-regex)». No falla el lint, pero lo introduce esta rama; conviene quitar la directiva.
9. **Info. En `/phase/3` no hay nada del brief** (solo en `/phase/2`), conforme al plan.

## No verificado

Lector de pantalla real, Supabase y Google reales (el acceso se sustituyó por tokens de un JWKS local), el inicio de sesión de la interfaz (el proxy inyecta el token), Catastro/INSPIRE/Open-Meteo/PVGIS reales (a propósito), un fallo de red real (código 0) en guardar o promover, y los pantallazos oscuros de 320 px y de las vistas con XSS/extremos.

## Limpieza

Parados uvicorn 8003, proxy 8000, JWKS 9200 y `next start` 3010; base `rgb32b` eliminada. Los scripts quedaron fuera del repo (scratchpad).

# RGB-32b · Juez

Veredicto: **APROBADO** (tras una primera revisión rechazada por el hallazgo 2 del Tester, corregida en 6a09777).

## Verificación propia
- `lint`: 0 errores, 3 avisos preexistentes (el aviso nuevo de `frontend/lib/brief.ts` desapareció). `typecheck` verde. Suite completa del front: 110 suites, 2557 tests en verde en la primera revisión; tras la corrección, los 6 conjuntos del brief (220 tests) en verde, y el coordinador informa de 2558 en la suite completa y de `build` verde.
- Alcance: brief en la fase 2 de proyectos reales con `BriefForm`, `BriefPromotePanel`, `TechnicalDataSnapshot` y `BriefScreen`; versión congelada en solo lectura con fase > 2; `PRY-EJ-*` sin llamadas al brief; sin cambios de backend; el front no decide permisos (usa `permissions` del servidor).
- Tests: los del Escritor solo cambian en 3e6bcd1 (consulta de la nota más estricta, `/1 dato técnico sin verificar/i`; se revierte el apaño de producción de los dos `<span>`): no debilita nada. La corrección 6a09777 añade un test nuevo (rojo antes) y no modifica ninguno existente.
- Seguridad y reglas: sin `dangerouslySetInnerHTML`, texto como texto (XSS probado por el Tester), datos ficticios, sin secretos, código en inglés y UI en español, la única transición es la promoción explícita con confirmación, `.mcp.json` fuera del diff.
- Pantallazos: 50 en `screenshots-32b/`, claro y oscuro, datos ficticios, referenciados; abiertos 41, 09-promoted-dark y 20-readonly-partner-light.

## Corrección del hallazgo 2 (6a09777)
`min-w-0 … break-words` en el `dd` de `BriefForm.tsx` y `break-words` en `CELL` de `TechnicalDataSnapshot.tsx`, con el test «a long unbroken text wraps instead of widening the page», y se quita el `eslint-disable` sin uso (hallazgo 8). Cubre la vista del brief; en la tabla de datos técnicos, `break-words` no reduce el ancho mínimo de una celda de tabla, pero esos valores vienen del Catastro y están acotados.

## Seguimientos (no bloquean)
1. **Hallazgo 1:** proyecto en fase >= 3 sin versión congelada (solo posible con datos anteriores a RGB-32a o insertados a mano; la ruta genérica ya lo impide) muestra el panel de promoción con «Faltan 7 requisitos». Tratar `phase > 2` como congelado y avisar «Sin versión congelada»; requiere pasar la fase a `BriefScreen`.
2. **Hallazgo 3:** obtener datos técnicos en el editor de la misma página no actualiza el panel de promoción hasta recargar (`router.refresh()`).
3. **Hallazgo 4:** tras «Recargar» por un 409 o tras promover, siguen visibles los avisos anteriores sobre la versión congelada; limpiarlos al recibir un brief congelado.
4. **Comprobación visual pendiente:** el caso 41 (2000 caracteres sin espacios) no se ha repetido en navegador tras la corrección; solo lo cubre el test de clase. Repetirlo con el build real y comprobar `scrollWidth <= innerWidth`.

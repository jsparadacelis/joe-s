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

# RGB-49 · Tester

Rama `rgb-49/project-team-screen` (con `main` fusionado). Veredicto del Tester: **APROBADO**, sin bloqueantes ni altos. Pantallazos en [`screenshots/`](screenshots/) (52 ficheros, claro y oscuro, 1280 px página completa salvo `team-320px` y `focus-assign-button`). Datos ficticios `@example.com`. No se tocó código de producción ni tests.

## Resultados de las comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint` | 0 errores, 3 avisos preexistentes (`PromotePanel.test.tsx` `API_SHEET`, `auth.test.ts` `_omit` x2), ajenos a RGB-49 |
| `npm run typecheck` | verde |
| `npx jest` (suite completa) | 97 suites, **2170 tests** en verde |
| `npm run build` | verde (aparece `/projects/[code]/team`) |

## Entorno

`next build` + `next start` (3010) contra uvicorn real y Postgres local `back-db-1` (54329) en una **base propia `rgb49`** (migraciones 001-011 + `seed_dev`; borrada al terminar), nunca producción. Uvicorns: 8001 `AUTH_MODE=dev` rol `partner`, 8002 rol `director`, 8004 rol `architect`, y 8003 en `AUTH_MODE=supabase` contra un JWKS falso local (puerto 9200, tokens ES256 firmados con una clave de prueba; los miembros activos llevan un `user_id` ficticio). Un proxy local en el 8000 cambia de uvicorn, añade latencia a POST/DELETE o a GET, hace fallar `GET /members` o el listado del equipo (500), oculta a una persona de `GET /api/members` (persona desconocida) e inyecta un `Authorization` para que la interfaz hable con el API de verdad como una persona concreta. El navegador no se interceptó. Playwright (Chrome, `es-ES`), claro y oscuro, axe-core con todas las reglas. Datos: oportunidades `PRY-2026-001` y `-002`; miembros activos socia, director, arquitecta con firmante habilitado, colaborador con dirección facultativa, administración con sponsor, un arquitecto sin cualificaciones y una directora de proyecto; uno invitado y uno revocado. Unas 240 comprobaciones automatizadas, todas en verde (algunos fallos intermedios fueron errores de mis scripts, no de la pantalla, y se corrigieron).

## Verificación de `/projects/<code>/team`

- **Vacío y formulario:** «Todavía no hay equipo asignado»; el selector de persona solo ofrece las 7 personas activas (ni la invitada ni la revocada); el de función, las 7 funciones (`team-empty-*`). Enviar vacío: «Elige una persona.» y «Elige una función.», foco en la persona, sin POST; solo la persona: error en la función y foco en ella (`assign-form-errors-*`). Las funciones de firma muestran «Esta función exige la cualificación «…»» enlazada con `aria-describedby`, y desaparece con otra función (`assign-signing-note-*`).
- **Asignar cada función** (socia): director de proyecto, líder técnico, arquitecto, colaborador de obra, firmante habilitado, dirección facultativa y sponsor, cada una a una persona con la cualificación cuando hace falta. En cada caso: fila en BD, aviso `role=status` «Se asignó la función «…» a …», selector vaciado, foco en Persona, tabla con 7 filas y 7 eventos `project_member:assign` en el registro de auditoría (`team-list-*`).
- **422 `missing_qualification`:** firmante, dirección facultativa o sponsor a quien no tiene esa cualificación (también a una persona con otra distinta): mensaje del servidor en aviso `role=alert` con el foco, nada guardado; editar un campo borra el aviso (`assign-error-422-qualification-*`).
- **Restringida (`signing_function_restricted`):** el back responde **403 con código `no_authority`** y el mensaje «Solo un socio o un director puede dar o quitar las funciones de firmante habilitado, dirección facultativa y sponsor.» (no 422, ver nota). Se probó con una persona de estudio `architect` a la que se dio `project_director` en el proyecto, usando la interfaz contra el API real (`assign-error-403-restricted-*`, `remove-error-403-restricted-*`): no puede dar ni quitar funciones de firma, sí las demás. Un `director` de estudio sí puede dar y quitar funciones de firma (con la cualificación) y las demás; sin cualificación recibe el 422 de cualificación. Una persona sin autoridad en el proyecto (`architect`) ve el equipo y recibe en acciones: 403 «No tienes autoridad para gestionar el equipo de este proyecto. Pueden hacerlo: Socio, Director, Director de proyecto.» con el foco en el aviso, también al quitar (`assign-error-403-*`, `remove-error-403-*`).
- **409:** asignación repetida «Esa persona ya tiene esa función en el proyecto.» (`assign-error-409-duplicate-*`); persona revocada tras cargar la pantalla «Solo se asigna a personas con acceso activo al estudio.» (`assign-error-409-not-active-*`).
- **404:** proyecto renombrado tras cargar, «No existe ese proyecto.» (`assign-error-404-project-*`); un código inexistente en la URL muestra la página 404 de Next, sin formulario (`project-not-found-*`); quitar una asignación ya borrada, «No existe esa asignación en el proyecto.» con foco en el aviso (`remove-error-404-*`).
- **Quitar:** «Quitar» abre confirmación en la propia fila (foco en «Confirmar quitar a … como …»; `remove-confirm-*`); Escape y Cancelar cierran sin enviar DELETE y devuelven el foco a «Quitar a … como …»; confirmar borra la fila, avisa «Se quitó la función «Sponsor» a …» y deja el foco en el aviso `status` (`remove-success-*`). Abrir la confirmación de otra fila cierra la anterior.
- **Pestaña «Equipo»:** orden «Fase y promoción, Plan y tiempos, Equipo»; `aria-current="page"` solo en `/team` (y solo «Equipo»); desde la ficha del proyecto, la fase, «Plan y tiempos» y la puntuación el enlace lleva a `/team`; al salir ya no está activa (`tabs-from-project-*`, `tabs-from-plan-and-timing-*`).
- **Persona desconocida:** un `member_id` que `GET /api/members` no devuelve se muestra «Persona desconocida» con botón «Quitar a Persona desconocida como Arquitecto» (`team-unknown-person-*`).
- **Cargando y error de carga:** «Cargando el equipo…» sin formulario (`team-loading-*`); un 500 en el listado del equipo o en el de miembros muestra el aviso y «Reintentar», sin formulario; reintentar con el fallo vigente lo mantiene, y al recuperarse aparece la pantalla (`load-error-*`, `load-error-members-*`).

## Efecto de negocio de extremo a extremo (API en `AUTH_MODE=supabase`, asignación desde la interfaz)

Proyectos `PRY-2026-001` y `-002`, repetido con ambos en fase 2 y en fase 3. Persona: arquitecto del estudio, sin autoridad global.

1. Antes: promover `-001` da 403 `no_authority` (igual para una persona con rol de estudio `project_director` sin asignación).
2. En la pantalla `/team` de `-001` se asigna «Director de proyecto» a esa persona (fila en BD).
3. Después: promover `-001` ya no da 403 sino **422 `incomplete_deliverable`** (pasa la autoridad; el entregable de la fase está incompleto, la fase no cambia); promover `-002` sigue en 403, y gestionar el equipo de `-002` también (403). Puede dar funciones no firmantes en `-001` (201) pero no las de firma (403 restringida).
4. En la pantalla se quita la función: promover `-001` vuelve a 403 y ya no puede gestionar el equipo.

En `AUTH_MODE=dev` este efecto no existe a propósito (las funciones salen del rol de estudio, `dev_project_roles.py`); la gestión del equipo sí lee siempre las asignaciones reales. No se probó una promoción completa con éxito (habría que rellenar los entregables).

## Intentar romper

- **Doble envío** con 1,5 s de latencia (clic, clic forzado y Enter): un único POST y una fila; mientras vuela, «Asignar» está deshabilitado y el formulario `aria-busy` (`assign-in-flight-*`). Doble confirmación de «Quitar»: un único DELETE y sin error.
- **XSS** (`<img src=x onerror=alert(1)>@example.com` y `a"><script>alert(2)</script>@example.com` sembrados): se asignan, se muestran como texto en la tabla, el aviso y los nombres accesibles, sin diálogos ni nodos inyectados (`team-xss-*`).
- **Teclado:** Persona, Tab, función por letras («Arq»), Tab, Enter: asigna y el foco vuelve a Persona; Enter en «Quitar» → foco en «Confirmar», Tab a «Cancelar», Escape cierra y devuelve el foco, Enter y Enter quita. Anillo de foco visible en «Asignar» (`focus-assign-button-*`).
- **Lector de pantalla** (`ariaSnapshot`, no un lector real): tabla «Equipo del proyecto» con `caption` y 3 `columnheader`; botones «Quitar a … como …» y «Confirmar quitar a … como …»; formulario «Asignar una función» con `combobox` «Persona» y «Función»; errores de campo con `role=alert`; avisos de éxito con `role=status`.
- **Contraste y axe:** 0 violaciones (incluida `color-contrast`) en claro y oscuro en vacío, errores de formulario, nota de cualificación, lista, 422, 409, 403, restringida, confirmación, éxito y 404 de quitar, persona desconocida, cargando, errores de carga, XSS y 320 px.

## Hallazgos (ninguno bloqueante)

1. **Info/Media, no atribuible a RGB-49. A 320 px la página se desborda (scrollWidth 523) y el panel queda aplastado** (la tabla no se ve, tiene su propio scroll horizontal; `team-320px-*`). Es del shell: la barra lateral de 232 px no se colapsa; `/projects/<code>/phase/2` da 523, «Plan y tiempos» 676 y `/portfolio` 454. Ya era el hallazgo 8 de RGB-16 y el 1 de RGB-48.
2. **Baja. Tras un 404 al quitar («No existe esa asignación…») la fila sigue en la tabla** hasta recargar: `confirmRemove` no recarga el listado en el error (sí lo hace tras el éxito). Repro: abrir `/team` con una asignación, borrarla en BD (u otra persona), «Quitar» → «Confirmar»: aviso 404 y la fila sigue con «Quitar». Lo mismo, de menor impacto, tras un 409 `assignment_already_exists`. Sugerencia: llamar a `reloadTeam()` también en los errores 404 y 409.
3. **Baja. El formulario no tiene título visible «Asignar una función»** (solo `aria-label`); se distingue por el hueco bajo la tabla. Mismo hallazgo que en RGB-48.
4. **Info. El error de función de firma restringida llega como 403 `no_authority`** (la clase hereda de `NoAuthority`), no 422 como sugería el plan; el front muestra el mensaje del servidor, así que no hay efecto visible. Conviene que el plan/tests no asuman un código 422 propio.
5. **Info.** Con `AUTH_MODE=dev` la pantalla no puede reproducir la restricción ni el efecto sobre promover (el contexto de desarrollo no es una persona asignada); se probó inyectando un token en el proxy hacia el API en modo `supabase`.

## No verificado

Lector de pantalla real, Supabase y Google reales (el inicio de sesión se sustituyó por tokens firmados con un JWKS local), 401, una promoción completa con éxito tras asignar, el orden de las asignaciones con muchas filas.

## Limpieza

Parados uvicorn 8001 a 8004 (y 8005), proxy 8000, JWKS falso 9200 y `next start` 3010; base `rgb49` eliminada. Los scripts de Playwright quedaron fuera del repo. Se borraron pantallazos de una primera pasada que mostraban un caso mal planteado.

# RGB-49 · Juez

Veredicto: **APROBADO**.

Verificado con evidencia propia: `npm run lint` (0 errores, los 3 avisos preexistentes), `npm run typecheck` verde, `npx jest` 97 suites / 2170 tests en verde, `npm run build` verde.

1. **Plan y alcance:** pestaña «Equipo» en `components/project/ProjectTabs.tsx`, ruta `app/projects/[code]/team/page.tsx` (404 si el proyecto no existe), `lib/project-team.ts` con las rutas de RGB-4 (GET/POST/DELETE `/api/projects/{code}/members`), sin cambios en `backend/`, sin ocultar la pestaña por rol.
2. **Tests:** desde el último commit del Escritor (`912200c`) no hay cambios en `frontend/__tests__` hechos por el Desarrollador (`git diff 912200c HEAD`). Los dos cambios del Escritor en `ProjectTabs.test.tsx` («dos pestañas» a «tres», y el orden con Tab) son un ajuste legítimo: el requisito añade una pestaña. No se debilitan: se conservan las comprobaciones de texto exacto, `href`, `aria-current`, teclado y axe, y se añaden casos para «Equipo» (también en `/team`).
3. **Seguridad y reglas:** el texto se renderiza como texto de React (sin `dangerouslySetInnerHTML`; el Tester lo probó con cargas XSS), datos solo `@example.com`, sin secretos, el front no decide permisos (muestra el mensaje del servidor), código en inglés e interfaz en español, nada cambia el estado de un proyecto.
4. **Pantallazos:** 52 en `docs/plans/RGB-49/screenshots/`, claro y oscuro, datos ficticios; abiertos `team-list-dark`, `assign-error-403-restricted-light` y `remove-confirm-light`: corresponden al cambio. Referenciados en el informe del Tester.
5. **Hallazgos:** ninguno bloqueante. Sobre el nº 2 (fila que permanece tras 404 al quitar o 409 al asignar): es un caso de carrera poco frecuente, el aviso del servidor es claro y recargar lo resuelve; no justifica rechazar. Seguimiento: llamar a `reloadTeam()` también en `confirmRemove` (404 `assignment_not_found`) y `handleAssign` (409 `assignment_already_exists`), con un test que tras ese error vuelva a pedir el equipo. Sobre el nº 4: confirmado en `backend/app/access/domain/errors.py` (`SigningFunctionRestricted(NoAuthority)`, código `no_authority`, 403); el front muestra el mensaje del servidor (pantallazos `assign-error-403-restricted-*` y `remove-error-403-restricted-*`). Los hallazgos 1, 3 y 5 son preexistentes o de entorno.

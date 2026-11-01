# RGB-49: pantalla «Equipo del proyecto» (asignar funciones por proyecto)

Notion: https://app.notion.com/p/40a444f747b381a2b088e3aec09f9ea9

## Objetivo
Que un socio o director asigne y quite desde la web las funciones de cada persona en un proyecto (RGB-4). Sin esto, las fases 2 a 7 solo las promueve quien tiene la función en el proyecto y nadie puede dársela sin tocar la API a mano.

## Contrato (back existente, RGB-4, sin cambios)
- `GET /api/projects/{code}/members` → `{members: [{id, member_id, role}]}`. No trae correos: el front cruza `member_id` con `GET /api/members` (RGB-2a, `{members: [{id, email, role, qualifications, status}]}`).
- `POST /api/projects/{code}/members` body `{member_id, role}` → 201 `{id, member_id, role}`. Errores `{detail:{code,message}}`: 403 `no_authority`, 404 `project_not_found` / `member_not_found`, 409 `member_not_active` / `assignment_already_exists`, 422 `missing_qualification` / `signing_function_restricted`.
- `DELETE /api/projects/{code}/members/{assignment_id}` → la asignación retirada. 403, 404 `assignment_not_found`.
- Funciones: `project_director, technical_lead, architect, site_collaborator, licensed_signatory, site_management, sponsor`. Las tres últimas (de firma) las da solo un socio o director a quien tenga la cualificación equivalente. El servidor decide; el front muestra los mensajes.

## Front
- Pestaña nueva «Equipo» en `ProjectTabs` y ruta `app/projects/[code]/team/page.tsx`.
- `lib/project-team.ts`: tipos, etiquetas de función (reutiliza `roleLabel`/`qualificationLabel` de `lib/me.ts` y añade las de las funciones de firma), `fetchProjectTeam`, `assignProjectRole`, `unassignProjectRole`; cruce con `fetchMembers` de `lib/members.ts`.
- `components/project/ProjectTeamEditor.tsx` (cliente): tabla persona / función con «Quitar» (confirmación en línea, nombre accesible con correo y función); formulario «Asignar una función» con persona (solo `status=active`), función y aviso de qué cualificación exige cada función de firma; errores junto al campo o en aviso accesible con foco; estados cargando, vacío («Todavía no hay equipo asignado»), error de carga con reintento.
- Datos ficticios `@example.com`.

## Fuera de alcance
Ocultar la pestaña por rol (el servidor decide), editar una asignación (se quita y se pone otra), notificar a la persona.

## Flujo
Escritor de tests → Desarrollador → Tester (build y API reales, claro y oscuro, `docs/plans/RGB-49/screenshots/`) → Juez → PR → merge → despliegue.

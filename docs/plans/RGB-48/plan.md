# RGB-48: pantalla «Equipo del estudio» (invitar, listar, revocar)

Notion: https://app.notion.com/p/40a444f747b381d1bdb6e95374a24f81

## Objetivo
Que un socio gestione quién entra a la plataforma sin tocar la base de datos: invitar por correo, ver el estado de cada persona y retirar el acceso. La persona invitada no recibe nada de la plataforma: se activa al entrar con Google con ese correo (RGB-2a/2b). El aviso por correo es RGB-50.

## Contrato (back existente, RGB-2a, sin cambios)
- `GET /api/members` → `{members: [{id, email, role, qualifications[], status}]}`; `status`: `invited | active | revoked`.
- `POST /api/members/invitations` body `{email, role, qualifications[]}` → 201 con el miembro. Errores `{detail:{code,message}}`: 403 `no_authority`, 409 `member_already_exists`, 422 `invalid_email`.
- `POST /api/members/{id}/revoke` → miembro con `status=revoked`. Errores: 403, 404, 409 `last_partner`.
- Roles: `partner, director, project_director, technical_lead, architect, site_collaborator, administration`. Cualificaciones: `licensed_signatory, site_management, sponsor`. Etiquetas ya en `lib/me.ts` (`roleLabel`, `qualificationLabel`).
- Solo un socio invita o revoca a socio, director o administración y concede cualificaciones. El director puede invitar al resto de roles. El servidor decide; el front solo muestra lo que devuelve y los errores.

## Front
- `lib/members.ts`: tipos, etiquetas de estado («Invitada», «Activa», «Acceso retirado»), `fetchMembers`, `inviteMember`, `revokeMember`, validación de correo en cliente (misma regla que el back: no vacío, una sola `@`, dominio con punto; el back manda).
- `components/settings/TeamEditor.tsx` (cliente) en `/settings`, debajo de los ajustes del plan y scoring, con título «Equipo del estudio»:
  - Tabla: correo, rol, cualificaciones, estado, acción «Retirar acceso» (confirmación; no para personas ya retiradas).
  - Formulario «Invitar a una persona»: correo, rol (select), cualificaciones (casillas); errores junto al campo, foco gestionado, aviso de éxito («Invitación creada. La persona se activa al entrar con Google con este correo.»).
  - Estados: cargando, vacío, error de carga con reintento, 401/403 (mensaje del back; si 403 al listar, «Solo los socios y directores pueden ver el equipo.» si el back lo da).
  - Accesibilidad: tabla con encabezados, `role=status` para avisos, botones con nombre accesible que incluye el correo («Retirar acceso de a@example.com»), contraste en claro y oscuro.
- Datos ficticios `@example.com` en tests y pantallazos.

## Fuera de alcance
Editar rol o cualificaciones de una persona existente (el back no lo tiene), reenviar invitaciones, aviso por correo (RGB-50), ocultar la sección por rol (el front no decide permisos; muestra el 403).

## Flujo
Escritor de tests → Desarrollador → Tester (build real, claro y oscuro, `docs/plans/RGB-48/screenshots/`) → Juez → PR.

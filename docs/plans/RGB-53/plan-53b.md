# RGB-53b: botón «Invitar a alguien»

## Objetivo
Invitar a una persona en dos pasos desde cualquier pantalla, sin ir al final de `/settings`. Sin cambios de back: reutiliza `POST /api/members/invitations` (`inviteMember` en `lib/members.ts`).

## Diseño
- `components/layout/InviteButton.tsx` (cliente), en `Topbar` a la izquierda de la cuenta. Botón «Invitar a alguien» que abre un diálogo modal (`role="dialog"`, `aria-modal`, `aria-labelledby`), con foco en el correo, Escape y «Cancelar» cierran y devuelven el foco al botón, y el foco queda atrapado dentro.
- Campos: correo (obligatorio, misma validación `isValidEmail`) y rol (select con `MEMBER_ROLES` y etiquetas de `roleLabel`; **preseleccionado «Arquitecto»**). «Más opciones» (`<details>`) con las cualificaciones (`MEMBER_QUALIFICATIONS`).
- Errores junto al campo, igual que `TeamEditor`: `invalid_email` y `member_already_exists` en el correo; el resto (403, 422...) en un aviso `role="alert"` dentro del diálogo con el mensaje del servidor. El front no decide permisos: el botón lo ve todo el mundo y el servidor responde 403.
- Éxito (el diálogo cambia de paso, `role="status"`): «Invitación creada para {correo}.», un cuadro de solo lectura con el mensaje «Hola, te he invitado a RGB Proyectos. Entra con Google con este correo ({correo}): {origen}» (origen = `window.location.origin`), botón «Copiar mensaje» (clipboard; confirma «Mensaje copiado»; si falla, el texto queda seleccionable y avisa «No se pudo copiar. Selecciona el texto y cópialo.»), «Invitar a otra persona» (vuelve al formulario vacío, rol de nuevo Arquitecto) y «Cerrar».
- No se envía correo hasta RGB-50; el texto lo dice: «La plataforma no envía el aviso: mándale este mensaje tú.»
- En modo `dev` (sin cuenta) también aparece.
- Fuera de alcance: refrescar la tabla de `TeamEditor` si está abierta en `/settings` (se ve al recargar), editar o reenviar invitaciones.

## Archivos
`components/layout/InviteButton.tsx` (+ `InviteDialog` si conviene separarlo), `components/layout/Topbar.tsx`, tests en `__tests__/components/layout/`, pantallazos en `docs/plans/RGB-53/screenshots-53b/` (diálogo, éxito, error, claro y oscuro, y a 360 px).

## Flujo
Escritor de tests → Desarrollador → Tester (build real) → Juez → PR con pantallazos.

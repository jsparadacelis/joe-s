# RGB-53b · implementation log

## Qué se hizo
- `frontend/components/layout/InviteButton.tsx`: botón «Invitar a alguien» y diálogo modal (portal en `document.body`). Props opcionales `inviter` (por defecto `inviteMember`) y `clipboard` (por defecto `navigator.clipboard`).
- `frontend/components/layout/Topbar.tsx`: `InviteButton` a la izquierda de la cuenta, también sin cuenta (modo dev).

## Decisiones
- Reutiliza `inviteMember`, `isValidEmail`, `MEMBER_ROLES`, `MEMBER_QUALIFICATIONS`, `roleLabel`, `qualificationLabel`, `Button` y `Notice`; solo clases con tokens.
- Accesibilidad: `role="dialog"`, `aria-modal`, `aria-labelledby`; foco inicial en el correo (en el botón «Copiar mensaje» tras el éxito); foco atrapado con un manejador de Tab que ignora lo que está dentro de un `<details>` cerrado; Escape y «Cancelar»/«Cerrar» devuelven el foco al botón.
- Errores: `invalid_email` y `member_already_exists` junto al correo (`aria-invalid`, `aria-describedby`); el resto en un `Notice` de tono `bad` (`role="alert"`) dentro del diálogo.
- Un `ref` impide el doble envío mientras hay una petición en curso.
- «Invitar a otra persona» restablece correo, rol (Arquitecto), cualificaciones y cierra «Más opciones» (`key` en el `<details>`).

## Resultado
- Tests nuevos (InviteButton y Topbar-invite) en verde; `lint` (0 errores, 3 avisos previos), `typecheck` y `build` en verde.
- Dos tests anteriores quedan en rojo porque asumen un Topbar sin botón: `__tests__/components/layout/Topbar-account.test.tsx` («shows nothing new in dev mode», `queryByRole("button")` vacío) y `__tests__/keyboard-focus.test.tsx` (el primer Tab ahora cae en «Invitar a alguien»). No se han tocado; contradicen el plan 53b (el botón aparece también en modo dev) y deben actualizarse por el Escritor de tests.

# RGB-53: segundo factor solo para el socio e invitación fácil

## Motivo
Pedir el código de autenticación a director y administración en cada entrada es demasiado para el MVP (petición del 2026-11-12).

## Parte 1 (hecha): el segundo factor solo se exige al socio
- `backend/app/study/domain/mfa.py`: `_MFA_ROLES = {PARTNER}`. Director y administración entran con `aal1`.
- `frontend/lib/auth-guard.ts`: `MFA_ROLES = {"partner"}`.
- Tests ajustados (cambia el requisito, no se debilita nada): `test_mfa.py`, `test_authenticate.py`, `auth-guard.test.ts`.
- Quien ya tenga un TOTP activo (`nextAal = aal2`) sigue viendo `/login/mfa` hasta que se desactive su factor en Supabase.
- Sin migración. `docs/despliegue.md` actualizado.

## Parte 2 (pendiente): invitar fácil
- Botón «Invitar a alguien» visible en la cabecera, con diálogo de correo y rol (cualificaciones en «Más opciones»).
- Al crear la invitación, mensaje listo para copiar con el enlace de la plataforma (no se envía correo hasta RGB-50).
- Reutiliza `inviteMember` de `lib/members.ts` y `TeamEditor`.

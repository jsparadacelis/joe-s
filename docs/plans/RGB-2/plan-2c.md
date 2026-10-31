# RGB-2c: el alta del doble factor no deja a nadie bloqueado y explica sus fallos

Primer contacto con un Supabase real (2026-10-31): un socio entra con Google, la API le exige `aal2` (403 `mfa_required`) y la pantalla `/login/mfa` crea un factor TOTP. Si la persona recarga o sale antes de verificar, queda un factor `unverified` cuya clave ya no se puede ver; al volver, la pantalla ve «ningún factor verificado» y vuelve a crear otro, y los fallos se muestran con un texto genérico sin pista de la causa.

## Cambios (solo front, `components/auth/MfaPanel.tsx` y `lib/auth.ts`)
1. **Factor pendiente:** si no hay un factor verificado y existen factores TOTP sin verificar, se retiran (`auth.mfa.unenroll`) antes de crear uno nuevo. Así el QR siempre corresponde al factor que se verifica y nadie queda bloqueado. Un factor verificado nunca se retira.
2. **Fallos con causa:** cuando falla la preparación, el desafío o la verificación, el aviso añade «Código de error: xxx» con el `code` de Supabase (sin datos personales). Los mensajes en español no cambian.
3. `AuthClient` gana `mfa.unenroll({ factorId })`.

## Fuera de alcance
Recuperación del segundo factor perdido (sigue sin existir; decisión de producto ya anotada en `estado.md`).

## Flujo
Escritor de tests → Desarrollador → Tester (Supabase simulado, pantallazos claro y oscuro) → Juez → PR → merge → redespliegue del front.

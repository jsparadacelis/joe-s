# RGB-18 · Registro de implementación

## 2026-10-26

TDD: casos compartidos y tests en rojo (el módulo no existía), luego el módulo.

- Back: `validate_cadastral_reference` / `normalize_cadastral_reference` con 16 casos compartidos (válida, minúsculas, espacios exteriores e interiores, tabulador y espacio duro, 14 de parcela, corta, larga, vacía, solo espacios, guiones, símbolos, tilde, `ß`, símbolo con longitud errónea, carácter de control) y códigos de error estables. 31 tests.
- Front: `lib/cadastral-reference.ts` con los mismos casos; `isValidCadastralReference` delega en él. Los 1814 tests anteriores siguen verdes sin cambios (el caso «espacio interior» de `technical-data.test.ts` se sigue rechazando, ahora por longitud). 1845 en total; lint, `typecheck` y `build` en verde.
- Sin cambios de interfaz, así que no hay pantallazos.
- Un hallazgo de diseño: pasar a mayúsculas antes de validar convertiría `ß` en `SS`; por eso la comprobación de caracteres va antes. Hay un caso compartido que lo fija.
- Sin veredicto de Juez independiente.

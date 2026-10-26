# RGB-18 · Validación de la referencia catastral

Tarea de back (P0, S, E3). Depende de RGB-17 (hecha); bloquea RGB-24 (cliente del Catastro).

Fuente: página RGB-18 del Backlog de Notion.

## Criterios de aceptación

- [x] Mensajes en español que explican el formato (14 de la parcela y 6 del inmueble).
- [x] Tests con casos válidos, de 14 caracteres, con símbolos y con espacios.

## Diseño

- Módulo de dominio puro `backend/app/external_data/domain/cadastral_reference.py` (contexto `external_data`, que ya prevé la arquitectura): `normalize_cadastral_reference` y `validate_cadastral_reference`, que devuelve la referencia normalizada o lanza `InvalidCadastralReference` con `code` y `message`.
- El mismo módulo en el front, `frontend/lib/cadastral-reference.ts`, y un fichero de casos compartido (`backend/tests/external_data/domain/cadastral_cases.json`) que leen los tests de los dos lados, como `score_cases.json` en RGB-14. El servidor es la referencia.
- `isValidCadastralReference` (datos técnicos y relieve) delega en el módulo nuevo.

## Reglas

1. Se quitan los espacios (espacio, tabulador, salto de línea y espacio duro) en cualquier posición y se pasa a mayúsculas. La lista es fija a propósito: `\s` de JS y `str.split()` de Python difieren en U+001C a U+001F y U+0085 (el desajuste ya visto en RGB-13).
2. Vacía: «Introduce la referencia catastral.»
3. Cualquier carácter que no sea letra ASCII o dígito (guiones, símbolos, tildes, `ß`): «solo puede llevar letras y números, sin símbolos ni guiones». Se comprueba **antes** de pasar a mayúsculas, porque `"ß".upper()` daría `SS` y colaría un símbolo como letras. Gana a la longitud.
4. 14 caracteres: mensaje específico de «referencia de la parcela» que explica el formato completo (código `plot_reference_only`).
5. Otra longitud: dice cuántos caracteres hay y cuál es el formato (14 + 6).
6. 20: válida.

## Fuera de alcance

- Usar los mensajes en pantalla: `TechnicalDataEditor` y `ReliefViewer` siguen con «La referencia catastral debe tener 20 caracteres.». Cambiarlo es trabajo de interfaz (con pantallazos); queda como seguimiento.
- Validar el campo `cadastral_reference` de la ficha del proyecto al guardar: hoy es texto libre y exigirlo cambiaría la edición de la ficha. Decisión de producto aparte.
- Consultar el Catastro (RGB-24).

## Archivos

Back: `app/external_data/domain/cadastral_reference.py`, `tests/external_data/domain/{test_cadastral_reference.py,cadastral_cases.json}`.
Front: `lib/cadastral-reference.ts`, `__tests__/lib/cadastral-reference.test.ts`, `lib/technical-data.ts`.
Docs: este plan, `implementation_log.md`, `docs/estado.md`, `docs/arquitectura.md`, Notion y el artifact.

# RGB-29 · Registro de implementación

## Escritor de tests

Tests escritos desde `plan.md` y el borrador navegable, antes de implementar. No hay código de producción ni stubs.

### Archivos nuevos
- `__tests__/lib/datos-tecnicos.test.ts`: GRUPOS, DEFINICIONES (26 ids en orden, 12/6/8, tipos, orígenes, unidades, opciones literales del borrador, `ab` con 22 opciones), `estaEditado`, `contarPendientes`, `contarEditados`, `restaurarDato`, `marcarTodoVerificado`, `esReferenciaCatastralValida`, `reconsultar`, `obtenerDatosTecnicos` (residencial/industrial, planeamiento vacío salvo `scalc`, copias) y `obtenerDatosTecnicosGuardados` (EJ-004/002/desconocido null; EJ-001 con 0 pendientes y 2 editados).
- `__tests__/lib/capacidad.test.ts`: `parseNumero`, `formatearNumero`, `calcularCapacidad` con casos calculados a mano (limita edificabilidad / ocupación × plantas, empate, Polígono, PB..PB+5, parcela mínima, existente, nulls).
- `__tests__/components/proyecto/datos-tecnicos/DatosTecnicosEditor.test.tsx`: entrada previa, referencia inválida, consulta («Consultando…»), grupos, listas con «Sin dato», editado/original/Restaurar, manual sin «Editado», verificado y contadores, «Marcar todo como verificado», capacidad en vivo, volver a consultar, modos `solo-lectura` y `vista-previa`, sin datos, axe, etiquetas, teclado.

### Archivos existentes modificados (por la existencia de PRY-EJ-004)
- `__tests__/lib/proyectos.test.ts`: «tres» pasa a cuatro proyectos (`toHaveLength(4)`, se añade `["PRY-EJ-004", 2]`), `it.each` de versión congelada incluye EJ-004, y bloque nuevo de EJ-004.
- `__tests__/lib/tiempos.test.ts`: EJ-004 entra en `codigos` de coherencia y bloque nuevo (7 fases, fase actual 2, nada activo tras la actual, totales = sumas, calendario = activas + pausa).
- `__tests__/app/plan-y-tiempos.test.tsx`: EJ-004 en el axe y un test de su plan (7 barras, un h1).
- `__tests__/app/proyectos.test.tsx`: enlace de EJ-004 a la fase 2 y bloque nuevo de la fase 2 (EJ-004 edición, EJ-001 solo lectura, EJ-002 vista previa, otras fases sin panel, axe).
No se tocó ningún test de componentes existente. La única aserción previa cambiada es `toHaveLength(3)` a 4.

### Cómo fallan
Todas las suites nuevas fallan por módulo inexistente (`@/lib/datos-tecnicos`, `@/lib/capacidad`, `@/components/proyecto/datos-tecnicos/DatosTecnicosEditor`). `lib/proyectos`, `lib/tiempos`, `app/proyectos` y `app/plan-y-tiempos` fallan en los tests de PRY-EJ-004 y el panel. El resto (499 tests) sigue en verde.
Para comprobar que los tests son correctos y no piden imposibles, se implementó de forma desechable una versión mínima (no incluida): con ella los 23 tests rojos pasaron, salvo ajustes ya hechos en los tests.

### Ambigüedades del plan y cómo se trataron
1. **Props de `FilaDato`, `PanelGrupo`, `PanelCapacidad`, `ResumenVerificacion`**: el plan no las define. No se testean por separado; los cubre `DatosTecnicosEditor`.
2. **Firma de `DatosTecnicosEditor`**: se pasa `inicial={null}` cuando no hay datos (el plan no dice si es opcional o `null`); `modo` es `ModoFase`; `consultar(ref)` recibe la referencia.
3. **Estructura DOM de una fila**: no fijada. Los tests localizan el control por etiqueta (`getByLabelText(/^Etiqueta/)`, tolera que el origen vaya dentro o fuera de la etiqueta) y la «fila» como el primer ancestro que contiene una casilla.
4. **Textos de Capacidad**: el plan solo fija el aviso vacío. Los tests usan el borrador: cifras como `150 m²t` y «limita: Edificabilidad / Ocupación × plantas», «Cumple» / «No cumple», comprobados con `toHaveTextContent` sobre el contenedor (toleran el reparto en elementos).
5. **«vacío»**: «Valor de {origen}: {original o vacío}» se interpreta como el literal «vacío» cuando el original es cadena vacía (como el borrador).
6. **Contador de editados**: «{n} editados» literal («1 editados»). No se afirma si aparece «0 editados».
7. **Referencia catastral en solo lectura/vista previa**: se exige `disabled` o `readOnly`; el resto de controles deben estar `disabled`. Todos los botones presentes deben estar deshabilitados.
8. **Vista previa o solo lectura sin datos**: el plan solo fija el texto para solo lectura. En vista previa se acepta o bien botón de consulta deshabilitado o bien el aviso «Sin datos técnicos registrados.».
9. **`reconsultar`**: «manual» = `original === null` en el estado actual; el orden del resultado es el de `nuevos`; un id que no estaba en `actual` se toma de `nuevos`.
10. **`obtenerDatosTecnicos` con referencia inválida**: el plan no lo define; no se testea.
11. **`obtenerDatosTecnicosGuardados('PRY-EJ-001')`**: el plan solo dice «verificados» y «2 editados»; se exige 0 pendientes, 26 datos y 2 editados, sin fijar valores concretos. `PRY-EJ-003` también devuelve null (el plan dice «el resto → null»).
12. **`formatearNumero`**: decimales por defecto 0 (como el borrador); no se prueba el separador de millares en 4 cifras (ICU `es-ES` no lo aplica).
13. **Duración**: el editor tarda ~40 s en esta suite (user-event + 26 controles); se fija `jest.setTimeout(20000)` en ese archivo.

## Desarrollador

Implementado para poner en verde los tests del Escritor de tests, sin modificarlos ni debilitarlos.

### Qué se hizo
- `lib/datos-tecnicos.ts`: `GRUPOS`, `DEFINICIONES` (26, listas copiadas del borrador; `ab` generada: «< 0,04 g» y 0,04 a 0,24 g), funciones puras (`estaEditado`, contadores, `restaurarDato`, `marcarTodoVerificado`, `esReferenciaCatastralValida`, `reconsultar`) y, en un bloque «DATOS DE EJEMPLO» sustituible por el cliente de la API, `obtenerDatosTecnicos` y `obtenerDatosTecnicosGuardados` (siempre copias). PRY-EJ-001 devuelve los datos verificados con 2 editados (`sc` y `spp`) y planeamiento de ejemplo.
- `lib/capacidad.ts`: `parseNumero`, `formatearNumero` (Intl.NumberFormat cacheado), `calcularCapacidad`.
- `lib/proyectos.ts`: PRY-EJ-004 («Local comercial (ejemplo)», fase 2) y `obtenerReferenciaCatastral(codigo)` (referencias ficticias de las fichas). `lib/tiempos.ts`: plan de PRY-EJ-004 (2 + 1 semanas activas, sin pausas).
- `components/proyecto/datos-tecnicos/`: `DatosTecnicosEditor` (único Client Component, estado local inmutable), `FilaDato` (memoizada), `PanelGrupo`, `PanelCapacidad`, `ResumenVerificacion` (Server-compatibles, sin estado).
- Página de la fase 2: muestra el editor bajo el entregable genérico; el resto de fases no cambia.
- Test nuevo `DatosTecnicosEditorFallo.test.tsx` para código no cubierto (ruta manual).

### Decisiones
- **Referencia de la ficha**: `Proyecto` no cambia (un test fija su forma exacta con `toEqual`); se añade la función aparte `obtenerReferenciaCatastral`. La página usa la referencia guardada si la hay, si no la de la ficha.
- **Rendimiento**: `FilaDato` con `memo`, callbacks estables por `id` (actualización funcional), `Map` por id y capacidad con `useMemo`; al teclear solo se repinta la fila editada.
- **Ruta manual** (regla del repo «ruta manual si falla»): si `consultar` rechaza, aviso «No se pudo consultar. Puedes introducir los datos manualmente.» y botón «Introducir datos manualmente», que crea los 26 datos vacíos sin origen (no cuentan como editados).
- **Solo lectura sin datos**: solo el aviso «Sin datos técnicos registrados.». **Vista previa sin datos**: entrada con referencia y consulta deshabilitadas.
- En solo lectura y vista previa, «Restaurar» se muestra deshabilitado; «Marcar todo como verificado» y «Volver a consultar» también.
- Estados en texto (chips «Editado», «Limita», «Verificado» con nombre accesible «Verificado {dato}»); los bordes de color son un refuerzo. `aria-live="polite"` en el contador y en avisos/resultado de la consulta.
- Texto de origen: «Consultado el {fecha} a través del servidor» (el borrador decía «valores simulados»).

### Desviaciones
- `jest.config.js`: `testTimeout: 20000`. Axe sobre pantallas con 26 controles tarda ~2 s aislado y, con las suites en paralelo, superaba los 5 s por defecto de tests que no puedo tocar (y provocaba «Axe is already running» en cascada). Es configuración, no debilita ningún test.
- No hay cambios en los tests del Escritor. Ninguno pareció incorrecto.
- `last:border-b-0` lo rechaza el test de clases de color; las filas conservan todas su borde inferior.

### Resultados
`npm run lint`, `npm run typecheck`, `npm test` (670 tests) y `npm run build` en verde.

## Tester

Fecha: 2026-10-23

### Qué se ejecutó

- `npm run lint`, `typecheck`, `test` (34 suites, 670 tests) y `build` en verde, sin cambios de código mío. La suite tarda 74-88 s; se ejecutó tres veces (completa dos veces y una con `--testTimeout=5000`) sin ningún test flaky. El `testTimeout` de 20 s es razonable como margen (en esta máquina todo pasa incluso con 5 s, pero axe con 26 controles sube con CPU compartida); no debilita ningún test.
- Build real + `npm run start` (puerto 3489) y `curl`: `/proyectos` 200; `/proyectos/PRY-EJ-004` 307 a `/fase/2`; `/plan-y-tiempos` 200 para EJ-001..004; `/proyectos/NOEXISTE`, `/fase/8` y `/fase/x` 404. Fases 0..7 de EJ-001..004: un único h1 en todas; el panel «Datos técnicos del inmueble» solo aparece en la fase 2 (EJ-003 en fase 2: «Sin datos técnicos registrados.»).
- Playwright (`playwright-core` en el directorio temporal de la sesión, fuera del repo; Chromium, locale `es-ES`, 1440 px, claro y oscuro) sobre `/proyectos/PRY-EJ-004/fase/2`:
  - Referencia prellenada `1234567DG3413S0001AB`. Con 19 caracteres, con símbolo (`...0001A!`), vacía, con espacio y con guiones: aviso «La referencia catastral debe tener 20 caracteres.» y no aparece ningún grupo. 21 caracteres: `maxLength=20` impide teclearlos; quitando el atributo desde la consola, el aviso también sale. El aviso desaparece al editar.
  - «Obtener datos técnicos» pasa a «Volver a consultar»; 3 grupos + Capacidad; 26 etiquetas con su origen y unidad, idénticas a `TECH_DEF`; valores idénticos a `TECH_SRC.residencial`; listas con «Sin dato» y opciones idénticas al borrador (22 de aceleración, 15 zonas, 13 usos...). «Consultando…» no se llega a ver en el navegador porque la función de ejemplo resuelve al instante (lo cubren los tests con promesa diferida).
  - Editar `sc` y `uso`: chip «Editado» y «Valor de Catastro: 142 / Residencial»; «Restaurar» devuelve el valor; contador «2 editados»; editar un dato manual (`altura`) no muestra «Editado». «Verificado»: 26 sin verificar a 19 tras marcar 7; «Marcar todo como verificado» deja «Todo verificado».
  - Capacidad a mano contra la fórmula (spc 96, spp 99,4, edif 1,5, ocup 70, PB+2): catastral techo 144 / huella 67,2 / x3 201,6, máximo 144, limita Edificabilidad, existente 142 (99 %); Polígono: 149,1 / 69,6 / 208,7, máximo 149,1; con ocupación 40: huella 39,8, x3 119,3, limita Ocupación × plantas, existente 119 %; parcela mínima 100: «No cumple (99 < 100 m²)»; con mínima 80: «Cumple (96 ≥ 80 m²)». Edificabilidad no numérica: vuelve el aviso de rellenar. Todos coinciden.
  - «Volver a consultar» conserva los manuales (altura 12, edif 1,5, plantas PB+2) y repone los datos de origen (sc 142, uso Residencial) sin verificar.
  - Solo teclado: Tab entre campos, escribir en los números, flechas en las listas (PB+2 con 3 flechas), Espacio en «Verificado», Enter en «Restaurar». Foco: outline sólido de 2 px, offset 2 px.
  - Ninguna petición a otro origen que el servidor propio.
- Modos: EJ-001 (solo lectura, datos visibles, 59 controles, 0 habilitados, «Todo verificado», sc 138 con «Valor de Catastro: 142») y EJ-002 (vista previa, 4 controles, 0 habilitados). 
- axe-core 4.x real en el navegador (wcag2a/aa, 21aa, best-practice): 0 violaciones en EJ-004 antes y después de consultar, EJ-001 y EJ-002.
- Contraste con los tokens (texto sobre fondo del chip): `warn/warn-soft` 4,77 claro / 6,83 oscuro; `ok/ok-soft` 5,11 / 6,41; `point/point-soft` («Limita») 9,10 / 4,88. Bordes de estado sobre `surface` en claro: ok 6,16, warn 5,70, point 11,3. Todo >= 4,5 (texto) y >= 3 (no textual).
- Higiene: sin `fetch`, `process.env` ni URLs de servicios externos en `lib`, `components` y `app`; sin auth/API/Docker/CI; `node_modules` y `.next` ignorados, no existe `test-results`; datos ficticios.

### Criterios

Todos cumplen salvo lo indicado en hallazgos (ruta manual solo verificada por tests, no en navegador).

### Hallazgos

1. **Media, sin corregir.** Tras la ruta manual («Introducir datos manualmente») todos los datos tienen `original = null`; si luego una consulta funciona, `reconsultar` los trata como manuales y los datos de origen nunca se rellenan. Hay que decidir si la ruta manual marca los datos de parcela y condiciones como «sin origen» distinto de «manual» (p. ej. `reconsultar` solo conserva los de planeamiento, como dice el plan: «manuales (planeamiento)»). No se corrigió porque cambia el contrato de `reconsultar`, fijado por tests.
2. **Baja.** La ruta manual y el estado «Consultando…» no se pueden forzar en el build de producción (la consulta de ejemplo no falla ni tarda); solo están cubiertos por tests con promesas.
3. **Baja.** Los controles (`border-hair` #d6d5d1 sobre blanco, 1,4:1) no llegan a 3:1 como límite del control (WCAG 1.4.11). Es el mismo token que ya usan los campos de `FaseEntregable` y el resto de la app (patrón heredado), y el texto del control sí cumple; se anota para el sistema de diseño.
4. **Baja.** Visual: con 12 datos frente a 6, «Condiciones técnicas» deja unos 300 px vacíos bajo ella (`items-start`, igual que `.tgroups` del borrador). Sin solapes ni texto cortado; etiquetas largas («Sup. de parcela (polígono)») envuelven a 2 líneas sin desalinear filas.
5. **Baja.** Copia: el texto «Todos editables…» se mantiene también en solo lectura y vista previa, donde nada se puede editar. La referencia se muestra en mayúsculas por CSS pero el valor interno conserva las minúsculas (la validación es insensible a mayúsculas). `aria-invalid` no tiene estilo visible propio (el aviso lo compensa).
6. **Info.** La vista previa del borrador permitía probar la consulta y editar; el plan (RGB-10/RGB-29) la deja toda deshabilitada: se sigue el plan.

### Cambios del Tester

- Solo pantallazos (ningún código ni test).

### Pantallazos (`docs/plans/RGB-29/screenshots/`, 1440 px, build real, datos ficticios)

`EJ-004-antes-de-consultar-{claro,oscuro}.png`, `EJ-004-tras-consultar-{claro,oscuro}.png` (con «Uso catastral» y «Superficie construida» editados, 7 datos verificados y la capacidad de PB+2, 70 %, 1,5), `EJ-004-referencia-invalida-{claro,oscuro}.png`, `EJ-004-foco-teclado-{claro,oscuro}.png`, `EJ-001-solo-lectura-{claro,oscuro}.png`, `EJ-002-vista-previa-{claro,oscuro}.png`.

Defectos visuales: ninguno bloqueante; solo el hallazgo 4 (hueco bajo «Condiciones técnicas»). Los estados verificado (borde y casilla verde), editado (chip y texto «Valor de…») y sin verificar se distinguen también sin color.

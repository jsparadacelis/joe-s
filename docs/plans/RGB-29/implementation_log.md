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

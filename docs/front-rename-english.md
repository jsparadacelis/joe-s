# Front: renombrado del código a inglés (RGB-34)

Regla del repo (`CLAUDE.md`): el código va en inglés; solo se queda en español lo que ve la persona usuaria y los textos del PRD sembrados como datos. Los planes históricos de RGB-6, RGB-10, RGB-22 y RGB-29 **no se reescriben**: esta tabla traduce sus nombres a los actuales. El comportamiento no cambia.

## Módulos y archivos

| Antes | Ahora |
|---|---|
| `lib/fases.ts` | `lib/phases.ts` |
| `lib/proyectos.ts` | `lib/projects.ts` |
| `lib/tiempos.ts` | `lib/timing.ts` |
| `lib/datos-tecnicos.ts` | `lib/technical-data.ts` |
| `lib/capacidad.ts` | `lib/capacity.ts` |
| `lib/relieve.ts` | `lib/relief.ts` |
| `lib/relieve-lecturas.ts` | `lib/relief-readings.ts` |
| `lib/relieve-colores.ts` | `lib/relief-colors.ts` |
| `lib/relieve-escena.ts` | `lib/relief-scene.ts` |
| `components/proyecto/` | `components/project/` |
| `components/proyecto/FaseEntregable.tsx` | `components/project/PhaseDeliverableForm.tsx` |
| `components/proyecto/ModoBanner.tsx` | `components/project/ModeBanner.tsx` |
| `components/proyecto/ProyectoTabs.tsx` | `components/project/ProjectTabs.tsx` |
| `components/proyecto/datos-tecnicos/` | `components/project/technical-data/` |
| `DatosTecnicosEditor` | `TechnicalDataEditor` |
| `FilaDato` | `DatumRow` |
| `PanelCapacidad` | `CapacityPanel` |
| `PanelGrupo` | `GroupPanel` |
| `ResumenVerificacion` | `VerificationSummary` |
| `components/proyecto/relieve/` | `components/project/relief/` |
| `VisorRelieve` | `ReliefViewer` |
| `ControlesRelieve` | `ReliefControls` |
| `LecturasRelieve` | `ReliefReadings` |
| `AvisosRelieve` | `ReliefNotices` |
| `components/tiempos/` | `components/timing/` |
| `HistorialPausas` | `PauseHistory` |
| `ResumenTiempos` | `TimingSummary` |
| `TablaTiempos` | `TimingTable` |
| `app/proyectos/[codigo]/fase/[fase]` | `app/proyectos/[code]/fase/[phase]` (la URL no cambia) |
| `app/proyectos/[codigo]` | `app/proyectos/[code]` |
| `__tests__/` | mismos nombres traducidos (`relieve-arquitectura` pasa a `relief-architecture`, `reconsultar-grupos` a `requery-groups`, `helpers/relieve-plano` a `helpers/relief-plane`) |
| CSS `--relieve-bajo/-medio-bajo/-medio-alto/-alto` | `--relief-low/-mid-low/-mid-high/-high` |

## Funciones

| Antes | Ahora |
|---|---|
| `estadoFase` / `modoFase` / `parseFaseId` | `phaseState` / `phaseMode` / `parsePhaseId` |
| `listarProyectos` / `obtenerProyecto` | `listProjects` / `fetchProject` |
| `obtenerEntregable` | `fetchDeliverable` |
| `obtenerReferenciaCatastral` | `fetchCadastralReference` |
| `obtenerPlanTiempos` | `fetchTimingPlan` |
| `porcentajeConsumo` / `semaforoConsumo` / `formatearFecha` | `consumptionPercent` / `consumptionTrafficLight` / `formatDate` |
| `obtenerDatosTecnicos` / `obtenerDatosTecnicosGuardados` | `fetchTechnicalData` / `fetchSavedTechnicalData` |
| `estaEditado` / `contarPendientes` / `contarEditados` | `isEdited` / `countPending` / `countEdited` |
| `restaurarDato` / `marcarTodoVerificado` / `reconsultar` | `restoreDatum` / `markAllVerified` / `requery` |
| `esReferenciaCatastralValida` | `isValidCadastralReference` |
| `calcularCapacidad` / `parseNumero` / `formatearNumero` | `calculateCapacity` / `parseNumber` / `formatNumber` |
| `obtenerRelieve` | `fetchRelief` |
| `recortarPoligono` / `calcularVentana` | `clipPolygon` / `calculateViewWindow` |
| `alturaEn` / `areaPoligono` / `puntoEnPoligono` / `calcularLecturas` | `heightAt` / `polygonArea` / `pointInPolygon` / `calculateReadings` |
| `leerColoresEscena` / `leerRampaAlturas` | `readSceneColors` / `readHeightRamp` |
| `montarEscena` | `mountScene` |
| `Escena.reiniciar/acercar/alejar/actualizarExageracion/liberar` | `ReliefScene.reset/zoomIn/zoomOut/updateExaggeration/release` |

## Tipos y constantes

| Antes | Ahora |
|---|---|
| `FaseId`, `Fase`, `FASES` | `PhaseId`, `Phase`, `PHASES` |
| `EstadoFase`, `ModoFase` | `PhaseState`, `PhaseMode` |
| `Proyecto`, `EntregableFase`, `Campo`, `TipoCampo` | `Project`, `PhaseDeliverable`, `Field`, `FieldType` |
| `PlanTiempos`, `TiempoFase`, `FaseConPlan`, `Pausa`, `PausaActiva`, `MotivoPausa`, `Semaforo` | `TimingPlan`, `PhaseTiming`, `PlannedPhase`, `Pause`, `ActivePause`, `PauseReason`, `TrafficLight` |
| `ETIQUETA_MOTIVO`, `ETIQUETA_SEMAFORO`, `TONO_SEMAFORO` | `REASON_LABEL`, `TRAFFIC_LIGHT_LABEL`, `TRAFFIC_LIGHT_TONE` |
| `DatoTecnico`, `DatosTecnicos`, `DefinicionDato`, `Grupo`, `GrupoId`, `TipoDato`, `GRUPOS`, `DEFINICIONES` | `TechnicalDatum`, `TechnicalData`, `DatumDefinition`, `DataGroup`, `DataGroupId`, `DatumType`, `DATA_GROUPS`, `DEFINITIONS` |
| `Capacidad` | `Capacity` |
| `Relieve`, `OpcionesRelieve`, `Margen`, `LadoMaximo`, `Exageracion`, `Punto`, `Ventana` | `Relief`, `ReliefOptions`, `Margin`, `MaxSide`, `Exaggeration`, `Point`, `ViewWindow` |
| `MARGENES`, `LADOS_MAXIMOS`, `EXAGERACIONES` | `MARGINS`, `MAX_SIDES`, `EXAGGERATIONS` |
| `Lecturas`, `ColoresEscena`, `RampaAlturas`, `Escena` | `Readings`, `SceneColors`, `HeightRamp`, `ReliefScene` |

## Campos

| Antes | Ahora |
|---|---|
| `codigo`, `nombre`, `faseActual`, `faseVista` | `code`, `name`, `currentPhase`, `viewedPhase` |
| `entregable`, `promueve`, `campos`, `etiqueta`, `tipo`, `valor`, `versionCongelada` | `deliverable`, `promoter`, `fields`, `label`, `type`, `value`, `frozenVersion` |
| `planSemanas`, `activasSemanas`, `pausaSemanas` | `plannedWeeks`, `activeWeeks`, `pausedWeeks` |
| `totalPlanSemanas`, `totalActivasSemanas`, `totalPausaSemanas`, `calendarioSemanas`, `desviacionSemanas` | `totalPlannedWeeks`, `totalActiveWeeks`, `totalPausedWeeks`, `calendarWeeks`, `deviationWeeks` |
| `fases`, `pausas`, `pausaActiva`, `desde`, `hasta`, `motivo`, `semanas`, `reanudacionPrevista` | `phases`, `pauses`, `activePause`, `from`, `to`, `reason`, `weeks`, `expectedResumption` |
| `referenciaCatastral`, `consultadoEl`, `datos`, `origen`, `unidad`, `opciones`, `verificado` | `cadastralReference`, `queriedOn`, `data`, `origin`, `unit`, `options`, `verified` |
| `superficie`, `techo`, `huella`, `porPlantas`, `maximo`, `limita`, `existente`, `parcelaMinima`, `cumpleParcelaMinima` | `surface`, `buildableArea`, `footprint`, `byFloors`, `maximum`, `limitedBy`, `existing`, `minPlot`, `meetsMinPlot` |
| `ventana`, `columnas`, `filas`, `alturas`, `perimetro`, `superficiePoligono`, `recortada`, `parcelaCortada`, `fuente` | `viewWindow`, `columns`, `rows`, `heights`, `perimeter`, `polygonSurface`, `clamped`, `plotClipped`, `source` |
| `referencia`, `margen`, `ladoMaximo`, `exageracion` | `reference`, `margin`, `maxSide`, `exaggeration` |
| `alturaMin`, `alturaMax`, `desnivel`, `pendienteMedia` | `minHeight`, `maxHeight`, `elevationRange`, `meanSlope` |
| `fondo`, `acento`, `borde` (colores de la escena) | `background`, `accent`, `border` |

## Props

| Antes | Ahora |
|---|---|
| `codigo`, `faseActual`, `faseVista`, `modo`, `entregable` | `code`, `currentPhase`, `viewedPhase`, `mode`, `deliverable` |
| `onGuardar` | `onSave` |
| `referenciaInicial`, `obtener` (VisorRelieve) | `initialReference`, `fetcher` |
| `inicial`, `consultar`, `referenciaCatastral` (DatosTecnicosEditor) | `initial`, `query`, `cadastralReference` |
| `deshabilitado`, `onCambiar`, `onVerificar`, `onRestaurar`, `onMarcarTodo` | `disabled`, `onValueChange`, `onVerify`, `onRestore`, `onMarkAll` |
| `onReferencia`, `onMargen`, `onLadoMaximo`, `onExageracion`, `onAtajo`, `onVer`, `atajos`, `idError` | `onReference`, `onMargin`, `onMaxSide`, `onExaggeration`, `onShortcut`, `onView`, `shortcuts`, `errorId` |
| `StatusChip variant="semaforo"` | `variant="traffic-light"` |

## Valores

| Antes | Ahora |
|---|---|
| modos `edicion` / `solo-lectura` / `vista-previa` | `edit` / `read-only` / `preview` |
| estados `hecha` / `actual` / `vista` | `done` / `current` / `upcoming` (el texto visible sigue siendo «hecha», «actual», «vista») |
| semáforo `verde` / `ambar` / `rojo` | `green` / `amber` / `red` |
| motivos `espera-cliente` / `espera-organismo` / `decision-interna` / `otra` | `client-wait` / `authority-wait` / `internal-decision` / `other` |
| tipos de campo `texto` / `area` / `fecha` | `text` / `textarea` / `date` |
| grupos `parcela` / `condiciones` / `planeamiento` | `plot` / `conditions` / `planning` |
| tipos de dato `texto` / `numero` / `lista` | `text` / `number` / `list` |
| `limita`: «Edificabilidad» / «Ocupación × plantas» | `limitedBy`: `buildability` / `occupancy-floors` (la interfaz sigue mostrando los textos en español) |
| estados del visor `reposo/cargando/listo/sin-webgl/error` | `idle/loading/ready/no-webgl/error` |
| ids de datos técnicos `dir, muni, clase, uso, anyo, sc, spc, spp, coords, alt, pend, pendcat, zc, ab, k, viento, nieve, fv, edif, ocup, altura, plantas, retv, retl, pmin, scalc` | `address, municipality, propertyClass, use, year, builtArea, cadastralPlotArea, polygonPlotArea, coords, altitude, slope, slopeType, climateZone, seismicAcceleration, kCoefficient, windZone, snowZone, pvProduction, buildability, maxOccupancy, maxHeight, floors, streetSetback, boundarySetback, minPlot, calcArea` |
| ids DOM `dato-<id>`, `relieve-referencia`, `relieve-recorte`, `relieve-lado`, `relieve-exageracion` | `datum-<id>`, `relief-reference`, `relief-margin`, `relief-max-side`, `relief-exaggeration` |

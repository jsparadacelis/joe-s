# Huecos del backend

Qué le falta al backend para que el front deje de usar datos de ejemplo, a qué tarea del Backlog pertenece cada hueco y qué archivo del front lo sustituye hoy. Se mantiene al cerrar cada tarea.

Fuente del reparto: tabla del Backlog de Notion (título, tipo, dependencias y notas de todas las tareas) y las páginas completas de RGB-11, RGB-13, RGB-16, RGB-17, RGB-21 y RGB-23. Lo marcado **(por verificar)** sale de deducir, no de una página leída. Estado de la API a 2026-10-24: promoción (`POST /api/projects/{code}/promote|hold|do-not-pursue`), `GET /api/plan` y ajustes del plan (`GET/PUT /api/settings/plan…`), con topes y 422 uniformes (PR #29). No hay autenticación ni lecturas de proyectos.

## Capas del front con datos de ejemplo

| Archivo del front | Pantalla | Lo sustituye (tareas) |
| --- | --- | --- |
| `frontend/lib/projects.ts` | Línea de fases, entregables, proyectos | Lectura mínima de proyecto (`GET /api/projects/{code}`) **resuelta por RGB-13**; faltan entregables y fases: RGB-17 (ficha), RGB-36 (entregables) y las fases de RGB-19/32/35 |
| `frontend/lib/timing.ts` | «Plan y tiempos» | RGB-21 (pausas y su persistencia) sobre RGB-20 (hecha, funciones puras) |
| `frontend/lib/portfolio.ts` | Cartera | Lectura mínima (`GET /api/portfolio`) **resuelta por RGB-13**; el semáforo, el hito y las semanas siguen nulos/`unknown` hasta RGB-17, RGB-21 y RGB-16 |
| `frontend/lib/technical-data.ts` | Datos técnicos | RGB-24 (Catastro), RGB-27 (tablas técnicas), RGB-28 (modelo del dato) |
| `frontend/lib/capacity.ts` | Capacidad edificable | RGB-30 |
| `frontend/lib/relief.ts` | Visor 3D | RGB-33 (MDT del IGN), con RGB-25 (perímetro INSPIRE) |

Conectado a la API real: ajustes del plan en `/settings` (PR #27); alta de oportunidad, cartera y ficha mínima (RGB-13).

## Huecos por dato

| Hueco | Qué bloquea | Quién lo resuelve | Notas |
| --- | --- | --- | --- |
| ~~Nadie hace `INSERT` en `projects`~~ | ~~La cartera real, que hoy saldría vacía~~ | **Resuelto por RGB-13** (`POST /api/opportunities`, migración 006) | La oportunidad aparece en la cartera en fase 0 con «Sin plan hasta promover». Pendiente solo desplegarlo en Cloud Run/Supabase |
| Responsable: hoy solo un id | Columna «Responsable» con nombre | RGB-2 (usuarios) y RGB-4 (roles); el id lo guarda RGB-13 | Hasta entonces, `owner_name` nulo |
| Tipología y escala | Plan y semáforo calculado en servidor | RGB-13 guarda la tipología; **RGB-16** elige tipología y escala desde el scoring, confirma el plan como línea base y crea la ficha | El análisis previo atribuía todo a RGB-16; el alta de la tipología es de RGB-13 |
| Próximo hito, semáforo y riesgo | Columnas de hito y estado | **RGB-17** · Ficha (bloques «Tiempo»: plan confirmado, próximo hito y fecha; «Estado»: semáforo; «Riesgo») | La ficha es la fuente del hito: apunta a que manda el hito de la ficha frente a `internal_milestones` **(por verificar con el PRD)** |
| ~~Pausas~~ | ~~«En pausa», fecha prevista, reloj parado~~ | **Resuelto por RGB-21** (migración 007, `POST .../pause`, `.../resume`, `GET .../pauses` y `pause` en `GET /api/portfolio`) | La cartera muestra «En pausa» y la fecha prevista. Pendiente solo desplegarlo en Cloud Run/Supabase; el reloj activo con pausas reales llega con RGB-22 |
| Bloqueo del proyecto | Columna «Bloqueo» | **Sin tarea clara**: candidatos RGB-39 (riesgos, incidencias y decisiones) o RGB-37 (trámite municipal) **(por verificar con el PRD)** | Decidir antes de añadir columna o migración |
| Última actualización de la ficha | «Días sin actualizar», fichas desactualizadas | **Sin tarea clara**; encaja con RGB-17 (ficha) **(por verificar)** | Hoy `updated_at` solo cambia al promover |
| Autenticación y permisos | Quién puede cambiar ajustes, promover o pausar | RGB-2 y RGB-4 | La API de Cloud Run es pública sin auth: cualquiera puede cambiar los ajustes del plan |
| Semillas de ejemplo | Datos de prueba comunes front/back | RGB-7 (calidad) | El PR #29 sembró solo el estudio ficticio de desarrollo (`seed_dev`) |
| Estado «En revisión» en Notion | — | La persona revisora | RGB-1, 3, 5, 8, 9, 15 y 20 están mergeadas en `main` pero figuran «En revisión» |

## Orden recomendado

1. **RGB-13** (alta de oportunidad): primera escritura en `projects`, desbloquea una cartera con datos reales mínimos (oportunidades en fase 0).
2. ~~**RGB-21** (pausas)~~ (hecha): desbloquea «en pausa» y el semáforo por consumo, y con ello RGB-23 y el reporte semanal (RGB-42).
3. **RGB-14, RGB-16 y RGB-17** (scoring, plan propuesto y ficha): tipología, escala, hito y semáforo en servidor.
4. **RGB-2 y RGB-4** (autenticación y roles): nombres de responsable y permisos; imprescindibles antes de exponer la API a más personas.
5. RGB-11 (parte back) entra cuando 1 y 2 estén; mientras tanto puede dar `unknown` en lo que falte, no un valor inventado.

## Decisiones pendientes de la persona responsable del producto

1. ¿Qué proyectos entran en la cartera (activos, todos menos los descartados) y se ocultan los cerrados (fase 7)?
2. ¿Qué manda para el próximo hito: el de la ficha o los hitos internos con fecha?
3. ¿El semáforo se calcula por consumo del plan (RGB-22) o se fija a mano? Si se calcula, mostrará «Sin calcular» hasta tener tipología, escala y pausas.
4. ¿Qué tarea es la dueña de «bloqueo» y de «última actualización de la ficha»?

## Cómo se actualiza este documento

Al cerrar una tarea que quite un hueco: se tacha aquí, se sustituye el archivo del front por el cliente de la API y se anota en `docs/estado.md`. Los análisis por tarea están en `docs/plans/RGB-N/` (p. ej. `docs/plans/RGB-11/backend-analysis.md`).

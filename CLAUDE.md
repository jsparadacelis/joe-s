# RGB Proyectos

Plataforma web de escritorio para que RGB Arquitectos gestione proyectos como una sucesión de fases-estado (0 Oportunidad … 7 Cierre). Contexto, stack y alcance: [README.md](README.md). Fuente de verdad: PRD y backlog del MVP en Notion.

## Reglas

- Nada de datos reales de clientes en semillas, tests ni capturas.
- Todo texto de la interfaz en español.
- **El código siempre en inglés:** paquetes, clases, funciones, variables, tablas y columnas, rutas y claves JSON de la API, comentarios, docstrings, nombres de tests y datos de prueba. Solo va en español lo que ve la persona usuaria (interfaz y mensajes de error de la API) y los textos del PRD sembrados como datos (nombres y entregables de las fases). La documentación (`docs/`, Notion) puede seguir en español.
- Ninguna acción de IA cambia el estado de un proyecto.
- Cada transición de estado escribe en el registro de auditoría (quién, qué, cuándo, versión).
- Toda consulta externa va por el servidor, con caché y con ruta manual si falla.
- Antes de escribir código de una tarea, resume el plan y los archivos que vas a tocar.
- **DDD:** el backend (Python, FastAPI, en `backend/`) se organiza por contexto delimitado (`backend/app/<context>/{domain,application,infrastructure}`), con el lenguaje del PRD en español. El dominio es Python puro: no importa FastAPI, Supabase ni nada de fuera. Detalle en [docs/arquitectura.md](docs/arquitectura.md).
- **TDD:** ningún código de producción sin un test (pytest) que falle antes (rojo → verde → refactor). Dominio con tests unitarios puros, casos de uso con puertos simulados con `create_autospec`, infraestructura con Postgres real (incluida la RLS). Un test incorrecto se corrige justificándolo, no se debilita.

## Flujo por tarea

Toda tarea tiene un plan, documentado en el repo (`docs/plans/RGB-N/plan.md`, con `implementation_log.md` al ejecutar) y en la página de la tarea en Notion.

Las tareas de front se orquestan con subagentes: Escritor de tests (escribe los tests desde el plan y los criterios, antes de implementar), Desarrollador (implementa hasta ponerlos en verde, con buenas prácticas), Tester (verifica los criterios e intenta romper) y Juez (veredicto aprobado o rechazado). El PR solo se abre con veredicto aprobado. RGB-6 se ejecutó antes de añadir el Escritor de tests.

Al abrir un PR con código, se monta un monitor que consulta su estado cada 30 s; cuando se mergea se sigue con la siguiente tarea de front, si está clara (y se explica la decisión si no lo está). Los PRs que solo tocan `.md` se mergean sin pedir permiso. Al cerrar cada tarea se actualizan `docs/estado.md`, el plan/log de la tarea y Notion.

Todo PR de front incluye pantallazos de cómo queda la interfaz con el cambio (claro y oscuro cuando afecte al tema). Se guardan en `docs/plans/RGB-N/screenshots/` (con datos ficticios, nunca reales), se enlazan en la descripción del PR y se referencian en `implementation_log.md`. El Tester los genera con el build real y el Juez comprueba que existen y corresponden al cambio.

1. Lee la tarea `RGB-N` en la base de datos Backlog de Notion y ejecútala siguiendo su prompt.
2. Trabaja por orden de ID dentro de cada épica y respeta «Depende de».
3. No marques nada hecho hasta cumplir los criterios de aceptación.
4. Al terminar: tests en verde, commit con el ID de la tarea en el mensaje, estado a «En revisión» y una línea en la tarea con lo que cambió.
5. Una persona revisa y pasa la tarea a «Hecho».

## Skills

- Backend: [skills/backend/SKILL.md](skills/backend/SKILL.md)
- Frontend: [skills/frontend/SKILL.md](skills/frontend/SKILL.md)

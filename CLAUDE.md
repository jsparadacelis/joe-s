# RGB Proyectos

Plataforma web de escritorio para que RGB Arquitectos gestione proyectos como una sucesión de fases-estado (0 Oportunidad … 7 Cierre). Contexto, stack y alcance: [README.md](README.md). Fuente de verdad: PRD y backlog del MVP en Notion.

## Reglas

- Nada de datos reales de clientes en semillas, tests ni capturas.
- Todo texto de la interfaz en español.
- Ninguna acción de IA cambia el estado de un proyecto.
- Cada transición de estado escribe en el registro de auditoría (quién, qué, cuándo, versión).
- Toda consulta externa va por el servidor, con caché y con ruta manual si falla.
- Antes de escribir código de una tarea, resume el plan y los archivos que vas a tocar.

## Flujo por tarea

1. Lee la tarea `RGB-N` en la base de datos Backlog de Notion y ejecútala siguiendo su prompt.
2. Trabaja por orden de ID dentro de cada épica y respeta «Depende de».
3. No marques nada hecho hasta cumplir los criterios de aceptación.
4. Al terminar: tests en verde, commit con el ID de la tarea en el mensaje, estado a «En revisión» y una línea en la tarea con lo que cambió.
5. Una persona revisa y pasa la tarea a «Hecho».

## Skills

- Backend: [skills/backend/SKILL.md](skills/backend/SKILL.md)
- Frontend: [skills/frontend/SKILL.md](skills/frontend/SKILL.md)

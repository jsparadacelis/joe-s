# RGB Proyectos

Plataforma web de escritorio para que RGB Arquitectos gestione cada proyecto como una sucesión de fases-estado. Cada fase cierra con su entregable de salida y la persona encargada promueve a la siguiente.

> Fuente de verdad: PRD y backlog del MVP en Notion (*RGB Proyectos · PRD y backlog del MVP*).

## Alcance del MVP

- **Usuarios:** socio, director, directores de proyecto, líder técnico, arquitectos y colaborador de obra (11 personas). Sin acceso de cliente.
- **La fase es el estado del proyecto:** 0 Oportunidad · 1 Inicio · 2 Briefing y concepto · 3 Anteproyecto · 4 Proyecto básico · 5 Proyecto de ejecución · 6 Obra · 7 Cierre.
- **Promoción:** solo con el entregable de salida completo y aprobado, y solo por quien tiene autoridad en esa fase. Al promover se congela una versión del entregable.
- **Fases navegables:** las anteriores muestran su entregable congelado, las siguientes una vista previa; solo la actual se edita.
- **Plan de tiempos:** el scoring (tipología y escala) genera semanas por fase. Las pausas paran el reloj activo, no el calendario.
- **Fuera del MVP:** economía (honorarios, hitos de pago, facturas), portal de cliente, obra en móvil, versión móvil, postventa, licitación y preobra.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | TypeScript, Next.js 16 (App Router) + React 19 con renderizado en servidor, Tailwind CSS v4, Jest + Testing Library. Despliegue en Vercel |
| Backend | Python + FastAPI en `backend/`, DDD y TDD con pytest. Despliegue en Cloud Run. Ver [docs/arquitectura.md](docs/arquitectura.md) y [docs/despliegue.md](docs/despliegue.md) |
| Base de datos | PostgreSQL en Supabase (UE), con seguridad por fila (RLS) para multiestudio desde el día uno |
| Autenticación | Google o Microsoft |
| IA | Claude API: solo propone; nunca firma, emite ni aprueba |

### Arquitectura en tres capas

1. **Registro:** la base de datos.
2. **Orquestación:** eventos, reglas, aprobaciones y registro de auditoría.
3. **Inteligencia:** Claude API como asistente.

### Datos externos

Siempre desde el servidor, con caché por referencia catastral (30 días) y ruta manual si falla:

- Catastro (DNPRC, CPMRC, INSPIRE)
- MDT de 5 m del IGN (WCS de la IDEE, solo la ventana recortada)
- Open-Meteo y PVGIS
- Tablas del CTE DB-HE, NCSE-02 y DB-SE-AE transcritas con fuente y versión

Cada dato técnico guarda: valor, origen, valor original, editado (sí/no) y verificado (sí/no).

## Reglas del repositorio

- Nada de datos reales de clientes en semillas, tests ni capturas.
- Todo texto de la interfaz en español.
- Ninguna acción de IA cambia el estado de un proyecto.
- Cada transición de estado escribe en el registro de auditoría (quién, qué, cuándo, versión).
- Toda consulta externa va por el servidor, con caché y con ruta manual si falla.
- Antes de escribir código de una tarea, resumir el plan y los archivos a tocar.

## Estructura

```
frontend/   Next.js (app, components, lib, __tests__)
backend/    FastAPI (app, migrations, tests, Dockerfile, requirements)
docs/       arquitectura, despliegue, estado y planes por tarea
skills/     guías para Claude Code
scripts/    dev.sh: Postgres + migraciones + API (8000) + front (3000)
```

Para levantar todo en local: `bash scripts/dev.sh` (copia `.env.example` y `frontend/.env.example` si faltan).

## Estado

Qué está hecho, decisiones y pendientes: [docs/estado.md](docs/estado.md).

## Skills

Guías para trabajar con Claude Code, separadas por área:

- [`skills/backend`](skills/backend/SKILL.md): API, base de datos, auditoría, datos externos e IA.
- [`skills/frontend`](skills/frontend/SKILL.md): interfaz, fases, estados y accesibilidad.

## Flujo de trabajo

1. Trabajar el backlog por orden de ID dentro de cada épica, respetando «Depende de».
2. No marcar nada como hecho hasta cumplir los criterios de aceptación.
3. Al terminar: tests en verde, commit con el ID de la tarea (`RGB-N`) en el mensaje y estado a «En revisión» en Notion.
4. Una persona revisa y pasa la tarea a «Hecho».

## Antes de programar

- Acuerdo escrito con RGB sobre la propiedad del producto.
- Confirmar el servicio del Catastro sin certificado (el servicio WCF documentado exige certificado electrónico).

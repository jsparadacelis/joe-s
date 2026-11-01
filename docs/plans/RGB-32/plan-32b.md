# RGB-32b: pantalla del brief y promoción a Anteproyecto

Notion: https://app.notion.com/p/3fd444f747b381dcbe8bd2eed6da8655 · Servidor: RGB-32a (PR #66, desplegado). Contrato exacto de la API en `docs/plans/RGB-32/implementation_log.md` («Contrato exacto de la API»).

## Objetivo
Que el director de proyecto redacte el brief de un proyecto en fase 2 (Briefing), vea qué falta para pasar a Anteproyecto y lo promueva, y que cualquier persona del estudio lo lea (en solo lectura y, tras la promoción, la versión congelada v1 con los datos técnicos no verificados marcados). Sigue el patrón de la ficha de la fase 1 (RGB-17b/19): `ProjectSheet` + `PromotePanel`.

## Front
- `lib/brief.ts`: tipos del contrato, etiquetas en español de los 8 campos (necesidades, programa, condicionantes, presupuesto objetivo, plazo, levantamiento topográfico, alineación, aprobación del cliente: pendiente / por correo / en reunión / con firma), cliente de la API (`getBrief`, `saveBrief`, `promoteBrief` con `createApiClient`, errores `ApiError` propagados), validaciones de cliente que replican las del servidor (presupuesto numérico > 0 con hasta 2 decimales y tope, plazo `AAAA-MM-DD` entre 2000 y 2100, longitudes de 2000) — el servidor manda.
- `components/project/brief/`: `BriefForm` (campos por bloque, errores junto al campo, foco gestionado, solo editable si `permissions.can_edit`), `BriefPromotePanel` (completitud: obligatorios que faltan, «Datos técnicos obtenidos», «Aprobación del cliente registrada»; botón con la razón visible; confirmación; éxito con enlace a la fase 3; 403/404/409/422 accesibles) y `TechnicalDataSnapshot` (en la versión congelada: lista de los datos técnicos con origen, original, editado y verificado; los no verificados señalados; solo lectura).
- Integración en la página de la fase 2 (`app/projects/[code]/phase/[phase]/page.tsx`) bajo el panel de datos técnicos, solo para proyectos reales (los `PRY-EJ-*` siguen con datos locales). Con la fase > 2 se muestra la versión congelada en solo lectura con el aviso «Brief v1 congelado · solo lectura».
- El front no decide permisos: usa `permissions` del servidor y muestra sus mensajes. Textos en español, solo tokens de color, accesibilidad como criterio (roles, `aria-describedby`, foco tras guardar y tras errores).

## Fuera de alcance
Adjuntar ficheros de firma o aprobación (la plataforma aún no guarda archivos), notificar al cliente, el paquete de anteproyecto (RGB-35).

## Flujo
Escritor de tests → Desarrollador → Tester (build real + API real con Postgres local, director de proyecto asignado y rol sin autoridad; pantallazos claro y oscuro en `docs/plans/RGB-32/screenshots-32b/`) → Juez → PR → merge → despliegue.

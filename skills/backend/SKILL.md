---
name: rgb-backend
description: Convenciones de backend para RGB Proyectos (TypeScript, API, PostgreSQL con RLS, auditoría, datos externos e IA). Usar al tocar API, base de datos, migraciones, transiciones de fase o integraciones externas.
---

# Backend · RGB Proyectos

## Stack

- Python + FastAPI en `backend/`, desplegado en Railway; el front (Next.js, TypeScript) va en Vercel.
- PostgreSQL en Supabase (UE) con seguridad por fila (RLS); multiestudio desde el día uno.
- Autenticación con Google o Microsoft.

## Método

- **DDD:** `backend/app/<contexto>/{domain,application,infrastructure}`. `domain` no importa de las otras capas ni de librerías externas; `api` solo llama a casos de uso. Ver [docs/arquitectura.md](../../docs/arquitectura.md).
- **TDD (pytest):** escribe primero el test que falla. Dominio: unitario puro. Aplicación: puertos con `create_autospec`. Infraestructura: Postgres real, con tests de RLS. Convenciones de test como en parcerolegal (`backend/CLAUDE.md`).

## Reglas

1. **Multiestudio:** toda tabla de negocio lleva `studio_id` y política RLS. Ninguna consulta se salta la RLS.
2. **Fase = estado:** el proyecto solo cambia de fase mediante una transición explícita que valida (a) entregable de salida completo y aprobado y (b) rol con autoridad en esa fase.
3. **Auditoría:** cada transición de estado escribe en el registro de auditoría (quién, qué, cuándo, versión) en la misma transacción.
4. **Congelado:** al promover se guarda una versión inmutable del entregable.
5. **IA:** Claude API solo propone. Ningún código de IA cambia el estado de un proyecto ni aprueba, firma o emite.
6. **Datos técnicos:** cada dato guarda valor, origen, valor original, editado (sí/no) y verificado (sí/no).
7. **Datos externos** (Catastro, IGN, Open-Meteo, PVGIS): solo desde el servidor, con caché por referencia catastral (30 días) y ruta de entrada manual si falla.
8. **Pausas:** paran el reloj activo del plan de tiempos, no el calendario.
9. Sin datos reales de clientes en semillas ni tests.

## Antes de escribir código

Resume el plan y los archivos que vas a tocar. Lee la tarea `RGB-N` en el Backlog de Notion y respeta sus criterios de aceptación y «Depende de».

## Verificación

- Tests de las reglas de promoción y de RLS.
- Commit con el ID de la tarea en el mensaje.

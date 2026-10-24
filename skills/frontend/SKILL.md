---
name: rgb-frontend
description: Convenciones de frontend para RGB Proyectos (React con SSR, TypeScript, interfaz en español, navegación por fases). Usar al crear o modificar pantallas, componentes y flujos de interfaz.
---

# Frontend · RGB Proyectos

## Stack

- TypeScript estricto, Next.js 16 (App Router) + React 19 con renderizado en servidor.
- Tailwind CSS v4: los tokens viven en el bloque `@theme` de `app/globals.css`; ningún color suelto en componentes.
- Iconos con `lucide-react`. Tests con Jest + Testing Library (+ `jest-axe`).
- Estructura: `app/` (rutas), `components/layout`, `components/ui`, `lib/`, `__tests__/`.
- Solo escritorio en el MVP (sin versión móvil).

## Reglas

1. **Idioma:** todo texto de la interfaz en español; el código (archivos, identificadores, comentarios, nombres de tests y datos de prueba) en inglés (ver `docs/front-rename-english.md`).
2. **Fases navegables:**
   - fases anteriores: entregable congelado, solo lectura;
   - fases siguientes: vista previa;
   - fase actual: única editable.
3. **Promoción:** el botón solo se habilita con el entregable completo y aprobado y si el usuario tiene autoridad en esa fase; mostrar siempre qué falta.
4. **IA:** las sugerencias se muestran como propuestas que una persona acepta o descarta; nunca aplican cambios de estado.
5. **Datos técnicos:** mostrar origen y marcas de «editado» y «verificado»; ofrecer entrada manual cuando falla una consulta externa.
6. **Datos externos:** el cliente nunca llama a Catastro, IGN, Open-Meteo ni PVGIS; siempre pasa por la API.
7. Sin datos reales de clientes en semillas, tests ni capturas.
8. Accesibilidad básica: etiquetas en formularios, foco visible, contraste suficiente.

## Antes de escribir código

Resume el plan y los archivos que vas a tocar. Lee la tarea `RGB-N` en el Backlog de Notion y respeta sus criterios de aceptación y «Depende de».

## Verificación

- Tests de componentes con estados por fase (anterior, actual, siguiente).
- Commit con el ID de la tarea en el mensaje.

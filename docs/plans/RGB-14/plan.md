# RGB-14 · Scoring de 7 criterios con umbral configurable (full-stack)

Tarea full-stack (P0, M, E2). Depende de RGB-13 (hecha). Bloquea RGB-16 (plan propuesto y promoción). Flujo como en RGB-13/21: contrato primero ([contract.md](contract.md)), dos frentes en worktrees, Integrador, Juez, PR único.

Fuente: página RGB-14 del Backlog de Notion. Entregable de salida de la fase 0. Siete criterios de 1 a 5 (encaje del cliente, localización, tipología, presupuesto, plazo, fuente, probabilidad); nota sobre 100 con pesos configurables por estudio (iguales por defecto) y umbral (60 por defecto); recomendación «perseguir» / «no perseguir»; **la decisión es de la persona**.

## Criterios de aceptación

- [ ] Con todo a 3 y pesos iguales la nota es 60.
- [ ] Cambiar pesos o umbral no altera scorings ya congelados.

## Supuestos provisionales

1. Nota = `100 · Σ(peso·puntuación) / (5 · Σ pesos)`, redondeada a 1 decimal. Recomendación «perseguir» si nota ≥ umbral.
2. «Congelado» = cada scoring guardado es una fila insert-only con la nota, los pesos y el umbral usados en ese momento; nunca se recalcula. El vigente es el último; el historial se conserva.
3. Solo se puntúa una oportunidad (fase 0). La recomendación no cambia el estado del proyecto (regla: ninguna acción de IA ni de cálculo cambia estados; promover/no perseguir sigue siendo una acción humana existente).
4. Pesos: números > 0 y ≤ 10 (suma > 0); umbral: entero 1–100. Permisos por rol llegan con RGB-4; hoy como los ajustes del plan.
5. La nota en vivo del formulario se calcula en el cliente con la misma fórmula (test cruzado con el caso 3/3 = 60); lo que cuenta es lo que devuelve la API al guardar.

## Alcance

**Back:** migración `008_scoring.sql` (`scoring_settings` por estudio, solo overrides; `opportunity_scorings` insert-only con RLS y `REVOKE UPDATE/DELETE`), dominio puro en `opportunity` (criterios, nota, recomendación, ajustes), casos de uso, rutas, auditoría de cada guardado.
**Front:** `lib/scoring.ts` (cliente + fórmula), formulario de scoring de una oportunidad (`/projects/[code]/scoring`), recomendación visible (no sustituye la decisión), sección de pesos y umbral en `/settings`, enlace desde la ficha de la oportunidad.

Fuera de alcance: plan propuesto y promoción (RGB-16), permisos por rol (RGB-4), bloquear la promoción por nota.

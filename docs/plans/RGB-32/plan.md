# RGB-32 · Brief manual y promoción a Anteproyecto (parte de servidor)

Tarea full-stack (esta es la parte de backend). Depende de RGB-19 (patrón de ficha y promoción), RGB-4 (política: la fase 2 la promueve el director de proyecto de ese proyecto) y RGB-28 (datos técnicos). Fuente: página RGB-32 del Backlog de Notion.

El brief lo redacta el equipo, no la IA: no existe ninguna ruta ni caso de uso de IA que lo escriba ni que promueva. Solo el acto explícito `POST /brief/promote` cambia la fase, a través de `PromotionService`.

## Criterios de aceptación (backlog)

- Promover a 3 · Anteproyecto: solo el director de proyecto de ese proyecto, con los obligatorios completos, datos técnicos obtenidos y aprobación del cliente registrada (distinta de «pendiente»).
- Los datos técnicos sin verificar no bloquean, pero quedan marcados en la versión congelada.
- Brief v1 y datos técnicos se congelan juntos: una sola versión congelada de la fase 2 que contiene el brief y la fotografía de los datos técnicos (verificado o no, origen, valor original).

## Diseño

Sin migración. El borrador del brief vive en `exit_deliverables.content` de la fase 2 bajo la clave `brief` (la fila la abre `PromotionService` al promover desde la fase 1). Al promover, el contenido pasa a `{brief, technical_data}`, se marca completo y aprobado y `PromotionService` lo congela como versión 1 de la fase 2 en `frozen_versions` (solo inserción).

Nuevo contexto delimitado `briefing` (`backend/app/briefing/{domain,application,infrastructure}`):

- **domain**: campos y etiquetas del brief, validación (`validate_brief_update`), estados de aprobación, `Completeness`, permisos (`can_edit`, `can_promote`), errores en español, puerto `Briefs`, y el validador de entregable de la fase 2 (`BriefDeliverableValidator`, defensa en profundidad si alguien promoviera por la ruta genérica).
- **application**: `GetBrief`, `UpdateBrief`, `PromoteBrief`, y la fotografía de datos técnicos (`technical_snapshot`), que reutiliza el puerto `TechnicalDataRepository` de RGB-28 (`load`, `last_query`).
- **infrastructure**: `PostgresBriefs` (proyecto con `FOR UPDATE`, borrador, finalizar, congelado).

Orden de comprobaciones (como RGB-19, tras la carrera que halló el Tester): proyecto con bloqueo `FOR UPDATE` → fase 2 (409) → autoridad (403) → validación (422). Todo rechazo de negocio se devuelve y se audita (entidad `project_brief`); el éxito lo audita `PromotionService` (`project/promote`) más `project_brief/freeze` con la versión.

## Archivos

Back:
- `app/briefing/domain/{brief.py,errors.py,ports.py,validator.py}`
- `app/briefing/application/{get_brief.py,update_brief.py,promote_brief.py,technical_snapshot.py}`
- `app/briefing/infrastructure/postgres_briefs.py`
- `app/api/brief_routes.py`, `app/api/dependencies.py`, `app/api/main.py`
- `app/lifecycle/application/validators.py` (registra la fase 2)
- `tests/`: espejo (dominio puro, casos de uso con `create_autospec`, Postgres real con RLS y carrera de dos promociones, rutas con dobles y con Postgres) y `tests/test_architecture.py` (`briefing` entre los clientes de la política; adaptador cableado solo en `dependencies`).

Docs: este plan, `implementation_log.md` (contrato exacto de la API).

## Decisiones (para revisar con RGB)

1. **Datos técnicos obtenidos** = hay al menos un dato técnico con valor (venga de una consulta o escrito a mano: la ruta manual cuenta). Una consulta registrada sin ningún valor no cuenta. La opción más estricta razonable; `completeness` informa también de `technical_data_queried`.
2. **Sin verificar no bloquea.** La fotografía lista `unverified` y marca cada dato.
3. **Plazo** = fecha objetivo de entrega `AAAA-MM-DD`, fecha real entre los años 2000 y 2100.
4. **Presupuesto objetivo** = número JSON (no texto, no booleano) en euros, mayor que 0, hasta 1 000 000 000, como mucho 2 decimales.
5. **«Con firma»** no exige adjunto (la plataforma no almacena archivos aún); basta registrar el estado `signed`. Pendiente de definir con RGB si debe exigirse el documento.
6. **Textos** de hasta 2000 caracteres, sin NUL ni sustitutos aislados; los vacíos cuentan como no rellenados.
7. **Aprobación del cliente**: `pending` (por defecto), `email`, `meeting`, `signed`. Quién y cuándo la registró queda en la auditoría.
8. **Fase 2 siempre** para escribir; con fase > 2 el GET devuelve la versión congelada; con fase < 2, 404 `brief_not_found`.

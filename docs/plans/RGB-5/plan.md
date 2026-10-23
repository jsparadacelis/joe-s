# RGB-5 · Registro de auditoría inalterable

Tarea de Notion: https://app.notion.com/p/3fd444f747b381cc8db3e4722159dfd6
Tipo: Backend · Épica E0 · P0 · Tamaño S. Depende de RGB-3. Apilada sobre su rama mientras el PR #11 sigue abierto.

## Alcance

- Tabla `audit_events` solo de inserción: estudio, usuario, entidad, id de entidad, acción, versión, valor anterior, valor nuevo (jsonb), resultado y fecha.
- Inalterable por dos vías: `rgb_app` solo tiene `SELECT` e `INSERT`, y un disparador rechaza `UPDATE`, `DELETE` y `TRUNCATE` incluso al propietario.
- Aislada por estudio con la plantilla de RGB-3.
- `audit()` para los servicios: construye el evento desde el `RequestContext` y lo entrega al puerto `AuditLog`. El adaptador de Postgres escribe con la misma conexión de la transacción de negocio, así la promoción y su auditoría son atómicas.

Fuera de alcance: consulta o pantalla de auditoría, y los eventos concretos de cada servicio (los añade cada tarea).

## Archivos

```
backend/migrations/003_audit.sql
backend/app/audit/domain/event.py            # EventoDeAuditoria, Resultado
backend/app/audit/domain/ports.py             # RegistroDeAuditoria (Protocol)
backend/app/audit/application/record.py      # audit()
backend/app/audit/infrastructure/postgres_audit_log.py
backend/tests/audit/{domain,application,infrastructure}/...
```

## Criterios de aceptación

- [ ] No existe ruta para editar ni borrar eventos: ni `rgb_app` (permisos) ni el propietario (disparador).
- [ ] Cada evento guarda usuario, estudio, entidad, acción, valores antes y después y fecha.
- [ ] Un estudio no ve ni escribe eventos de otro; `tables_without_rls()` sigue vacía.
- [ ] pytest, ruff y CI en verde.

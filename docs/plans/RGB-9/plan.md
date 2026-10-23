# RGB-9 · Servicio de promoción con reglas y versión congelada

Tarea de Notion: https://app.notion.com/p/3fd444f747b38103a8b9db10c1560617
Tipo: Backend · Épica E1 · P0 · Tamaño M. Depende de RGB-8 (mergeada) y RGB-4 (roles y permisos, sin hacer).

## Alcance

Tres acciones sobre un proyecto, en una sola transacción con la RLS del estudio:

| Acción | Reglas |
| --- | --- |
| `promover` | Autoridad en la fase actual; entregable de salida completo y aprobado y validador de la fase sin faltantes; congela el entregable (versión n+1), registra la promoción, pasa a la fase siguiente, abre su entregable y audita |
| `retener` | Autoridad en la fase actual; motivo obligatorio; no cambia de fase; registra y audita |
| `no_perseguir` | Solo fase 0; autoridad de la fase 0; motivo obligatorio; registra y audita |

Rechazos (sin autoridad, entregable incompleto, última fase, acción no permitida, falta de motivo) **no lanzan excepción en el servicio**: devuelven una `Transicion` rechazada, así la transacción confirma y el intento queda en el registro de auditoría con resultado `rechazado`. La API los traduce a HTTP después de confirmar.

API: `POST /api/proyectos/{codigo}/promover`, `/retener` y `/no-perseguir`. Errores en español: 403 con quién puede (`pueden`), 422 con lo que falta (`faltantes`), 404, 409.

## Decisiones

- **Autoridad = rol o habilitación.** Las claves del PRD `socio_director` y `director_de_proyecto` se resuelven con el `Rol`; `firmante_habilitado`, `direccion_facultativa` y `sponsor` con una **habilitación** del usuario (`ContextoDeSolicitud.habilitaciones`). RGB-4 las asignará; mientras, el contexto de desarrollo las lee de la configuración. Cambiar el criterio es tocar `tiene_autoridad`.
- **Validador por fase:** `ValidadorDeEntregable` (puerto). Cada tarea de fase registrará el suyo (ficha en RGB-19, brief en RGB-32...). Hoy solo se exigen las marcas `completo` y `aprobado` del entregable.
- **Rechazos solo en la auditoría:** `promociones` guarda únicamente las acciones efectivas; los intentos rechazados quedan en `eventos_auditoria` con `resultado = rechazado`.
- **`no_perseguir` solo registra la decisión**; cómo se muestra una oportunidad descartada en la cartera es de RGB-16.
- **Concurrencia:** el proyecto se lee con `FOR UPDATE`; dos promociones simultáneas se serializan.
- **IA:** un test de arquitectura impide que `reporte` o `ia` importen el servicio de promoción.

## Archivos

```
backend/app/estudio/domain/contexto.py                  # Habilitacion, habilitaciones
backend/app/ciclo_de_vida/domain/{autoridad,entregable,errores,ports}.py
backend/app/ciclo_de_vida/application/servicio_promocion.py
backend/app/ciclo_de_vida/infrastructure/postgres_ciclo_de_vida.py
backend/app/api/rutas_promocion.py, main.py, dependencies.py
backend/app/shared/config.py                            # dev_rol, dev_habilitaciones
backend/tests/...                                       # dominio, aplicación, Postgres, API, arquitectura
```

## Criterios de aceptación

- [ ] Promover sin entregable completo devuelve un error claro con lo que falta.
- [ ] Promover sin autoridad devuelve 403 con quién puede hacerlo.
- [ ] Todo queda en el registro de auditoría (también los rechazos).
- [ ] Promover congela una versión inmutable y abre la fase siguiente, todo atómico.
- [ ] pytest, ruff y CI en verde.

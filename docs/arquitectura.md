# Arquitectura del backend

Estado: propuesta (2026-10-23). Sigue el stack de parcerolegal: FastAPI + pytest + DDD en capas, Supabase y Railway.

## Principios

- **DDD:** el código se organiza por contexto delimitado, con el lenguaje ubicuo del PRD en español: Proyecto, Fase, Entregable de salida, Promoción, Pausa, Dato técnico.
- **TDD:** ningún código de producción sin un test que falle antes (rojo → verde → refactor).
- **El dominio no conoce nada de fuera:** ni FastAPI, ni Supabase, ni `requests`. Python puro con `dataclasses` y `Protocol` para los puertos, como en parcerolegal.

## Infraestructura

| Pieza | Servicio | Notas |
| --- | --- | --- |
| Front | Vercel | Next.js 16 en la raíz del repo (ya existe). |
| API | Railway | FastAPI en `backend/`, con `railway.toml` y `/api/health`. |
| Base de datos | Supabase (Postgres, UE) | Migraciones SQL versionadas en `backend/migrations`. RLS en toda tabla de negocio. |
| Auth | Fuera de alcance por ahora | Ver «Identidad y RLS». |

El front llama a la API por HTTP (CORS limitado al dominio de Vercel).

## Estructura

```
backend/
  app/
    api/               # FastAPI: main.py, routes, schemas (Pydantic), dependencies
    <contexto>/
      domain/          # entidades, objetos de valor, eventos, políticas, ports.py (Protocols)
      application/     # casos de uso
      infrastructure/  # repositorios Postgres, clientes externos
    shared/            # reloj, generador de ids, errores de dominio, conexión y transacción
  migrations/          # SQL numerado + políticas RLS
  tests/               # espejo de app/: domain, application, infrastructure, api
```

parcerolegal usa una sola capa `domain/application/infrastructure` porque tiene un solo contexto. Aquí hay varios, así que cada contexto lleva sus tres capas.

Regla de dependencias, vigilada con un test de arquitectura: `domain` no importa de `application`, `infrastructure` ni `api`; `application` solo de `domain`; `infrastructure` implementa los puertos del dominio; `api` solo llama a `application`.

## Contextos delimitados

| Contexto | Conceptos | Tareas |
| --- | --- | --- |
| `estudio` | Estudio, contexto de solicitud | RGB-3, RGB-4 (después) |
| `auditoria` | Registro inalterable (quién, qué, cuándo, versión) | RGB-5 |
| `ciclo_de_vida` | Proyecto (raíz), Fase, Entregable de salida, Promoción, versión congelada | RGB-8, RGB-9, RGB-11, RGB-12 |
| `oportunidad` | Oportunidad, Scoring, plantillas de semanas, factor de escala | RGB-13 a RGB-16 |
| `tiempos` | Reloj activo, Pausa, calendario | RGB-20, RGB-21 |
| `datos_tecnicos` | Dato técnico (valor, origen, original, editado, verificado), tablas CTE/NCSE | RGB-27, RGB-28, RGB-30, RGB-31 |
| `datos_externos` | Catastro, INSPIRE, IGN, Open-Meteo, PVGIS, caché de 30 días | RGB-18, RGB-24 a RGB-26, RGB-33 |
| `reporte` | Reporte semanal propuesto por Claude (solo propone) | RGB-42 |

Los contextos se comunican por identificadores y eventos de dominio (p. ej. `ProyectoPromovido`), no compartiendo entidades. La promoción y su registro de auditoría se escriben en la **misma transacción**.

## Reglas de dominio que se codifican primero

1. `Proyecto.promover(...)` solo avanza una fase (n → n+1) y solo con el entregable de salida completo y aprobado.
2. Solo promueve quien tiene autoridad en esa fase (política `AutoridadPorFase`).
3. Al promover se crea una versión inmutable del entregable.
4. Ninguna acción de IA llama a `promover`: el puerto de IA no tiene acceso al agregado `Proyecto`.
5. Cada promoción emite `ProyectoPromovido` (quién, de qué fase a cuál, cuándo, qué versión).

## Acceso a datos

parcerolegal habla con Supabase por REST (PostgREST) con `requests`. Aquí no basta: REST no permite abrir una transacción que agrupe varias escrituras, y la promoción más su auditoría deben ser atómicas, con RLS activa.

Propuesta: **`psycopg` 3 (conexión directa al pooler de Supabase) con SQL explícito** dentro de los repositorios, sin ORM, igual que parcerolegal no usa ninguno. Cada caso de uso abre una transacción y fija `set_config('app.estudio_id', ..., true)` antes de consultar.

## Identidad y RLS (sin autenticación por ahora)

El backend depende de un puerto, no de un proveedor:

```python
@dataclass(frozen=True)
class ContextoDeSolicitud:
    estudio_id: str
    usuario_id: str
    rol: Rol
```

- Hoy: una dependencia de FastAPI entrega un contexto fijo con datos ficticios.
- Mañana (RGB-2): esa dependencia lee la sesión de Supabase Auth.
- Las políticas RLS filtran por `current_setting('app.estudio_id')`. Al llegar la autenticación solo cambia el origen del valor.
- Toda tabla de negocio lleva `estudio_id` y un test de RLS que prueba que un estudio no ve los datos de otro.

## Estrategia de tests (TDD)

Se adoptan las convenciones de `backend/CLAUDE.md` de parcerolegal: Arrange / Act / Assert separados, el sujeto armado desde fixtures, dobles con `create_autospec(Port, spec_set=True, instance=True)` en vez de clases fake inline, imports arriba, builders con nombre que revele la intención y un test por comportamiento.

| Capa | Tipo | Dobles |
| --- | --- | --- |
| `domain` | Unitario puro, sin I/O | Ninguno |
| `application` | Caso de uso completo | Puertos con `create_autospec`, reloj e ids fijos |
| `infrastructure` | Integración contra Postgres real, con migraciones y RLS | Ninguno |
| `api` | Contrato HTTP con `TestClient` | Caso de uso simulado |
| Arquitectura | Falla si se rompe la regla de dependencias | — |

## Contrato con el front

El front de RGB-10 define el contrato en `lib/fases.ts` y `lib/proyectos.ts` (`listarProyectos`, `obtenerProyecto`, `obtenerEntregable`) sobre datos de ejemplo. Los esquemas Pydantic de la API reproducen esos tipos, y el front sustituye el bloque de ejemplo por un cliente HTTP sin tocar los componentes.

## Decisiones abiertas

1. **Dónde vive el backend:** propongo `backend/` en este mismo repo, junto al Next de la raíz, para versionar contrato y código juntos.
2. **Acceso a datos con `psycopg` directo** en lugar de REST, por la atomicidad de promoción más auditoría.
3. **RGB-9 sin RGB-4:** `AutoridadPorFase` como política de dominio hasta que haya permisos reales.
4. **Lenguaje:** el README y el skill decían «TypeScript» para todo el proyecto. Con esto, el front sigue en TypeScript y el backend pasa a Python; actualizo esas líneas.

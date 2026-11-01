# RGB-52: conectar el visor 3D del terreno al servicio de relieve

Notion: https://app.notion.com/p/40b444f747b381a1b811e6f38b0857e5 · Depende de RGB-33 (servicio de relieve, desplegado) y RGB-34 (visor 3D con terreno sintético).

## Objetivo
Que el visor 3D de la fase 3 muestre el terreno real del MDT de 5 m del IGN a través del servidor, en vez de generar uno sintético en el navegador. Responde a la pregunta de por qué «Ver relieve» no llamaba al backend.

## Contrato del servidor (RGB-33)
`GET /api/cadastre/{reference}/relief?margin=&max_side=` (margen ∈ {0,10,25,50,100}, lado ∈ {100,200,300,500}); respuesta `{reference, window{min_lon,min_lat,max_lon,max_lat,width_m,height_m}, grid{ncols,nrows,cell_size_m,values (norte→sur, null = sin dato),min_m,max_m}, outline (GeoJSON Polygon/MultiPolygon en lon/lat, o null), clipped, parcel_clipped, plot_area_m2}`; errores `{detail:{code,message}}`: 422 `invalid_relief_margin` / `invalid_relief_max_side` / referencia (mensajes de RGB-18), 404 `plot_not_found`, 503 `cadastre_unavailable` / `relief_unavailable` («No se pudo obtener el relieve. Puedes seguir sin el visor 3D.»). El detalle y la tabla de equivalencias con el tipo `Relief` del visor están en `docs/plans/RGB-33/implementation_log.md`.

## Front
- `lib/relief.ts`: `fetchRelief(options)` pasa a llamar a la API con `createApiClient` (patrón de `lib/technical-data-api.ts`) y traduce la respuesta al tipo `Relief` existente (`viewWindow` en metros locales con origen en la esquina suroeste, `heights` en orden de lectura con fila 0 al norte, `perimeter` convertido de lon/lat a metros locales —misma proyección local que el servidor para que el polígono coincida con la malla—, `polygonSurface = plot_area_m2`, `clamped = clipped`, `plotClipped = parcel_clipped`, `source` con la fuente real). Las funciones puras (recorte, etc.) y las lecturas siguen como están; el bloque SAMPLE LAYER se conserva solo para los proyectos de ejemplo `PRY-EJ-*` (sin llamada a la API).
- Tolerancias del servidor: `outline` nulo → visor sin perímetro y aviso; celdas `null` → se interpolan o se omiten sin romper la malla y se avisa («Hay celdas sin dato»); respuesta mal formada → error `invalid_relief_response`.
- Estados y errores en español en el visor: «Cargando relieve…», 422/404 junto a la referencia, 503 con el aviso del servidor y el resto de la pantalla (datos técnicos, brief…) intacto; el visor libera WebGL como hasta ahora; ya no se genera terreno sintético en proyectos reales.
- El front no llama a servicios externos: solo a la API.

## Fuera de alcance
Pendiente calculada sobre el MDT en el servidor (seguimiento de RGB-26) y cambiar los valores de margen/lado (son los del servidor).

## Flujo
Escritor de tests → Desarrollador → Tester (build real + API real con Postgres local y el WCS/INSPIRE/Catastro simulados con las respuestas grabadas; pantallazos claro y oscuro con WebGL real en `docs/plans/RGB-52/screenshots/`) → Juez → PR → merge → despliegue.

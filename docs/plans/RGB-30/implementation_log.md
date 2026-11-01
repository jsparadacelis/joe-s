# RGB-30: registro de implementación

## Qué se hizo (TDD, rojo -> verde)

1. `domain/capacity.py`: `compute_capacity(values)` con `Decimal`, sin redondeo (el front tampoco
   redondea; solo formatea al mostrar). Devuelve `CapacityResult(capacity, missing)`: si falta un
   dato obligatorio (superficie de cálculo, edificabilidad, ocupación, plantas) no hay capacidad y
   `missing` dice cuáles. Sin divisiones por cero: el porcentaje usado por lo existente solo se
   calcula con techo máximo mayor que 0.
2. `capacity_cases.json` (21 casos) leído por `test_capacity.py` y por el nuevo
   `frontend/__tests__/lib/capacity-parity.test.ts`. El front ya cumplía todos los casos: no se
   ha tocado `capacity.ts`.
3. `GetCapacity` y `GET /api/projects/{code}/capacity` (solo lectura, cualquier persona del
   estudio, 404 si el proyecto no existe, sin auditoría, sin migración). Se recalcula en cada
   lectura.

## Criterio de aceptación

96 m², 1,5 m²t/m²s, 70 %, PB+2 -> techo por edificabilidad 144 m²t, por plantas 201,6, máximo
144, limita la edificabilidad (primer caso del JSON, y test propio).

## Diferencias entre front y back (documentadas, sin cambiar el front)

- Lectura de números: el front usa `parseFloat` (admite «12abc», «1e3», «-5» y trata el punto como
  separador de miles). El back solo admite decimales planos no negativos (como los que guarda
  RGB-28, siempre con coma). Con datos guardados no hay diferencia; el JSON compartido usa solo
  formas canónicas.
- Aritmética: exacta en el back, coma flotante en el front; la paridad se comprueba con
  `toBeCloseTo(…, 6)`.
- Datos que faltan: el front devuelve `null`; el back además dice cuáles faltan.
- `calcArea` «Topográfico»: el catálogo no tiene superficie topográfica; ambos usan la catastral
  (igual que con «Catastral» o vacío).
- Porcentaje usado por lo existente: el front lo calcula en el componente (y no lo muestra con
  existente 0); el back lo devuelve (`existing_share`, 0 con existente 0).

## Seguimiento

- v1.1: envolvente edificable con el retranqueo más restrictivo (`streetSetback`,
  `boundarySetback`). La v1 no usa retranqueos.
- Conectar `CapacityPanel` a esta ruta (hoy calcula en el cliente).
- Superficie topográfica como dato propio si se decide añadirla al catálogo.

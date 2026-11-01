# RGB-31: registro de implementación

## Qué se hizo (TDD, rojo -> verde)

1. `domain/alerts.py`: `Alert` (`code`, `severity`, `message` en español, `suggestion`, `fields`),
   `ProjectFacts`, `AlertConfig` y `evaluate_alerts(values, facts, config)`, con una función por
   regla. Sin dato (ausente, vacío o no numérico) no hay alerta. No muta nada. 64 tests.
2. Puerto `ProjectFactsReader` + `PostgresProjectFacts` (LEFT: un proyecto sin oportunidad devuelve
   tipología y ubicación vacías, y esas reglas no saltan; RLS aplica). 3 tests con Postgres.
3. `GetAlerts` (lee con `lock=False`, valor vigente = editado, 404 si no existe) y
   `GET /api/projects/{code}/alerts`: solo lectura, cualquier persona del estudio en cualquier fase,
   sin auditoría ni escritura, sin migración. 6 tests de caso de uso, 7 de ruta con caso de uso
   simulado y 7 de ruta con Postgres real (recálculo al leer, desaparecen al corregir el dato,
   la lectura no cambia ninguna tabla, aislamiento entre estudios).
4. `TechnicalDataUseCases` gana el campo `alerts`; se actualizaron los dos tests que lo construyen.

Total: 87 tests nuevos. Suite completa: 2991 passed.

## Decisiones de negocio (PARA REVISAR CON RGB)

Todas viven en `AlertConfig` con valores por defecto; no se guardan por estudio todavía.

- **Diferencia de superficie: 3 %**, relativa a la superficie catastral, en valor absoluto
  (polígono mayor o menor). Exactamente 3 % no alerta. Catastral = 0 no alerta.
- **Pendiente: 10 %** (`slope`). Igual al umbral no alerta.
- **Año: anterior a 1980** (estricto; 1980 no alerta). Solo se acepta un año de 4 cifras. El
  código de la alerta es siempre `pre_1980_building`, aunque se cambie el año.
- **Gravedad:** `warning` para superficie, uso y municipio; `info` para año y pendiente.
- **Uso catastral frente a tipología** (`project_type` de la ficha). Solo se alerta ante una
  incoherencia clara, listada explícitamente; un uso fuera de la tabla, vacío o desconocido, una
  tipología ausente o desconocida, nunca alertan:
  - `single_family_house`: Industrial, Sanidad y beneficencia, Religioso, Espectáculos, Deportivo,
    Cultural, Ocio y hostelería, Oficinas, Comercial.
  - `multi_family`: igual que la anterior sin Oficinas ni Comercial (locales en planta baja).
  - `facility`: Residencial, Industrial.
  - `industrial`: Residencial, Sanidad y beneficencia, Religioso, Cultural, Espectáculos,
    Deportivo, Ocio y hostelería.
  - `rehabilitation` y `renovation_interiors`: nunca (cualquier uso es posible).
  - Compatibles siempre: Suelo sin edificar, Edificio singular, Almacén y estacionamiento.
- **Municipio** (`MUNICIPIO (PROVINCIA)` frente al texto libre de la ubicación). Se normaliza
  (minúsculas, sin tildes ni signos) y se descartan artículos y preposiciones
  (el, la, los, las, de, del, d, l, a, en, i, y, els, les). Es coherente, y no alerta, si:
  (a) las palabras del municipio (o de una de sus variantes «ALICANTE/ALACANT») están en la
  ubicación; (b) un tramo de la ubicación (separado por comas, guiones, barras o paréntesis) está
  contenido en el nombre del municipio («Alcalá» para «Alcalá de Henares»); o (c) la ubicación
  nombra la provincia. Sin municipio, sin ubicación o sin palabras tras normalizar: no alerta.
  Limitación conocida: nombres equivalentes en otra lengua o con otra forma que no compartan
  palabras (p. ej. «Gerona» frente a «GIRONA») sí alertan; es un aviso informativo.

## Seguimiento (fuera de esta tarea)

- Guardar `AlertConfig` por estudio (tabla/migración y pantalla de ajustes).
- Visualización en el front («encima de los datos técnicos») consumiendo la ruta: tarea posterior.
- Si se admite un año de corte configurable, nombrar el código de forma neutra.

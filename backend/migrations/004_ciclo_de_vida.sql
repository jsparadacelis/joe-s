-- Ciclo de vida: la fase es el estado del proyecto (0 Oportunidad a 7 Cierre).

-- Configuración global de las fases (no es dato de un estudio): solo lectura para la API.
CREATE TABLE fases_config (
    id smallint PRIMARY KEY CHECK (id BETWEEN 0 AND 7),
    nombre text NOT NULL,
    entregable_salida text NOT NULL,
    autoridad text NOT NULL
);

INSERT INTO fases_config (id, nombre, entregable_salida, autoridad) VALUES
    (0, 'Oportunidad', 'Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas', 'socio_director'),
    (1, 'Inicio', 'Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)', 'socio_director'),
    (2, 'Briefing y concepto', 'Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada', 'director_de_proyecto'),
    (3, 'Anteproyecto', 'Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo', 'director_de_proyecto'),
    (4, 'Proyecto básico', 'Básico emitido y licencia concedida con condiciones', 'firmante_habilitado'),
    (5, 'Proyecto de ejecución', 'Ejecución coordinada, visada y emitida', 'firmante_habilitado'),
    (6, 'Obra', 'Registro de obra completo y recepción', 'direccion_facultativa'),
    (7, 'Cierre', 'Certificado final, Libro del Edificio y lecciones', 'sponsor');

ALTER TABLE fases_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fases_config FORCE ROW LEVEL SECURITY;
CREATE POLICY lectura_global ON fases_config FOR SELECT USING (true);
GRANT SELECT ON fases_config TO rgb_app;

-- Proyecto: una sola fase (fase_actual obligatoria y existente).
CREATE TABLE proyectos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estudio_id uuid NOT NULL REFERENCES estudios (id),
    codigo text NOT NULL CHECK (btrim(codigo) <> ''),
    nombre text NOT NULL CHECK (btrim(nombre) <> ''),
    fase_actual smallint NOT NULL REFERENCES fases_config (id),
    semaforo text CHECK (semaforo IN ('verde', 'ambar', 'rojo')),
    proximo_hito text,
    responsable_id text,
    en_pausa boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (estudio_id, codigo),
    UNIQUE (estudio_id, id),
    -- «Activo» exige responsable, fase (ya obligatoria), próximo hito y semáforo.
    CONSTRAINT activo_exige_datos CHECK (
        NOT activo OR (
            btrim(coalesce(responsable_id, '')) <> ''
            AND btrim(coalesce(proximo_hito, '')) <> ''
            AND semaforo IS NOT NULL
        )
    )
);

-- Entregable de salida de cada fase del proyecto.
CREATE TABLE entregables_salida (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estudio_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    fase smallint NOT NULL REFERENCES fases_config (id),
    contenido jsonb NOT NULL DEFAULT '{}',
    completo boolean NOT NULL DEFAULT false,
    aprobado boolean NOT NULL DEFAULT false,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (proyecto_id, fase),
    CHECK (NOT aprobado OR completo),
    FOREIGN KEY (estudio_id, proyecto_id) REFERENCES proyectos (estudio_id, id)
);

-- Versión congelada al promover: inmutable.
CREATE TABLE versiones_congeladas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estudio_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    fase smallint NOT NULL REFERENCES fases_config (id),
    version integer NOT NULL CHECK (version >= 1),
    contenido jsonb NOT NULL,
    congelada_por text NOT NULL CHECK (btrim(congelada_por) <> ''),
    congelada_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (proyecto_id, fase, version),
    FOREIGN KEY (estudio_id, proyecto_id) REFERENCES proyectos (estudio_id, id)
);

-- Historial de promociones, retenciones y «no perseguir»: solo inserción.
CREATE TABLE promociones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estudio_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    accion text NOT NULL,
    de_fase smallint NOT NULL REFERENCES fases_config (id),
    a_fase smallint REFERENCES fases_config (id),
    usuario_id text NOT NULL CHECK (btrim(usuario_id) <> ''),
    resultado text NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok', 'rechazado')),
    motivo text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (estudio_id, proyecto_id) REFERENCES proyectos (estudio_id, id),
    CONSTRAINT accion_coherente CHECK (
        (accion = 'promover' AND a_fase IS NOT NULL AND a_fase = de_fase + 1)
        OR (accion = 'retener' AND a_fase IS NULL AND btrim(coalesce(motivo, '')) <> '')
        OR (
            accion = 'no_perseguir' AND de_fase = 0 AND a_fase IS NULL
            AND btrim(coalesce(motivo, '')) <> ''
        )
    )
);

-- Hitos internos de una fase (p. ej. contrato, arranque, licencia, visado, recepción): no son estados.
CREATE TABLE hitos_internos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estudio_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    fase smallint NOT NULL REFERENCES fases_config (id),
    nombre text NOT NULL CHECK (btrim(nombre) <> ''),
    fecha_prevista date,
    cumplido_en timestamptz,
    FOREIGN KEY (estudio_id, proyecto_id) REFERENCES proyectos (estudio_id, id)
);

SELECT proteger_tabla_de_estudio('proyectos');
SELECT proteger_tabla_de_estudio('entregables_salida');
SELECT proteger_tabla_de_estudio('versiones_congeladas');
SELECT proteger_tabla_de_estudio('promociones');
SELECT proteger_tabla_de_estudio('hitos_internos');

-- Historiales inmutables: la API solo lee e inserta, y ni el propietario puede alterarlos.
REVOKE UPDATE, DELETE, TRUNCATE ON versiones_congeladas, promociones FROM rgb_app;

CREATE OR REPLACE FUNCTION rechazar_alteracion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% es inalterable: solo admite inserciones', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER versiones_congeladas_inalterable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON versiones_congeladas
    FOR EACH STATEMENT EXECUTE FUNCTION rechazar_alteracion();

CREATE TRIGGER promociones_inalterable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON promociones
    FOR EACH STATEMENT EXECUTE FUNCTION rechazar_alteracion();

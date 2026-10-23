-- Registro de auditoría: solo inserción. Quién, qué, cuándo, versión y resultado.
CREATE TABLE eventos_auditoria (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estudio_id uuid NOT NULL REFERENCES estudios (id),
    usuario_id text NOT NULL CHECK (btrim(usuario_id) <> ''),
    entidad text NOT NULL CHECK (btrim(entidad) <> ''),
    entidad_id text NOT NULL CHECK (btrim(entidad_id) <> ''),
    accion text NOT NULL CHECK (btrim(accion) <> ''),
    version integer CHECK (version >= 1),
    valor_anterior jsonb,
    valor_nuevo jsonb,
    resultado text NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok', 'rechazado')),
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eventos_auditoria_entidad_idx
    ON eventos_auditoria (estudio_id, entidad, entidad_id, creado_en);

SELECT proteger_tabla_de_estudio('eventos_auditoria');

-- Primera barrera: la API solo puede leer e insertar.
REVOKE UPDATE, DELETE, TRUNCATE ON eventos_auditoria FROM rgb_app;

-- Segunda barrera: ni el propietario puede alterar ni vaciar el registro.
CREATE OR REPLACE FUNCTION rechazar_alteracion_de_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'eventos_auditoria es inalterable: solo admite inserciones';
END
$$;

CREATE TRIGGER eventos_auditoria_inalterable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON eventos_auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION rechazar_alteracion_de_auditoria();

-- Multiestudio: cada estudio es un inquilino aislado por seguridad por fila (RLS).

-- Rol con el que la API ejecuta cada petición. Sin login: se alcanza con SET LOCAL ROLE.
-- Los propietarios de tabla saltan la RLS, por eso la API nunca consulta como propietario.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rgb_app') THEN
        CREATE ROLE rgb_app NOLOGIN;
    END IF;
    EXECUTE format('GRANT rgb_app TO %I', current_user);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO rgb_app', current_schema());
END
$$;

-- Plantilla: toda tabla de negocio (con columna estudio_id) la invoca en su migración.
CREATE OR REPLACE FUNCTION proteger_tabla_de_estudio(tabla regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabla);
    EXECUTE format(
        'CREATE POLICY aislamiento_estudio ON %s '
        'USING (estudio_id::text = app_estudio_id()) '
        'WITH CHECK (estudio_id::text = app_estudio_id())',
        tabla
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO rgb_app', tabla);
END
$$;

-- Comprobación de CI: tablas del esquema sin RLS forzada o sin política.
CREATE OR REPLACE FUNCTION tablas_sin_rls() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
    SELECT c.relname::text
    FROM pg_class c
    WHERE c.relnamespace = current_schema()::regnamespace
      AND c.relkind = 'r'
      AND c.relname <> 'schema_migrations'
      AND (
          NOT c.relrowsecurity
          OR NOT c.relforcerowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      )
    ORDER BY 1
$$;

CREATE TABLE estudios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL CHECK (btrim(nombre) <> ''),
    creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estudios ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudios FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_estudio ON estudios
    USING (id::text = app_estudio_id())
    WITH CHECK (id::text = app_estudio_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON estudios TO rgb_app;

-- =============================================================================
-- Supabase: cargar schema IME (sin crear roles authenticator)
-- Ejecutar en: Dashboard → SQL Editor (o supabase db execute)
-- Orden: este archivo = init adaptado + patches de extras
-- =============================================================================
-- Luego en Dashboard → Settings → API → "Exposed schemas": añade  api
-- (debe quedar p.ej. public, api  o  public, storage, graphql_public, api)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS data;
CREATE SCHEMA IF NOT EXISTS api;

-- Tablas (igual que init local)
CREATE TABLE IF NOT EXISTS data.sedes (
  id                      text PRIMARY KEY,
  nombre                  text NOT NULL,
  estudiantes             integer NOT NULL DEFAULT 0,
  presupuesto_preventivo  numeric NOT NULL DEFAULT 100,
  fee_servicio            numeric NOT NULL DEFAULT 0,
  constructor             text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS data.fases (
  id       text PRIMARY KEY,
  sede_id  text NOT NULL REFERENCES data.sedes(id) ON DELETE CASCADE,
  nombre   text NOT NULL,
  orden    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS data.activos (
  id       text PRIMARY KEY,
  fase_id  text NOT NULL REFERENCES data.fases(id) ON DELETE CASCADE,
  nombre   text NOT NULL,
  orden    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS data.usuarios (
  id        text PRIMARY KEY,
  nombre    text NOT NULL,
  rol       text NOT NULL,
  clave     text NOT NULL DEFAULT '',
  sede_ids  jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS data.planes (
  id               text PRIMARY KEY,
  tarea            text NOT NULL,
  procedimiento    text NOT NULL DEFAULT '',
  categoria        text NOT NULL DEFAULT '',
  frecuencia       text NOT NULL DEFAULT '',
  duracion_valor   numeric NOT NULL DEFAULT 0,
  duracion_unidad  text NOT NULL DEFAULT 'minutos',
  extras           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data.plan_aplicaciones (
  id             bigserial PRIMARY KEY,
  plan_id        text NOT NULL REFERENCES data.planes(id) ON DELETE CASCADE,
  sede_id        text NOT NULL,
  fase_id        text NOT NULL,
  activo_id      text NOT NULL,
  fecha_inicial  text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS data.ordenes (
  id                 text PRIMARY KEY,
  codigo             text NOT NULL,
  plan_id            text,
  tarea              text NOT NULL DEFAULT '',
  procedimiento      text NOT NULL DEFAULT '',
  categoria          text NOT NULL DEFAULT '',
  frecuencia         text NOT NULL DEFAULT '',
  duracion_valor     numeric NOT NULL DEFAULT 0,
  duracion_unidad    text NOT NULL DEFAULT 'minutos',
  sede_id            text,
  fase_id            text,
  activo_id          text,
  tecnico_id         text,
  fecha_programada   text NOT NULL DEFAULT '',
  fecha_completada   text NOT NULL DEFAULT '',
  estado             text NOT NULL DEFAULT 'pendiente',
  observaciones      text NOT NULL DEFAULT '',
  foto               text NOT NULL DEFAULT '',
  materiales         jsonb NOT NULL DEFAULT '[]'::jsonb,
  materiales_estado  text NOT NULL DEFAULT '',
  consumos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         text NOT NULL DEFAULT '',
  extras             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data.solicitudes (
  id                 text PRIMARY KEY,
  codigo             text NOT NULL,
  sede_id            text,
  fase_id            text,
  activo_id          text,
  descripcion        text NOT NULL DEFAULT '',
  criticidad         text NOT NULL DEFAULT 'media',
  solicitante_id     text,
  fecha              text NOT NULL DEFAULT '',
  hora               text NOT NULL DEFAULT '',
  estado             text NOT NULL DEFAULT 'pendiente',
  tecnico_id         text NOT NULL DEFAULT '',
  fecha_programada   text NOT NULL DEFAULT '',
  fecha_completada   text NOT NULL DEFAULT '',
  hora_completada    text NOT NULL DEFAULT '',
  observaciones      text NOT NULL DEFAULT '',
  foto               text NOT NULL DEFAULT '',
  resolucion         text NOT NULL DEFAULT '',
  materiales         jsonb NOT NULL DEFAULT '[]'::jsonb,
  materiales_estado  text NOT NULL DEFAULT '',
  calificacion       numeric NOT NULL DEFAULT 0,
  comentario_calif   text NOT NULL DEFAULT '',
  consumos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  extras             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data.servicios (
  id              text PRIMARY KEY,
  codigo          text NOT NULL,
  sede_id         text,
  fase_id         text,
  activo_id       text,
  trabajo         text NOT NULL DEFAULT '',
  proveedor       text NOT NULL DEFAULT '',
  presupuesto     numeric NOT NULL DEFAULT 0,
  fecha           text NOT NULL DEFAULT '',
  estado          text NOT NULL DEFAULT 'programada',
  observaciones   text NOT NULL DEFAULT '',
  extras          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data.stock (
  id              text PRIMARY KEY,
  sede_id         text NOT NULL,
  nombre          text NOT NULL,
  unidad          text NOT NULL DEFAULT 'u',
  cantidad        numeric NOT NULL DEFAULT 0,
  costo_unitario  numeric NOT NULL DEFAULT 0,
  minimo          numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS data.categorias (
  orden   integer PRIMARY KEY,
  nombre  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS data.app_meta (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ot_counter   integer NOT NULL DEFAULT 1,
  sol_counter  integer NOT NULL DEFAULT 1,
  srv_counter  integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS data.resumenes_mes (
  mes    text PRIMARY KEY,
  valor  jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO data.app_meta (id, ot_counter, sol_counter, srv_counter)
VALUES (1, 1, 1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION data.json_num(v text, fallback numeric DEFAULT 0)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(NULLIF(btrim(v), '')::numeric, fallback);
$$;

CREATE OR REPLACE FUNCTION data.json_int(v text, fallback integer DEFAULT 0)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(NULLIF(btrim(v), '')::integer, fallback);
$$;

CREATE OR REPLACE FUNCTION data.merge_row(base jsonb, extras jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN extras IS NULL OR extras = '{}'::jsonb THEN base
    ELSE base || extras
  END;
$$;

-- Las funciones get/put/has están en patch_actualizacion_extras.sql
-- Tras crear tablas, ejecuta también: db/patch_actualizacion_extras.sql
-- (omite ALTER si las columnas extras ya existen; IF NOT EXISTS las cubre)

GRANT USAGE ON SCHEMA api TO anon, authenticated;
GRANT USAGE ON SCHEMA data TO postgres;

-- Tras crear las RPC (patch_actualizacion_extras.sql + has_app_data de init):
-- GRANT EXECUTE ON FUNCTION api.get_app_state() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION api.put_app_state(jsonb) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION api.has_app_data() TO anon, authenticated;

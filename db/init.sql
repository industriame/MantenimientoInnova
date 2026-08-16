-- =============================================================================
-- IME Mantenimiento — PostgreSQL + PostgREST (tablas normalizadas)
-- =============================================================================
-- Uso:
--   sudo -u postgres createdb ime_mantenimiento
--   sudo -u postgres psql -d ime_mantenimiento -f db/init.sql
--
-- PostgREST (postgrest.conf):
--   db-uri = "postgres://authenticator:CAMBIAR_PASSWORD@localhost:5432/ime_mantenimiento"
--   db-schemas = "api"
--   db-anon-role = "anon"
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS data;
CREATE SCHEMA IF NOT EXISTS api;

-- -----------------------------------------------------------------------------
-- Tablas (schema data; la API pública solo expone RPC en api)
-- -----------------------------------------------------------------------------

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
  duracion_unidad  text NOT NULL DEFAULT 'minutos'
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
  created_at         text NOT NULL DEFAULT ''
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
  consumos           jsonb NOT NULL DEFAULT '[]'::jsonb
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
  observaciones   text NOT NULL DEFAULT ''
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
  mes    text PRIMARY KEY,  -- YYYY-MM
  valor  jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO data.app_meta (id, ot_counter, sol_counter, srv_counter)
VALUES (1, 1, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- get_app_state(): arma el documento camelCase que espera la app
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.get_app_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = data, api, public
AS $$
DECLARE
  result jsonb;
  meta   data.app_meta%ROWTYPE;
BEGIN
  SELECT * INTO meta FROM data.app_meta WHERE id = 1;

  SELECT jsonb_build_object(
    'sedes', COALESCE((
      SELECT jsonb_agg(sede_obj ORDER BY s.nombre)
      FROM data.sedes s
      CROSS JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', s.id,
          'nombre', s.nombre,
          'estudiantes', s.estudiantes,
          'presupuestoPreventivo', s.presupuesto_preventivo,
          'feeServicio', s.fee_servicio,
          'constructor', s.constructor,
          'fases', COALESCE((
            SELECT jsonb_agg(fase_obj ORDER BY f.orden, f.nombre)
            FROM data.fases f
            CROSS JOIN LATERAL (
              SELECT jsonb_build_object(
                'id', f.id,
                'nombre', f.nombre,
                'activos', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object('id', a.id, 'nombre', a.nombre)
                    ORDER BY a.orden, a.nombre
                  )
                  FROM data.activos a
                  WHERE a.fase_id = f.id
                ), '[]'::jsonb)
              ) AS fase_obj
            ) x
            WHERE f.sede_id = s.id
          ), '[]'::jsonb)
        ) AS sede_obj
      ) y
    ), '[]'::jsonb),

    'usuarios', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'nombre', u.nombre,
          'rol', u.rol,
          'clave', u.clave,
          'sedeIds', u.sede_ids
        )
        ORDER BY u.nombre
      )
      FROM data.usuarios u
    ), '[]'::jsonb),

    'planes', COALESCE((
      SELECT jsonb_agg(plan_obj ORDER BY p.tarea)
      FROM data.planes p
      CROSS JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', p.id,
          'tarea', p.tarea,
          'procedimiento', p.procedimiento,
          'categoria', p.categoria,
          'frecuencia', p.frecuencia,
          'duracionValor', p.duracion_valor,
          'duracionUnidad', p.duracion_unidad,
          'aplicaciones', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'sedeId', pa.sede_id,
                'faseId', pa.fase_id,
                'activoId', pa.activo_id,
                'fechaInicial', pa.fecha_inicial
              )
              ORDER BY pa.id
            )
            FROM data.plan_aplicaciones pa
            WHERE pa.plan_id = p.id
          ), '[]'::jsonb)
        ) AS plan_obj
      ) z
    ), '[]'::jsonb),

    'ordenes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'codigo', o.codigo,
          'planId', o.plan_id,
          'tarea', o.tarea,
          'procedimiento', o.procedimiento,
          'categoria', o.categoria,
          'frecuencia', o.frecuencia,
          'duracionValor', o.duracion_valor,
          'duracionUnidad', o.duracion_unidad,
          'sedeId', o.sede_id,
          'faseId', o.fase_id,
          'activoId', o.activo_id,
          'tecnicoId', o.tecnico_id,
          'fechaProgramada', o.fecha_programada,
          'fechaCompletada', o.fecha_completada,
          'estado', o.estado,
          'observaciones', o.observaciones,
          'foto', o.foto,
          'materiales', o.materiales,
          'materialesEstado', o.materiales_estado,
          'consumos', o.consumos,
          'createdAt', o.created_at
        )
        ORDER BY o.codigo
      )
      FROM data.ordenes o
    ), '[]'::jsonb),

    'solicitudes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'codigo', s.codigo,
          'sedeId', s.sede_id,
          'faseId', s.fase_id,
          'activoId', s.activo_id,
          'descripcion', s.descripcion,
          'criticidad', s.criticidad,
          'solicitanteId', s.solicitante_id,
          'fecha', s.fecha,
          'hora', s.hora,
          'estado', s.estado,
          'tecnicoId', s.tecnico_id,
          'fechaProgramada', s.fecha_programada,
          'fechaCompletada', s.fecha_completada,
          'horaCompletada', s.hora_completada,
          'observaciones', s.observaciones,
          'foto', s.foto,
          'resolucion', s.resolucion,
          'materiales', s.materiales,
          'materialesEstado', s.materiales_estado,
          'calificacion', s.calificacion,
          'comentarioCalif', s.comentario_calif,
          'consumos', s.consumos
        )
        ORDER BY s.codigo
      )
      FROM data.solicitudes s
    ), '[]'::jsonb),

    'servicios', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sv.id,
          'codigo', sv.codigo,
          'sedeId', sv.sede_id,
          'faseId', sv.fase_id,
          'activoId', sv.activo_id,
          'trabajo', sv.trabajo,
          'proveedor', sv.proveedor,
          'presupuesto', sv.presupuesto,
          'fecha', sv.fecha,
          'estado', sv.estado,
          'observaciones', sv.observaciones
        )
        ORDER BY sv.codigo
      )
      FROM data.servicios sv
    ), '[]'::jsonb),

    'stock', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', st.id,
          'sedeId', st.sede_id,
          'nombre', st.nombre,
          'unidad', st.unidad,
          'cantidad', st.cantidad,
          'costoUnitario', st.costo_unitario,
          'minimo', st.minimo
        )
        ORDER BY st.nombre
      )
      FROM data.stock st
    ), '[]'::jsonb),

    'categorias', COALESCE((
      SELECT jsonb_agg(c.nombre ORDER BY c.orden)
      FROM data.categorias c
    ), '[]'::jsonb),

    'otCounter', COALESCE(meta.ot_counter, 1),
    'solCounter', COALESCE(meta.sol_counter, 1),
    'srvCounter', COALESCE(meta.srv_counter, 1),

    'resumenesMes', COALESCE((
      SELECT jsonb_object_agg(r.mes, r.valor)
      FROM data.resumenes_mes r
    ), '{}'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- -----------------------------------------------------------------------------
-- put_app_state(payload): reemplazo atómico desde el documento de la app
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.put_app_state(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, api, public
AS $$
DECLARE
  s    jsonb;
  f    jsonb;
  a    jsonb;
  u    jsonb;
  p    jsonb;
  ap   jsonb;
  o    jsonb;
  sol  jsonb;
  sv   jsonb;
  st   jsonb;
  cat  jsonb;
  mes  text;
  fi   integer;
  ai   integer;
  ci   integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido';
  END IF;

  -- Orden: hijos → padres
  TRUNCATE
    data.resumenes_mes,
    data.categorias,
    data.stock,
    data.servicios,
    data.solicitudes,
    data.ordenes,
    data.plan_aplicaciones,
    data.planes,
    data.usuarios,
    data.activos,
    data.fases,
    data.sedes
    RESTART IDENTITY;

  -- Sedes → fases → activos
  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'sedes', '[]'::jsonb))
  LOOP
    INSERT INTO data.sedes (
      id, nombre, estudiantes, presupuesto_preventivo, fee_servicio, constructor
    ) VALUES (
      s->>'id',
      COALESCE(s->>'nombre', ''),
      COALESCE((s->>'estudiantes')::integer, 0),
      COALESCE((s->>'presupuestoPreventivo')::numeric, 100),
      COALESCE((s->>'feeServicio')::numeric, 0),
      COALESCE(s->>'constructor', '')
    );

    fi := 0;
    FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(s->'fases', '[]'::jsonb))
    LOOP
      INSERT INTO data.fases (id, sede_id, nombre, orden)
      VALUES (f->>'id', s->>'id', COALESCE(f->>'nombre', ''), fi);

      ai := 0;
      FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(f->'activos', '[]'::jsonb))
      LOOP
        INSERT INTO data.activos (id, fase_id, nombre, orden)
        VALUES (a->>'id', f->>'id', COALESCE(a->>'nombre', ''), ai);
        ai := ai + 1;
      END LOOP;
      fi := fi + 1;
    END LOOP;
  END LOOP;

  -- Usuarios
  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'usuarios', '[]'::jsonb))
  LOOP
    INSERT INTO data.usuarios (id, nombre, rol, clave, sede_ids)
    VALUES (
      u->>'id',
      COALESCE(u->>'nombre', ''),
      COALESCE(u->>'rol', 'solicitante'),
      COALESCE(u->>'clave', ''),
      COALESCE(u->'sedeIds', '[]'::jsonb)
    );
  END LOOP;

  -- Planes + aplicaciones
  FOR p IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'planes', '[]'::jsonb))
  LOOP
    INSERT INTO data.planes (
      id, tarea, procedimiento, categoria, frecuencia, duracion_valor, duracion_unidad
    ) VALUES (
      p->>'id',
      COALESCE(p->>'tarea', ''),
      COALESCE(p->>'procedimiento', ''),
      COALESCE(p->>'categoria', ''),
      COALESCE(p->>'frecuencia', ''),
      COALESCE((p->>'duracionValor')::numeric, 0),
      COALESCE(p->>'duracionUnidad', 'minutos')
    );

    FOR ap IN SELECT * FROM jsonb_array_elements(COALESCE(p->'aplicaciones', '[]'::jsonb))
    LOOP
      INSERT INTO data.plan_aplicaciones (
        plan_id, sede_id, fase_id, activo_id, fecha_inicial
      ) VALUES (
        p->>'id',
        COALESCE(ap->>'sedeId', ''),
        COALESCE(ap->>'faseId', ''),
        COALESCE(ap->>'activoId', ''),
        COALESCE(ap->>'fechaInicial', '')
      );
    END LOOP;
  END LOOP;

  -- Órdenes preventivas
  FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'ordenes', '[]'::jsonb))
  LOOP
    INSERT INTO data.ordenes (
      id, codigo, plan_id, tarea, procedimiento, categoria, frecuencia,
      duracion_valor, duracion_unidad, sede_id, fase_id, activo_id, tecnico_id,
      fecha_programada, fecha_completada, estado, observaciones, foto,
      materiales, materiales_estado, consumos, created_at
    ) VALUES (
      o->>'id',
      COALESCE(o->>'codigo', ''),
      o->>'planId',
      COALESCE(o->>'tarea', ''),
      COALESCE(o->>'procedimiento', ''),
      COALESCE(o->>'categoria', ''),
      COALESCE(o->>'frecuencia', ''),
      COALESCE((o->>'duracionValor')::numeric, 0),
      COALESCE(o->>'duracionUnidad', 'minutos'),
      o->>'sedeId',
      o->>'faseId',
      o->>'activoId',
      o->>'tecnicoId',
      COALESCE(o->>'fechaProgramada', ''),
      COALESCE(o->>'fechaCompletada', ''),
      COALESCE(o->>'estado', 'pendiente'),
      COALESCE(o->>'observaciones', ''),
      COALESCE(o->>'foto', ''),
      COALESCE(o->'materiales', '[]'::jsonb),
      COALESCE(o->>'materialesEstado', ''),
      COALESCE(o->'consumos', '[]'::jsonb),
      COALESCE(o->>'createdAt', '')
    );
  END LOOP;

  -- Solicitudes / correctivos
  FOR sol IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'solicitudes', '[]'::jsonb))
  LOOP
    INSERT INTO data.solicitudes (
      id, codigo, sede_id, fase_id, activo_id, descripcion, criticidad,
      solicitante_id, fecha, hora, estado, tecnico_id, fecha_programada,
      fecha_completada, hora_completada, observaciones, foto, resolucion,
      materiales, materiales_estado, calificacion, comentario_calif, consumos
    ) VALUES (
      sol->>'id',
      COALESCE(sol->>'codigo', ''),
      sol->>'sedeId',
      sol->>'faseId',
      sol->>'activoId',
      COALESCE(sol->>'descripcion', ''),
      COALESCE(sol->>'criticidad', 'media'),
      sol->>'solicitanteId',
      COALESCE(sol->>'fecha', ''),
      COALESCE(sol->>'hora', ''),
      COALESCE(sol->>'estado', 'pendiente'),
      COALESCE(sol->>'tecnicoId', ''),
      COALESCE(sol->>'fechaProgramada', ''),
      COALESCE(sol->>'fechaCompletada', ''),
      COALESCE(sol->>'horaCompletada', ''),
      COALESCE(sol->>'observaciones', ''),
      COALESCE(sol->>'foto', ''),
      COALESCE(sol->>'resolucion', ''),
      COALESCE(sol->'materiales', '[]'::jsonb),
      COALESCE(sol->>'materialesEstado', ''),
      COALESCE((sol->>'calificacion')::numeric, 0),
      COALESCE(sol->>'comentarioCalif', ''),
      COALESCE(sol->'consumos', '[]'::jsonb)
    );
  END LOOP;

  -- Servicios externos
  FOR sv IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'servicios', '[]'::jsonb))
  LOOP
    INSERT INTO data.servicios (
      id, codigo, sede_id, fase_id, activo_id, trabajo, proveedor,
      presupuesto, fecha, estado, observaciones
    ) VALUES (
      sv->>'id',
      COALESCE(sv->>'codigo', ''),
      sv->>'sedeId',
      sv->>'faseId',
      sv->>'activoId',
      COALESCE(sv->>'trabajo', ''),
      COALESCE(sv->>'proveedor', ''),
      COALESCE((sv->>'presupuesto')::numeric, 0),
      COALESCE(sv->>'fecha', ''),
      COALESCE(sv->>'estado', 'programada'),
      COALESCE(sv->>'observaciones', '')
    );
  END LOOP;

  -- Stock
  FOR st IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'stock', '[]'::jsonb))
  LOOP
    INSERT INTO data.stock (
      id, sede_id, nombre, unidad, cantidad, costo_unitario, minimo
    ) VALUES (
      st->>'id',
      COALESCE(st->>'sedeId', ''),
      COALESCE(st->>'nombre', ''),
      COALESCE(st->>'unidad', 'u'),
      COALESCE((st->>'cantidad')::numeric, 0),
      COALESCE((st->>'costoUnitario')::numeric, 0),
      COALESCE((st->>'minimo')::numeric, 0)
    );
  END LOOP;

  -- Categorías
  ci := 0;
  FOR cat IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'categorias', '[]'::jsonb))
  LOOP
    INSERT INTO data.categorias (orden, nombre)
    VALUES (ci, cat #>> '{}')
    ON CONFLICT (nombre) DO NOTHING;
    ci := ci + 1;
  END LOOP;

  -- Contadores
  INSERT INTO data.app_meta (id, ot_counter, sol_counter, srv_counter)
  VALUES (
    1,
    COALESCE((payload->>'otCounter')::integer, 1),
    COALESCE((payload->>'solCounter')::integer, 1),
    COALESCE((payload->>'srvCounter')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    ot_counter = EXCLUDED.ot_counter,
    sol_counter = EXCLUDED.sol_counter,
    srv_counter = EXCLUDED.srv_counter;

  -- Resúmenes por mes
  IF payload ? 'resumenesMes' AND jsonb_typeof(payload->'resumenesMes') = 'object' THEN
    FOR mes IN SELECT * FROM jsonb_object_keys(payload->'resumenesMes')
    LOOP
      INSERT INTO data.resumenes_mes (mes, valor)
      VALUES (mes, payload->'resumenesMes'->mes);
    END LOOP;
  END IF;

  RETURN api.get_app_state();
END;
$$;

-- ¿Hay datos? (para que la app sepa si debe sembrar seedData)
CREATE OR REPLACE FUNCTION api.has_app_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = data, api, public
AS $$
  SELECT EXISTS (SELECT 1 FROM data.sedes LIMIT 1)
      OR EXISTS (SELECT 1 FROM data.usuarios LIMIT 1);
$$;

-- -----------------------------------------------------------------------------
-- Roles PostgREST
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'CAMBIAR_PASSWORD';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA api TO anon;
GRANT EXECUTE ON FUNCTION api.get_app_state() TO anon;
GRANT EXECUTE ON FUNCTION api.put_app_state(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION api.has_app_data() TO anon;
GRANT anon TO authenticator;

COMMIT;

-- Endpoints:
--   POST /rpc/has_app_data     → true|false
--   POST /rpc/get_app_state    → { sedes, usuarios, ... }
--   POST /rpc/put_app_state    body: { "payload": { ... } }

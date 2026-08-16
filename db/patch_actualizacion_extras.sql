-- Preserva campos nuevos de Actualizacion (y futuros) en columna extras jsonb
-- sin romper el modelo PostgREST existente.
BEGIN;

ALTER TABLE data.planes
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE data.ordenes
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE data.solicitudes
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE data.servicios
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION data.merge_row(base jsonb, extras jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN extras IS NULL OR extras = '{}'::jsonb THEN base
    ELSE base || extras
  END;
$$;

-- get_app_state: fusiona columnas tipadas + extras (gana extras en claves repetidas)
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
          'id', u.id, 'nombre', u.nombre, 'rol', u.rol,
          'clave', u.clave, 'sedeIds', u.sede_ids
        ) ORDER BY u.nombre
      ) FROM data.usuarios u
    ), '[]'::jsonb),

    'planes', COALESCE((
      SELECT jsonb_agg(
        data.merge_row(
          jsonb_build_object(
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
                  'sedeId', pa.sede_id, 'faseId', pa.fase_id,
                  'activoId', pa.activo_id, 'fechaInicial', pa.fecha_inicial
                ) ORDER BY pa.id
              ) FROM data.plan_aplicaciones pa WHERE pa.plan_id = p.id
            ), '[]'::jsonb)
          ),
          p.extras
        ) ORDER BY p.tarea
      ) FROM data.planes p
    ), '[]'::jsonb),

    'ordenes', COALESCE((
      SELECT jsonb_agg(
        data.merge_row(
          jsonb_build_object(
            'id', o.id, 'codigo', o.codigo, 'planId', o.plan_id,
            'tarea', o.tarea, 'procedimiento', o.procedimiento,
            'categoria', o.categoria, 'frecuencia', o.frecuencia,
            'duracionValor', o.duracion_valor, 'duracionUnidad', o.duracion_unidad,
            'sedeId', o.sede_id, 'faseId', o.fase_id, 'activoId', o.activo_id,
            'tecnicoId', o.tecnico_id,
            'fechaProgramada', o.fecha_programada, 'fechaCompletada', o.fecha_completada,
            'estado', o.estado, 'observaciones', o.observaciones, 'foto', o.foto,
            'materiales', o.materiales, 'materialesEstado', o.materiales_estado,
            'consumos', o.consumos, 'createdAt', o.created_at
          ),
          o.extras
        ) ORDER BY o.codigo
      ) FROM data.ordenes o
    ), '[]'::jsonb),

    'solicitudes', COALESCE((
      SELECT jsonb_agg(
        data.merge_row(
          jsonb_build_object(
            'id', s.id, 'codigo', s.codigo,
            'sedeId', s.sede_id, 'faseId', s.fase_id, 'activoId', s.activo_id,
            'descripcion', s.descripcion, 'criticidad', s.criticidad,
            'solicitanteId', s.solicitante_id, 'fecha', s.fecha, 'hora', s.hora,
            'estado', s.estado, 'tecnicoId', s.tecnico_id,
            'fechaProgramada', s.fecha_programada, 'fechaCompletada', s.fecha_completada,
            'horaCompletada', s.hora_completada,
            'observaciones', s.observaciones, 'foto', s.foto, 'resolucion', s.resolucion,
            'materiales', s.materiales, 'materialesEstado', s.materiales_estado,
            'calificacion', s.calificacion, 'comentarioCalif', s.comentario_calif,
            'consumos', s.consumos
          ),
          s.extras
        ) ORDER BY s.codigo
      ) FROM data.solicitudes s
    ), '[]'::jsonb),

    'servicios', COALESCE((
      SELECT jsonb_agg(
        data.merge_row(
          jsonb_build_object(
            'id', sv.id, 'codigo', sv.codigo,
            'sedeId', sv.sede_id, 'faseId', sv.fase_id, 'activoId', sv.activo_id,
            'trabajo', sv.trabajo, 'proveedor', sv.proveedor,
            'presupuesto', sv.presupuesto, 'fecha', sv.fecha,
            'estado', sv.estado, 'observaciones', sv.observaciones
          ),
          sv.extras
        ) ORDER BY sv.codigo
      ) FROM data.servicios sv
    ), '[]'::jsonb),

    'stock', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', st.id, 'sedeId', st.sede_id, 'nombre', st.nombre,
          'unidad', st.unidad, 'cantidad', st.cantidad,
          'costoUnitario', st.costo_unitario, 'minimo', st.minimo
        ) ORDER BY st.nombre
      ) FROM data.stock st
    ), '[]'::jsonb),

    'categorias', COALESCE((
      SELECT jsonb_agg(c.nombre ORDER BY c.orden) FROM data.categorias c
    ), '[]'::jsonb),

    'otCounter', COALESCE(meta.ot_counter, 1),
    'solCounter', COALESCE(meta.sol_counter, 1),
    'srvCounter', COALESCE(meta.srv_counter, 1),

    'resumenesMes', COALESCE((
      SELECT jsonb_object_agg(r.mes, r.valor) FROM data.resumenes_mes r
    ), '{}'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- put_app_state: guarda columnas tipadas + extras = objeto completo
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

  TRUNCATE
    data.resumenes_mes, data.categorias, data.stock, data.servicios,
    data.solicitudes, data.ordenes, data.plan_aplicaciones, data.planes,
    data.usuarios, data.activos, data.fases, data.sedes
    RESTART IDENTITY;

  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'sedes', '[]'::jsonb))
  LOOP
    INSERT INTO data.sedes (
      id, nombre, estudiantes, presupuesto_preventivo, fee_servicio, constructor
    ) VALUES (
      s->>'id', COALESCE(s->>'nombre', ''),
      data.json_int(s->>'estudiantes', 0),
      data.json_num(s->>'presupuestoPreventivo', 100),
      data.json_num(s->>'feeServicio', 0),
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

  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'usuarios', '[]'::jsonb))
  LOOP
    INSERT INTO data.usuarios (id, nombre, rol, clave, sede_ids)
    VALUES (
      u->>'id', COALESCE(u->>'nombre', ''), COALESCE(u->>'rol', 'solicitante'),
      COALESCE(u->>'clave', ''), COALESCE(u->'sedeIds', '[]'::jsonb)
    );
  END LOOP;

  FOR p IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'planes', '[]'::jsonb))
  LOOP
    INSERT INTO data.planes (
      id, tarea, procedimiento, categoria, frecuencia,
      duracion_valor, duracion_unidad, extras
    ) VALUES (
      p->>'id', COALESCE(p->>'tarea', ''), COALESCE(p->>'procedimiento', ''),
      COALESCE(p->>'categoria', ''), COALESCE(p->>'frecuencia', ''),
      data.json_num(p->>'duracionValor', 0),
      COALESCE(p->>'duracionUnidad', 'minutos'),
      p
    );
    FOR ap IN SELECT * FROM jsonb_array_elements(COALESCE(p->'aplicaciones', '[]'::jsonb))
    LOOP
      INSERT INTO data.plan_aplicaciones (plan_id, sede_id, fase_id, activo_id, fecha_inicial)
      VALUES (
        p->>'id', COALESCE(ap->>'sedeId', ''), COALESCE(ap->>'faseId', ''),
        COALESCE(ap->>'activoId', ''), COALESCE(ap->>'fechaInicial', '')
      );
    END LOOP;
  END LOOP;

  FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'ordenes', '[]'::jsonb))
  LOOP
    INSERT INTO data.ordenes (
      id, codigo, plan_id, tarea, procedimiento, categoria, frecuencia,
      duracion_valor, duracion_unidad, sede_id, fase_id, activo_id, tecnico_id,
      fecha_programada, fecha_completada, estado, observaciones, foto,
      materiales, materiales_estado, consumos, created_at, extras
    ) VALUES (
      o->>'id', COALESCE(o->>'codigo', ''), o->>'planId',
      COALESCE(o->>'tarea', ''), COALESCE(o->>'procedimiento', ''),
      COALESCE(o->>'categoria', ''), COALESCE(o->>'frecuencia', ''),
      data.json_num(o->>'duracionValor', 0),
      COALESCE(o->>'duracionUnidad', 'minutos'),
      o->>'sedeId', o->>'faseId', o->>'activoId', o->>'tecnicoId',
      COALESCE(o->>'fechaProgramada', ''), COALESCE(o->>'fechaCompletada', ''),
      COALESCE(o->>'estado', 'pendiente'),
      COALESCE(o->>'observaciones', ''), COALESCE(o->>'foto', ''),
      COALESCE(o->'materiales', '[]'::jsonb),
      COALESCE(o->>'materialesEstado', ''),
      COALESCE(o->'consumos', '[]'::jsonb),
      COALESCE(o->>'createdAt', ''),
      o
    );
  END LOOP;

  FOR sol IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'solicitudes', '[]'::jsonb))
  LOOP
    INSERT INTO data.solicitudes (
      id, codigo, sede_id, fase_id, activo_id, descripcion, criticidad,
      solicitante_id, fecha, hora, estado, tecnico_id, fecha_programada,
      fecha_completada, hora_completada, observaciones, foto, resolucion,
      materiales, materiales_estado, calificacion, comentario_calif, consumos, extras
    ) VALUES (
      sol->>'id', COALESCE(sol->>'codigo', ''),
      sol->>'sedeId', sol->>'faseId', sol->>'activoId',
      COALESCE(sol->>'descripcion', ''), COALESCE(sol->>'criticidad', 'media'),
      sol->>'solicitanteId', COALESCE(sol->>'fecha', ''), COALESCE(sol->>'hora', ''),
      COALESCE(sol->>'estado', 'pendiente'), COALESCE(sol->>'tecnicoId', ''),
      COALESCE(sol->>'fechaProgramada', ''), COALESCE(sol->>'fechaCompletada', ''),
      COALESCE(sol->>'horaCompletada', ''),
      COALESCE(sol->>'observaciones', ''), COALESCE(sol->>'foto', ''),
      COALESCE(sol->>'resolucion', ''),
      COALESCE(sol->'materiales', '[]'::jsonb),
      COALESCE(sol->>'materialesEstado', ''),
      data.json_num(sol->>'calificacion', 0),
      COALESCE(sol->>'comentarioCalif', ''),
      COALESCE(sol->'consumos', '[]'::jsonb),
      sol
    );
  END LOOP;

  FOR sv IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'servicios', '[]'::jsonb))
  LOOP
    INSERT INTO data.servicios (
      id, codigo, sede_id, fase_id, activo_id, trabajo, proveedor,
      presupuesto, fecha, estado, observaciones, extras
    ) VALUES (
      sv->>'id', COALESCE(sv->>'codigo', ''),
      sv->>'sedeId', sv->>'faseId', sv->>'activoId',
      COALESCE(sv->>'trabajo', ''), COALESCE(sv->>'proveedor', ''),
      data.json_num(sv->>'presupuesto', 0),
      COALESCE(sv->>'fecha', ''),
      COALESCE(sv->>'estado', 'programada'),
      COALESCE(sv->>'observaciones', ''),
      sv
    );
  END LOOP;

  FOR st IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'stock', '[]'::jsonb))
  LOOP
    INSERT INTO data.stock (
      id, sede_id, nombre, unidad, cantidad, costo_unitario, minimo
    ) VALUES (
      st->>'id', COALESCE(st->>'sedeId', ''), COALESCE(st->>'nombre', ''),
      COALESCE(st->>'unidad', 'u'),
      data.json_num(st->>'cantidad', 0),
      data.json_num(st->>'costoUnitario', 0),
      data.json_num(st->>'minimo', 0)
    );
  END LOOP;

  ci := 0;
  FOR cat IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'categorias', '[]'::jsonb))
  LOOP
    INSERT INTO data.categorias (orden, nombre)
    VALUES (ci, cat #>> '{}')
    ON CONFLICT (nombre) DO NOTHING;
    ci := ci + 1;
  END LOOP;

  INSERT INTO data.app_meta (id, ot_counter, sol_counter, srv_counter)
  VALUES (
    1,
    data.json_int(payload->>'otCounter', 1),
    data.json_int(payload->>'solCounter', 1),
    data.json_int(payload->>'srvCounter', 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    ot_counter = EXCLUDED.ot_counter,
    sol_counter = EXCLUDED.sol_counter,
    srv_counter = EXCLUDED.srv_counter;

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

GRANT EXECUTE ON FUNCTION api.get_app_state() TO anon;
GRANT EXECUTE ON FUNCTION api.put_app_state(jsonb) TO anon;
NOTIFY pgrst, 'reload schema';

COMMIT;

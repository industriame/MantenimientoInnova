BEGIN;

-- Casts seguros: '' o null no rompen el put completo
CREATE OR REPLACE FUNCTION data.json_num(v text, fallback numeric DEFAULT 0)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(v), '')::numeric, fallback);
$$;

CREATE OR REPLACE FUNCTION data.json_int(v text, fallback integer DEFAULT 0)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(v), '')::integer, fallback);
$$;

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

  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'sedes', '[]'::jsonb))
  LOOP
    INSERT INTO data.sedes (
      id, nombre, estudiantes, presupuesto_preventivo, fee_servicio, constructor
    ) VALUES (
      s->>'id',
      COALESCE(s->>'nombre', ''),
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
      u->>'id',
      COALESCE(u->>'nombre', ''),
      COALESCE(u->>'rol', 'solicitante'),
      COALESCE(u->>'clave', ''),
      COALESCE(u->'sedeIds', '[]'::jsonb)
    );
  END LOOP;

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
      data.json_num(p->>'duracionValor', 0),
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
      data.json_num(o->>'duracionValor', 0),
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
      data.json_num(sol->>'calificacion', 0),
      COALESCE(sol->>'comentarioCalif', ''),
      COALESCE(sol->'consumos', '[]'::jsonb)
    );
  END LOOP;

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
      data.json_num(sv->>'presupuesto', 0),
      COALESCE(sv->>'fecha', ''),
      COALESCE(sv->>'estado', 'programada'),
      COALESCE(sv->>'observaciones', '')
    );
  END LOOP;

  FOR st IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'stock', '[]'::jsonb))
  LOOP
    INSERT INTO data.stock (
      id, sede_id, nombre, unidad, cantidad, costo_unitario, minimo
    ) VALUES (
      st->>'id',
      COALESCE(st->>'sedeId', ''),
      COALESCE(st->>'nombre', ''),
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

GRANT EXECUTE ON FUNCTION api.put_app_state(jsonb) TO anon;
NOTIFY pgrst, 'reload schema';

COMMIT;

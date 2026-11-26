-- Bodega (data.stock): guarda los campos que no tienen columna propia
-- (sku, creadoDesde, …) en una columna extras jsonb, igual que órdenes,
-- solicitudes y servicios. Sin esto put_app_state_v2 los descartaba.
--
-- Modifica las funciones existentes reemplazando solo el bloque de stock,
-- y falla si el bloque no se encuentra (no aplica cambios a medias).
BEGIN;

ALTER TABLE data.stock
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $patch$
DECLARE
  d text;
  n text;
BEGIN
  -- Lectura: columnas tipadas + extras
  d := pg_get_functiondef('api.get_app_state()'::regprocedure);
  n := replace(d,
$a$        jsonb_build_object(
          'id', st.id, 'sedeId', st.sede_id, 'nombre', st.nombre,
          'unidad', st.unidad, 'cantidad', st.cantidad,
          'costoUnitario', st.costo_unitario, 'minimo', st.minimo
        ) ORDER BY st.nombre$a$,
$b$        data.merge_row(jsonb_build_object(
          'id', st.id, 'sedeId', st.sede_id, 'nombre', st.nombre,
          'unidad', st.unidad, 'cantidad', st.cantidad,
          'costoUnitario', st.costo_unitario, 'minimo', st.minimo
        ), st.extras) ORDER BY st.nombre$b$);
  IF n = d THEN
    RAISE EXCEPTION 'get_app_state: no se encontró el bloque de stock';
  END IF;
  EXECUTE n;

  -- Escritura: lo que no es columna va a extras
  d := pg_get_functiondef('api.put_app_state_v2(jsonb)'::regprocedure);
  n := replace(d,
$a$      id, sede_id, nombre, unidad, cantidad, costo_unitario, minimo
    ) VALUES ($a$,
$b$      id, sede_id, nombre, unidad, cantidad, costo_unitario, minimo, extras
    ) VALUES ($b$);
  n := replace(n,
$a$      data.json_num(st->>'minimo', 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      sede_id = EXCLUDED.sede_id, nombre = EXCLUDED.nombre, unidad = EXCLUDED.unidad,
      cantidad = EXCLUDED.cantidad, costo_unitario = EXCLUDED.costo_unitario, minimo = EXCLUDED.minimo;$a$,
$b$      data.json_num(st->>'minimo', 0),
      (st - 'id' - 'sedeId' - 'nombre' - 'unidad' - 'cantidad' - 'costoUnitario' - 'minimo')
    )
    ON CONFLICT (id) DO UPDATE SET
      sede_id = EXCLUDED.sede_id, nombre = EXCLUDED.nombre, unidad = EXCLUDED.unidad,
      cantidad = EXCLUDED.cantidad, costo_unitario = EXCLUDED.costo_unitario, minimo = EXCLUDED.minimo,
      extras = EXCLUDED.extras;$b$);
  IF n = d OR position('extras = EXCLUDED.extras;' IN n) = 0 OR position('minimo, extras' IN n) = 0 THEN
    RAISE EXCEPTION 'put_app_state_v2: no se encontró el bloque de stock';
  END IF;
  EXECUTE n;
END
$patch$;

COMMIT;

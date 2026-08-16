-- Wrappers en public para que Supabase (schema cache por defecto) encuentre las RPC.
-- Ejecutar en SQL Editor DESPUÉS de tener api.get/put/has creadas
-- y de exponer el schema api (o al menos estas funciones en public).

CREATE OR REPLACE FUNCTION public.has_app_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = api, data, public
AS $$
  SELECT api.has_app_data();
$$;

CREATE OR REPLACE FUNCTION public.get_app_state()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = api, data, public
AS $$
  SELECT api.get_app_state();
$$;

CREATE OR REPLACE FUNCTION public.put_app_state(payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = api, data, public
AS $$
  SELECT api.put_app_state(payload);
$$;

GRANT EXECUTE ON FUNCTION public.has_app_data() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_state() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.put_app_state(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

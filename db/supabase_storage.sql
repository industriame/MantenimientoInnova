-- =============================================================================
-- Supabase Storage: bucket de evidencias fotográficas
-- Ejecutar en: Dashboard → SQL Editor
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidencias',
  'evidencias',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Limpia políticas previas del bucket (nombres nuestros + típicos del dashboard)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%evidencias%'
        OR qual::text ILIKE '%evidencias%'
        OR with_check::text ILIKE '%evidencias%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- INSERT + SELECT son obligatorios (Storage hace INSERT … RETURNING *)
-- UPDATE hace falta por x-upsert / PUT
CREATE POLICY "evidencias_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'evidencias');

CREATE POLICY "evidencias_anon_select"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'evidencias');

CREATE POLICY "evidencias_anon_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'evidencias')
  WITH CHECK (bucket_id = 'evidencias');

CREATE POLICY "evidencias_anon_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'evidencias');

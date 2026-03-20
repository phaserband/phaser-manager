-- Rulează o singură dată în Supabase → SQL Editor dacă primești:
-- "new row violates row-level security policy" la „Actualizează fișa” / Link.
--
-- Cauză: politica veche permitea upload doar pentru auth.role() = 'authenticated',
-- iar aplicația folosește cheia anon fără sesiune de login Supabase.

DROP POLICY IF EXISTS "fisa_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "fisa_public_insert" ON storage.objects;
CREATE POLICY "fisa_public_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fisa-public');

DROP POLICY IF EXISTS "fisa_public_update" ON storage.objects;
CREATE POLICY "fisa_public_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'fisa-public');

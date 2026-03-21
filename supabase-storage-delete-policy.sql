-- Rulează în Supabase → SQL Editor (o singură dată).
-- Fără această politică, ștergerea ofertelor din app NU poate elimina fișierele din bucket-ul fisa-public (RLS blochează DELETE).

DROP POLICY IF EXISTS "fisa_public_delete" ON storage.objects;
CREATE POLICY "fisa_public_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'fisa-public');

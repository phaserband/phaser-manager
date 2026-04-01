-- ═══════════════════════════════════════════════════════════════════════════
-- Phaser Manager — Securitate: doar utilizatori autentificați (Supabase Auth)
-- Rulează în Supabase → SQL Editor DUPĂ ce fiecare membru are cont Auth
-- (Authentication → Users) cu același email ca în MEMBERS din aplicație.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) app_data — fără acces anonim
DROP POLICY IF EXISTS "app_data_anon_all" ON app_data;
DROP POLICY IF EXISTS "Allow all for app_data" ON app_data;
DROP POLICY IF EXISTS "Allow authenticated users for app_data" ON app_data;

CREATE POLICY "app_data_authenticated_all" ON app_data
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2) backups — la fel
DROP POLICY IF EXISTS "Allow all on backups" ON backups;

CREATE POLICY "backups_authenticated_all" ON backups
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3) Storage fisa-public — scriere doar autentificat (citirea publică rămâne)
DROP POLICY IF EXISTS "fisa_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "fisa_public_update" ON storage.objects;
DROP POLICY IF EXISTS "fisa_public_delete" ON storage.objects;

CREATE POLICY "fisa_public_insert_auth" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'fisa-public' AND auth.role() = 'authenticated');

CREATE POLICY "fisa_public_update_auth" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'fisa-public' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'fisa-public' AND auth.role() = 'authenticated');

CREATE POLICY "fisa_public_delete_auth" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'fisa-public' AND auth.role() = 'authenticated');

-- Notă: SELECT pe fisa-public rămâne din politica fisa_public_read (orice anonim poate citi URL-ul public — normal pentru linkuri către clienți).

-- 4) member_profiles — admini care pot aproba / actualiza orice rând (aliniază cu PHASER_ADMIN_EMAILS din index.html)
DROP POLICY IF EXISTS "member_profiles_update" ON member_profiles;
CREATE POLICY "member_profiles_update" ON member_profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR lower((SELECT email FROM auth.users WHERE id = auth.uid())) IN (
      'raczradurr@gmail.com',
      'contact@phaser.ro'
    )
  );

-- ============================================
-- Phaser Manager - Setup Supabase
-- ============================================
-- Rulează acest SQL în Supabase Dashboard → SQL Editor

-- ─────────────────────────────────────────────
-- PASUL 0 — Activează Supabase Auth (Email)
-- ─────────────────────────────────────────────
-- În Supabase Dashboard → Authentication → Providers → Email:
--   ✅ Enable Email provider
--   ☐ Confirm email — DEZACTIVEAZĂ pentru aplicație internă
--
-- Recomandare: dezactivează "Confirm email" ca membrii să poată
-- intra direct fără să dea click pe un link de confirmare.

-- ─────────────────────────────────────────────
-- 1. Tabela app_data (date principale aplicație)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_data (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for app_data" ON app_data;
CREATE POLICY "Allow authenticated users for app_data" ON app_data
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- 2. Tabela member_profiles (profiluri utilizatori)
-- ─────────────────────────────────────────────
-- Folosită pentru utilizatori noi care se înregistrează prin "Cont nou"
-- + sistem de aprobare admin

CREATE TABLE IF NOT EXISTS member_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  prenume TEXT NOT NULL,
  nume TEXT NOT NULL,
  nickname TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'membru',    -- 'membru' | 'furnizor' | 'admin'
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;

-- Orice user autentificat poate citi profilurile
DROP POLICY IF EXISTS "member_profiles_select" ON member_profiles;
CREATE POLICY "member_profiles_select" ON member_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Un user poate insera doar propriul profil
DROP POLICY IF EXISTS "member_profiles_insert" ON member_profiles;
CREATE POLICY "member_profiles_insert" ON member_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Un user poate updata propriul profil; adminul poate updata pe oricine
DROP POLICY IF EXISTS "member_profiles_update" ON member_profiles;
CREATE POLICY "member_profiles_update" ON member_profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'raczradurr@gmail.com'
  );

-- ─────────────────────────────────────────────
-- 3. Supabase Storage — bucket "avatars"
-- ─────────────────────────────────────────────
-- Creează bucket public pentru poze de profil

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Oricine poate vedea pozele (bucket public)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Doar userii autentificați pot uploada
DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.role() = 'authenticated'
  );

-- Userii pot updata/șterge doar propriile fișiere
DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────
-- 3b. Supabase Storage — bucket "fisa-public" (fișe evenimente partajabile)
-- Creează bucket public pentru link-uri către fișa evenimentului
INSERT INTO storage.buckets (id, name, public)
VALUES ('fisa-public', 'fisa-public', true)
ON CONFLICT (id) DO NOTHING;

-- Oricine poate vedea fișele (bucket public)
DROP POLICY IF EXISTS "fisa_public_read" ON storage.objects;
CREATE POLICY "fisa_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'fisa-public');

-- Userii autentificați pot uploada
DROP POLICY IF EXISTS "fisa_auth_insert" ON storage.objects;
CREATE POLICY "fisa_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'fisa-public' AND auth.role() = 'authenticated'
  );

-- ─────────────────────────────────────────────
-- 4. Curăță tabele vechi
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS phaser_trusted;

-- ─────────────────────────────────────────────
-- FLUX UTILIZATORI NOU
-- ─────────────────────────────────────────────
-- 1. Utilizatorul deschide app-ul → alege "Sunt Membru" sau "Sunt Furnizor"
-- 2. Dacă Membru → "Mă autentific" (email + parolă) sau "Cont nou" (formular complet)
-- 3. La "Cont nou" → completează prenume, nume, email, nickname (opțional), poză (opțional)
--    → se creează cont Supabase Auth + profil în member_profiles cu status="pending"
--    → EXCEPȚIE: dacă emailul e recunoscut (din lista MEMBERS sau admin), status="approved" automat
-- 4. Adminul (raczradurr@gmail.com) vede în "Contul meu" secțiunea "Cereri de acces"
--    → poate Aproba sau Respinge fiecare cerere
-- 5. Membrul aprobat se poate loga și accesa aplicația

-- ─────────────────────────────────────────────
-- MIGRARE LA phaser.ro (când ești gata)
-- ─────────────────────────────────────────────
-- 1. Creează un proiect nou Supabase pentru trupă
-- 2. Rulează acest SQL în noul proiect
-- 3. Exportă datele din proiectul vechi:
--    SELECT data FROM app_data WHERE id = 'phaser_main';
-- 4. Importă în noul proiect
-- 5. Actualizează în index.html:
--    const SUPABASE_URL = "https://[nou-proiect].supabase.co";
--    const SUPABASE_ANON_KEY = "[noua-cheie-anon]";
-- 6. Mută bucket-ul "avatars" sau re-uploadează pozele
-- 7. Fiecare membru își creează cont nou pe noul proiect
-- 8. Deployează pe phaser.ro prin Cloudflare Pages sau Workers
-- 9. Actualizează ADMIN_EMAIL în index.html dacă se schimbă adminul

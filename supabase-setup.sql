-- ============================================
-- Phaser Manager - Setup Supabase
-- ============================================
-- Rulează acest SQL în Supabase Dashboard → SQL Editor

-- ─────────────────────────────────────────────
-- PASUL 0 — Activează Supabase Auth (Email)
-- ─────────────────────────────────────────────
-- În Supabase Dashboard → Authentication → Providers → Email:
--   ✅ Enable Email provider
--   ☐ Confirm email — DEZACTIVEAZĂ pentru aplicație internă (nu vrei să trimiți confirmări)
--   (sau lasă activat dacă vrei confirmare prin email)
--
-- Utilizatorii se înregistrează singuri din aplicație cu emailul lor personal.
-- Emailul trebuie să corespundă cu cel din MEMBERS sau setat în Contul Meu.

-- ─────────────────────────────────────────────
-- 1. Tabela app_data (date principale)
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

-- Dacă vrei să păstrezi accesul anonim temporar (în timp ce migrezi):
-- CREATE POLICY "Allow all for app_data" ON app_data FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 2. Tabela phaser_trusted — nu mai e necesară
-- ─────────────────────────────────────────────
-- Sesiunile sunt gestionate de Supabase Auth (JWT tokens).
-- Poți șterge sau ignora această tabelă.
DROP TABLE IF EXISTS phaser_trusted;

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
-- 6. Fiecare membru își creează cont nou cu emailul personal pe noul proiect
-- 7. Deployează pe phaser.ro prin Cloudflare Pages sau Workers

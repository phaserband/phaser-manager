-- ============================================
-- Phaser Manager - Setup Supabase
-- ============================================
-- Rulează acest SQL în Supabase Dashboard → SQL Editor
-- pentru a crea tabelele necesare sincronizării cloud.

-- 1. Tabela app_data (date principale: evenimente, tasks, etc.)
CREATE TABLE IF NOT EXISTS app_data (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permite citire și scriere pentru toți (anon key)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for app_data" ON app_data;
CREATE POLICY "Allow all for app_data" ON app_data
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabela phaser_trusted (utilizatori de încredere / login)
CREATE TABLE IF NOT EXISTS phaser_trusted (
  device_id TEXT PRIMARY KEY,
  user_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE phaser_trusted ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for phaser_trusted" ON phaser_trusted;
CREATE POLICY "Allow all for phaser_trusted" ON phaser_trusted
  FOR ALL USING (true) WITH CHECK (true);

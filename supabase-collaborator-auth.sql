-- Phaser Manager — Autentificare colaboratori (parole hashuite)
-- Rulează o singură dată în Supabase Dashboard → SQL Editor
--
-- Ce face: creează un tabel public cu parolele colaboratorilor ca hash SHA-256.
-- Parolele NU mai sunt stocate în codul sursă (index.html).
-- Hashul este one-way — nu poate fi inversat.
--
-- ════════════════════════════════════════════════════════════════

-- 1. Creează tabelul
CREATE TABLE IF NOT EXISTS collaborator_auth (
  key           TEXT PRIMARY KEY,     -- 'prezent', 'levi', 'flavius'
  password_hash TEXT NOT NULL,        -- SHA-256 hex al parolei
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS: citire publică (necesară pentru login înainte de autentificare),
--    scriere doar pentru service_role (admin din Dashboard sau script server)
ALTER TABLE collaborator_auth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colab_auth_public_read" ON collaborator_auth;
CREATE POLICY "colab_auth_public_read"
  ON collaborator_auth FOR SELECT
  USING (true);

-- Scriere permisă doar prin service_role (din Dashboard sau script server):
-- nu adăugăm policy INSERT/UPDATE/DELETE → implicit DENY pentru anon/authenticated

-- 3. Inserează parolele curente ca hash SHA-256
--    Parolele curente: prezent@phaser! / levi@phaser! / flavius@phaser!
--    (poți schimba oricând din Dashboard → Table Editor → collaborator_auth)
INSERT INTO collaborator_auth (key, password_hash) VALUES
  ('prezent', '0819a69026b6d45bac83fce7701a70e22374a0d989f132593af1bdbf1edb653e'),
  ('levi',    'a716a9711ba50ef3ea60ce34594ef1805b126dc2ef18ec70e69dd92e73edeeba'),
  ('flavius', 'd94cee7d70a4715aaa123b33c8adf67f9e2902f3e7450943555a15ece872d496')
ON CONFLICT (key) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  updated_at    = now();

-- ════════════════════════════════════════════════════════════════
-- Cum schimbi o parolă ulterior (fără să atingi codul):
--
-- 1. Calculează hash-ul noii parole:
--    Linux/Mac: echo -n "parola_noua" | sha256sum
--    Online: https://emn178.github.io/online-tools/sha256.html
--
-- 2. Actualizează în Dashboard → Table Editor → collaborator_auth
--    SAU rulează:
--    UPDATE collaborator_auth
--      SET password_hash = 'hash_nou_aici', updated_at = now()
--      WHERE key = 'prezent';  -- sau 'levi' / 'flavius'
-- ════════════════════════════════════════════════════════════════

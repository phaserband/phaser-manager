-- Coloană: la aprobare, admin leagă contul de un membru din trupă (m1…m5)
ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS band_member_id TEXT;

COMMENT ON COLUMN member_profiles.band_member_id IS 'Opțional / legacy — login-ul curent mapează email Auth la membru din MEMBER_AUTH_EMAIL în index.html';

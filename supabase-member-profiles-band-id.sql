-- Coloană: la aprobare, admin leagă contul de un membru din trupă (m1…m5)
ALTER TABLE member_profiles
  ADD COLUMN IF NOT EXISTS band_member_id TEXT;

COMMENT ON COLUMN member_profiles.band_member_id IS 'ID membru din app (ex. m1) — setat la aprobare dacă emailul nu e în lista MEMBERS hardcodată';

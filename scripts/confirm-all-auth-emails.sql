-- Marchează toți userii Auth ca având email confirmat (fără click pe link).
-- Rulează în Supabase → SQL Editor dacă încă ai useri «neconfirmați».
-- Păstrează «Confirm email» DEBIFAT în Authentication → Providers → Email pentru useri noi.

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc', now()))
WHERE email_confirmed_at IS NULL;

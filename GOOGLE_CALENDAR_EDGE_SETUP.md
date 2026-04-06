# Google Calendar — OAuth cu refresh token (Supabase Edge Functions)

Fluxul **varianta 2**: browserul nu mai ține token scurt; **refresh token**-ul e salvat în Postgres și e folosit doar din **Edge Functions** cu **client secret**.

## Ce primești tu (înainte de deploy)

1. **Google Cloud Console** → **Credentials** → OAuth client **Web** (același ca `GCAL_CLIENT_ID` din `index.html`).
2. **Client secret** (`GOCSPX-…`) — îl pui **doar** în secretele Supabase, niciodată în `index.html`.
3. **Authorized redirect URIs** — adaugă **exact** (înlocuiește cu project ref-ul tău dacă e altul):

   `https://uhekoixrvyoascchdwrp.supabase.co/functions/v1/google-calendar-oauth-callback`

4. **Authorized JavaScript origins** — rămâne `https://manager.phaser.ro` (sau unde ai managerul).

5. Un **secret aleator** pentru semnarea parametrului `state` (ex. 32 bytes hex):

   `openssl rand -hex 32`

## Pași în Supabase

### 1. SQL

În **SQL Editor**, rulează conținutul din:

`supabase/migrations/20250406120000_google_calendar_credentials.sql`

### 2. CLI și deploy funcții

Din folderul proiectului (ai nevoie de [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
cd "/Users/raczradu/Downloads/Phaser Manager"
supabase link --project-ref uhekoixrvyoascchdwrp
```

Setează secretele (înlocuiește valorile):

```bash
supabase secrets set GOOGLE_CLIENT_ID="166600809896-bkch0s9678ahv7l9fofe0ti47btc4pum.apps.googleusercontent.com"
supabase secrets set GOOGLE_CLIENT_SECRET="GOCSPX-xxxxx"
supabase secrets set OAUTH_STATE_SECRET="paste_hex_64chars"
supabase secrets set FRONTEND_OAUTH_REDIRECT="https://manager.phaser.ro"
```

Deploy la **toate** funcțiile:

```bash
supabase functions deploy google-calendar-oauth-start
supabase functions deploy google-calendar-oauth-callback
supabase functions deploy google-calendar-access-token
supabase functions deploy google-calendar-disconnect
supabase functions deploy google-calendar-connection-status
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sunt injectate automat în Edge.)

### 3. Frontend

În `index.html`, `GCAL_USE_SERVER_OAUTH = true` (implicit). Dacă funcțiile nu sunt deployate încă, pune `false` ca să rămână fluxul vechi GIS.

## Comportament

- La **Conectează Calendar**, ești trimis la Google; după acord, revii la `https://manager.phaser.ro/?gcal_oauth=ok`.
- **Fiecare utilizator Supabase** are propriul rând în `google_calendar_credentials` — evenimentele merg în **Calendarul Google al contului cu care te autentifici la Google** (nu e un calendar „al trupei” partajat automat).

## Rollback

- `GCAL_USE_SERVER_OAUTH = false` în `index.html`.
- Opțional: șterge rândurile din `google_calendar_credentials` / dezactivezi funcțiile.

## Probleme frecvente

| Simptom | Verificare |
|--------|------------|
| `redirect_uri_mismatch` | Redirect URI în Google = exact URL-ul callback Edge. |
| `no_refresh_token` | Prima conectare trebuie cu `prompt=consent` + cont care nu a refuzat deja scope-ul; revocă accesul app în [Google Account](https://myaccount.google.com/permissions) și reconectează. |
| 401 la Functions | JWT Supabase valid; utilizator autentificat în app. |
| CORS | Origin-ul managerului e permis implicit prin `corsHeaders` (reflectă `Origin` din request). |

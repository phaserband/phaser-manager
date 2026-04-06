# Securitate — Phaser Manager

## Situația actuală (important)

1. **Cheia Supabase „anon”** e în `index.html`. Oricine descarcă pagina o poate vedea. Dacă în SQL ai rulat `supabase-fix-appdata-rls.sql`, politica **`app_data_anon_all`** permite citire/scriere în `app_data` **fără login**. Practic, **URL-ul aplicației + cheia anon = acces la datele trupei** pentru cine știe să facă request-uri API.

2. **Ecranul „Cine folosește aplicația?”** nu e autentificare: oricine poate alege orice membru (e doar `localStorage`).

3. **PIN-ul vechi** din cod era doar o barieră vizuală (ușor de ocolit). Acum PIN-ul e **opțional**: `PHASER_ACCESS_PIN = ""` în `index.html` = fără PIN.

4. **Meta `noindex`** reduce apariția în Google; nu ascunde aplicația față de cine are linkul.

## Ce să faci concret (în ordine)

### A) Dacă ai folosit vreodată Claude din cod cu cheie în fișier

Cheia a fost scoasă din repo. **Revocă cheia** în [Anthropic Console](https://console.anthropic.com/) și creează una nouă; pune-o doar în **Setări AI** din aplicație (sau nu o folosi deloc).

### B) Protejează `manager.phaser.ro` (recomandat)

În **Cloudflare** → Zero Trust (sau **Access**) → **Applications** → protejează hostname-ul managerului:

- Politică: doar emailuri din trupă / listă de utilizatori Google / OTP.
- Astfel, **înainte** să se încarce `index.html`, vizitatorul trebuie să treacă de Cloudflare — mult mai puternic decât PIN-ul din browser.

Documentație: [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/).

### C) PIN opțional (în plus față de Access)

În `index.html`, în blocul PIN gate, setezi **doar în copia deployată** (fără commit):

```js
var PHASER_ACCESS_PIN = "codul-tau";
```

Lasă `""` în Git; folosește PIN doar ca strat suplimentar, nu ca singura apărare.

### D) Supabase Auth + RLS (implementat în aplicație)

Aplicația folosește **login email + parolă** (Supabase Auth, PKCE), iar sync-ul către `app_data` / `backups` / scrierea în storage `fisa-public` rulează doar când există sesiune validă și utilizatorul e recunoscut (membru din `MEMBERS` sau profil **approved** cu `band_member_id`).

**Înainte să strângi RLS**, creează în **Authentication → Users** conturi cu **aceleași emailuri** ca în `MEMBERS` din `index.html` (sau folosește fluxul de înregistrare + aprobare din panoul admin).

**Ordinea scripturilor SQL în Supabase (SQL Editor):**

1. `supabase-setup.sql` (dacă proiectul e nou) sau doar părțile lipsă.
2. `supabase-member-profiles-band-id.sql` — coloana `band_member_id` pe `member_profiles`.
3. `supabase-security-auth-rls.sql` — `app_data` și `backups` doar pentru `authenticated`; storage `fisa-public` scriere doar autentificat.

După pasul 3, **fără login** nu mai poți citi/scrie `app_data` din client — e normal.

**Admin aprobare:** în UI, la fiecare cerere alegi **Membru trupă** (`m1`…`m5`) înainte de **Aprobă**; se salvează `band_member_id` în `member_profiles`. Politica `member_profiles_update` din `supabase-setup.sql` permite update la toți utilizatorii pentru emailurile admin din listă (aliniați cu `PHASER_ADMIN_EMAILS` din cod).

### E) Rotații

- Dacă cheia anon a fost expusă public (repo GitHub deschis etc.), din Supabase **Settings → API** poți **roti** JWT secret / reevalua politicile RLS.

### F) Google Calendar — `Error 400: redirect_uri_mismatch`

Conectarea folosește **Google Identity Services** (`initTokenClient`) cu `GCAL_CLIENT_ID` din `index.html`. Eroarea apare când **originea paginii** nu e permisă pentru acel client OAuth.

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → clientul OAuth **Web** cu ID-ul din cod.
2. **Authorized JavaScript origins** — adaugă **exact** URL-ul fără path, de exemplu:
   - `https://manager.phaser.ro` (dacă aici host-ezi managerul)
   - `http://localhost:8080` (dacă testezi local cu server pe portul 8080)
3. Dacă deschizi app-ul cu `www` sau alt subdomeniu, adaugă și acel origin (ex. `https://www.manager.phaser.ro` dacă e cazul).
4. Tip client: trebuie să fie **Web application**, nu iOS/Android.
5. După salvare, așteaptă 1–5 minute și reîncearcă „Conectează Calendar”.

### G) Calendar stabil (refresh token pe server)

Pentru conectare **persistentă** fără „token 1 oră”, vezi **[GOOGLE_CALENDAR_EDGE_SETUP.md](./GOOGLE_CALENDAR_EDGE_SETUP.md)** — Edge Functions + tabel `google_calendar_credentials`. În `index.html`, `GCAL_USE_SERVER_OAUTH = true` activează acest flux.

## Rezumat

| Măsură                         | Efort | Efect                          |
|-------------------------------|-------|--------------------------------|
| Cloudflare Access pe manager  | Mediu | Foarte bun — oprește lumea random |
| Fără chei API în repo         | Mic   | Evită furt de chei             |
| PIN opțional                  | Mic   | Barieră ușoară                 |
| Supabase Auth + RLS stricte   | Mare  | Model corect multi-user       |

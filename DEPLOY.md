# Phaser Manager — Deploy pe Cloudflare Pages

## Pasul 1: Creează repo pe GitHub

1. Mergi la [github.com/new](https://github.com/new)
2. Nume repo: `phaser-manager` (sau altceva)
3. Alege **Private** sau **Public**
4. **NU** bifa „Add a README" — repo-ul trebuie gol
5. Click **Create repository**

## Pasul 2: Push codul pe GitHub

În terminal, din folderul proiectului:

```bash
cd "/Users/raczradu/Downloads/Phaser Manager"
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TE_USERNAME/phaser-manager.git
git push -u origin main
```

Înlocuiește `TE_USERNAME` cu username-ul tău GitHub și `phaser-manager` cu numele repo-ului dacă e diferit.

## Pasul 3: Conectează Cloudflare Pages la GitHub

1. Mergi la [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **Create application** → **Pages** → **Connect to Git**
3. Autorizează GitHub și alege repo-ul `phaser-manager`
4. Setări build:
   - **Build command:** (lasă gol)
   - **Build output directory:** `/` (sau `.`)
5. Click **Save and Deploy**

## Actualizări automate

După ce e conectat, la fiecare `git push` Cloudflare Pages face deploy automat:

```bash
git add .
git commit -m "Descriere modificări"
git push
```

## Varianta alternativă: Upload direct

Dacă nu vrei Git, poți uploada folderul direct din dashboard:
**Workers & Pages** → proiectul tău → **Deployments** → **Upload assets**

## Încărcare optimizată (septembrie 2026)

Sursa editabilă a fost mutată în `src/index.html`. `index.html` din rădăcină este acum pagina mică generată pentru producție.

1. `npm ci`
2. Editează `src/index.html`.
3. `npm run build` și `npm run build:check`.
4. Include sursa, `index.html` și noul `assets/app.<hash>.min.js` în commit, apoi publică prin push.

Setările Cloudflare rămân aceleași: build gol, director publicat rădăcina. Nu trebuie schimbat contul sau proiectul de găzduire. Nu șterge fișierele app cu hash mai vechi în același deploy: paginile deschise și cache-urile le pot solicita încă.

React 18.3.1 și Supabase 2.116.0 sunt servite local din `assets/vendor`, la versiunile existente la optimizare. Bibliotecile PDF existente (html2pdf 0.10.1, jsPDF 2.5.1) se încarcă la export. Loaderul reutilizează încărcările în curs și permite reîncercare după eroare.

`_headers` cere revalidarea paginii HTML și cache lung pentru fișierele cu versiune/hash. Surse: https://esbuild.github.io/api/#transform și https://developers.cloudflare.com/pages/configuration/headers/.

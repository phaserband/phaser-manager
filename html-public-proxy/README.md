# phaser-html-proxy

Worker Cloudflare care servește fișierele `offer-*.html`, `contract-*.html`, `fisa-*.html` și **`playlist-covers.html`** din bucket-ul public Supabase cu header corect **`Content-Type: text/html`**.

Fără acest proxy, unele proiecte Supabase returnează HTML-ul ca **`text/plain`**, iar browserul afișează sursa (tag-uri) în loc să randeze pagina.

## Deploy

```bash
cd html-public-proxy
npx wrangler deploy
```

Verifică în `wrangler.toml` că `SUPABASE_PUBLIC_OBJECT_BASE` indică bucket-ul tău:

`https://<project-ref>.supabase.co/storage/v1/object/public/fisa-public`

## Domeniu Phaser (recomandat)

În Cloudflare → worker **phaser-html-proxy** → **Triggers** → **Custom Domains** → adaugă de ex. **`offer.phaser.ro`** (DNS pe zona phaser.ro). În `index.html` setează `WORKER_PUBLIC_HTML_BASE = "https://offer.phaser.ro"` — linkurile de ofertă nu mai conțin subdomeniul random `*.workers.dev`.

## Fallback workers.dev

**`PHASER_CF_WORKERS_SUBDOMAIN`** = partea din mijloc (ex. `phaserband` → `*.phaserband.workers.dev`). Folosit dacă `WORKER_PUBLIC_HTML_BASE` e gol sau pentru PDF/AI fără domeniu propriu. Opțional: suprascrie în app (widget AI → ⚙️).

## Depanare: «Not found» sau 502 pe link

1. **URL complet** — trebuie `https://…workers.dev/offer-xxxx.html` (sau contract/fisa). Doar domeniul fără path → 404.
2. **Variabila `SUPABASE_PUBLIC_OBJECT_BASE` în Cloudflare** (Workers → phaser-html-proxy → Settings → Variables) trebuie să fie exact:
   `https://<PROJECT_REF>.supabase.co/storage/v1/object/public/fisa-public`  
   același `<PROJECT_REF>` ca `SUPABASE_URL` din `index.html` al aplicației. Dacă e alt proiect sau lipsește `fisa-public`, worker-ul dă 404/502.
3. Repornește deploy după modificare: `cd html-public-proxy && npx wrangler deploy`.
4. Verificare rapidă: în terminal, `curl -sI "https://<PROJECT_REF>.supabase.co/storage/v1/object/public/fisa-public/offer-XXX.html"` → trebuie 200; apoi același path pe worker → tot 200.

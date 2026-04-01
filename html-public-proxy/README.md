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

## Legare în Phaser Manager

În `index.html`, setează:

```js
const OFFER_HTML_PROXY_URL = "https://phaser-html-proxy.<subdomeniu>.workers.dev";
```

(lăsând gol `""` vei folosi linkul direct Supabase — poate arăta sursa ca text.)

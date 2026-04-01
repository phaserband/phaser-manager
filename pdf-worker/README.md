# Phaser PDF Worker

Worker Cloudflare care generează PDF-uri de calitate din HTML folosind Browser Rendering (Puppeteer).

## Setup

1. **Instalează dependențele:**
   ```bash
   cd pdf-worker
   npm install
   ```

2. **Autentificare Cloudflare:**
   ```bash
   npx wrangler login
   ```

3. **Activează Browser Rendering** în dashboard Cloudflare:
   - Workers & Pages → Overview → Browser Rendering
   - Sau la primul deploy, urmează instrucțiunile

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **URL după deploy:** ex. `phaser-pdf-worker.phaserband.workers.dev`. În `index.html`, **`PHASER_CF_WORKERS_SUBDOMAIN`** trebuie să fie `phaserband` (sau ce ai în Account Details).

## Limitări (plan gratuit)

- 10 minute browser/zi
- Suficient pentru zeci de PDF-uri pe zi

## API

`POST /` cu body JSON:
```json
{
  "html": "<div>Conținut HTML</div>",
  "baseUrl": "https://example.com/"
}
```

Returnează PDF binary (`application/pdf`).

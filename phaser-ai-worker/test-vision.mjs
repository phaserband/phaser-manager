#!/usr/bin/env node
/**
 * Test rapid vision CI — același body ca Phaser Manager: { visionIdCard: true, imageDataUrl }.
 *
 * Usage:
 *   node test-vision.mjs <worker-url> [cale-foto.jpg]
 *
 * Exemplu:
 *   node test-vision.mjs https://phaser-ai-worker.phaserband.workers.dev
 *   node test-vision.mjs https://phaser-ai-worker.phaserband.workers.dev ~/Desktop/buletin.jpg
 *
 * Fără fișier: trimite un JPEG 1×1 (valid) — verifică doar că Worker răspunde; câmpurile vor fi goale.
 */

import fs from "fs/promises";
import path from "path";

const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";

const base = String(process.argv[2] || process.env.PHASER_AI_WORKER_URL || "").trim().replace(/\/$/, "");

if (!/^https?:\/\//i.test(base)) {
  console.error("Lipsește URL Worker.");
  console.error("Usage: node test-vision.mjs <worker-url> [path-to-image.jpg|png|webp]");
  console.error("   or: PHASER_AI_WORKER_URL=https://... node test-vision.mjs");
  process.exit(1);
}

async function loadImageDataUrl(filePath) {
  const abs = path.resolve(filePath);
  const buf = await fs.readFile(abs);
  const b64 = buf.toString("base64");
  const lower = abs.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

async function main() {
  const imgArg = process.argv[3];
  const imageDataUrl = imgArg ? await loadImageDataUrl(imgArg) : tinyJpeg;

  console.error(`POST ${base}`);
  console.error(`  image: ${imgArg ? path.resolve(imgArg) : "built-in 1×1 JPEG (smoke test)"}`);
  console.error(`  bytes (approx): ${Math.round(imageDataUrl.length / 1024)} KB data URL\n`);

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visionIdCard: true, imageDataUrl }),
  });

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("Răspuns non-JSON (primele 600 caractere):");
    console.error(rawText.slice(0, 600));
    process.exit(1);
  }

  console.log(JSON.stringify({ httpStatus: res.status, body: data }, null, 2));

  if (!res.ok) {
    console.error("\n❌ HTTP error — vezi body.error mai sus.");
    process.exit(1);
  }

  const rawStr = data.raw != null ? String(data.raw) : "";
  if (rawStr === "[object Object]") {
    console.error(
      "\n❌ Worker DEPLOY-at returnează «[object Object]» — JSON-ul vine ca obiect dar e stringificat greșit.\n" +
        "   Reparația e în index.js (trimite { parsed }). Deploy:\n" +
        "   cd phaser-ai-worker && npx wrangler deploy\n"
    );
    process.exit(2);
  }

  if (data.parsed && typeof data.parsed === "object") {
    const filled = Object.entries(data.parsed).filter(([, v]) => String(v || "").trim());
    console.error(`\n✓ Worker a returnat { parsed } — ${filled.length} câmpuri nevide:`);
    filled.forEach(([k, v]) => console.error(`   ${k}: ${String(v).slice(0, 80)}${String(v).length > 80 ? "…" : ""}`));
    if (filled.length === 0 && !imgArg) {
      console.error("\n(i) Normal pentru JPEG 1×1 — pune o poză reală: node test-vision.mjs <url> ./buletin.jpg");
    }
  } else if (data.raw) {
    const r = String(data.raw);
    console.error("\n✓ Worker a returnat { raw } (string). Primele 500 caractere:");
    console.error(r.slice(0, 500) + (r.length > 500 ? "…" : ""));
    const i0 = r.indexOf("{");
    const i1 = r.lastIndexOf("}");
    if (i0 >= 0 && i1 > i0) {
      try {
        const j = JSON.parse(r.slice(i0, i1 + 1));
        const n = Object.values(j).filter((v) => String(v || "").trim()).length;
        console.error(`\n  → JSON extras din raw: ${n} câmpuri nevide (verifică că nu sunt inventate dacă poza e prea mică).`);
      } catch {
        console.error("\n  → Nu s-a putut parsa JSON din raw (OK dacă modelul a răspuns doar în proză).");
      }
    }
    if (/low.resolution|too small|unable to read|don'?t have the capability to read images/i.test(r)) {
      console.error("\n(i) Modelul a primit imaginea; pentru CI real: node test-vision.mjs <url> ./poza_buletin.jpg");
    }
  } else {
    console.error("\n⚠ Răspuns OK dar fără parsed/raw — verifică deploy-ul worker-ului.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

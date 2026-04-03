#!/usr/bin/env node
/**
 * Resetează parola pentru TOȚI utilizatorii Supabase Auth din proiect.
 *
 * Necesită Node.js 18+ (fetch integrat).
 *
 * 1) Supabase Dashboard → Settings → API → copiază:
 *    - Project URL → SUPABASE_URL
 *    - service_role (secret) → SUPABASE_SERVICE_ROLE_KEY
 *
 * 2) În Dashboard → Authentication → Providers → Email:
 *    dezactivează «Confirm email» dacă nu vrei confirmare.
 *
 * 3) Rulezi (o singură dată, pe calculatorul tău):
 *
 *    export SUPABASE_URL="https://xxxx.supabase.co"
 *    export SUPABASE_SERVICE_ROLE_KEY="eyJhbG..."
 *    export NEW_PASSWORD="phaser5!"
 *    export CONFIRM=YES
 *    node scripts/reset-supabase-user-passwords.mjs
 *
 * După reset, sesiunile vechi se invalidează — utilizatorii se loghează din nou.
 */

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const newPassword = process.env.NEW_PASSWORD || "phaser5!";

if (!url || !serviceKey) {
  console.error("Lipsește SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (process.env.CONFIRM !== "YES") {
  console.error('Adaugă CONFIRM=YES în mediu ca să rulezi efectiv (protecție împotriva rulării din greșeală).');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function listAllUsers() {
  const all = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`List users failed ${res.status}: ${t}`);
    }
    const body = await res.json();
    const batch = body.users || [];
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

async function setPassword(userId) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Update user ${userId} failed ${res.status}: ${t}`);
  }
}

async function main() {
  console.log("Citesc utilizatorii Auth…");
  const users = await listAllUsers();
  if (users.length === 0) {
    console.log("Niciun utilizator în Auth.");
    return;
  }
  console.log(`${users.length} utilizatori. Parolă nouă: (ascunsă în log)`);
  users.forEach((u) => console.log(`  - ${u.email || u.id} (${u.id})`));
  for (const u of users) {
    await setPassword(u.id);
    console.log(`OK: ${u.email || u.id}`);
  }
  console.log("Gata. Dezactivează «Confirm email» în Auth dacă încă e activ.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

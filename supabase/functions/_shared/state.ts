/** Semnează userId în state OAuth (HMAC-SHA256), fără tabel temporar. */

export async function encodeOAuthState(userId: string, secret: string): Promise<string> {
  const ts = Date.now();
  const payload = `${userId}|${ts}`;
  const sig = await hmacHex(secret, payload);
  const obj = { u: userId, t: ts, s: sig };
  return btoa(JSON.stringify(obj));
}

export async function decodeOAuthState(stateB64: string, secret: string, maxAgeMs = 900_000): Promise<string | null> {
  try {
    const obj = JSON.parse(atob(stateB64)) as { u: string; t: number; s: string };
    if (!obj.u || !obj.t || !obj.s) return null;
    if (Date.now() - obj.t > maxAgeMs) return null;
    const payload = `${obj.u}|${obj.t}`;
    const expected = await hmacHex(secret, payload);
    if (expected !== obj.s) return null;
    return obj.u;
  } catch {
    return null;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(mac);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

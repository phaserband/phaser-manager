/**
 * Re-proxy pentru fișiere HTML din Supabase Storage public.
 * Supabase poate servi .html cu Content-Type: text/plain → browserul arată sursa ca text.
 * Acest worker citește obiectul public și răspunde cu text/html.
 *
 * Setează în wrangler.toml [vars] SUPABASE_PUBLIC_OBJECT_BASE (fără slash final e ok, normalizăm).
 * Trebuie să fie același proiect Supabase ca în app: …/storage/v1/object/public/fisa-public
 */
const cors = { "Access-Control-Allow-Origin": "*" };

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Accept",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    let key = url.pathname.replace(/^\/+/, "");
    if (!key || key.includes("..") || key.includes("\\") || key.includes("/")) {
      return new Response(
        "Not found — deschide URL-ul complet cu fișierul (ex. …/offer-xxx.html), nu doar domeniul.",
        { status: 404, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    if (!/^(offer|contract|fisa)-.+\.html$/i.test(key) && !/^playlist-covers\.html$/i.test(key)) {
      return new Response("Not found", { status: 404, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
    }

    let base = (env.SUPABASE_PUBLIC_OBJECT_BASE || "").trim();
    if (!base) {
      return new Response("Worker misconfigured: SUPABASE_PUBLIC_OBJECT_BASE", {
        status: 500,
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    base = base.replace(/\/+$/, "") + "/";

    const upstream = base + encodeURI(key).replace(/%2F/gi, "/");
    let res;
    try {
      res = await fetch(upstream, {
        method: request.method,
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "User-Agent": "phaser-html-proxy/1",
        },
      });
    } catch (e) {
      return new Response("Bad gateway (rețea către storage)", {
        status: 502,
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (!res.ok) {
      const st = res.status;
      const hint =
        st === 404
          ? "Not found — fișierul nu există la URL-ul din SUPABASE_PUBLIC_OBJECT_BASE (alt proiect / bucket?)."
          : `Not found — storage a răspuns ${st}; verifică în Cloudflare că SUPABASE_PUBLIC_OBJECT_BASE = …/public/fisa-public (același ref ca în index.html).`;
      return new Response(hint, {
        status: st === 404 ? 404 : 502,
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "X-Phaser-Upstream-Status": String(st) },
      });
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  },
};

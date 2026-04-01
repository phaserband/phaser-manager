/**
 * Re-proxy pentru fișiere HTML din Supabase Storage public.
 * Supabase poate servi .html cu Content-Type: text/plain → browserul arată sursa ca text.
 * Acest worker citește obiectul public și răspunde cu text/html.
 *
 * Setează în wrangler.toml [vars] SUPABASE_PUBLIC_OBJECT_BASE (fără slash final e ok, normalizăm).
 */
export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    let key = url.pathname.replace(/^\/+/, "");
    if (!key || key.includes("..") || key.includes("\\") || key.includes("/")) {
      return new Response("Not found", { status: 404 });
    }
    if (!/^(offer|contract|fisa)-.+\.html$/i.test(key) && !/^playlist-covers\.html$/i.test(key)) {
      return new Response("Not found", { status: 404 });
    }

    let base = (env.SUPABASE_PUBLIC_OBJECT_BASE || "").trim();
    if (!base) {
      return new Response("Worker misconfigured: SUPABASE_PUBLIC_OBJECT_BASE", { status: 500 });
    }
    if (!base.endsWith("/")) base += "/";

    const upstream = base + encodeURI(key).replace(/%2F/gi, "/");
    const res = await fetch(upstream, {
      method: request.method,
      headers: { Accept: "text/html,*/*" },
    });

    if (!res.ok) {
      return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

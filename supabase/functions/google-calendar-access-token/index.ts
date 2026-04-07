// POST + JWT → access_token proaspăt (refresh pe server, global credential)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ch = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: ch });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row, error: rErr } = await admin
    .from("google_calendar_credentials")
    .select("refresh_token, user_id, updated_at")
    .not("refresh_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rErr || !row?.refresh_token) {
    return new Response(JSON.stringify({ error: "not_connected" }), {
      status: 404,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("GCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "server_config" }), {
      status: 500,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tj = await tr.json();
  if (!tr.ok || !tj.access_token) {
    console.error("refresh failed", tr.status, tj);
    return new Response(JSON.stringify({ error: tj.error || "refresh_failed" }), {
      status: 502,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      access_token: tj.access_token,
      expires_in: tj.expires_in ?? 3600,
    }),
    { headers: { ...ch, "Content-Type": "application/json" } },
  );
});

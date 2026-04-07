// GET + JWT → { connected: boolean } (global connection, not per-user)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseOrigin } from "../_shared/supabase_url.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ch = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: ch });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ connected: false, error: "no_session" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = supabaseOrigin();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return new Response(JSON.stringify({ connected: false }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim());
  const { data } = await admin
    .from("google_calendar_credentials")
    .select("user_id, refresh_token, updated_at")
    .not("refresh_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return new Response(JSON.stringify({ connected: !!data, mode: "global" }), {
    headers: { ...ch, "Content-Type": "application/json" },
  });
});

// GET + JWT → { connected: boolean }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return new Response(JSON.stringify({ connected: false }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await admin
    .from("google_calendar_credentials")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return new Response(JSON.stringify({ connected: !!data }), {
    headers: { ...ch, "Content-Type": "application/json" },
  });
});

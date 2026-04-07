// POST + JWT → șterge refresh token global (doar owner-ul credentialului activ)
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

  const confirm = (req.headers.get("X-Disconnect-Confirm") || "").toLowerCase();
  if (confirm !== "yes") {
    return new Response(JSON.stringify({ error: "Disconnect requires explicit confirmation" }), {
      status: 400,
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
  const { data: latest } = await admin
    .from("google_calendar_credentials")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) {
    return new Response(JSON.stringify({ ok: true, already_disconnected: true }), {
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }
  if (latest.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Only the account that connected the global calendar can disconnect it." }), {
      status: 403,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }
  await admin.from("google_calendar_credentials").delete().eq("user_id", latest.user_id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...ch, "Content-Type": "application/json" },
  });
});

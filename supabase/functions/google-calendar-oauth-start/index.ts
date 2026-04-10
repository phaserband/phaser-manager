// POST + JWT user → URL către Google OAuth (authorization code + refresh token)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { googleOAuthCallbackUrl, supabaseOrigin } from "../_shared/supabase_url.ts";
import { encodeOAuthState } from "../_shared/state.ts";

const GCAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

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
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = supabaseOrigin();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("GCAL_CLIENT_ID") || "").trim();
  const stateSecret = (Deno.env.get("OAUTH_STATE_SECRET") || "").trim();
  const functionUrl = googleOAuthCallbackUrl();

  if (!clientId || !stateSecret) {
    return new Response(JSON.stringify({ error: "Server misconfiguration: GOOGLE_CLIENT_ID or OAUTH_STATE_SECRET" }), {
      status: 500,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const state = await encodeOAuthState(user.id, stateSecret);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: functionUrl,
    response_type: "code",
    scope: GCAL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return new Response(JSON.stringify({ url: authUrl }), {
    headers: { ...ch, "Content-Type": "application/json" },
  });
});

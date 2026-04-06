// GET de la Google → schimbă code pe refresh_token → salvează în DB → redirect înapoi în app
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decodeOAuthState } from "../_shared/state.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  const frontend = Deno.env.get("FRONTEND_OAUTH_REDIRECT") || "https://manager.phaser.ro/";
  const redirectOk = (extra = "") =>
    new Response(null, {
      status: 302,
      headers: { Location: `${frontend.replace(/\/$/, "")}/?gcal_oauth=ok${extra}` },
    });
  const redirectErr = (msg: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${frontend.replace(/\/$/, "")}/?gcal_oauth=err&reason=${encodeURIComponent(msg)}`,
      },
    });

  if (errParam) {
    return redirectErr(errParam);
  }
  if (!code || !state) {
    return redirectErr("missing_code_or_state");
  }

  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("GCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const functionUrl = Deno.env.get("SUPABASE_URL")! + "/functions/v1/google-calendar-oauth-callback";

  if (!stateSecret || !clientId || !clientSecret) {
    return redirectErr("server_config");
  }

  const userId = await decodeOAuthState(state, stateSecret);
  if (!userId) {
    return redirectErr("bad_state");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: functionUrl,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("Google token exchange failed", tokenRes.status, tokenJson);
    return redirectErr(tokenJson.error || "token_exchange_failed");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let refresh = tokenJson.refresh_token as string | undefined;
  if (!refresh) {
    const { data: existing } = await admin
      .from("google_calendar_credentials")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    refresh = existing?.refresh_token ?? undefined;
  }
  if (!refresh) {
    console.error("No refresh_token from Google and none stored — use prompt=consent with acct that revokes app access and retry");
    return redirectErr("no_refresh_token");
  }

  const { error: upErr } = await admin.from("google_calendar_credentials").upsert(
    {
      user_id: userId,
      refresh_token: refresh,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upErr) {
    console.error("upsert credentials", upErr);
    return redirectErr("db_save_failed");
  }

  return redirectOk();
});

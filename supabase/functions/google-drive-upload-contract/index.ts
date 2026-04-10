import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseOrigin } from "../_shared/supabase_url.ts";

type UploadPayload = {
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
};

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const json = (status: number, body: Record<string, unknown>, extraHeaders: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const ch = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: ch });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, ch);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json(401, { error: "Unauthorized" }, ch);
  }

  const supabaseUrl = supabaseOrigin();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return json(401, { error: "Invalid session" }, ch);
  }

  const body = (await req.json().catch(() => null)) as UploadPayload | null;
  const fileName = String(body?.fileName || "").trim();
  const mimeType = String(body?.mimeType || "application/pdf").trim() || "application/pdf";
  const contentBase64 = String(body?.contentBase64 || "").trim();
  if (!fileName || !contentBase64) {
    return json(400, { error: "Missing fileName/contentBase64" }, ch);
  }

  let bytes: Uint8Array;
  try {
    const raw = atob(contentBase64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  } catch {
    return json(400, { error: "Invalid base64 payload" }, ch);
  }

  const admin = createClient(supabaseUrl, (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim());
  const { data: row, error: rErr } = await admin
    .from("google_calendar_credentials")
    .select("refresh_token, updated_at")
    .not("refresh_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rErr || !row?.refresh_token) {
    return json(404, { error: "not_connected" }, ch);
  }

  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("GCAL_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) {
    return json(500, { error: "server_config" }, ch);
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson?.access_token) {
    console.error("google token refresh failed", tokenRes.status, tokenJson);
    return json(502, { error: tokenJson?.error || "refresh_failed" }, ch);
  }

  const folderId = String(Deno.env.get("GOOGLE_DRIVE_CONTRACTS_FOLDER_ID") || "").trim();
  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType,
  };
  if (folderId) metadata.parents = [folderId];

  const boundary = `phaser-${crypto.randomUUID()}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const bodyBytes = new Uint8Array(
    new TextEncoder().encode(head).length + bytes.length + new TextEncoder().encode(tail).length,
  );
  const enc = new TextEncoder();
  const headBytes = enc.encode(head);
  const tailBytes = enc.encode(tail);
  bodyBytes.set(headBytes, 0);
  bodyBytes.set(bytes, headBytes.length);
  bodyBytes.set(tailBytes, headBytes.length + bytes.length);

  const uploadRes = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token as string}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: bodyBytes,
  });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadJson?.id) {
    console.error("drive upload failed", uploadRes.status, uploadJson);
    return json(502, { error: uploadJson?.error?.message || "drive_upload_failed" }, ch);
  }

  const fileId = String(uploadJson.id);
  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) {
    const pErr = await permRes.text().catch(() => "");
    console.warn("drive permission warning", permRes.status, pErr);
  }

  const viewUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  return json(200, { fileId, webViewLink: viewUrl }, ch);
});

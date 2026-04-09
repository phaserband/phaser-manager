/**
 * Proxy securizat pentru API REST factureaza.ro v1.
 * Secret: FACTUREAZA_API_KEY (Contul meu → Cheie API) — setează în Supabase → Edge Functions → Secrets.
 * Docs: https://factureaza.ro/documentatie-api-v1
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseOrigin } from "../_shared/supabase_url.ts";

const BASE_PROD = "https://factureaza.ro/api/v1/";
const BASE_SANDBOX = "https://sandbox.factureaza.ro/api/v1/";

function flatForm(prefix: string, val: unknown, into: string[][]): void {
  if (val == null) return;
  if (Array.isArray(val)) {
    val.forEach((item, i) => flatForm(`${prefix}[${i}]`, item, into));
    return;
  }
  if (typeof val === "object") {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      flatForm(`${prefix}[${k}]`, v, into);
    }
    return;
  }
  into.push([prefix, String(val)]);
}

function encodeRailsForm(root: string, obj: Record<string, unknown>): string {
  const pairs: string[][] = [];
  flatForm(root, obj, pairs);
  return new URLSearchParams(pairs).toString();
}

function parseErrors(xml: string): string[] {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return [...doc.getElementsByTagName("error")].map((e) => (e.textContent || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function idUnderRootTag(xml: string, rootTag: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const root = doc.getElementsByTagName(rootTag)[0];
    if (!root) return null;
    const id = root.getElementsByTagName("id")[0]?.textContent?.trim();
    return id || null;
  } catch {
    return null;
  }
}

function firstClientIdFromSearch(xml: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const clients = doc.getElementsByTagName("client");
    if (clients.length === 0) return null;
    const id = clients[0].getElementsByTagName("id")[0]?.textContent?.trim();
    return id || null;
  } catch {
    return null;
  }
}

function xmlChildText(el: Element, ...tagNames: string[]): string {
  for (const n of tagNames) {
    const c = el.getElementsByTagName(n)[0];
    const t = (c?.textContent || "").trim();
    if (t) return t;
  }
  return "";
}

type InvoiceSeriesRow = { id: string; prefix: string; label: string };

/** Extrage seriile de facturi din răspunsul XML list (REST v1). */
function parseInvoiceSeriesListXml(xml: string): { rows: InvoiceSeriesRow[]; rootTag: string } {
  const rows: InvoiceSeriesRow[] = [];
  const seen = new Set<string>();
  let rootTag = "";
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    rootTag = doc.documentElement?.tagName || "";
    const containerTags = ["invoice-series", "invoice_series", "document-series", "document_series"];
    for (const tag of containerTags) {
      const nodes = doc.getElementsByTagName(tag);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const id = xmlChildText(el, "id");
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        const prefix = xmlChildText(el, "prefix");
        const year = xmlChildText(el, "year");
        const cc = xmlChildText(el, "counter-current", "counter_current", "counterCurrent");
        const label = [prefix && `prefix ${prefix}`, year && `an ${year}`, cc && `ultim nr. ${cc}`].filter(Boolean).join(" · ") || "fără detalii";
        rows.push({ id, prefix, label });
      }
      if (rows.length > 0) break;
    }
  } catch {
    /* ignore */
  }
  return { rows, rootTag };
}

async function resolveDocumentSeriesId(base: string, apiKey: string, rawSeries: unknown): Promise<number | null> {
  const token = String(rawSeries ?? "").trim();
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);

  const norm = token.toUpperCase();
  const tryPaths = ["invoice_series.xml", "document_series.xml"];
  for (const path of tryPaths) {
    const r = await factFetch(base, apiKey, path, { method: "GET" });
    const xml = await r.text();
    if (!r.ok) continue;
    const { rows } = parseInvoiceSeriesListXml(xml);
    if (!rows.length) continue;
    const direct = rows.find((x) => x.prefix.toUpperCase() === norm);
    if (direct) return Number(direct.id);
    const loose = rows.find((x) => x.label.toUpperCase().includes(norm));
    if (loose) return Number(loose.id);
  }
  return null;
}

async function factFetch(base: string, apiKey: string, path: string, init: RequestInit): Promise<Response> {
  const url = new URL(path.replace(/^\//, ""), base);
  const basic = btoa(`${apiKey}:x`);
  const h = new Headers(init.headers);
  h.set("Authorization", `Basic ${basic}`);
  return fetch(url.toString(), { ...init, headers: h });
}

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
    return new Response(JSON.stringify({ error: "no_session" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = supabaseOrigin();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const supa = createClient(supabaseUrl, anon);
  const { data: { user }, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const apiKey = (Deno.env.get("FACTUREAZA_API_KEY") || "").trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "server_config",
        message: "Lipsește FACTUREAZA_API_KEY în secrets (Supabase → Edge Functions).",
      }),
      { status: 503, headers: { ...ch, "Content-Type": "application/json" } },
    );
  }

  type Line = { description: string; unit?: string; unit_count?: string | number; price: string; vat: number };
  type Body = {
    sandbox?: boolean;
    documentSeriesId: number | string;
    documentSeriesCounter: number;
    currencyId: number;
    vatType: number;
    documentDate: string;
    client: {
      name: string;
      uid?: string;
      city?: string;
      address?: string;
      registration_id?: string;
      country_id?: string;
    };
    lines: Line[];
    upperAnnotation?: string;
    lowerAnnotation?: string;
  };

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  if (raw.listInvoiceSeries === true) {
    const sandbox = !!raw.sandbox;
    const base = sandbox ? BASE_SANDBOX : BASE_PROD;
    const tryPaths = ["invoice_series.xml", "document_series.xml"];
    let lastText = "";
    let lastStatus = 0;
    let fallbackEmpty: { path: string; rootTag: string; xml: string } | null = null;
    for (const path of tryPaths) {
      const lr = await factFetch(base, apiKey, path, { method: "GET" });
      lastText = await lr.text();
      lastStatus = lr.status;
      if (!lr.ok) continue;
      const { rows, rootTag } = parseInvoiceSeriesListXml(lastText);
      if (rows.length > 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            series: rows,
            endpoint: path,
            rootTag,
          }),
          { headers: { ...ch, "Content-Type": "application/json" } },
        );
      }
      if (!fallbackEmpty) fallbackEmpty = { path, rootTag, xml: lastText };
    }
    if (fallbackEmpty) {
      const { path, rootTag, xml } = fallbackEmpty;
      return new Response(
        JSON.stringify({
          ok: true,
          series: [],
          endpoint: path,
          rootTag,
          emptyParseHint:
            "XML primit dar fără serii recunoscute — încearcă celălalt endpoint sau contactează suportul factureaza.",
          xmlPreview: xml.slice(0, 2200),
        }),
        { headers: { ...ch, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        error: "list_series_failed",
        status: lastStatus,
        message: "Nu am putut citi lista de serii de la factureaza (verifică cheia API și sandbox vs producție).",
        detail: lastText.slice(0, 2800),
      }),
      { status: 502, headers: { ...ch, "Content-Type": "application/json" } },
    );
  }

  const body = raw as unknown as Body;

  if (!body.client?.name?.trim() || !Array.isArray(body.lines) || body.lines.length === 0) {
    return new Response(JSON.stringify({ error: "validation", message: "Client și cel puțin o poziție sunt obligatorii." }), {
      status: 400,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const base = body.sandbox ? BASE_SANDBOX : BASE_PROD;
  const resolvedSeriesId = await resolveDocumentSeriesId(base, apiKey, body.documentSeriesId);
  if (!resolvedSeriesId) {
    return new Response(
      JSON.stringify({
        error: "validation",
        message: "Serie facturi invalidă. Pune ID numeric sau prefix existent (ex. PM).",
      }),
      { status: 400, headers: { ...ch, "Content-Type": "application/json" } },
    );
  }
  const uid = (body.client.uid || "").replace(/\D/g, "").trim();

  let clientId: string | null = null;
  if (uid) {
    const sr = await factFetch(
      base,
      apiKey,
      `clients/search.xml?field=uid&value=${encodeURIComponent(uid)}`,
      { method: "GET" },
    );
    const sxml = await sr.text();
    if (sr.ok) clientId = firstClientIdFromSearch(sxml);
  }

  if (!clientId) {
    const clientObj: Record<string, string> = {
      name: body.client.name.trim(),
      country_id: (body.client.country_id || "167").trim(),
    };
    if (uid) clientObj.uid = uid;
    if (body.client.city) clientObj.city = body.client.city.trim();
    if (body.client.address) clientObj.address = body.client.address.trim();
    if (body.client.registration_id) clientObj.registration_id = body.client.registration_id.trim();

    const cr = await factFetch(base, apiKey, "clients.xml", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeRailsForm("client", clientObj),
    });
    const cxml = await cr.text();
    if (cr.status !== 201) {
      const errs = parseErrors(cxml);
      return new Response(
        JSON.stringify({
          error: "client_create_failed",
          status: cr.status,
          errors: errs,
          detail: cxml.slice(0, 2500),
        }),
        { status: 502, headers: { ...ch, "Content-Type": "application/json" } },
      );
    }
    clientId = idUnderRootTag(cxml, "client");
  }

  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id_missing" }), {
      status: 502,
      headers: { ...ch, "Content-Type": "application/json" },
    });
  }

  const positions: Record<string, Record<string, string | number>> = {};
  body.lines.forEach((line, i) => {
    const idx = String(i + 1);
    positions[idx] = {
      description: line.description,
      unit: line.unit || "buc",
      unit_count: String(line.unit_count ?? 1),
      price: String(line.price),
      vat: 0,
    };
  });

  const invoice: Record<string, unknown> = {
    client_id: clientId,
    currency_id: body.currencyId,
    document_date: body.documentDate,
    document_series_id: resolvedSeriesId,
    document_series_counter: body.documentSeriesCounter,
    vat_type: body.vatType,
    document_positions: positions,
  };
  if (body.upperAnnotation) invoice.upper_annotation = body.upperAnnotation;
  if (body.lowerAnnotation) invoice.lower_annotation = body.lowerAnnotation;

  const ir = await factFetch(base, apiKey, "invoices.xml", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeRailsForm("invoice", invoice),
  });
  const ixml = await ir.text();

  if (ir.status !== 201) {
    const errs = parseErrors(ixml);
    return new Response(
      JSON.stringify({
        error: "invoice_create_failed",
        status: ir.status,
        errors: errs,
        detail: ixml.slice(0, 2500),
      }),
      { status: 502, headers: { ...ch, "Content-Type": "application/json" } },
    );
  }

  const invoiceId = idUnderRootTag(ixml, "invoice");
  let hashcode: string | null = null;
  try {
    const doc = new DOMParser().parseFromString(ixml, "text/xml");
    const inv = doc.getElementsByTagName("invoice")[0];
    hashcode = inv?.getElementsByTagName("hashcode")[0]?.textContent?.trim() || null;
  } catch { /* ignore */ }
  const pdfUrl = invoiceId ? `${base.replace(/\/$/, "")}/invoices/${invoiceId}.pdf` : null;
  const vizHost = body.sandbox ? "https://sandbox.factureaza.ro" : "https://factureaza.ro";
  const previewUrl = hashcode ? `${vizHost}/vizualizare/${hashcode}` : null;

  return new Response(
    JSON.stringify({
      ok: true,
      invoiceId,
      hashcode,
      pdfUrl,
      previewUrl,
      sandbox: !!body.sandbox,
    }),
    { headers: { ...ch, "Content-Type": "application/json" } },
  );
});

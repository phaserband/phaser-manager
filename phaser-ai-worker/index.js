// Phaser AI Worker — Cloudflare AI
// - Chat: Llama 3.1 8B Instruct
// - Buletin / CI: Llama 3.2 11B Vision Instruct (prima dată pe cont: POST { "metaVisionAgree": true })
// Deploy: npx wrangler deploy → phaser-ai-worker.<subdomain>.workers.dev

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const body = await request.json();

      /** O singură dată per cont Cloudflare — acceptă licența Meta pentru Llama 3.2 Vision (documentație CF). */
      if (body && body.metaVisionAgree === true) {
        try {
          await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" });
        } catch (e) {
          // Cloudflare poate arunca mesajul 5016 „Thank you for agreeing…” chiar la succes — îl tratăm ca OK.
          const msg = String(e && e.message ? e.message : e);
          if (!/Thank you for agreeing|5016/.test(msg)) throw e;
        }
        return new Response(
          JSON.stringify({
            ok: true,
            message: "Licență Meta acceptată pentru Llama 3.2 Vision. Poți folosi citirea din buletin.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (body && body.visionIdCard === true && body.imageDataUrl) {
        const imageDataUrl = String(body.imageDataUrl || "").trim();
        if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
          return new Response(
            JSON.stringify({
              error: "Imaginea trebuie să fie data:image/jpeg|png|webp;base64,...",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sys =
          "You are an expert at reading Romanian national ID cards (buletin / carte de identitate). " +
          "Reply ONLY with valid JSON, no markdown code fences, with exactly these keys: " +
          "clientNume (full legal name as printed, UPPERCASE), cnp (13 digits), " +
          "ciSeria (exactly 2 letters), ciNr (serial digits only), jud (county), mun (city), str, nr2, ap (optional), " +
          "domiciliu (one line: full address if str/nr split is uncertain). " +
          'Use empty string "" for unreadable or missing fields.';

        const userText =
          "Read this Romanian identity document image and extract all visible fields. Output one JSON object with those keys only. No other text.";

        const messages = [
          { role: "system", content: sys },
          { role: "user", content: userText },
        ];

        const aiRes = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
          messages,
          image: imageDataUrl,
          max_tokens: 700,
        });

        const text =
          aiRes && typeof aiRes === "object"
            ? String(aiRes.response ?? aiRes.result ?? aiRes.text ?? "").trim()
            : String(aiRes || "").trim();

        return new Response(JSON.stringify({ raw: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { messages, system } = body || {};
      if (!Array.isArray(messages)) {
        return new Response(
          JSON.stringify({
            error: "Trimite { messages: [...], system?: string } sau { visionIdCard: true, imageDataUrl }.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const llamaMessages = [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: llamaMessages,
        max_tokens: 1024,
      });

      return new Response(JSON.stringify({ response: response.response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: String(e && e.message ? e.message : e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};

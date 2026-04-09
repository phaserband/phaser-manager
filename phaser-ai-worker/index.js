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
          "ciSeria (2 letters), ciNr (serial number digits), jud (județ / county as on card), " +
          "localitate (ONE field: copy exactly what the card shows for place — municipiu OR oraș OR comună/sat OR sat name; do not split), " +
          "adresaDomiciliu (ONE string: the full domiciliu line(s) as printed — street, number, block, stair, apartment, village details, etc.; keep it as on the card, do not force separate nr/ap). " +
          'Use empty string "" for unreadable or missing fields.';

        const userText =
          "Read this Romanian ID card image and fill every JSON field from what is printed on the card. Use \"\" only if truly unreadable.";

        /**
         * Tutorialul CF folosește `image` la rădăcină + `messages` (text). Fără `image`, modelul nu „vede” poza.
         * Încercăm mai întâi cu JSON schema; dacă eșuează, același input fără schema.
         */
        const messages = [
          { role: "system", content: sys },
          { role: "user", content: userText },
        ];

        const idCardJsonSchema = {
          type: "object",
          properties: {
            clientNume: { type: "string" },
            cnp: { type: "string" },
            ciSeria: { type: "string" },
            ciNr: { type: "string" },
            jud: { type: "string" },
            localitate: { type: "string" },
            adresaDomiciliu: { type: "string" },
          },
          required: ["clientNume", "cnp", "ciSeria", "ciNr", "jud", "localitate", "adresaDomiciliu"],
        };

        const baseOpts = { messages, image: imageDataUrl, max_tokens: 768 };

        let aiRes;
        try {
          aiRes = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
            ...baseOpts,
            response_format: {
              type: "json_schema",
              json_schema: idCardJsonSchema,
            },
          });
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          if (/JSON Mode|json schema|couldn'?t be met|json_schema/i.test(msg)) {
            aiRes = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", baseOpts);
          } else {
            throw e;
          }
        }

        let parsedOut = null;
        let text = "";
        if (aiRes && typeof aiRes === "object") {
          const r = aiRes.response;
          if (r && typeof r === "object" && !Array.isArray(r)) {
            parsedOut = r;
          } else if (typeof r === "string") {
            text = r.trim();
          } else {
            text = String(r ?? aiRes.result ?? aiRes.text ?? "").trim();
          }
          if (!parsedOut && !text && Array.isArray(aiRes.data)) {
            const first = aiRes.data[0];
            if (first && typeof first === "object") {
              const rr = first.response ?? first.result;
              if (rr && typeof rr === "object" && !Array.isArray(rr)) parsedOut = rr;
              else text = (typeof rr === "string" ? rr : String(rr ?? first.text ?? "")).trim();
            }
          }
        } else {
          text = String(aiRes || "").trim();
        }

        if (parsedOut) {
          return new Response(JSON.stringify({ parsed: parsedOut }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!text) {
          return new Response(
            JSON.stringify({
              error:
                "Modelul vision nu a returnat text (timeout sau poză prea mare). Încearcă o poză mai mică/JPEG sau OpenAI în setări.",
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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

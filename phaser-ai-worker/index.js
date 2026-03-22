// Phaser AI Worker — Cloudflare AI (Llama 3.1 8B)
// Deploy: npx wrangler deploy

const ALLOWED_ORIGIN = "https://phaser-manager.raczradurr.workers.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { messages, system } = await request.json();

      // Construieste lista de mesaje pentru Llama
      const llamaMessages = [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      const response = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: llamaMessages,
          max_tokens: 1024,
        }
      );

      return new Response(
        JSON.stringify({ response: response.response }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (e) {
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};

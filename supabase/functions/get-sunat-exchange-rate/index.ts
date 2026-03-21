import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtenemos el token desde las variables de entorno de Supabase (Secrets)
    const DECOLECTA_TOKEN = Deno.env.get('DECOLECTA_TOKEN');
    
    if (!DECOLECTA_TOKEN) {
      return new Response(JSON.stringify({ error: 'DECOLECTA_TOKEN is not configured in Supabase Secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Realizamos la petición a Decolecta desde el servidor (donde no hay problemas de CORS)
    const response = await fetch(`https://api.decolecta.com/v1/tipo-cambio/sunat?token=${DECOLECTA_TOKEN}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: `Decolecta API error: ${errorText}` }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

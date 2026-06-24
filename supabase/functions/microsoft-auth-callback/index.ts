import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!
const REDIRECT_URI = 'https://g-gomes.vercel.app/auth/microsoft/callback'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { code, user_id } = await req.json()

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'Files.Read offline_access User.Read',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return new Response(JSON.stringify({ error: 'Falha ao obter tokens', details: tokens }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase.from('microsoft_tokens').upsert({
    usuario_id: user_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at,
  })

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!
const GRAPH = 'https://graph.microsoft.com/v1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function getAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('microsoft_tokens').select('*').eq('usuario_id', userId).single()
  if (!data) return null

  if (new Date(data.expires_at) < new Date(Date.now() + 60000)) {
    if (!data.refresh_token) return null
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
        scope: 'Files.ReadWrite offline_access User.Read',
      }),
    })
    const refreshed = await res.json()
    if (!refreshed.access_token) return null
    const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase.from('microsoft_tokens').update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? data.refresh_token,
      expires_at,
    }).eq('usuario_id', userId)
    return refreshed.access_token
  }

  return data.access_token
}

function caminhoGraph(pasta: string, arquivo: string): string {
  const partes = [...pasta.split('/'), arquivo].filter(Boolean).map(p => encodeURIComponent(p))
  return partes.join('/')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, pasta, nome_arquivo, conteudo_html } = await req.json()
    if (!pasta || !nome_arquivo || !conteudo_html) {
      return new Response(JSON.stringify({ error: 'dados_incompletos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
    const accessToken = await getAccessToken(supabase, user_id)
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const caminho = caminhoGraph(pasta, nome_arquivo)
    const res = await fetch(`${GRAPH}/me/drive/root:/${caminho}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/html' },
      body: conteudo_html,
    })
    const resultado = await res.json()

    if (!res.ok) {
      const codigo = resultado?.error?.code
      return new Response(JSON.stringify({
        error: codigo === 'itemNotFound' ? 'pasta_nao_encontrada' : 'erro_upload',
        details: resultado,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, webUrl: resultado.webUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'erro_interno', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

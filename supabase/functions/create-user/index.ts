import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verifica se quem chama é admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders })
    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', caller.id).single()
    if (!callerProfile?.is_admin) return new Response(JSON.stringify({ error: 'Sem permissão' }), { status: 403, headers: corsHeaders })

    const { email, password, nome, cargo, modulos } = await req.json()
    if (!email || !password || !nome) return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: corsHeaders })

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createError) return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })

    await supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      nome,
      email,
      cargo: cargo || null,
      modulos: modulos ?? ['agenda', 'processos', 'pendencias', 'reunioes'],
      is_admin: false,
    })

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})

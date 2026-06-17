import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

async function getAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('google_tokens').select('*').eq('usuario_id', userId).single()
  if (!data) return null

  if (new Date(data.expires_at) < new Date(Date.now() + 60000)) {
    if (!data.refresh_token) return null
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const refreshed = await res.json()
    if (!refreshed.access_token) return null
    const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase.from('google_tokens').update({ access_token: refreshed.access_token, expires_at }).eq('usuario_id', userId)
    return refreshed.access_token
  }

  return data.access_token
}

function buildGcalEvent(ev: any) {
  const start = ev.dia_inteiro
    ? { date: ev.data_inicio.split('T')[0] }
    : { dateTime: ev.data_inicio, timeZone: 'America/Sao_Paulo' }

  const endDate = ev.data_fim
    ? ev.data_fim
    : ev.dia_inteiro
      ? ev.data_inicio
      : new Date(new Date(ev.data_inicio).getTime() + 3600000).toISOString()

  const end = ev.dia_inteiro
    ? { date: endDate.split('T')[0] }
    : { dateTime: endDate, timeZone: 'America/Sao_Paulo' }

  return {
    summary: ev.titulo,
    ...(ev.descricao ? { description: ev.descricao } : {}),
    start,
    end,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  const { action, user_id, evento } = await req.json()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const accessToken = await getAccessToken(supabase, user_id)
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'not_connected' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (action === 'create') {
    const res = await fetch(BASE, { method: 'POST', headers, body: JSON.stringify(buildGcalEvent(evento)) })
    const gcal = await res.json()
    if (gcal.id) {
      await supabase.from('eventos').update({ google_event_id: gcal.id }).eq('id', evento.id)
    }
    return new Response(JSON.stringify({ google_event_id: gcal.id, htmlLink: gcal.htmlLink }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (action === 'update' && evento.google_event_id) {
    await fetch(`${BASE}/${evento.google_event_id}`, { method: 'PUT', headers, body: JSON.stringify(buildGcalEvent(evento)) })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (action === 'delete' && evento.google_event_id) {
    await fetch(`${BASE}/${evento.google_event_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})

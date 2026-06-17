import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = 'mailto:gui.vr.gomes@gmail.com'

function base64urlToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  return Uint8Array.from(atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeVapidJwt(audience: string): Promise<string> {
  const enc = (v: object) => bytesToBase64url(new TextEncoder().encode(JSON.stringify(v)))
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: audience, exp: Math.floor(Date.now() / 1000) + 3600, sub: VAPID_SUBJECT })}`

  const raw = base64urlToBytes(VAPID_PRIVATE_KEY)
  const pkcs8 = new Uint8Array(138)
  pkcs8.set([0x30,0x81,0x87,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x6d,0x30,0x6b,0x02,0x01,0x01,0x04,0x20])
  pkcs8.set(raw, 36)
  pkcs8.set([0xa1,0x44,0x03,0x42,0x00], 68)
  pkcs8.set(base64urlToBytes(VAPID_PUBLIC_KEY), 73)

  const key = await crypto.subtle.importKey('pkcs8', pkcs8.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${bytesToBase64url(new Uint8Array(sig))}`
}

async function sendPush(endpoint: string, payload: object): Promise<void> {
  const audience = new URL(endpoint)
  const jwt = await makeVapidJwt(`${audience.protocol}//${audience.host}`)
  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body: JSON.stringify(payload),
  })
}

async function notificar(supabase: any, usuarioIds: string[], title: string, body: string, url: string) {
  if (!usuarioIds.length) return
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .in('usuario_id', usuarioIds)

  await Promise.allSettled((subs ?? []).map((s: any) => sendPush(s.endpoint, { title, body, url })))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
  })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json()

  // Chamada direta (ex: futuro uso manual)
  if (body.usuario_ids) {
    await notificar(supabase, body.usuario_ids, body.title, body.message, body.url ?? '/')
    return new Response('ok')
  }

  // Webhook do Supabase — body tem { type, table, record, old_record }
  const { table, record } = body
  if (!record) return new Response('ok')

  if (table === 'pendencias') {
    // Notifica todos os participantes (exceto quem criou)
    const { data: parts } = await supabase
      .from('pendencia_participantes')
      .select('usuario_id')
      .eq('pendencia_id', record.id)

    const ids = ((parts ?? []) as any[])
      .map((p: any) => p.usuario_id)
      .filter((id: string) => id !== record.de_usuario_id)

    // Fallback: para_usuario_id se não tiver participantes
    if (ids.length === 0 && record.para_usuario_id && record.para_usuario_id !== record.de_usuario_id) {
      ids.push(record.para_usuario_id)
    }

    const { data: criador } = await supabase
      .from('profiles').select('nome').eq('id', record.de_usuario_id).single()
    const nomeCriador = criador?.nome?.split(' ')[0] ?? 'Alguém'

    await notificar(supabase, ids, 'Nova pendência', `${nomeCriador}: ${record.titulo}`, '/pendencias')
  }

  if (table === 'eventos') {
    // Notifica participantes do evento
    const { data: parts } = await supabase
      .from('evento_participantes')
      .select('usuario_id')
      .eq('evento_id', record.id)

    const ids = ((parts ?? []) as any[])
      .map((p: any) => p.usuario_id)
      .filter((id: string) => id !== record.criado_por)

    if (ids.length === 0) return new Response('ok')

    const { data: criador } = await supabase
      .from('profiles').select('nome').eq('id', record.criado_por).single()
    const nomeCriador = criador?.nome?.split(' ')[0] ?? 'Alguém'

    await notificar(supabase, ids, 'Novo evento', `${nomeCriador}: ${record.titulo}`, '/agenda')
  }

  return new Response('ok')
})

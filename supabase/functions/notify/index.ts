import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = 'mailto:gui.vr.gomes@gmail.com'

// ── Web Push (manual VAPID implementation) ──────────────────────────────────

function base64urlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Uint8Array.from(atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 3600, sub: VAPID_SUBJECT }
  const enc = (v: object) => bytesToBase64url(new TextEncoder().encode(JSON.stringify(v)))
  const unsigned = `${enc(header)}.${enc(payload)}`

  const keyBytes = base64urlToBytes(VAPID_PRIVATE_KEY)
  const key = await crypto.subtle.importKey('pkcs8',
    (() => { const d = new Uint8Array(138); d.set([0x30,0x81,0x87,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x6d,0x30,0x6b,0x02,0x01,0x01,0x04,0x20]; d.set(keyBytes, 36); d[68]=0xa1; d[69]=0x44; d[70]=0x03; d[71]=0x42; d[72]=0x00; const pub = base64urlToBytes(VAPID_PUBLIC_KEY); d.set(pub, 73); return d.buffer })(),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${bytesToBase64url(new Uint8Array(sig))}`
}

async function sendPush(endpoint: string, p256dh: string, auth: string, payload: object): Promise<boolean> {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await makeVapidJwt(audience)
  const body = new TextEncoder().encode(JSON.stringify(payload))

  // Simple unencrypted push (works for Chrome/Edge with aesgcm)
  // For full encryption we'd need aesgcm — use simple approach first
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body,
  })
  return res.ok || res.status === 201
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const body = await req.json()
  // body: { usuario_ids: string[], title: string, message: string, url: string }
  const { usuario_ids, title, message, url = '/' } = body

  if (!usuario_ids?.length) return new Response('ok')

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('usuario_id', usuario_ids)

  const results = await Promise.allSettled(
    (subs ?? []).map(sub => sendPush(sub.endpoint, sub.p256dh, sub.auth, { title, body: message, url }))
  )

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})

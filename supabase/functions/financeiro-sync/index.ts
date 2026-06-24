import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!
const GRAPH = 'https://graph.microsoft.com/v1.0'
const ABA_CONTAS_A_PAGAR = 'CONTAS A PAGAR '

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
        scope: 'Files.Read offline_access User.Read',
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

// Converte um link de compartilhamento do OneDrive no "shareId" exigido pelo Graph
function encodeSharingUrl(url: string): string {
  const base64 = btoa(url).replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-')
  return 'u!' + base64
}

function colLetra(n: number): string {
  let s = ''
  let x = n
  while (x >= 0) {
    s = String.fromCharCode(65 + (x % 26)) + s
    x = Math.floor(x / 26) - 1
  }
  return s
}

// O Excel/Graph devolve datas como número de série (dias desde 1899-12-30)
function serialParaISO(v: any): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, arquivo_url, data: dataAlvo, modo } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)

    const accessToken = await getAccessToken(supabase, user_id)
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const headers = { Authorization: `Bearer ${accessToken}` }
    const shareId = encodeSharingUrl(arquivo_url)

    const itemRes = await fetch(`${GRAPH}/shares/${shareId}/driveItem?$select=id,parentReference,name`, { headers })
    const item = await itemRes.json()
    if (!item.id) {
      return new Response(JSON.stringify({ error: 'arquivo_nao_encontrado', details: item }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const driveId = item.parentReference?.driveId
    const itemId = item.id
    const workbookBase = `${GRAPH}/drives/${driveId}/items/${itemId}/workbook`

    const listRes = await fetch(`${workbookBase}/worksheets?$select=id,name`, { headers })
    const lista = await listRes.json()
    const aba = Array.isArray(lista.value) ? lista.value.find((w: any) => w.name?.trim() === ABA_CONTAS_A_PAGAR.trim()) : null
    if (!aba) {
      return new Response(JSON.stringify({
        error: 'aba_nao_encontrada',
        details: { procurado: ABA_CONTAS_A_PAGAR, abas_disponiveis: (lista.value ?? []).map((w: any) => w.name) },
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Lê a planilha em blocos de linhas, todos em paralelo (bem mais rápido que um atrás do outro)
    const COLS = 11 // A..K
    const BLOCO = 3000
    const NUM_BLOCOS = 6 // cobre até a linha ~18000, com margem confortável
    const buscarTodos = modo === 'todos'
    const alvo = String(dataAlvo ?? new Date().toISOString().slice(0, 10))

    const enderecos: string[] = []
    for (let i = 0; i < NUM_BLOCOS; i++) {
      const inicio = 3 + i * BLOCO // pula as 2 primeiras linhas (totais soltos + cabeçalho)
      const fim = inicio + BLOCO - 1
      enderecos.push(`A${inicio}:${colLetra(COLS - 1)}${fim}`)
    }

    const respostas = await Promise.all(
      enderecos.map(endereco =>
        fetch(`${workbookBase}/worksheets/${aba.id}/range(address='${endereco}')?$select=values`, { headers })
          .then(r => r.json())
      )
    )

    const encontrados: any[] = []
    for (const range of respostas) {
      const valores: any[][] = range.values ?? []
      for (const row of valores) {
        const vencimentoISO = serialParaISO(row[3])
        if (vencimentoISO == null) continue
        if (!buscarTodos && vencimentoISO !== alvo) continue
        encontrados.push({
          data_dig: serialParaISO(row[0]),
          empresa: row[1] ?? null,
          vencimento: vencimentoISO,
          fornecedor: row[4] ?? null,
          nota: row[5] ?? null,
          descricao: row[6] ?? null,
          pagamento: serialParaISO(row[7]),
          valor: typeof row[8] === 'number' ? row[8] : null,
          tipo: row[9] ?? null,
          observacao: row[10] ?? null,
        })
      }
    }

    return new Response(JSON.stringify({ arquivo: item.name, data: alvo, lancamentos: encontrados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'erro_interno', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

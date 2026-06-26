import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!
const GRAPH = 'https://graph.microsoft.com/v1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Mesma lista de lojas e mapeamento de conta de depósito padrão usado no app (conferenciaCartaoHelpers.ts),
// só pra resolver o nome da conta de depósito quando a conferência de dinheiro ainda não tiver sido salva.
const CONTA_DEPOSITO_PADRAO: Record<string, string> = {
  '02 - TRÊS RIOS': 'FAPS ITAU', '03 - ATERRADO 56': 'FAPS ITAU', '04 - RETIRO': 'FAPS ITAU',
  '05 - AMARAL P.': 'FAPS ITAU', '06 - VILA': 'FAPS SICOOB', '07 - ATERRADO 968': 'FAPS SICOOB', '08 - FEITO DOCE 33': 'FAPS ITAU',
}

const BANCOS = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB', 'PESSOAL BRADESCO', 'PESSOAL ITAU', 'DINHEIRO']
const CONTAS_SALDO_INICIAL = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB']
const CONTAS_RESUMO = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB', 'PESSOAL BRADESCO', 'PESSOAL ITAU', 'DINHEIRO']
const FORMAS_PAGAMENTO_NOTA: Record<string, string> = { pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' }

const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function hojeBrasilia(): string {
  // America/Sao_Paulo está fixo em UTC-3 (sem horário de verão desde 2019).
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return partes // formato en-CA já vem como YYYY-MM-DD
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

async function gerarEEnviarRelatorio(supabase: any, userId: string, dia: string, pastaOnedrive: string): Promise<{ erro?: string }> {
  const [
    { data: lancamentosTodos },
    { data: saldosRows },
    { data: cartao },
    { data: dinheiro },
    { data: notasFiscais },
    { data: despesasLoja },
    { data: errosCaixa },
  ] = await Promise.all([
    supabase.from('financeiro_lancamentos').select('*').eq('dia', dia),
    supabase.from('financeiro_saldos').select('campo, valor').eq('dia', dia),
    supabase.from('financeiro_conferencia_cartao').select('*').eq('dia', dia),
    supabase.from('financeiro_conferencia_dinheiro').select('*').eq('dia', dia),
    supabase.from('financeiro_notas_fiscais').select('*').eq('dia', dia).order('criado_em'),
    supabase.from('financeiro_despesas_loja').select('*').eq('dia', dia).order('criado_em'),
    supabase.from('financeiro_erros_caixa').select('*').eq('dia', dia).order('criado_em'),
  ])

  const saldos: Record<string, number> = {}
  for (const row of saldosRows ?? []) saldos[row.campo] = row.valor

  const fechadosRows = (lancamentosTodos ?? []).filter((l: any) => l.fechado)
  const listaExibida = fechadosRows.length > 0 ? fechadosRows : (lancamentosTodos ?? [])

  const linhasCartao = (cartao ?? []).map((r: any) => ({ loja: r.loja, vendaCartao: r.venda_cartao, recebidoRede: r.recebido_rede, taxaRede: r.taxa_rede, diferenca: r.diferenca }))
  const linhasDinheiro = (dinheiro ?? []).map((r: any) => ({
    loja: r.loja, vendaDinheiro: r.venda_dinheiro, fechamentoCaixa: r.fechamento_caixa, diferenca: r.diferenca, deposito: r.deposito,
    contaDeposito: r.conta_deposito ?? CONTA_DEPOSITO_PADRAO[r.loja] ?? 'FAPS ITAU',
  }))

  function notasPorLoja(loja: string) {
    const doDia = (notasFiscais ?? []).filter((n: any) => n.loja === loja)
    const cartaoTotal = doDia.filter((n: any) => n.forma_pagamento === 'credito' || n.forma_pagamento === 'debito').reduce((s: number, n: any) => s + n.valor, 0)
    const dinheiroTotal = doDia.filter((n: any) => n.forma_pagamento === 'dinheiro').reduce((s: number, n: any) => s + n.valor, 0)
    return { cartao: cartaoTotal, dinheiro: dinheiroTotal }
  }
  function despesaPorLoja(loja: string) {
    return (despesasLoja ?? []).filter((d: any) => d.loja === loja).reduce((s: number, d: any) => s + d.valor, 0)
  }
  function erroPorLoja(loja: string) {
    return (errosCaixa ?? []).filter((e: any) => e.loja === loja).reduce((s: number, e: any) => s + e.valor, 0)
  }
  function pagamentosPorConta(conta: string) {
    return listaExibida.filter((l: any) => l.pagar_em === conta && !l.redirecionado_para).reduce((s: number, l: any) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
  }
  function recebidoRedeTotal() {
    return linhasCartao.reduce((s: number, l: any) => s + l.recebidoRede, 0)
  }
  function depositoPorConta(conta: string) {
    return linhasDinheiro.filter((l: any) => l.contaDeposito === conta).reduce((s: number, l: any) => s + l.deposito, 0)
  }

  const transfItauParaSicoob = (saldos['FAPS ITAU'] ?? 0) + depositoPorConta('FAPS ITAU') - pagamentosPorConta('FAPS ITAU')
  const transfSicoobParaGGomes = pagamentosPorConta('G GOMES SICOOB') - (saldos['G GOMES SICOOB'] ?? 0)
  const transfSicoobParaTS = pagamentosPorConta('TS SICOOB') - (saldos['TS SICOOB'] ?? 0)
  const transfSicoobParaPessoalBradesco = pagamentosPorConta('PESSOAL BRADESCO')
  const transfSicoobParaPessoalItau = pagamentosPorConta('PESSOAL ITAU')
  const saqueSicoobDinheiro = pagamentosPorConta('DINHEIRO')

  const transferenciasRedeLista = linhasCartao.filter((l: any) => l.recebidoRede > 0).map((l: any) => ({ de: l.loja, para: 'FAPS SICOOB', valor: l.recebidoRede }))
  const transferenciasLista = [
    { de: '01 - DEPOSITO 180', para: 'FAPS SICOOB', valor: transfItauParaSicoob },
    ...transferenciasRedeLista,
    { de: 'FAPS SICOOB', para: 'G GOMES SICOOB', valor: transfSicoobParaGGomes },
    { de: 'FAPS SICOOB', para: 'TS SICOOB', valor: transfSicoobParaTS },
    { de: 'FAPS SICOOB', para: 'PESSOAL BRADESCO', valor: transfSicoobParaPessoalBradesco },
    { de: 'FAPS SICOOB', para: 'PESSOAL ITAU', valor: transfSicoobParaPessoalItau },
  ].filter(t => t.valor > 0)

  function saldoAntesPagamentos(conta: string): number {
    if (conta === 'FAPS ITAU') return (saldos['FAPS ITAU'] ?? 0) + depositoPorConta('FAPS ITAU') - transfItauParaSicoob
    if (conta === 'FAPS SICOOB') {
      return (saldos['FAPS SICOOB'] ?? 0) + transfItauParaSicoob + recebidoRedeTotal()
        - transfSicoobParaGGomes - transfSicoobParaTS - transfSicoobParaPessoalBradesco - transfSicoobParaPessoalItau - saqueSicoobDinheiro
    }
    if (conta === 'G GOMES SICOOB') return (saldos['G GOMES SICOOB'] ?? 0) + transfSicoobParaGGomes
    if (conta === 'TS SICOOB') return (saldos['TS SICOOB'] ?? 0) + transfSicoobParaTS
    if (conta === 'PESSOAL BRADESCO') return (saldos['PESSOAL BRADESCO'] ?? 0) + transfSicoobParaPessoalBradesco
    if (conta === 'PESSOAL ITAU') return (saldos['PESSOAL ITAU'] ?? 0) + transfSicoobParaPessoalItau
    if (conta === 'DINHEIRO') return saqueSicoobDinheiro
    return 0
  }
  function saldoDepoisPagamentos(conta: string): number {
    return saldoAntesPagamentos(conta) - pagamentosPorConta(conta)
  }

  const pagamentosCPAgrupados: { conta: string; itens: any[] }[] = []
  for (const conta of [...BANCOS, '']) {
    const itens = listaExibida.filter((l: any) => (l.pagar_em ?? '') === conta && !l.redirecionado_para).sort((a: any, b: any) => (a.valor ?? 0) - (b.valor ?? 0))
    if (itens.length > 0) pagamentosCPAgrupados.push({ conta: conta || 'Não pagar', itens })
  }
  const pagamentosAdiados = listaExibida.filter((l: any) => !!l.redirecionado_para).sort((a: any, b: any) => (a.redirecionado_para ?? '').localeCompare(b.redirecionado_para ?? ''))

  const css = `
    body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px;max-width:1100px;margin:0 auto}
    h1{font-size:20px;margin-bottom:4px}
    h2{font-size:14px;text-transform:uppercase;margin:24px 0 8px;color:#374151}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
    th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}
    th{background:#f3f4f6}
    .num{text-align:right}
    .total{font-weight:bold;background:#f3f4f6}
    .grupo{font-weight:bold;text-transform:uppercase;background:#e5e7eb}
    .naopagar td{text-decoration:line-through;color:#9ca3af}
  `
  const linhasSaldoInicial = CONTAS_SALDO_INICIAL.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldos[c] ?? 0))}</td></tr>`).join('')
  const linhasCartaoHtml = linhasCartao.map((l: any) => `<tr><td>${esc(l.loja)}</td><td class="num">${esc(fmt(l.vendaCartao))}</td><td class="num">${esc(fmt(l.recebidoRede))}</td><td class="num">${esc(fmt(l.taxaRede))}</td><td class="num">${esc(fmt(l.diferenca - notasPorLoja(l.loja).cartao))}</td></tr>`).join('')
  const linhasDinheiroHtml = linhasDinheiro.map((l: any) => `<tr><td>${esc(l.loja)}</td><td class="num">${esc(fmt(l.vendaDinheiro))}</td><td class="num">${esc(fmt(l.fechamentoCaixa))}</td><td class="num">${esc(fmt(l.deposito))}</td><td>${esc(l.contaDeposito)}</td><td class="num">${esc(fmt(l.diferenca + despesaPorLoja(l.loja) + erroPorLoja(l.loja) - notasPorLoja(l.loja).dinheiro))}</td></tr>`).join('')
  const linhasNotas = (notasFiscais ?? []).map((n: any) => `<tr><td>${esc(n.loja)}</td><td>${esc(FORMAS_PAGAMENTO_NOTA[n.forma_pagamento] ?? n.forma_pagamento)}</td><td class="num">${esc(fmt(n.valor))}</td></tr>`).join('')
  const linhasDespesas = (despesasLoja ?? []).map((d: any) => `<tr><td>${esc(d.loja)}</td><td>${esc(d.descricao)}</td><td class="num">${esc(fmt(d.valor))}</td></tr>`).join('')
  const linhasErros = (errosCaixa ?? []).map((e: any) => `<tr><td>${esc(e.loja)}</td><td>${esc(e.operadora)}</td><td class="num">${esc(fmt(e.valor))}</td></tr>`).join('')
  const linhasTransf = transferenciasLista.map(t => `<tr><td>${esc(t.de)}</td><td>${esc(t.para)}</td><td class="num">${esc(fmt(t.valor))}</td></tr>`).join('') +
    (saqueSicoobDinheiro > 0 ? `<tr><td>FAPS SICOOB</td><td>DINHEIRO (saque)</td><td class="num">${esc(fmt(saqueSicoobDinheiro))}</td></tr>` : '')
  const linhasSaldoAntes = CONTAS_RESUMO.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldoAntesPagamentos(c)))}</td></tr>`).join('')
  const linhasSaldoDepois = CONTAS_RESUMO.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldoDepoisPagamentos(c)))}</td></tr>`).join('')
  const totalPagamentos = listaExibida.filter((l: any) => !l.redirecionado_para).reduce((s: number, l: any) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
  const linhasPagPorConta = BANCOS.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(pagamentosPorConta(c)))}</td></tr>`).join('')
  const linhasPagamentos = pagamentosCPAgrupados.map(g => `<tr class="grupo"><td colspan="10">${esc(g.conta)}</td></tr>` +
    g.itens.map((l: any) => `<tr${g.conta === 'Não pagar' ? ' class="naopagar"' : ''}><td>${esc(l.empresa)}</td><td>${l.vencimento ? esc(new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.nota)}</td><td>${esc(l.descricao)}</td><td>${esc(l.observacao)}</td><td class="num">${esc(fmt(l.valor))}</td><td>${esc(l.tipo)}</td><td>${esc(l.pagar_em)}</td><td>${l.pago ? 'Pago' : '—'}</td></tr>`).join('')).join('')
  const linhasAdiados = pagamentosAdiados.map((l: any) => `<tr><td>${esc(l.empresa)}</td><td>${l.vencimento ? esc(new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.nota)}</td><td>${esc(l.descricao)}</td><td>${esc(l.observacao)}</td><td class="num">${esc(fmt(l.valor))}</td><td>${l.redirecionado_para ? esc(new Date(l.redirecionado_para + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td></tr>`).join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório financeiro — ${esc(dia)}</title><style>${css}</style></head><body>
    <h1>Relatório financeiro completo</h1>
    <p>${esc(fmtData(dia))}</p>

    <h2>Saldo inicial</h2>
    <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoInicial}</tbody></table>

    <h2>Conferência rede (cartão)</h2>
    <table><thead><tr><th>Loja</th><th>Venda cartão</th><th>Recebido na rede</th><th>Taxa rede</th><th>Diferença</th></tr></thead><tbody>${linhasCartaoHtml}</tbody></table>

    <h2>Conferência de dinheiro</h2>
    <table><thead><tr><th>Loja</th><th>Venda dinheiro</th><th>Fechamento de caixa</th><th>Depósito</th><th>Conta depósito</th><th>Diferença</th></tr></thead><tbody>${linhasDinheiroHtml}</tbody></table>

    ${(notasFiscais ?? []).length > 0 ? `<h2>Notas fiscais</h2><table><thead><tr><th>Loja</th><th>Forma de pagamento</th><th>Valor</th></tr></thead><tbody>${linhasNotas}</tbody></table>` : ''}
    ${(despesasLoja ?? []).length > 0 ? `<h2>Despesas pagas em loja</h2><table><thead><tr><th>Loja</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${linhasDespesas}</tbody></table>` : ''}
    ${(errosCaixa ?? []).length > 0 ? `<h2>Erros de caixa</h2><table><thead><tr><th>Loja</th><th>Operadora</th><th>Valor</th></tr></thead><tbody>${linhasErros}</tbody></table>` : ''}
    ${(transferenciasLista.length > 0 || saqueSicoobDinheiro > 0) ? `<h2>Transferências</h2><table><thead><tr><th>De</th><th>Para</th><th>Valor</th></tr></thead><tbody>${linhasTransf}</tbody></table>` : ''}

    <h2>Saldo antes dos pagamentos</h2>
    <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoAntes}<tr class="total"><td>Total</td><td class="num">${esc(fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoAntesPagamentos(c), 0)))}</td></tr></tbody></table>

    <h2>Pagamentos previstos — total ${esc(fmt(totalPagamentos))}</h2>
    <table><thead><tr><th>Loja</th><th>Venc.</th><th>Fornecedor</th><th>Fatura</th><th>Descrição</th><th>Observação</th><th>Valor</th><th>Tipo</th><th>Pagar em</th><th>Pago</th></tr></thead><tbody>${linhasPagamentos}</tbody></table>

    ${pagamentosAdiados.length > 0 ? `<h2>Adiados</h2><table><thead><tr><th>Loja</th><th>Venc.</th><th>Fornecedor</th><th>Fatura</th><th>Descrição</th><th>Observação</th><th>Valor</th><th>Nova data</th></tr></thead><tbody>${linhasAdiados}</tbody></table>` : ''}

    <h2>Pagamentos por conta</h2>
    <table><thead><tr><th>Conta</th><th>Total</th></tr></thead><tbody>${linhasPagPorConta}<tr class="total"><td>Total</td><td class="num">${esc(fmt(BANCOS.reduce((s, c) => s + pagamentosPorConta(c), 0)))}</td></tr></tbody></table>

    <h2>Saldo depois dos pagamentos</h2>
    <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoDepois}<tr class="total"><td>Total</td><td class="num">${esc(fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoDepoisPagamentos(c), 0)))}</td></tr></tbody></table>
  </body></html>`

  const accessToken = await getAccessToken(supabase, userId)
  if (!accessToken) return { erro: 'not_connected' }

  const [ano, mes, diaNum] = dia.split('-')
  const caminho = caminhoGraph(pastaOnedrive, `Relatorio-CP-${diaNum}-${mes}-${ano}.html`)
  const res = await fetch(`${GRAPH}/me/drive/root:/${caminho}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/html' },
    body: html,
  })
  if (!res.ok) {
    const resultado = await res.json().catch(() => null)
    return { erro: resultado?.error?.code ?? `erro_upload_${res.status}` }
  }
  return {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!)
    const dia = hojeBrasilia()

    const { data: configs } = await supabase.from('financeiro_config')
      .select('usuario_id, pasta_onedrive')
      .not('pasta_onedrive', 'is', null)
    const resultados: Record<string, string> = {}

    for (const cfg of configs ?? []) {
      if (!cfg.pasta_onedrive?.trim()) continue

      // Evita gerar/enviar duas vezes o mesmo dia (cron disparado de novo, retry, etc.)
      const { data: jaFeito } = await supabase.from('financeiro_saldos')
        .select('valor').eq('dia', dia).eq('usuario_id', cfg.usuario_id).eq('campo', 'DIA_FINALIZADO_AUTO').maybeSingle()
      if (jaFeito?.valor === 1) { resultados[cfg.usuario_id] = 'ja_feito'; continue }

      const { erro } = await gerarEEnviarRelatorio(supabase, cfg.usuario_id, dia, cfg.pasta_onedrive.trim())
      if (erro) {
        resultados[cfg.usuario_id] = 'erro: ' + erro
        continue
      }
      await supabase.from('financeiro_saldos').upsert(
        { dia, campo: 'DIA_FINALIZADO_AUTO', valor: 1, usuario_id: cfg.usuario_id, updated_at: new Date().toISOString() },
        { onConflict: 'dia,campo' }
      )
      resultados[cfg.usuario_id] = 'ok'
    }

    return new Response(JSON.stringify({ dia, resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'erro_interno', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import { supabase } from './supabase'

// Recalcula o "saldo depois dos pagamentos" de um dia específico de qualquer conta, direto do banco —
// usado pra verificar se o saldo inicial informado no dia seguinte bate com o que deveria sobrar
// de ontem (já considerando depósitos, transferências entre contas e pagamentos daquele dia).
export async function calcularSaldoDepoisPagamentos(dia: string, contas: string[]): Promise<Record<string, number>> {
  const [{ data: saldosRows }, { data: lancamentosTodos }, { data: cartao }, { data: dinheiro }, { data: guardado }] = await Promise.all([
    supabase.from('financeiro_saldos').select('campo, valor').eq('dia', dia),
    supabase.from('financeiro_lancamentos').select('valor, juros, pagar_em, redirecionado_para, fechado').eq('dia', dia),
    supabase.from('financeiro_conferencia_cartao').select('loja, recebido_rede').eq('dia', dia),
    supabase.from('financeiro_conferencia_dinheiro').select('loja, deposito, conta_deposito').eq('dia', dia),
    supabase.from('financeiro_dinheiro_guardado').select('origem, valor, destino, conta_deposito').eq('dia', dia),
  ])

  const saldos: Record<string, number> = {}
  for (const r of saldosRows ?? []) saldos[r.campo] = r.valor

  const fechadosRows = (lancamentosTodos ?? []).filter((l: any) => l.fechado)
  const listaExibida = fechadosRows.length > 0 ? fechadosRows : (lancamentosTodos ?? [])

  function pagamentosPorConta(conta: string) {
    return listaExibida.filter((l: any) => l.pagar_em === conta && !l.redirecionado_para).reduce((s: number, l: any) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
  }
  function dinheiroGuardadoPorLoja(loja: string) {
    return (guardado ?? []).filter((d: any) => d.origem === loja).reduce((s: number, d: any) => s + d.valor, 0)
  }
  function dinheiroGuardadoEscritorioPorConta(conta: string) {
    return (guardado ?? []).filter((d: any) => d.origem === 'Escritório' && d.destino === 'deposito' && d.conta_deposito === conta).reduce((s: number, d: any) => s + d.valor, 0)
  }
  function depositoPorConta(conta: string) {
    const porLojas = (dinheiro ?? []).filter((l: any) => l.conta_deposito === conta).reduce((s: number, l: any) => s + l.deposito + dinheiroGuardadoPorLoja(l.loja), 0)
    return porLojas + dinheiroGuardadoEscritorioPorConta(conta)
  }
  function recebidoRedeTotal() {
    return (cartao ?? []).reduce((s: number, l: any) => s + l.recebido_rede, 0)
  }

  const transfItauParaSicoob = (saldos['FAPS ITAU'] ?? 0) + depositoPorConta('FAPS ITAU') - pagamentosPorConta('FAPS ITAU')
  const transfSicoobParaGGomes = pagamentosPorConta('G GOMES SICOOB') - (saldos['G GOMES SICOOB'] ?? 0)
  const transfSicoobParaTS = pagamentosPorConta('TS SICOOB') - (saldos['TS SICOOB'] ?? 0)
  const transfSicoobParaPessoalBradesco = pagamentosPorConta('PESSOAL BRADESCO')
  const transfSicoobParaPessoalItau = pagamentosPorConta('PESSOAL ITAU')
  const saqueSicoobDinheiro = pagamentosPorConta('DINHEIRO')

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

  const resultado: Record<string, number> = {}
  for (const c of contas) resultado[c] = saldoDepoisPagamentos(c)
  return resultado
}

export async function buscarNotasPixDosDias(dias: string[]): Promise<number> {
  if (dias.length === 0) return 0
  const { data } = await supabase.from('financeiro_notas_fiscais').select('valor').in('dia', dias).eq('forma_pagamento', 'pix')
  return (data ?? []).reduce((s, n) => s + n.valor, 0)
}

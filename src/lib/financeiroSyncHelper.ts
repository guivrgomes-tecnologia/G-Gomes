import { supabase } from './supabase'

function valorCent(v: unknown): number {
  return Math.round((Number(v) || 0) * 100)
}

function somarDias(dataISO: string, n: number) {
  const d = new Date(dataISO + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ehFimDeSemana(dataISO: string): boolean {
  const diaSemana = new Date(dataISO + 'T12:00:00').getDay()
  return diaSemana === 0 || diaSemana === 6
}
function diaUtilEfetivo(dataISO: string, feriados: Set<string>): string {
  let atual = dataISO
  while (ehFimDeSemana(atual) || feriados.has(atual)) {
    atual = somarDias(atual, 1)
  }
  return atual
}

// Trava em memória pra impedir que duas sincronizações corram em paralelo (clique duplo, dois botões, etc.)
// Sem isso, a primeira rodada pode duplicar: as duas chamadas concorrentes não se veem ainda salvas no banco.
let sincronizacaoEmAndamento: Promise<{ erro?: string }> | null = null

export async function sincronizarLancamentos(userId: string, arquivoUrl: string): Promise<{ erro?: string }> {
  if (sincronizacaoEmAndamento) return sincronizacaoEmAndamento
  const promessa = sincronizarLancamentosInterno(userId, arquivoUrl)
  sincronizacaoEmAndamento = promessa
  try {
    return await promessa
  } finally {
    sincronizacaoEmAndamento = null
  }
}

async function sincronizarLancamentosInterno(userId: string, arquivoUrl: string): Promise<{ erro?: string }> {
  if (!arquivoUrl) return { erro: 'Configure o link da planilha primeiro.' }

  const { data, error } = await supabase.functions.invoke('financeiro-sync', {
    body: { user_id: userId, arquivo_url: arquivoUrl, modo: 'todos' },
  })

  let corpoErro: any = data?.error ? data : null
  if (error && (error as any).context?.json) {
    try { corpoErro = await (error as any).context.json() } catch { /* ignora */ }
  }
  if (corpoErro || error) {
    const codigo = corpoErro?.error
    const mensagem = codigo === 'not_connected' ? 'Conexão com a Microsoft expirou. Conecte novamente.'
      : codigo === 'arquivo_nao_encontrado' ? 'Não consegui localizar esse arquivo no OneDrive. Confere o link nas configurações.'
      : codigo === 'aba_nao_encontrada' ? `Não encontrei a aba "CONTAS A PAGAR" nesse arquivo. Abas disponíveis: ${(corpoErro?.details?.abas_disponiveis ?? []).join(', ')}`
      : codigo ? `${codigo}${corpoErro?.details ? ' — ' + JSON.stringify(corpoErro.details).slice(0, 300) : ''}`
      : error?.message ?? 'Erro ao sincronizar'
    return { erro: mensagem }
  }

  const { data: feriadosData } = await supabase.from('financeiro_feriados').select('dia')
  const feriadosAtuais = new Set((feriadosData ?? []).map(r => r.dia))

  const todos: any[] = data.lancamentos ?? []
  const porDia = new Map<string, any[]>()
  const vistos = new Set<string>()
  for (const l of todos) {
    if (!l.vencimento) continue
    const diaDestino = diaUtilEfetivo(l.vencimento, feriadosAtuais)
    const chave = `${l.vencimento}|${l.empresa ?? ''}|${l.fornecedor ?? ''}|${l.nota ?? ''}|${valorCent(l.valor)}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    if (!porDia.has(diaDestino)) porDia.set(diaDestino, [])
    porDia.get(diaDestino)!.push(l)
  }

  // Limpa lançamentos não fechados que ficaram presos em fins de semana/feriados de sincronizações antigas
  const { data: naoFechadosTodos } = await supabase.from('financeiro_lancamentos').select('id, dia').eq('fechado', false)
  const idsOrfaos = (naoFechadosTodos ?? []).filter(r => ehFimDeSemana(r.dia) || feriadosAtuais.has(r.dia)).map(r => r.id)
  if (idsOrfaos.length > 0) {
    await supabase.from('financeiro_lancamentos').delete().in('id', idsOrfaos)
  }

  const dias = Array.from(porDia.keys())
  // Identidade do lançamento: empresa + fornecedor + nota + vencimento. NUNCA usa valor aqui,
  // porque o valor da planilha é ajustado com frequência (descontos, juros, etc.) e não pode
  // ser usado pra reconhecer "é o mesmo lançamento de antes" — senão duplica a cada ajuste.
  // Aparam espaços extras (ex.: "COFINS " com espaço no final) pra não tratar como lançamento diferente.
  const norm = (v: unknown) => String(v ?? '').trim()
  const chaveLinha = (l: any) => `${norm(l.empresa)}|${norm(l.fornecedor)}|${norm(l.nota)}|${norm(l.vencimento)}`

  await Promise.all(dias.map(async dia => {
    // Busca os lançamentos existentes DESSE DIA especificamente, em vez de uma consulta gigante
    // com todos os dias da planilha de uma vez (que passava do limite de linhas do Supabase e
    // silenciosamente deixava de encontrar lançamentos já salvos — fazendo o sync "não atualizar nada").
    const { data: existentesDoDiaTodos } = await supabase.from('financeiro_lancamentos').select('*').eq('dia', dia)
    const diaTemAlgumFechado = (existentesDoDiaTodos ?? []).some(r => r.fechado)
    const existentesDoDia = (existentesDoDiaTodos ?? []).filter(r => !r.importado_de_id)
    const existentesPorChave = new Map(existentesDoDia.map(r => [chaveLinha(r), r]))
    const usados = new Set<string>()
    const novos: any[] = []
    const atualizacoes: any[] = []

    // Se duas linhas da planilha caírem na mesma identidade (ex.: "Fatura" genérica como "PA",
    // reaproveitada em vários lançamentos), mantém só a última lida — evita duas atualizações
    // concorrentes na mesma linha do banco com valores diferentes (corrida que descartava a correção).
    const linhasUnicasPorChave = new Map<string, any>()
    for (const l of porDia.get(dia)!) linhasUnicasPorChave.set(chaveLinha(l), l)

    for (const l of linhasUnicasPorChave.values()) {
      const lLimpo = { ...l, empresa: norm(l.empresa), fornecedor: norm(l.fornecedor), nota: norm(l.nota), tipo: norm(l.tipo) }
      const chave = chaveLinha(l)
      const existente = existentesPorChave.get(chave)
      if (existente) {
        usados.add(chave)
        if (existente.fechado) {
          // Essa linha específica já foi fechada (ex.: importada de um dia que já foi fechado) —
          // não muda valor pra não bagunçar o que já foi fechado, só a data de pagamento (informativa).
          if (lLimpo.pagamento && existente.pagamento !== lLimpo.pagamento) {
            atualizacoes.push(supabase.from('financeiro_lancamentos').update({ pagamento: lLimpo.pagamento }).eq('id', existente.id))
          }
        } else {
          atualizacoes.push(supabase.from('financeiro_lancamentos').update({
            data_dig: lLimpo.data_dig, descricao: lLimpo.descricao, pagamento: lLimpo.pagamento, tipo: lLimpo.tipo, observacao: lLimpo.observacao,
            empresa: lLimpo.empresa, fornecedor: lLimpo.fornecedor, nota: lLimpo.nota,
            valor: lLimpo.valor, valor_planilha: lLimpo.valor, linha_planilha: lLimpo.linha_planilha,
          }).eq('id', existente.id))
        }
      } else if (!diaTemAlgumFechado) {
        // Só insere lançamento novo se o dia não tiver nada fechado ainda — um dia com algo já
        // fechado não deve ganhar novidades por trás, pra não bagunçar o que já foi decidido.
        novos.push({ ...lLimpo, dia, usuario_id: userId, fechado: false, valor_planilha: lLimpo.valor })
      }
    }

    await Promise.all(atualizacoes)
    if (novos.length > 0) {
      // Insere um por um: se o banco recusar por já existir (corrida com outra aba/sincronização
      // rodando ao mesmo tempo), ignora — significa que o outro processo já inseriu, não duplica.
      await Promise.all(novos.map(async novo => {
        const { error: erroInsert } = await supabase.from('financeiro_lancamentos').insert(novo)
        if (erroInsert && erroInsert.code !== '23505') {
          console.error('Erro ao inserir lançamento:', erroInsert)
        }
      }))
    }

    if (!diaTemAlgumFechado) {
      const sobrando = existentesDoDia.filter(r => !usados.has(chaveLinha(r)) && !r.redirecionado_para && !r.origem_manual)
      if (sobrando.length > 0) {
        await supabase.from('financeiro_lancamentos').delete().in('id', sobrando.map((r: any) => r.id))
      }
    }
  }))

  return {}
}

import { useEffect, useState } from 'react'
import { Landmark, AlertTriangle, CalendarClock, CalendarCheck, CalendarRange, X, Package, CheckCircle2, ChevronRight } from 'lucide-react'
import { supabase, criarNotificacoes } from '../lib/supabase'

type Lancamento = {
  id: string
  empresa: string | null
  fornecedor: string | null
  nota: string | null
  descricao: string | null
  vencimento: string | null
  valor: number | null
  juros: number | null
  pago?: boolean
  pagamento: string | null
  redirecionado_para?: string | null
}

type Pedido = {
  id: string
  grupo_id: string
  numero_pedido: number | null
  fornecedor: string | null
  data_pedido: string | null
  prazo_pagamento: number[]
  valor_pedido: number | null
  loja_nome: string | null
  status: string
}

type GrupoPedido = {
  grupo_id: string
  numero_pedido: number | null
  fornecedor: string | null
  data_pedido: string | null
  prazo_pagamento: number[]
  valor_total: number
  lojas: string[]
}

const CAMPOS_SELECT = 'id, empresa, fornecedor, nota, descricao, vencimento, valor, juros, pago, pagamento, redirecionado_para'

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarValor(itens: Lancamento[]) {
  return itens.reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

export default function FinanceiroDashboard() {
  const [loading, setLoading] = useState(true)
  const [vencidosUltimoMes, setVencidosUltimoMes] = useState<Lancamento[]>([])
  const [pagamentosMesAtual, setPagamentosMesAtual] = useState<Lancamento[]>([])
  const [aVencerMesAtual, setAVencerMesAtual] = useState<Lancamento[]>([])
  const [pagamentosProximoMes, setPagamentosProximoMes] = useState<Lancamento[]>([])
  const [mostrarVencidos, setMostrarVencidos] = useState(false)
  const [pedidosPendentes, setPedidosPendentes] = useState<GrupoPedido[]>([])
  const [pedidoSelecionado, setPedidoSelecionado] = useState<GrupoPedido | null>(null)
  const [dataFaturamento, setDataFaturamento] = useState('')
  const [aprovando, setAprovando] = useState(false)
  const [semanaTotal, setSemanaTotal] = useState<{ total: number; qtd: number; inicio: string; fim: string } | null>(null)
  const [carregandoSemana, setCarregandoSemana] = useState(false)

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (!dataFaturamento) { setSemanaTotal(null); return }
    buscarSemana(dataFaturamento)
  }, [dataFaturamento])

  async function buscarSemana(data: string) {
    setCarregandoSemana(true)
    const d = new Date(data + 'T12:00:00')
    // Semana: segunda a domingo
    const diaSemana = d.getDay() // 0=dom, 1=seg...
    const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana
    const seg = new Date(d); seg.setDate(d.getDate() + diffSeg)
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
    const inicio = localDate(seg)
    const fim = localDate(dom)
    const { data: rows } = await supabase.from('financeiro_lancamentos')
      .select('valor, juros, pago, pagamento, redirecionado_para')
      .gte('vencimento', inicio).lte('vencimento', fim)
    const ativos = (rows ?? []).filter((l: any) => !l.redirecionado_para)
    const total = ativos.reduce((s: number, l: any) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
    setSemanaTotal({ total, qtd: ativos.length, inicio, fim })
    setCarregandoSemana(false)
  }

  async function carregar() {
    setLoading(true)
    const hoje = new Date()
    const hojeStr = localDate(hoje)
    const umMesAtras = new Date(hoje); umMesAtras.setMonth(hoje.getMonth() - 1)

    const inicioMesAtual = localDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fimMesAtual = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))
    const inicioProximoMes = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1))
    const fimProximoMes = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0))

    const [{ data: vencidos }, { data: mesAtual }, { data: proximoMes }, { data: pedidos }] = await Promise.all([
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', localDate(umMesAtras)).lt('vencimento', hojeStr),
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', inicioMesAtual).lte('vencimento', fimMesAtual),
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', inicioProximoMes).lte('vencimento', fimProximoMes),
      supabase.from('pedidos').select('id, grupo_id, numero_pedido, fornecedor, data_pedido, prazo_pagamento, valor_pedido, loja_nome, status')
        .eq('status', 'PENDENTE').order('numero_pedido', { ascending: false }),
    ])

    setVencidosUltimoMes((vencidos ?? []).filter(l => !l.pagamento && !l.redirecionado_para))
    setPagamentosMesAtual((mesAtual ?? []).filter(l => !l.redirecionado_para))
    setAVencerMesAtual((mesAtual ?? []).filter(l => !l.redirecionado_para && !l.pagamento && (l.vencimento ?? '') >= hojeStr))
    setPagamentosProximoMes((proximoMes ?? []).filter(l => !l.redirecionado_para))

    // Agrupa pedidos por grupo_id
    const grupos: Record<string, GrupoPedido> = {}
    for (const p of (pedidos ?? []) as Pedido[]) {
      if (!grupos[p.grupo_id]) {
        grupos[p.grupo_id] = {
          grupo_id: p.grupo_id,
          numero_pedido: p.numero_pedido,
          fornecedor: p.fornecedor,
          data_pedido: p.data_pedido,
          prazo_pagamento: p.prazo_pagamento ?? [],
          valor_total: 0,
          lojas: [],
        }
      }
      grupos[p.grupo_id].valor_total += p.valor_pedido ?? 0
      if (p.loja_nome) grupos[p.grupo_id].lojas.push(p.loja_nome)
    }
    setPedidosPendentes(Object.values(grupos))

    setLoading(false)
  }

  async function aprovarPedido() {
    if (!pedidoSelecionado || !dataFaturamento) return
    setAprovando(true)

    await supabase.from('pedidos')
      .update({ status: 'APROVADO', data_faturamento: dataFaturamento })
      .eq('grupo_id', pedidoSelecionado.grupo_id)

    // Busca quem criou o pedido para notificar
    const { data: rows } = await supabase
      .from('pedidos')
      .select('created_by')
      .eq('grupo_id', pedidoSelecionado.grupo_id)
      .limit(1)
    const criadorId = (rows?.[0] as any)?.created_by
    if (criadorId) {
      const fmtData = new Date(dataFaturamento + 'T12:00:00').toLocaleDateString('pt-BR')
      await criarNotificacoes([{
        usuario_id: criadorId,
        tipo: 'pedido_aprovado',
        titulo: `Pedido aprovado: ${pedidoSelecionado.fornecedor ?? ''}`,
        mensagem: `Faturar a partir de ${fmtData}`,
        link: '/pedidos',
      }])
    }

    setPedidosPendentes(prev => prev.filter(p => p.grupo_id !== pedidoSelecionado.grupo_id))
    setPedidoSelecionado(null)
    setDataFaturamento('')
    setSemanaTotal(null)
    setAprovando(false)
  }

  const cards = [
    {
      label: 'Vencidos no último mês', sub: 'Sem baixa registrada na planilha',
      valor: somarValor(vencidosUltimoMes), qtd: vencidosUltimoMes.length,
      icon: AlertTriangle, cor: 'border-red-200 bg-red-50 text-red-700', iconCor: 'text-red-500',
      onClick: () => setMostrarVencidos(true),
    },
    {
      label: 'Total de pagamentos no mês', sub: 'Todos os lançamentos do mês atual',
      valor: somarValor(pagamentosMesAtual), qtd: pagamentosMesAtual.length,
      icon: CalendarCheck, cor: 'border-gray-200 bg-white text-gray-700', iconCor: 'text-gray-400',
      onClick: undefined,
    },
    {
      label: 'A vencer nesse mês', sub: 'Ainda sem baixa, vencimento de hoje em diante',
      valor: somarValor(aVencerMesAtual), qtd: aVencerMesAtual.length,
      icon: CalendarClock, cor: 'border-amber-200 bg-amber-50 text-amber-700', iconCor: 'text-amber-500',
      onClick: undefined,
    },
    {
      label: 'Total de pagamentos no próximo mês', sub: 'Todos os lançamentos já previstos',
      valor: somarValor(pagamentosProximoMes), qtd: pagamentosProximoMes.length,
      icon: CalendarRange, cor: 'border-sky-200 bg-sky-50 text-sky-700', iconCor: 'text-sky-500',
      onClick: undefined,
    },
  ]

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Dashboard Financeiro</h1>
        <p className="text-sm text-gray-400">Visão geral dos pagamentos</p>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-400">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {cards.map(c => (
              <div key={c.label} onClick={c.onClick}
                className={`rounded-xl border p-4 ${c.cor} ${c.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
                <c.icon size={20} className={c.iconCor} />
                <p className="text-xs font-semibold mt-2.5">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{fmt(c.valor)}</p>
                <p className="text-[11px] opacity-70 mt-1">{c.qtd} lançamento{c.qtd === 1 ? '' : 's'} · {c.sub}</p>
              </div>
            ))}
          </div>

          {/* Pedidos pendentes de aprovação */}
          <div className="mb-2 flex items-center gap-2">
            <Package size={18} className="text-yellow-500" />
            <h2 className="text-base font-semibold text-gray-900">Pedidos aguardando aprovação</h2>
            {pedidosPendentes.length > 0 && (
              <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">{pedidosPendentes.length}</span>
            )}
          </div>

          {pedidosPendentes.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              Nenhum pedido pendente de aprovação.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
              {pedidosPendentes.map(p => (
                <button key={p.grupo_id} onClick={() => { setPedidoSelecionado(p); setDataFaturamento('') }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                  <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
                    <Package size={16} className="text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {p.numero_pedido && (
                        <span className="text-xs font-semibold text-gray-400">#{String(p.numero_pedido).padStart(3, '0')}</span>
                      )}
                      <span className="text-sm font-semibold text-gray-900 truncate">{p.fornecedor ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400">Pedido: {fmtDate(p.data_pedido)}</span>
                      {p.prazo_pagamento?.length > 0 && (
                        <span className="text-xs text-gray-400">Prazo: {p.prazo_pagamento.join('/')} dias</span>
                      )}
                      {p.lojas.length > 0 && (
                        <span className="text-xs text-gray-400 truncate">{p.lojas.length} loja{p.lojas.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{fmt(p.valor_total)}</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal de aprovação */}
      {pedidoSelecionado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPedidoSelecionado(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Package size={17} className="text-yellow-500" />
                Aprovar pedido
              </h3>
              <button onClick={() => setPedidoSelecionado(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                {pedidoSelecionado.numero_pedido && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Pedido</span>
                    <span className="font-semibold">#{String(pedidoSelecionado.numero_pedido).padStart(3, '0')}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Fornecedor</span>
                  <span className="font-semibold">{pedidoSelecionado.fornecedor ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Valor total</span>
                  <span className="font-semibold">{fmt(pedidoSelecionado.valor_total)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Prazo</span>
                  <span className="font-semibold">{pedidoSelecionado.prazo_pagamento?.join('/') ?? '—'} dias</span>
                </div>
                {pedidoSelecionado.lojas.length > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Lojas</span>
                    <span className="font-semibold text-right max-w-[60%]">{pedidoSelecionado.lojas.join(', ')}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Faturar a partir de</label>
                <input type="date" className="input" value={dataFaturamento}
                  onChange={e => setDataFaturamento(e.target.value)} />
              </div>

              {dataFaturamento && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${carregandoSemana ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-blue-200 bg-blue-50'}`}>
                  {carregandoSemana ? (
                    <span>Calculando pagamentos da semana...</span>
                  ) : semanaTotal && (
                    <>
                      <div className="text-xs text-blue-500 font-medium mb-1">
                        Semana de {new Date(semanaTotal.inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a {new Date(semanaTotal.fim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-blue-700 font-semibold text-base">{fmt(semanaTotal.total)}</span>
                        <span className="text-xs text-blue-500">{semanaTotal.qtd} lançamento{semanaTotal.qtd !== 1 ? 's' : ''} na programação</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setPedidoSelecionado(null)}
                className="btn-secondary text-sm px-4 py-2">Cancelar</button>
              <button onClick={aprovarPedido} disabled={!dataFaturamento || aprovando}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                {aprovando ? 'Aprovando...' : 'Aprovar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarVencidos && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMostrarVencidos(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={17} className="text-red-500" /> Vencidos no último mês ({vencidosUltimoMes.length})
              </h3>
              <button onClick={() => setMostrarVencidos(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            {vencidosUltimoMes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nenhum lançamento vencido sem baixa.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead><tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Venc.</th>
                    <th className="text-left px-3 py-2 font-medium">Loja</th>
                    <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                    <th className="text-left px-3 py-2 font-medium">Fatura</th>
                    <th className="text-left px-3 py-2 font-medium">Descrição</th>
                    <th className="text-right px-3 py-2 font-medium">Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {vencidosUltimoMes
                      .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''))
                      .map(l => (
                        <tr key={l.id} className="hover:bg-red-50/40">
                          <td className="px-3 py-2 whitespace-nowrap font-medium text-red-700">
                            {l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{l.empresa}</td>
                          <td className="px-3 py-2">{l.fornecedor}</td>
                          <td className="px-3 py-2">{l.nota}</td>
                          <td className="px-3 py-2">{l.descricao}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{fmt((l.valor ?? 0) + (l.juros ?? 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={5} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(somarValor(vencidosUltimoMes))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

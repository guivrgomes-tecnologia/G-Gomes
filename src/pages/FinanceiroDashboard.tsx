import { useEffect, useState } from 'react'
import { Landmark, AlertTriangle, CalendarClock, CalendarCheck, CalendarRange, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

const CAMPOS_SELECT = 'id, empresa, fornecedor, nota, descricao, vencimento, valor, juros, pago, pagamento, redirecionado_para'

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarValor(itens: Lancamento[]) {
  return itens.reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FinanceiroDashboard() {
  const [loading, setLoading] = useState(true)
  const [vencidosUltimoMes, setVencidosUltimoMes] = useState<Lancamento[]>([])
  const [pagamentosMesAtual, setPagamentosMesAtual] = useState<Lancamento[]>([])
  const [aVencerMesAtual, setAVencerMesAtual] = useState<Lancamento[]>([])
  const [pagamentosProximoMes, setPagamentosProximoMes] = useState<Lancamento[]>([])
  const [mostrarVencidos, setMostrarVencidos] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const hoje = new Date()
    const hojeStr = localDate(hoje)
    const umMesAtras = new Date(hoje); umMesAtras.setMonth(hoje.getMonth() - 1)

    const inicioMesAtual = localDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fimMesAtual = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))
    const inicioProximoMes = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1))
    const fimProximoMes = localDate(new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0))

    const [{ data: vencidos }, { data: mesAtual }, { data: proximoMes }] = await Promise.all([
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', localDate(umMesAtras)).lt('vencimento', hojeStr),
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', inicioMesAtual).lte('vencimento', fimMesAtual),
      supabase.from('financeiro_lancamentos').select(CAMPOS_SELECT)
        .gte('vencimento', inicioProximoMes).lte('vencimento', fimProximoMes),
    ])

    // "Vencido sem baixa": passou da data e não tem data de pagamento registrada na planilha (campo
    // `pagamento`) — não conta o que já foi adiado pra outro dia, porque esse já tem um plano novo.
    setVencidosUltimoMes((vencidos ?? []).filter(l => !l.pagamento && !l.redirecionado_para))
    setPagamentosMesAtual((mesAtual ?? []).filter(l => !l.redirecionado_para))
    setAVencerMesAtual((mesAtual ?? []).filter(l => !l.redirecionado_para && !l.pagamento && (l.vencimento ?? '') >= hojeStr))
    setPagamentosProximoMes((proximoMes ?? []).filter(l => !l.redirecionado_para))
    setLoading(false)
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

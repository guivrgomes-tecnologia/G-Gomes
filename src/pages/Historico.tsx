import { useEffect, useState } from 'react'
import { Plus, X, Trash2, TrendingUp, TrendingDown, List, Grid3x3, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import BarChart from '../components/BarChart'

type VendaLoja = { id: string; nome: string; ordem: number }
type VendaRegistro = {
  id: string; loja_id: string; ano: number; gerente: string | null
  jan: number; fev: number; mar: number; abr: number; mai: number; jun: number
  jul: number; ago: number; set: number; out: number; nov: number; dez: number
}

const MESES: { key: keyof VendaRegistro; label: string }[] = [
  { key: 'jan', label: 'Jan' }, { key: 'fev', label: 'Fev' }, { key: 'mar', label: 'Mar' },
  { key: 'abr', label: 'Abr' }, { key: 'mai', label: 'Mai' }, { key: 'jun', label: 'Jun' },
  { key: 'jul', label: 'Jul' }, { key: 'ago', label: 'Ago' }, { key: 'set', label: 'Set' },
  { key: 'out', label: 'Out' }, { key: 'nov', label: 'Nov' }, { key: 'dez', label: 'Dez' },
]

const REGISTRO_VAZIO = { jan: 0, fev: 0, mar: 0, abr: 0, mai: 0, jun: 0, jul: 0, ago: 0, set: 0, out: 0, nov: 0, dez: 0 }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtCompacto = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: v >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: v >= 1000000 ? 1 : 2 })

function totalRegistro(r: VendaRegistro): number {
  return MESES.reduce((s, m) => s + (r[m.key] as number), 0)
}

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

export default function Historico() {
  const { user } = useAuth()
  const [view, setView] = useState<'mensal' | 'anual' | 'grafico'>('mensal')
  const [lojas, setLojas] = useState<VendaLoja[]>([])
  const [registros, setRegistros] = useState<VendaRegistro[]>([])
  const [anos, setAnos] = useState<number[]>([])
  const [anoAtivo, setAnoAtivo] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})
  const [showNovaLoja, setShowNovaLoja] = useState(false)
  const [novaLojaNome, setNovaLojaNome] = useState('')
  const [showNovoAno, setShowNovoAno] = useState(false)
  const [novoAno, setNovoAno] = useState(new Date().getFullYear())
  const [copiarLojasDe, setCopiarLojasDe] = useState(true)
  const [editandoGerente, setEditandoGerente] = useState<string | null>(null)
  const [gerenteBuffer, setGerenteBuffer] = useState('')
  const [saving, setSaving] = useState(false)
  const [mostrarVariacao, setMostrarVariacao] = useState(true)

  useEffect(() => { loadTudo() }, [])

  async function loadTudo() {
    setLoading(true)
    const [{ data: loj }, { data: reg }] = await Promise.all([
      supabase.from('vendas_lojas').select('*').order('ordem'),
      supabase.from('vendas').select('*').order('ano', { ascending: false }),
    ])
    setLojas(loj ?? [])
    setRegistros((reg ?? []) as VendaRegistro[])
    const anosDisponiveis = Array.from(new Set((reg ?? []).map((r: any) => r.ano))).sort((a, b) => b - a)
    setAnos(anosDisponiveis)
    setAnoAtivo(prev => prev && anosDisponiveis.includes(prev) ? prev : (anosDisponiveis[0] ?? null))
    setLoading(false)
  }

  function registroDe(lojaId: string, ano: number): VendaRegistro | undefined {
    return registros.find(r => r.loja_id === lojaId && r.ano === ano)
  }

  async function criarAno() {
    setSaving(true)
    const lojasBase = copiarLojasDe ? lojas : []
    const rows = lojasBase.map(l => ({
      loja_id: l.id, ano: novoAno, gerente: copiarLojasDe ? (registroDe(l.id, anos[0] ?? novoAno)?.gerente ?? null) : null,
      ...REGISTRO_VAZIO,
    }))
    if (rows.length > 0) await supabase.from('vendas').insert(rows)
    setShowNovoAno(false)
    await loadTudo()
    setAnoAtivo(novoAno)
    setSaving(false)
  }

  async function deletarAno(ano: number) {
    if (!confirm(`Apagar todos os dados de vendas de ${ano}?`)) return
    await supabase.from('vendas').delete().eq('ano', ano)
    await loadTudo()
  }

  async function criarLoja() {
    if (!novaLojaNome.trim()) return
    setSaving(true)
    const { data } = await supabase.from('vendas_lojas').insert({ nome: novaLojaNome.trim(), ordem: lojas.length, criado_por: user!.id }).select().single()
    if (data && anoAtivo) {
      await supabase.from('vendas').insert({ loja_id: data.id, ano: anoAtivo, ...REGISTRO_VAZIO })
    }
    setNovaLojaNome(''); setShowNovaLoja(false)
    await loadTudo()
    setSaving(false)
  }

  async function deletarLoja(id: string) {
    if (!confirm('Remover esta loja e todo o histórico de vendas dela?')) return
    await supabase.from('vendas_lojas').delete().eq('id', id)
    await loadTudo()
  }

  async function atualizarMes(lojaId: string, ano: number, mes: keyof VendaRegistro, valorStr: string) {
    const valor = parseValorBR(valorStr)
    const existente = registroDe(lojaId, ano)
    if (existente) {
      await supabase.from('vendas').update({ [mes]: valor }).eq('id', existente.id)
    } else {
      await supabase.from('vendas').insert({ loja_id: lojaId, ano, ...REGISTRO_VAZIO, [mes]: valor })
    }
    await loadTudo()
  }

  async function salvarGerente(lojaId: string, ano: number) {
    const existente = registroDe(lojaId, ano)
    if (existente) {
      await supabase.from('vendas').update({ gerente: gerenteBuffer.trim() || null }).eq('id', existente.id)
    } else {
      await supabase.from('vendas').insert({ loja_id: lojaId, ano, ...REGISTRO_VAZIO, gerente: gerenteBuffer.trim() || null })
    }
    setEditandoGerente(null)
    await loadTudo()
  }

  function variacaoMes(lojaId: string, ano: number, mes: keyof VendaRegistro, anosAtras: number = 1): number | null {
    const atual = registroDe(lojaId, ano)
    const anterior = registroDe(lojaId, ano - anosAtras)
    if (!atual || !anterior) return null
    const valAtual = atual[mes] as number
    const valAnterior = anterior[mes] as number
    if (!valAnterior) return null
    return (valAtual - valAnterior) / valAnterior
  }

  if (loading) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  const lojasDoAno = anoAtivo ? lojas.filter(l => registroDe(l.id, anoAtivo)) : []
  const totalRedeAno = anoAtivo ? lojasDoAno.reduce((s, l) => s + totalRegistro(registroDe(l.id, anoAtivo)!), 0) : 0
  const totalPorMes = (mes: keyof VendaRegistro) => anoAtivo ? lojasDoAno.reduce((s, l) => s + ((registroDe(l.id, anoAtivo)?.[mes] as number) ?? 0), 0) : 0

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Histórico</h1>
          <p className="text-sm text-gray-400">Histórico de vendas por loja, mês a mês e ano a ano</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('mensal')} title="Visão mensal"
              className={`p-1.5 rounded-lg transition-colors ${view === 'mensal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <List size={15} />
            </button>
            <button onClick={() => setView('anual')} title="Visão anual"
              className={`p-1.5 rounded-lg transition-colors ${view === 'anual' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <Grid3x3 size={15} />
            </button>
            <button onClick={() => setView('grafico')} title="Gráfico"
              className={`p-1.5 rounded-lg transition-colors ${view === 'grafico' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <BarChart3 size={15} />
            </button>
          </div>
          <button onClick={() => setShowNovoAno(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Novo ano
          </button>
        </div>
      </div>

      {anos.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum ano de vendas cadastrado ainda.</p>
        </div>
      ) : view === 'mensal' ? (
        <>
          {/* Seletor de ano */}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {anos.map(a => (
              <div key={a} className="relative group">
                <button onClick={() => setAnoAtivo(a)}
                  className={`text-sm py-1.5 px-3.5 rounded-lg border font-medium transition-colors ${a === anoAtivo ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                  {a}
                </button>
                <button onClick={() => deletarAno(a)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <X size={10} />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-1.5 ml-3 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={mostrarVariacao} onChange={e => setMostrarVariacao(e.target.checked)} className="accent-brand-600" />
              Comparar com ano anterior
            </label>
            <button onClick={() => setShowNovaLoja(true)} className="ml-auto flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
              <Plus size={14} /> Loja
            </button>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500">Total da rede em {anoAtivo}</p>
              <p className="text-xl font-bold text-gray-800">{fmt(totalRedeAno)}</p>
            </div>
            {[1, 2].map(anosAtras => {
              const anoComp = anoAtivo ? anoAtivo - anosAtras : null
              const anterior = anoComp ? registros.filter(r => r.ano === anoComp) : []
              const totalAnterior = anterior.reduce((s, r) => s + totalRegistro(r), 0)
              const variacao = totalAnterior > 0 ? (totalRedeAno - totalAnterior) / totalAnterior : null
              return (
                <div key={anosAtras} className={`border rounded-xl p-4 ${variacao === null ? 'bg-gray-50 border-gray-200' : variacao >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                  <div className="flex items-center gap-1.5">
                    {variacao !== null && (variacao >= 0 ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-red-600" />)}
                    <p className={`text-xs font-medium ${variacao === null ? 'text-gray-500' : variacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>vs {anoComp ?? ''}</p>
                  </div>
                  <p className={`text-xl font-bold ${variacao === null ? 'text-gray-400' : variacao >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {variacao === null ? 'Sem dados' : `${variacao >= 0 ? '+' : ''}${(variacao * 100).toFixed(1)}%`}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Cards (mobile) */}
          <div className="sm:hidden space-y-3">
            {lojasDoAno.map(loja => {
              const r = registroDe(loja.id, anoAtivo!)!
              const total = totalRegistro(r)
              return (
                <div key={loja.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-gray-800">{loja.nome}</p>
                    <button onClick={() => deletarLoja(loja.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    {editandoGerente === loja.id ? (
                      <input autoFocus className="input text-xs py-1 px-2 w-32" value={gerenteBuffer}
                        onChange={e => setGerenteBuffer(e.target.value)}
                        onBlur={() => salvarGerente(loja.id, anoAtivo!)}
                        onKeyDown={e => e.key === 'Enter' && salvarGerente(loja.id, anoAtivo!)} />
                    ) : (
                      <button onClick={() => { setEditandoGerente(loja.id); setGerenteBuffer(r.gerente ?? '') }}
                        className="text-xs text-gray-500 hover:text-brand-600 transition-colors">{r.gerente ?? 'Definir gerente'}</button>
                    )}
                    <p className="text-sm font-semibold text-emerald-700">{fmt(total)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MESES.map(m => {
                      const key = `${loja.id}-${m.key}`
                      const valor = r[m.key] as number
                      const variacao1 = mostrarVariacao ? variacaoMes(loja.id, anoAtivo!, m.key, 1) : null
                      const variacao2 = mostrarVariacao ? variacaoMes(loja.id, anoAtivo!, m.key, 2) : null
                      return (
                        <div key={m.key}>
                          <label className="text-[11px] text-gray-400">{m.label}</label>
                          <input type="text" inputMode="decimal"
                            className="no-spin w-full text-right border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400"
                            value={editBuffer[key] ?? (valor ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                            onChange={e => setEditBuffer(b => ({ ...b, [key]: e.target.value }))}
                            onBlur={e => {
                              atualizarMes(loja.id, anoAtivo!, m.key, e.target.value)
                              setEditBuffer(b => { const n = { ...b }; delete n[key]; return n })
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          {variacao1 !== null && (
                            <p className={`text-[10px] text-right mt-0.5 font-medium ${variacao1 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {variacao1 >= 0 ? '+' : ''}{(variacao1 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 1}</span>
                            </p>
                          )}
                          {variacao2 !== null && (
                            <p className={`text-[10px] text-right mt-0.5 font-medium ${variacao2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {variacao2 >= 0 ? '+' : ''}{(variacao2 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 2}</span>
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {lojasDoAno.length === 0 && (
              <p className="p-8 text-center text-gray-400 text-sm">Nenhuma loja cadastrada para este ano.</p>
            )}
          </div>

          {/* Tabela (desktop) */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left p-3 sticky left-0 bg-gray-50 z-10 min-w-[130px]">Loja</th>
                  <th className="text-left p-3">Gerente</th>
                  {MESES.map(m => <th key={m.key} className="text-right p-3 min-w-[110px]">{m.label}</th>)}
                  <th className="text-right p-3 border-l-2 border-gray-300 bg-emerald-100 text-emerald-800 font-semibold">Total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {lojasDoAno.map(loja => {
                  const r = registroDe(loja.id, anoAtivo!)!
                  const total = totalRegistro(r)
                  return (
                    <tr key={loja.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap min-w-[130px]">{loja.nome}</td>
                      <td className="p-2 text-gray-500 whitespace-nowrap">
                        {editandoGerente === loja.id ? (
                          <input autoFocus className="input text-xs py-1 px-2 w-28" value={gerenteBuffer}
                            onChange={e => setGerenteBuffer(e.target.value)}
                            onBlur={() => salvarGerente(loja.id, anoAtivo!)}
                            onKeyDown={e => e.key === 'Enter' && salvarGerente(loja.id, anoAtivo!)} />
                        ) : (
                          <button onClick={() => { setEditandoGerente(loja.id); setGerenteBuffer(r.gerente ?? '') }}
                            className="hover:text-brand-600 transition-colors">{r.gerente ?? '—'}</button>
                        )}
                      </td>
                      {MESES.map(m => {
                        const key = `${loja.id}-${m.key}`
                        const valor = r[m.key] as number
                        const variacao1 = mostrarVariacao ? variacaoMes(loja.id, anoAtivo!, m.key, 1) : null
                        const variacao2 = mostrarVariacao ? variacaoMes(loja.id, anoAtivo!, m.key, 2) : null
                        return (
                          <td key={m.key} className="p-1.5">
                            <input type="text" inputMode="decimal"
                              className="no-spin w-full text-right border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand-400"
                              value={editBuffer[key] ?? (valor ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                              onChange={e => setEditBuffer(b => ({ ...b, [key]: e.target.value }))}
                              onBlur={e => {
                                atualizarMes(loja.id, anoAtivo!, m.key, e.target.value)
                                setEditBuffer(b => { const n = { ...b }; delete n[key]; return n })
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                            {variacao1 !== null && (
                              <p className={`text-[10px] text-right mt-0.5 font-medium ${variacao1 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {variacao1 >= 0 ? '+' : ''}{(variacao1 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 1}</span>
                              </p>
                            )}
                            {variacao2 !== null && (
                              <p className={`text-[10px] text-right mt-0.5 font-medium ${variacao2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {variacao2 >= 0 ? '+' : ''}{(variacao2 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 2}</span>
                              </p>
                            )}
                          </td>
                        )
                      })}
                      <td className="p-3 text-right font-semibold text-gray-800 border-l-2 border-gray-300 bg-emerald-50 whitespace-nowrap">{fmt(total)}</td>
                      <td className="p-3">
                        <button onClick={() => deletarLoja(loja.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
                {lojasDoAno.length === 0 && (
                  <tr><td colSpan={16} className="p-8 text-center text-gray-400 text-sm">Nenhuma loja cadastrada para este ano.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                  <td className="p-3 sticky left-0 bg-gray-50">TOTAL REDE</td>
                  <td className="p-3"></td>
                  {MESES.map(m => {
                    const total = totalPorMes(m.key)
                    const total1 = anoAtivo ? lojasDoAno.reduce((s, l) => s + ((registroDe(l.id, anoAtivo - 1)?.[m.key] as number) ?? 0), 0) : 0
                    const total2 = anoAtivo ? lojasDoAno.reduce((s, l) => s + ((registroDe(l.id, anoAtivo - 2)?.[m.key] as number) ?? 0), 0) : 0
                    const var1 = total1 > 0 ? (total - total1) / total1 : null
                    const var2 = total2 > 0 ? (total - total2) / total2 : null
                    return (
                      <td key={m.key} className="p-3 text-right whitespace-nowrap">
                        <span>{fmt(total)}</span>
                        {mostrarVariacao && var1 !== null && (
                          <p className={`text-[10px] font-medium mt-0.5 ${var1 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {var1 >= 0 ? '+' : ''}{(var1 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 1}</span>
                          </p>
                        )}
                        {mostrarVariacao && var2 !== null && (
                          <p className={`text-[10px] font-medium mt-0.5 ${var2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {var2 >= 0 ? '+' : ''}{(var2 * 100).toFixed(1)}% <span className="text-gray-400 font-normal">vs {anoAtivo! - 2}</span>
                          </p>
                        )}
                      </td>
                    )
                  })}
                  <td className="p-3 text-right border-l-2 border-gray-300 bg-emerald-100 whitespace-nowrap">{fmt(totalRedeAno)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : view === 'anual' ? (
        /* VISÃO ANUAL: loja x ano (totais) */
        <>
        <p className="text-xs text-gray-400 mb-1.5 sm:hidden">← Arraste a tabela para o lado para ver mais →</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="text-left p-3 sticky left-0 bg-gray-50 min-w-[130px]">Loja</th>
                {anos.slice().sort((a, b) => a - b).map(a => <th key={a} className="text-right p-3">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {lojas.map(loja => (
                <tr key={loja.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap min-w-[130px]">{loja.nome}</td>
                  {anos.slice().sort((a, b) => a - b).map(a => {
                    const r = registroDe(loja.id, a)
                    return (
                      <td key={a} className="p-3 text-right text-gray-700 whitespace-nowrap">
                        {r ? fmtCompacto(totalRegistro(r)) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                <td className="p-3 sticky left-0 bg-gray-50">TOTAL REDE</td>
                {anos.slice().sort((a, b) => a - b).map(a => {
                  const total = lojas.reduce((s, l) => { const r = registroDe(l.id, a); return s + (r ? totalRegistro(r) : 0) }, 0)
                  return <td key={a} className="p-3 text-right whitespace-nowrap">{fmtCompacto(total)}</td>
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      ) : (
        /* VISÃO GRÁFICO */
        <>
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {anos.map(a => (
              <button key={a} onClick={() => setAnoAtivo(a)}
                className={`text-sm py-1.5 px-3.5 rounded-lg border font-medium transition-colors ${a === anoAtivo ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {a}
              </button>
            ))}
          </div>

          <div className="card p-4 sm:p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Total da rede por mês — {anoAtivo}{anoAtivo ? ` x ${anoAtivo - 1}` : ''}</h3>
            <BarChart
              labels={MESES.map(m => m.label)}
              series={[
                ...(anos.includes((anoAtivo ?? 0) - 1) ? [{
                  name: String((anoAtivo ?? 0) - 1), color: '#d1d5db',
                  values: MESES.map(m => lojas.reduce((s, l) => { const r = registroDe(l.id, (anoAtivo ?? 0) - 1); return s + ((r?.[m.key] as number) ?? 0) }, 0)),
                }] : []),
                { name: String(anoAtivo ?? ''), color: '#3b82f6', values: MESES.map(m => totalPorMes(m.key)) },
              ]}
              formatValue={v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })}
            />
          </div>

          <div className="card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Total do ano por loja — {anoAtivo}</h3>
            <BarChart
              labels={lojasDoAno.map(l => l.nome)}
              series={[{ name: String(anoAtivo ?? ''), color: '#10b981', values: lojasDoAno.map(l => totalRegistro(registroDe(l.id, anoAtivo!)!)) }]}
              formatValue={v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })}
            />
          </div>
        </>
      )}

      {showNovaLoja && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNovaLoja(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Nova loja</h3>
              <button onClick={() => setShowNovaLoja(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <input className="input" placeholder="Nome da loja *" value={novaLojaNome} onChange={e => setNovaLojaNome(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && criarLoja()} />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNovaLoja(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
              <button onClick={criarLoja} disabled={saving || !novaLojaNome.trim()} className="btn-primary flex-1 text-sm">Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {showNovoAno && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNovoAno(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Novo ano de vendas</h3>
              <button onClick={() => setShowNovoAno(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ano</label>
              <input className="input" type="number" value={novoAno} onChange={e => setNovoAno(Number(e.target.value))} />
            </div>
            {lojas.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={copiarLojasDe} onChange={e => setCopiarLojasDe(e.target.checked)} className="accent-brand-600" />
                Copiar lista de lojas já cadastradas
              </label>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNovoAno(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
              <button onClick={criarAno} disabled={saving || !novoAno || anos.includes(novoAno)} className="btn-primary flex-1 text-sm">
                {anos.includes(novoAno) ? 'Ano já existe' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

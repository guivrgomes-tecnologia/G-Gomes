import { useEffect, useState } from 'react'
import { Plus, X, Trash2, ChevronLeft, TrendingUp, TrendingDown, Pencil, Check, Lock, Unlock, List, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import BarChart from '../components/BarChart'

type MetaMes = { id: string; mes: string; titulo: string; observacoes: string | null; criado_por: string; created_at: string }
type MetaSemana = { id: string; mes_id: string; label: string; ordem: number }
type MetaLoja = { id: string; mes_id: string; nome: string; gerente: string | null; meta_mes: number; ordem: number }
type MetaValor = { id: string; loja_id: string; semana_id: string; meta: number; realizado: number | null; confirmado: boolean }

const LOJAS_PADRAO = [
  { nome: 'Tres Rios (Loja 02)', gerente: 'Hygor' },
  { nome: 'Aterrado 56 (Loja 03)', gerente: 'Anderson' },
  { nome: 'Retiro (Loja 04)', gerente: 'Wagner' },
  { nome: 'Amaral Peixoto (Loja 05)', gerente: 'Alessandra' },
  { nome: 'Vila (Loja 06)', gerente: 'Mary' },
  { nome: 'Aterrado 968 (Loja 07)', gerente: 'Lucas' },
]

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

function corPct(pct: number) {
  if (pct >= 1) return 'text-green-600 bg-green-50'
  if (pct >= 0.8) return 'text-yellow-700 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

const MESES_LABEL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function Metas() {
  const { user } = useAuth()
  const [meses, setMeses] = useState<MetaMes[]>([])
  const [mesAtivo, setMesAtivo] = useState<MetaMes | null>(null)
  const [semanas, setSemanas] = useState<MetaSemana[]>([])
  const [lojas, setLojas] = useState<MetaLoja[]>([])
  const [valores, setValores] = useState<MetaValor[]>([])
  const [showNovoMes, setShowNovoMes] = useState(false)
  const hoje = new Date()
  const [novoMesForm, setNovoMesForm] = useState({ mesNum: hoje.getMonth() + 1, ano: hoje.getFullYear(), titulo: '' })
  const [showNovaLoja, setShowNovaLoja] = useState(false)
  const [novaLojaForm, setNovaLojaForm] = useState({ nome: '', gerente: '', meta_mes: '' })
  const [editandoLoja, setEditandoLoja] = useState<MetaLoja | null>(null)
  const [saving, setSaving] = useState(false)
  const [linhasDestrancadas, setLinhasDestrancadas] = useState<Record<string, boolean>>({})
  const [semanaSelecionada, setSemanaSelecionada] = useState<string | null>(null)
  const [modoVisao, setModoVisao] = useState<'tabela' | 'grafico'>('tabela')
  const [renomeandoSemana, setRenomeandoSemana] = useState<string | null>(null)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})

  useEffect(() => { loadMeses() }, [])
  useEffect(() => { if (mesAtivo) loadMesDetalhe(mesAtivo.id) }, [mesAtivo?.id])
  useEffect(() => {
    if (semanas.length === 0) { setSemanaSelecionada(null); return }
    if (semanaSelecionada && semanas.some(s => s.id === semanaSelecionada)) return
    const primeiraAberta = semanas.find(s => valores.some(v => v.semana_id === s.id && !v.confirmado))
    setSemanaSelecionada((primeiraAberta ?? semanas[semanas.length - 1]).id)
  }, [semanas])

  async function loadMeses() {
    const { data } = await supabase.from('metas_meses').select('*').order('mes', { ascending: false })
    setMeses(data ?? [])
  }

  async function loadMesDetalhe(mesId: string) {
    const [{ data: sem }, { data: loj }, { data: val }] = await Promise.all([
      supabase.from('metas_semanas').select('*').eq('mes_id', mesId).order('ordem'),
      supabase.from('metas_lojas').select('*').eq('mes_id', mesId).order('ordem'),
      supabase.from('metas_valores').select('*, loja:metas_lojas!inner(mes_id)').eq('loja.mes_id', mesId),
    ])
    setSemanas(sem ?? [])
    setLojas(loj ?? [])
    setValores((val ?? []) as any)
  }

  async function criarMes() {
    if (!novoMesForm.titulo.trim()) return
    const mes = `${novoMesForm.ano}-${String(novoMesForm.mesNum).padStart(2, '0')}`
    setSaving(true)
    const { data } = await supabase.from('metas_meses').insert({
      mes, titulo: novoMesForm.titulo.trim(), criado_por: user!.id,
    }).select().single()
    if (data) {
      const { data: sem } = await supabase.from('metas_semanas')
        .insert([1, 2, 3, 4, 5].map(n => ({ mes_id: data.id, label: `S${n}`, ordem: n }))).select()
      const { data: loj } = await supabase.from('metas_lojas')
        .insert(LOJAS_PADRAO.map((l, i) => ({ mes_id: data.id, nome: l.nome, gerente: l.gerente, meta_mes: 0, ordem: i }))).select()
      if (sem && loj) {
        await supabase.from('metas_valores').insert(
          loj.flatMap(l => sem.map(s => ({ loja_id: l.id, semana_id: s.id, meta: 0, realizado: null })))
        )
      }
    }
    setNovoMesForm({ mesNum: hoje.getMonth() + 1, ano: hoje.getFullYear(), titulo: '' }); setShowNovoMes(false)
    await loadMeses()
    if (data) setMesAtivo(data)
    setSaving(false)
  }

  async function deletarMes(id: string) {
    if (!confirm('Apagar este mês e todos os dados de metas dele?')) return
    await supabase.from('metas_meses').delete().eq('id', id)
    setMesAtivo(null)
    loadMeses()
  }

  async function criarLoja() {
    if (!mesAtivo || !novaLojaForm.nome.trim()) return
    setSaving(true)
    const { data } = await supabase.from('metas_lojas').insert({
      mes_id: mesAtivo.id, nome: novaLojaForm.nome.trim(), gerente: novaLojaForm.gerente.trim() || null,
      meta_mes: parseFloat(novaLojaForm.meta_mes || '0'), ordem: lojas.length,
    }).select().single()
    if (data) {
      await supabase.from('metas_valores').insert(semanas.map(s => ({ loja_id: data.id, semana_id: s.id, meta: 0, realizado: null })))
    }
    setNovaLojaForm({ nome: '', gerente: '', meta_mes: '' }); setShowNovaLoja(false)
    await loadMesDetalhe(mesAtivo.id)
    setSaving(false)
  }

  async function salvarEdicaoLoja() {
    if (!editandoLoja || !mesAtivo) return
    setSaving(true)
    await supabase.from('metas_lojas').update({
      nome: editandoLoja.nome, gerente: editandoLoja.gerente, meta_mes: editandoLoja.meta_mes,
    }).eq('id', editandoLoja.id)
    setEditandoLoja(null)
    await loadMesDetalhe(mesAtivo.id)
    setSaving(false)
  }

  async function deletarLoja(id: string) {
    if (!confirm('Remover esta loja do mês?')) return
    await supabase.from('metas_lojas').delete().eq('id', id)
    if (mesAtivo) loadMesDetalhe(mesAtivo.id)
  }

  function valorDe(lojaId: string, semanaId: string): MetaValor | undefined {
    return valores.find(v => v.loja_id === lojaId && v.semana_id === semanaId)
  }

  function parseValorBR(valor: string): number | null {
    const limpo = valor.trim()
    if (limpo === '') return null
    const normalizado = limpo.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(normalizado)
    return isNaN(num) ? null : num
  }

  async function atualizarValor(lojaId: string, semanaId: string, campo: 'meta' | 'realizado', valor: string) {
    const num = parseValorBR(valor)
    const existente = valorDe(lojaId, semanaId)
    if (existente) {
      await supabase.from('metas_valores').update({ [campo]: campo === 'meta' ? (num ?? 0) : num }).eq('id', existente.id)
    } else {
      await supabase.from('metas_valores').insert({ loja_id: lojaId, semana_id: semanaId, meta: campo === 'meta' ? (num ?? 0) : 0, realizado: campo === 'realizado' ? num : null })
    }
    if (mesAtivo) loadMesDetalhe(mesAtivo.id)
  }

  async function confirmarValor(lojaId: string, semanaId: string) {
    const existente = valorDe(lojaId, semanaId)
    if (!existente) return
    await supabase.from('metas_valores').update({ confirmado: true }).eq('id', existente.id)
    if (mesAtivo) loadMesDetalhe(mesAtivo.id)
  }

  function toggleDestrancar(lojaId: string) {
    setLinhasDestrancadas(prev => ({ ...prev, [lojaId]: !prev[lojaId] }))
  }

  async function renomearSemana(semanaId: string, label: string) {
    await supabase.from('metas_semanas').update({ label }).eq('id', semanaId)
    if (mesAtivo) loadMesDetalhe(mesAtivo.id)
  }

  async function adicionarSemana() {
    if (!mesAtivo) return
    const ordem = semanas.length + 1
    const { data } = await supabase.from('metas_semanas').insert({ mes_id: mesAtivo.id, label: `S${ordem}`, ordem }).select().single()
    if (data) {
      await supabase.from('metas_valores').insert(lojas.map(l => ({ loja_id: l.id, semana_id: data.id, meta: 0, realizado: null })))
    }
    loadMesDetalhe(mesAtivo.id)
  }

  async function removerSemana(semanaId: string) {
    if (!confirm('Remover esta semana de todas as lojas?')) return
    await supabase.from('metas_semanas').delete().eq('id', semanaId)
    if (mesAtivo) loadMesDetalhe(mesAtivo.id)
  }

  // ===== Cálculos =====
  function totalRealLoja(lojaId: string) {
    return semanas.reduce((s, sem) => s + (valorDe(lojaId, sem.id)?.realizado ?? 0), 0)
  }
  const totalRedeMeta = lojas.reduce((s, l) => s + l.meta_mes, 0)
  const totalRedeReal = lojas.reduce((s, l) => s + totalRealLoja(l.id), 0)
  const pctRede = totalRedeMeta > 0 ? totalRedeReal / totalRedeMeta : 0

  function totalMetaSemana(semanaId: string) {
    return lojas.reduce((s, l) => s + (valorDe(l.id, semanaId)?.meta ?? 0), 0)
  }
  function totalRealizadoSemana(semanaId: string) {
    return lojas.reduce((s, l) => s + (valorDe(l.id, semanaId)?.realizado ?? 0), 0)
  }

  if (!mesAtivo) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Metas de Vendas</h1>
          <button onClick={() => setShowNovoMes(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo mês
          </button>
        </div>

        {meses.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
            <p>Nenhum mês de metas cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {meses.map(m => (
              <button key={m.id} onClick={() => setMesAtivo(m)}
                className="card p-5 text-left hover:shadow-md transition-shadow">
                <p className="font-semibold text-gray-900">{m.titulo}</p>
                <p className="text-xs text-gray-400 mt-1 capitalize">
                  {new Date(m.mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </p>
              </button>
            ))}
          </div>
        )}

        {showNovoMes && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNovoMes(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Novo mês de metas</h3>
                <button onClick={() => setShowNovoMes(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Título</label>
                <input className="input" placeholder="Ex: Acompanhamento de Vendas — Julho 2026"
                  value={novoMesForm.titulo} onChange={e => setNovoMesForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mês de referência</label>
                <div className="flex gap-2">
                  <select className="input flex-1" value={novoMesForm.mesNum} onChange={e => setNovoMesForm(f => ({ ...f, mesNum: Number(e.target.value) }))}>
                    {MESES_LABEL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <input className="input w-24" type="number" value={novoMesForm.ano} onChange={e => setNovoMesForm(f => ({ ...f, ano: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNovoMes(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={criarMes} disabled={saving || !novoMesForm.titulo.trim()} className="btn-primary flex-1 text-sm">Criar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMesAtivo(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} /> Voltar
        </button>
        <button onClick={() => deletarMes(mesAtivo.id)} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
          Apagar mês
        </button>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{mesAtivo.titulo}</h1>
      <p className="text-sm text-gray-400 mb-6 capitalize">
        {new Date(mesAtivo.mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </p>

      {/* Resumo da rede */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500">Meta da rede</p>
          <p className="text-xl font-bold text-gray-800">{fmt(totalRedeMeta)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-600">Total realizado</p>
          <p className="text-xl font-bold text-blue-700">{fmt(totalRedeReal)}</p>
        </div>
        <div className={`border rounded-xl p-4 ${pctRede >= 1 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
          <div className="flex items-center gap-1.5">
            {pctRede >= 1 ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-orange-600" />}
            <p className={`text-xs font-medium ${pctRede >= 1 ? 'text-green-600' : 'text-orange-600'}`}>% da meta</p>
          </div>
          <p className={`text-xl font-bold ${pctRede >= 1 ? 'text-green-700' : 'text-orange-700'}`}>{fmtPct(pctRede)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          <button onClick={() => setModoVisao('tabela')} title="Tabela"
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${modoVisao === 'tabela' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            <List size={14} /> Tabela
          </button>
          <button onClick={() => setModoVisao('grafico')} title="Gráfico"
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${modoVisao === 'grafico' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            <BarChart3 size={14} /> Gráfico
          </button>
        </div>
      </div>

      {modoVisao === 'grafico' ? (
        <div className="card p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Meta do mês x Total realizado, por loja</h3>
          <BarChart
            labels={lojas.map(l => l.nome.replace(/\s*\(Loja \d+\)/i, ''))}
            series={[
              { name: 'Meta do mês', color: '#9ca3af', values: lojas.map(l => l.meta_mes) },
              { name: 'Total realizado', color: '#10b981', values: lojas.map(l => totalRealLoja(l.id)) },
            ]}
            formatValue={v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })}
          />
        </div>
      ) : (
      <>
      {/* Seletor de semana */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {semanas.map(sem => {
          const ativa = sem.id === semanaSelecionada
          const todasConfirmadas = lojas.length > 0 && lojas.every(l => valorDe(l.id, sem.id)?.confirmado)
          return (
            <div key={sem.id} className="relative group">
              {renomeandoSemana === sem.id ? (
                <input autoFocus className="input text-xs py-1.5 px-2.5 w-32"
                  value={sem.label} onChange={e => renomearSemana(sem.id, e.target.value)}
                  onBlur={() => setRenomeandoSemana(null)}
                  onKeyDown={e => e.key === 'Enter' && setRenomeandoSemana(null)} />
              ) : (
                <button onClick={() => setSemanaSelecionada(sem.id)} onDoubleClick={() => setRenomeandoSemana(sem.id)}
                  title="Clique duas vezes para renomear"
                  className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border transition-colors ${ativa ? 'bg-brand-600 border-brand-600 text-white font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                  {todasConfirmadas && <Check size={12} className={ativa ? 'text-white' : 'text-green-500'} />}
                  {sem.label}
                </button>
              )}
              {semanas.length > 1 && (
                <button onClick={() => removerSemana(sem.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <X size={10} />
                </button>
              )}
            </div>
          )
        })}
        <button onClick={adicionarSemana} className="flex items-center gap-1 text-sm py-1.5 px-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
          <Plus size={14} /> Semana
        </button>
        <button onClick={() => setShowNovaLoja(true)} className="ml-auto flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
          <Plus size={14} /> Loja
        </button>
      </div>

      {/* Cards (mobile) */}
      <div className="sm:hidden space-y-3">
        {lojas.map(loja => {
          const totalReal = totalRealLoja(loja.id)
          const pct = loja.meta_mes > 0 ? totalReal / loja.meta_mes : 0
          const falta = loja.meta_mes - totalReal
          const v = semanaSelecionada ? valorDe(loja.id, semanaSelecionada) : undefined
          const destrancada = !!linhasDestrancadas[loja.id]
          const travado = !!v?.confirmado && !destrancada
          const pctSemana = v?.meta && v.meta > 0 && v.realizado != null ? v.realizado / v.meta : null
          const podeConfirmar = !travado && v && v.realizado != null
          return (
            <div key={loja.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="font-semibold text-gray-800">{loja.nome}</p>
                  <p className="text-xs text-gray-500">{loja.gerente ?? '—'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleDestrancar(loja.id)} title={linhasDestrancadas[loja.id] ? 'Travar linha' : 'Editar valores travados'}
                    className={linhasDestrancadas[loja.id] ? 'text-orange-500 hover:text-orange-600' : 'text-gray-300 hover:text-brand-500'}>
                    {linhasDestrancadas[loja.id] ? <Unlock size={15} /> : <Lock size={15} />}
                  </button>
                  <button onClick={() => setEditandoLoja(loja)} className="text-gray-300 hover:text-brand-500"><Pencil size={15} /></button>
                  <button onClick={() => deletarLoja(loja.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={15} /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[11px] text-gray-400">Meta do mês</p>
                  <p className="text-sm font-medium text-gray-700">{fmt(loja.meta_mes)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-[11px] text-emerald-600">Total real</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(totalReal)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-[11px] text-emerald-600">% meta</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${corPct(pct)}`}>{fmtPct(pct)}</span>
                </div>
                <div className="bg-violet-50 rounded-lg p-2">
                  <p className="text-[11px] text-violet-600">Falta</p>
                  <p className={`text-sm font-semibold ${falta > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmt(falta)}</p>
                </div>
              </div>

              {semanaSelecionada && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <p className="text-[11px] text-amber-600 font-medium mb-1">Semana selecionada</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-400">Meta da semana</label>
                      {travado ? (
                        <p className="text-sm text-gray-600 border border-amber-200 bg-amber-50 rounded-lg px-2 py-1.5 text-right">{fmt(v?.meta ?? 0)}</p>
                      ) : (
                        <input type="text" inputMode="decimal" className="w-full text-right border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 bg-white"
                          value={editBuffer[`${loja.id}-${semanaSelecionada}-meta`] ?? (v?.meta ? v.meta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                          onChange={e => setEditBuffer(b => ({ ...b, [`${loja.id}-${semanaSelecionada}-meta`]: e.target.value }))}
                          onBlur={e => {
                            atualizarValor(loja.id, semanaSelecionada, 'meta', e.target.value)
                            setEditBuffer(b => { const n = { ...b }; delete n[`${loja.id}-${semanaSelecionada}-meta`]; return n })
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400">Realizado</label>
                      {travado ? (
                        <p className="text-sm text-sky-700 font-medium border border-sky-200 bg-sky-50 rounded-lg px-2 py-1.5 text-right">{v?.realizado != null ? fmt(v.realizado) : '—'}</p>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input type="text" inputMode="decimal" placeholder="—" className="w-full text-right border border-sky-200 text-sky-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white"
                            value={editBuffer[`${loja.id}-${semanaSelecionada}-realizado`] ?? (v?.realizado != null ? v.realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                            onChange={e => setEditBuffer(b => ({ ...b, [`${loja.id}-${semanaSelecionada}-realizado`]: e.target.value }))}
                            onBlur={e => {
                              atualizarValor(loja.id, semanaSelecionada, 'realizado', e.target.value)
                              setEditBuffer(b => { const n = { ...b }; delete n[`${loja.id}-${semanaSelecionada}-realizado`]; return n })
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          {podeConfirmar && (
                            <button onClick={() => confirmarValor(loja.id, semanaSelecionada)} title="Confirmar e travar"
                              className="text-green-500 hover:text-green-700 shrink-0"><Check size={18} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right mt-1">
                    <span className={`inline-block text-xs font-semibold rounded px-1.5 py-0.5 ${pctSemana !== null ? corPct(pctSemana) : 'text-gray-300'}`}>
                      {pctSemana !== null ? fmtPct(pctSemana) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tabela (desktop) */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-left p-3 sticky left-0 bg-gray-50 min-w-[130px]">Loja</th>
              <th className="text-left p-3 bg-gray-50">Gerente</th>
              <th className="text-center p-3 bg-gray-50">Meta do mês</th>
              <th className="text-center p-3 border-l-2 border-gray-300 w-28 bg-amber-100 text-amber-800 font-semibold">Meta da semana</th>
              <th className="text-center p-3 w-28 bg-sky-100 text-sky-800 font-semibold">Realizado</th>
              <th className="text-center p-3 w-16 bg-sky-100 text-sky-800 font-semibold">%</th>
              <th className="text-center p-3 border-l-2 border-gray-300 bg-emerald-100 text-emerald-800 font-semibold">Total real</th>
              <th className="text-center p-3 bg-emerald-100 text-emerald-800 font-semibold">% meta</th>
              <th className="text-center p-3 bg-violet-100 text-violet-800 font-semibold">Falta</th>
              <th className="p-3 bg-gray-50"></th>
            </tr>
          </thead>
          <tbody>
            {lojas.map(loja => {
              const totalReal = totalRealLoja(loja.id)
              const pct = loja.meta_mes > 0 ? totalReal / loja.meta_mes : 0
              const falta = loja.meta_mes - totalReal
              const v = semanaSelecionada ? valorDe(loja.id, semanaSelecionada) : undefined
              const destrancada = !!linhasDestrancadas[loja.id]
              const travado = !!v?.confirmado && !destrancada
              const pctSemana = v?.meta && v.meta > 0 && v.realizado != null ? v.realizado / v.meta : null
              const podeConfirmar = !travado && v && v.realizado != null
              return (
                <tr key={loja.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap min-w-[130px]">{loja.nome}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{loja.gerente ?? '—'}</td>
                  <td className="p-3 text-right text-gray-700">{fmt(loja.meta_mes)}</td>
                  <td className="p-2 border-l-2 border-gray-300 bg-amber-50">
                    {travado ? (
                      <p className="text-right text-gray-600">{fmt(v?.meta ?? 0)}</p>
                    ) : semanaSelecionada ? (
                      <input type="text" inputMode="decimal" className="w-full text-right border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 bg-white"
                        value={editBuffer[`${loja.id}-${semanaSelecionada}-meta`] ?? (v?.meta ? v.meta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                        onChange={e => setEditBuffer(b => ({ ...b, [`${loja.id}-${semanaSelecionada}-meta`]: e.target.value }))}
                        onBlur={e => {
                          atualizarValor(loja.id, semanaSelecionada, 'meta', e.target.value)
                          setEditBuffer(b => { const n = { ...b }; delete n[`${loja.id}-${semanaSelecionada}-meta`]; return n })
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    ) : null}
                  </td>
                  <td className="p-2 bg-sky-50">
                    {travado ? (
                      <p className="text-right text-sky-700 font-medium">{v?.realizado != null ? fmt(v.realizado) : '—'}</p>
                    ) : semanaSelecionada ? (
                      <div className="flex items-center gap-1">
                        <input type="text" inputMode="decimal" placeholder="—" className="w-full text-right border border-sky-200 text-sky-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white"
                          value={editBuffer[`${loja.id}-${semanaSelecionada}-realizado`] ?? (v?.realizado != null ? v.realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                          onChange={e => setEditBuffer(b => ({ ...b, [`${loja.id}-${semanaSelecionada}-realizado`]: e.target.value }))}
                          onBlur={e => {
                            atualizarValor(loja.id, semanaSelecionada, 'realizado', e.target.value)
                            setEditBuffer(b => { const n = { ...b }; delete n[`${loja.id}-${semanaSelecionada}-realizado`]; return n })
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                        {podeConfirmar && (
                          <button onClick={() => confirmarValor(loja.id, semanaSelecionada)} title="Confirmar e travar"
                            className="text-green-500 hover:text-green-700 shrink-0"><Check size={16} /></button>
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2 text-center bg-sky-50">
                    <span className={`inline-block text-xs font-semibold rounded px-1.5 py-0.5 ${pctSemana !== null ? corPct(pctSemana) : 'text-gray-300'}`}>
                      {pctSemana !== null ? fmtPct(pctSemana) : '—'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-semibold text-gray-800 border-l-2 border-gray-300 bg-emerald-50">{fmt(totalReal)}</td>
                  <td className="p-3 text-center bg-emerald-50">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${corPct(pct)}`}>{fmtPct(pct)}</span>
                  </td>
                  <td className={`p-3 text-right font-semibold bg-violet-50 ${falta > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmt(falta)}</td>
                  <td className="p-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => toggleDestrancar(loja.id)} title={linhasDestrancadas[loja.id] ? 'Travar linha' : 'Editar valores travados'}
                        className={linhasDestrancadas[loja.id] ? 'text-orange-500 hover:text-orange-600' : 'text-gray-300 hover:text-brand-500'}>
                        {linhasDestrancadas[loja.id] ? <Unlock size={13} /> : <Lock size={13} />}
                      </button>
                      <button onClick={() => setEditandoLoja(loja)} className="text-gray-300 hover:text-brand-500"><Pencil size={13} /></button>
                      <button onClick={() => deletarLoja(loja.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
              <td className="p-3 sticky left-0 bg-gray-50">TOTAL REDE</td>
              <td className="p-3"></td>
              <td className="p-3 text-right">{fmt(totalRedeMeta)}</td>
              <td className="p-3 text-right border-l-2 border-gray-300 bg-amber-100">{semanaSelecionada ? fmt(totalMetaSemana(semanaSelecionada)) : '—'}</td>
              <td className="p-3 text-right text-sky-700 bg-sky-100">{semanaSelecionada ? fmt(totalRealizadoSemana(semanaSelecionada)) : '—'}</td>
              <td className="bg-sky-100"></td>
              <td className="p-3 text-right border-l-2 border-gray-300 bg-emerald-100">{fmt(totalRedeReal)}</td>
              <td className="p-3 text-center bg-emerald-100">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${corPct(pctRede)}`}>{fmtPct(pctRede)}</span>
              </td>
              <td className="p-3 text-right bg-violet-100">{fmt(totalRedeMeta - totalRedeReal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">Editando: <span className="font-medium text-gray-600">{semanas.find(s => s.id === semanaSelecionada)?.label}</span>. Selecione outra semana acima para editá-la.</p>
      </>
      )}

      {showNovaLoja && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNovaLoja(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Nova loja</h3>
              <button onClick={() => setShowNovaLoja(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <input className="input" placeholder="Nome da loja *" value={novaLojaForm.nome} onChange={e => setNovaLojaForm(f => ({ ...f, nome: e.target.value }))} autoFocus />
            <input className="input" placeholder="Gerente" value={novaLojaForm.gerente} onChange={e => setNovaLojaForm(f => ({ ...f, gerente: e.target.value }))} />
            <input className="input" type="number" placeholder="Meta do mês (R$)" value={novaLojaForm.meta_mes} onChange={e => setNovaLojaForm(f => ({ ...f, meta_mes: e.target.value }))} />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNovaLoja(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
              <button onClick={criarLoja} disabled={saving || !novaLojaForm.nome.trim()} className="btn-primary flex-1 text-sm">Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {editandoLoja && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditandoLoja(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Editar loja</h3>
              <button onClick={() => setEditandoLoja(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <input className="input" placeholder="Nome da loja" value={editandoLoja.nome} onChange={e => setEditandoLoja(l => l && ({ ...l, nome: e.target.value }))} autoFocus />
            <input className="input" placeholder="Gerente" value={editandoLoja.gerente ?? ''} onChange={e => setEditandoLoja(l => l && ({ ...l, gerente: e.target.value }))} />
            <input className="input" type="number" placeholder="Meta do mês (R$)" value={editandoLoja.meta_mes} onChange={e => setEditandoLoja(l => l && ({ ...l, meta_mes: parseFloat(e.target.value) || 0 }))} />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditandoLoja(null)} className="btn-secondary flex-1 text-sm">Cancelar</button>
              <button onClick={salvarEdicaoLoja} disabled={saving} className="btn-primary flex-1 text-sm">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

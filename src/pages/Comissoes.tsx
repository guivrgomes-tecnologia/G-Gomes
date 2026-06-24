import { useEffect, useState } from 'react'
import { Settings, X, Trash2, Plus, Send, DollarSign } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type VendaLoja = { id: string; nome: string; ordem: number }
type VendaRegistro = {
  id: string; loja_id: string; ano: number; gerente: string | null
  jan: number; fev: number; mar: number; abr: number; mai: number; jun: number
  jul: number; ago: number; set: number; out: number; nov: number; dez: number
}
type ComissaoConfig = { id: string; gerente: string; percentual: number }

const MESES: { key: keyof VendaRegistro; label: string }[] = [
  { key: 'jan', label: 'Jan' }, { key: 'fev', label: 'Fev' }, { key: 'mar', label: 'Mar' },
  { key: 'abr', label: 'Abr' }, { key: 'mai', label: 'Mai' }, { key: 'jun', label: 'Jun' },
  { key: 'jul', label: 'Jul' }, { key: 'ago', label: 'Ago' }, { key: 'set', label: 'Set' },
  { key: 'out', label: 'Out' }, { key: 'nov', label: 'Nov' }, { key: 'dez', label: 'Dez' },
]

const fmt = (v: number) => Math.ceil(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

export default function Comissoes() {
  const { user } = useAuth()
  const [lojas, setLojas] = useState<VendaLoja[]>([])
  const [registros, setRegistros] = useState<VendaRegistro[]>([])
  const [configs, setConfigs] = useState<ComissaoConfig[]>([])
  const [anos, setAnos] = useState<number[]>([])
  const [anoAtivo, setAnoAtivo] = useState<number | null>(null)
  const [mesEnvio, setMesEnvio] = useState<keyof VendaRegistro>('jan')
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [novoGerente, setNovoGerente] = useState('')
  const [novoPercentual, setNovoPercentual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadTudo() }, [])

  async function loadTudo() {
    setLoading(true)
    const [{ data: loj }, { data: reg }, { data: conf }] = await Promise.all([
      supabase.from('vendas_lojas').select('*').order('ordem'),
      supabase.from('vendas').select('*').order('ano', { ascending: false }),
      supabase.from('comissoes_config').select('*').order('gerente'),
    ])
    setLojas(loj ?? [])
    setRegistros((reg ?? []) as VendaRegistro[])
    setConfigs(conf ?? [])
    const anosDisponiveis = Array.from(new Set((reg ?? []).map((r: any) => r.ano))).sort((a, b) => b - a)
    setAnos(anosDisponiveis)
    setAnoAtivo(prev => prev && anosDisponiveis.includes(prev) ? prev : (anosDisponiveis[0] ?? null))
    const mesAtual = new Date().getMonth()
    setMesEnvio(MESES[mesAtual].key)
    setLoading(false)
  }

  function registroDe(lojaId: string, ano: number): VendaRegistro | undefined {
    return registros.find(r => r.loja_id === lojaId && r.ano === ano)
  }

  function percentualDe(gerente: string | null): number {
    if (!gerente) return 0
    const c = configs.find(c => c.gerente.trim().toLowerCase() === gerente.trim().toLowerCase())
    return c?.percentual ?? 0
  }

  function comissaoMes(lojaId: string, ano: number, mes: keyof VendaRegistro): number {
    const r = registroDe(lojaId, ano)
    if (!r) return 0
    const valor = r[mes] as number
    return valor * (percentualDe(r.gerente) / 100)
  }

  async function adicionarConfig() {
    if (!novoGerente.trim() || !novoPercentual) return
    setSaving(true)
    await supabase.from('comissoes_config').insert({
      gerente: novoGerente.trim(), percentual: parseValorBR(novoPercentual), criado_por: user!.id,
    })
    setNovoGerente(''); setNovoPercentual('')
    await loadTudo()
    setSaving(false)
  }

  async function atualizarPercentual(id: string, valorStr: string) {
    await supabase.from('comissoes_config').update({ percentual: parseValorBR(valorStr) }).eq('id', id)
    await loadTudo()
  }

  async function removerConfig(id: string) {
    if (!confirm('Remover esta configuração de comissão?')) return
    await supabase.from('comissoes_config').delete().eq('id', id)
    await loadTudo()
  }

  if (loading) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  const lojasDoAno = anoAtivo ? lojas.filter(l => registroDe(l.id, anoAtivo)) : []
  const totalComissaoMes = (mes: keyof VendaRegistro) => anoAtivo ? lojasDoAno.reduce((s, l) => s + comissaoMes(l.id, anoAtivo, mes), 0) : 0
  const totalComissaoAno = anoAtivo ? lojasDoAno.reduce((s, l) => s + MESES.reduce((ss, m) => ss + comissaoMes(l.id, anoAtivo, m.key), 0), 0) : 0

  function enviarParaFinanceiro() {
    if (!anoAtivo) return
    const mesNomeCompleto = new Date(anoAtivo, MESES.findIndex(m => m.key === mesEnvio), 1)
      .toLocaleDateString('pt-BR', { month: 'long' })
    const linhas = lojasDoAno
      .map(l => {
        const r = registroDe(l.id, anoAtivo)!
        const valor = comissaoMes(l.id, anoAtivo, mesEnvio)
        return `* ${l.nome}${r.gerente ? ` (${r.gerente})` : ''}: ${fmt(valor)}`
      })
      .join('\n')
    const msg = `Comissões do mês de ${mesNomeCompleto} abaixo:\n\n${linhas}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comissões</h1>
          <p className="text-sm text-gray-400">Cálculo automático de comissões com base no histórico de vendas</p>
        </div>
        <button onClick={() => setShowConfig(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Settings size={15} /> Configurações
        </button>
      </div>

      {anos.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <DollarSign size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum histórico de vendas cadastrado ainda.</p>
        </div>
      ) : (
        <>
          {/* Seletor de ano + envio */}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {anos.map(a => (
              <button key={a} onClick={() => setAnoAtivo(a)}
                className={`text-sm py-1.5 px-3.5 rounded-lg border font-medium transition-colors ${a === anoAtivo ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {a}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <select className="input text-sm py-1.5" value={mesEnvio} onChange={e => setMesEnvio(e.target.value as keyof VendaRegistro)}>
                {MESES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <button onClick={enviarParaFinanceiro} className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap">
                <Send size={14} /> Enviar para o financeiro
              </button>
            </div>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500">Total de comissões em {anoAtivo}</p>
              <p className="text-xl font-bold text-gray-800">{fmt(totalComissaoAno)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs font-medium text-emerald-600">Comissões em {MESES.find(m => m.key === mesEnvio)?.label}</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(totalComissaoMes(mesEnvio))}</p>
            </div>
          </div>

          {/* Cards (mobile) */}
          <div className="sm:hidden space-y-3">
            {lojasDoAno.map(loja => {
              const r = registroDe(loja.id, anoAtivo!)!
              const percentual = percentualDe(r.gerente)
              const totalLoja = MESES.reduce((s, m) => s + comissaoMes(loja.id, anoAtivo!, m.key), 0)
              return (
                <div key={loja.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-gray-800">{loja.nome}</p>
                    <p className="text-sm font-semibold text-emerald-700">{fmt(totalLoja)}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>{r.gerente ?? '—'}</span>
                    <span className={percentual === 0 ? 'text-gray-300' : 'text-gray-600'}>{percentual ? `${percentual}%` : '—'}</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 mb-2 flex items-center justify-between">
                    <span className="text-xs text-emerald-600 font-medium">{MESES.find(m => m.key === mesEnvio)?.label}</span>
                    <span className="text-sm font-bold text-emerald-700">{fmt(comissaoMes(loja.id, anoAtivo!, mesEnvio))}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MESES.map(m => (
                      <div key={m.key} className="text-center">
                        <p className="text-[11px] text-gray-400">{m.label}</p>
                        <p className="text-xs text-gray-700 font-medium">{fmt(comissaoMes(loja.id, anoAtivo!, m.key))}</p>
                      </div>
                    ))}
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
                  <th className="text-right p-3">%</th>
                  {MESES.map(m => <th key={m.key} className="text-right p-3 min-w-[100px]">{m.label}</th>)}
                  <th className="text-right p-3 border-l-2 border-gray-300 bg-emerald-100 text-emerald-800 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lojasDoAno.map(loja => {
                  const r = registroDe(loja.id, anoAtivo!)!
                  const percentual = percentualDe(r.gerente)
                  const totalLoja = MESES.reduce((s, m) => s + comissaoMes(loja.id, anoAtivo!, m.key), 0)
                  return (
                    <tr key={loja.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap min-w-[130px]">{loja.nome}</td>
                      <td className="p-2 text-gray-500 whitespace-nowrap">{r.gerente ?? '—'}</td>
                      <td className={`p-2 text-right whitespace-nowrap ${percentual === 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                        {percentual ? `${percentual}%` : '—'}
                      </td>
                      {MESES.map(m => (
                        <td key={m.key} className="p-2 text-right text-gray-700 whitespace-nowrap">
                          {fmt(comissaoMes(loja.id, anoAtivo!, m.key))}
                        </td>
                      ))}
                      <td className="p-3 text-right font-semibold text-gray-800 border-l-2 border-gray-300 bg-emerald-50 whitespace-nowrap">{fmt(totalLoja)}</td>
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
                  <td className="p-3"></td>
                  {MESES.map(m => <td key={m.key} className="p-3 text-right whitespace-nowrap">{fmt(totalComissaoMes(m.key))}</td>)}
                  <td className="p-3 text-right border-l-2 border-gray-300 bg-emerald-100 whitespace-nowrap">{fmt(totalComissaoAno)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Modal configurações */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowConfig(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Settings size={17} /> Configurações de comissão</h3>
              <button onClick={() => setShowConfig(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400">Defina a porcentagem de comissão de cada gerente. O nome precisa ser igual ao cadastrado no Histórico de vendas.</p>

            <div className="space-y-2">
              {configs.length === 0 && <p className="text-sm text-gray-400 py-2">Nenhuma configuração ainda.</p>}
              {configs.map(c => (
                <div key={c.id} className="flex items-center gap-2 p-2 border border-gray-100 rounded-lg bg-gray-50/60">
                  <span className="flex-1 text-sm text-gray-800 truncate">{c.gerente}</span>
                  <input type="text" inputMode="decimal" defaultValue={String(c.percentual).replace('.', ',')}
                    className="no-spin w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand-400"
                    onBlur={e => atualizarPercentual(c.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                  <span className="text-xs text-gray-400">%</span>
                  <button onClick={() => removerConfig(c.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <input className="input text-sm flex-1" placeholder="Nome do gerente" value={novoGerente}
                onChange={e => setNovoGerente(e.target.value)} />
              <input type="text" inputMode="decimal" className="no-spin input text-sm w-20 text-right" placeholder="%" value={novoPercentual}
                onChange={e => setNovoPercentual(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarConfig()} />
              <button onClick={adicionarConfig} disabled={saving || !novoGerente.trim() || !novoPercentual}
                className="btn-primary px-3"><Plus size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

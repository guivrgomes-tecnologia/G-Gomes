import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Landmark, CheckCircle2, ChevronLeft, ChevronRight, Eye, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sincronizarLancamentos } from '../lib/financeiroSyncHelper'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function hojeYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FinanceiroListagem() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [diasFechados, setDiasFechados] = useState<Set<string>>(new Set())
  const [totalPorDia, setTotalPorDia] = useState<Record<string, number>>({})
  const [sincronizando, setSincronizando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregarMes() }, [ano, mes])

  async function atualizarLancamentos() {
    setSincronizando(true)
    setErro('')
    const { data: cfg } = await supabase.from('financeiro_config').select('arquivo_url').eq('usuario_id', user!.id).maybeSingle()
    if (!cfg?.arquivo_url) {
      setErro('Configure o link da planilha na página de um dia primeiro.')
      setSincronizando(false)
      return
    }
    const { erro } = await sincronizarLancamentos(user!.id, cfg.arquivo_url)
    if (erro) setErro(erro)
    setSincronizando(false)
    await carregarMes()
  }

  async function carregarMes() {
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
    const ultimoDiaMes = new Date(ano, mes, 0).getDate()
    const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDiaMes).padStart(2, '0')}`
    const { data } = await supabase.from('financeiro_lancamentos')
      .select('dia, valor, juros, fechado, redirecionado_para')
      .gte('dia', inicio).lte('dia', fim)

    const fechados = new Set<string>()
    const totais: Record<string, number> = {}
    for (const r of data ?? []) {
      if (r.fechado) fechados.add(r.dia)
      if (r.redirecionado_para) continue
      totais[r.dia] = (totais[r.dia] ?? 0) + (r.valor ?? 0) + (r.juros ?? 0)
    }
    setDiasFechados(fechados)
    setTotalPorDia(totais)
  }

  function mudarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
  }

  const hojeISO = hojeYYYYMMDD()
  const ultimoDiaMes = new Date(ano, mes, 0).getDate()
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const celulas: (number | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: ultimoDiaMes }, (_, i) => i + 1)]

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Financeiro</h1>
        <div className="flex items-center gap-3">
          <button onClick={atualizarLancamentos} disabled={sincronizando} className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50">
            <Eye size={15} className={sincronizando ? 'animate-pulse' : ''} /> {sincronizando ? 'Atualizando...' : 'Atualizar lançamentos'}
          </button>
          <button onClick={() => navigate(`/financeiro/${hojeISO}`)} className="text-xs text-brand-600 hover:underline">Ir para hoje</button>
        </div>
      </div>

      {erro && (
        <p className="text-xs text-red-600 mb-4 flex items-center gap-1.5"><AlertCircle size={13} /> {erro}</p>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => mudarMes(-1)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <select className="input w-40" value={mes} onChange={e => setMes(Number(e.target.value))}>
          {MESES.map((nome, i) => <option key={nome} value={i + 1}>{nome}</option>)}
        </select>
        <select className="input w-28" value={ano} onChange={e => setAno(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => hoje.getFullYear() - 2 + i).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => mudarMes(1)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-1.5">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {celulas.map((d, i) => {
          if (d === null) return <div key={`vazio-${i}`} />
          const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const fechado = diasFechados.has(iso)
          const ehHoje = iso === hojeISO
          const diaSemana = new Date(ano, mes - 1, d).getDay()
          const fimDeSemana = diaSemana === 0 || diaSemana === 6
          const total = fimDeSemana ? 0 : (totalPorDia[iso] ?? 0)
          return (
            <button key={iso} onClick={() => navigate(`/financeiro/${iso}`)}
              className={`card p-2 sm:p-3 text-left hover:border-brand-300 hover:shadow-sm transition-all relative aspect-square sm:aspect-auto sm:h-24 flex flex-col ${ehHoje ? 'border-brand-400 ring-1 ring-brand-200' : ''}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${ehHoje ? 'text-brand-600' : 'text-gray-900'}`}>{d}</span>
                {fechado && <CheckCircle2 size={13} className="text-green-500" />}
              </div>
              {total > 0 && (
                <span className="text-[10px] sm:text-xs font-medium text-red-600 mt-auto truncate">{fmt(total)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

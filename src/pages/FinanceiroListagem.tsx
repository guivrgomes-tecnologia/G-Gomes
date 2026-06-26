import { useEffect, useRef, useState } from 'react'
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
const NUM_SEMANAS_VISIVEIS = 6

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function hojeYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDias(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDaSemana(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return addDias(iso, -d.getDay())
}

function fmtDataCurta(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function FinanceiroListagem() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [modoVisao, setModoVisao] = useState<'mes' | 'semana'>('mes')
  const [semanaRef, setSemanaRef] = useState(hojeYYYYMMDD())
  const [diasFechados, setDiasFechados] = useState<Set<string>>(new Set())
  const [totalPorDia, setTotalPorDia] = useState<Record<string, number>>({})
  const [sincronizando, setSincronizando] = useState(false)
  const sincronizandoRef = useRef(false)
  const [apagandoDuplicados, setApagandoDuplicados] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregarMes() }, [ano, mes, modoVisao, semanaRef])

  async function atualizarLancamentos() {
    if (sincronizandoRef.current) return
    sincronizandoRef.current = true
    setSincronizando(true)
    setErro('')
    const { data: cfg } = await supabase.from('financeiro_config').select('arquivo_url').eq('usuario_id', user!.id).maybeSingle()
    if (!cfg?.arquivo_url) {
      setErro('Configure o link da planilha na página de um dia primeiro.')
      sincronizandoRef.current = false
      setSincronizando(false)
      return
    }
    const { erro } = await sincronizarLancamentos(user!.id, cfg.arquivo_url)
    if (erro) setErro(erro)
    sincronizandoRef.current = false
    setSincronizando(false)
    await carregarMes()
  }

  async function carregarMes() {
    const inicioSemanaAtual = inicioDaSemana(semanaRef)
    const { inicio, fim } = modoVisao === 'semana'
      ? { inicio: inicioSemanaAtual, fim: addDias(inicioSemanaAtual, NUM_SEMANAS_VISIVEIS * 7 - 1) }
      : {
        inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
        fim: `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`,
      }
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

  async function apagarDuplicados() {
    setApagandoDuplicados(true)
    const { data, error } = await supabase.rpc('apagar_lancamentos_duplicados')
    setApagandoDuplicados(false)
    if (error) { alert('Erro ao apagar duplicados: ' + error.message); return }
    alert(`${data ?? 0} lançamento(s) duplicado(s) apagado(s).`)
    await carregarMes()
  }

  function mudarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
  }

  function mudarSemana(delta: number) {
    setSemanaRef(prev => addDias(prev, delta * 7))
  }

  const hojeISO = hojeYYYYMMDD()
  const ultimoDiaMes = new Date(ano, mes, 0).getDate()
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const celulas: (number | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: ultimoDiaMes }, (_, i) => i + 1)]

  function totalDoDia(iso: string) {
    const diaSemana = new Date(iso + 'T12:00:00').getDay()
    const fimDeSemana = diaSemana === 0 || diaSemana === 6
    return fimDeSemana ? 0 : (totalPorDia[iso] ?? 0)
  }

  // Linhas do calendário (cada uma é uma semana), pra mostrar o subtotal de cada semana do mês.
  const semanasDoMes: (number | null)[][] = []
  for (let i = 0; i < celulas.length; i += 7) semanasDoMes.push(celulas.slice(i, i + 7))
  const totalDoMes = semanasDoMes.reduce((total, semana) => total + semana.reduce<number>((s, d) => {
    if (d === null) return s
    return s + totalDoDia(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }, 0), 0)

  const inicioSemanaAtual = inicioDaSemana(semanaRef)
  // Várias semanas em sequência (não limitadas a um mês), cada uma como uma linha com os 7 dias + total.
  const semanasVisiveis: string[][] = Array.from({ length: NUM_SEMANAS_VISIVEIS }, (_, si) =>
    Array.from({ length: 7 }, (_, di) => addDias(inicioSemanaAtual, si * 7 + di))
  )
  const totalDoPeriodoSemanas = semanasVisiveis.reduce((s, semana) => s + semana.reduce((s2, iso) => s2 + totalDoDia(iso), 0), 0)

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Financeiro</h1>
        <div className="flex items-center gap-3">
          <button onClick={apagarDuplicados} disabled={apagandoDuplicados} className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {apagandoDuplicados ? 'Apagando...' : 'Apagar duplicados'}
          </button>
          <button onClick={atualizarLancamentos} disabled={sincronizando} className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50">
            <Eye size={15} className={sincronizando ? 'animate-pulse' : ''} /> {sincronizando ? 'Atualizando...' : 'Atualizar lançamentos'}
          </button>
          <button onClick={() => navigate(`/financeiro/${hojeISO}`)} className="text-xs text-brand-600 hover:underline">Ir para hoje</button>
        </div>
      </div>

      {erro && (
        <p className="text-xs text-red-600 mb-4 flex items-center gap-1.5"><AlertCircle size={13} /> {erro}</p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          {modoVisao === 'mes' ? (
            <>
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
            </>
          ) : (
            <>
              <button onClick={() => mudarSemana(-1)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Semanas de {fmtDataCurta(inicioSemanaAtual)} a {fmtDataCurta(addDias(inicioSemanaAtual, NUM_SEMANAS_VISIVEIS * 7 - 1))}
              </span>
              <button onClick={() => mudarSemana(1)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setSemanaRef(hojeYYYYMMDD())} className="text-xs text-brand-600 hover:underline">Semana de hoje</button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setModoVisao('mes')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${modoVisao === 'mes' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              Mês
            </button>
            <button onClick={() => setModoVisao('semana')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${modoVisao === 'semana' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              Semana
            </button>
          </div>
          <span className="text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
            Total {modoVisao === 'mes' ? 'do mês' : 'do período'}: <span className="text-red-600">{fmt(modoVisao === 'mes' ? totalDoMes : totalDoPeriodoSemanas)}</span>
          </span>
        </div>
      </div>

      {modoVisao === 'mes' ? (
        <>
          <div className="grid grid-cols-8 gap-1.5 sm:gap-2 mb-1.5">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
            <div className="text-center text-xs font-medium text-gray-400 py-1">Total</div>
          </div>

          <div className="flex flex-col gap-1.5 sm:gap-2">
            {semanasDoMes.map((semana, si) => {
              const totalSemana = semana.reduce<number>((s, d) => {
                if (d === null) return s
                return s + totalDoDia(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
              }, 0)
              return (
                <div key={si} className="grid grid-cols-8 gap-1.5 sm:gap-2">
                  {semana.map((d, i) => {
                    if (d === null) return <div key={`vazio-${si}-${i}`} />
                    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const fechado = diasFechados.has(iso)
                    const ehHoje = iso === hojeISO
                    const total = totalDoDia(iso)
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
                  <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 border border-gray-200 px-1">
                    {totalSemana > 0 && <span className="text-[10px] sm:text-xs font-semibold text-gray-700 text-center break-words">{fmt(totalSemana)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-8 gap-1.5 sm:gap-2 mb-1.5">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
            <div className="text-center text-xs font-medium text-gray-400 py-1">Total</div>
          </div>

          <div className="flex flex-col gap-1.5 sm:gap-2">
            {semanasVisiveis.map((semana, si) => {
              const totalSemana = semana.reduce((s, iso) => s + totalDoDia(iso), 0)
              return (
                <div key={si} className="grid grid-cols-8 gap-1.5 sm:gap-2">
                  {semana.map(iso => {
                    const fechado = diasFechados.has(iso)
                    const ehHoje = iso === hojeISO
                    const total = totalDoDia(iso)
                    return (
                      <button key={iso} onClick={() => navigate(`/financeiro/${iso}`)}
                        className={`card p-1.5 sm:p-2 text-left hover:border-brand-300 hover:shadow-sm transition-all relative h-12 flex flex-col justify-center ${ehHoje ? 'border-brand-400 ring-1 ring-brand-200' : ''}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold whitespace-nowrap ${ehHoje ? 'text-brand-600' : 'text-gray-900'}`}>{fmtDataCurta(iso)}</span>
                          {fechado && <CheckCircle2 size={11} className="text-green-500 shrink-0" />}
                        </div>
                        {total > 0 && (
                          <span className="text-[10px] font-medium text-red-600 truncate">{fmt(total)}</span>
                        )}
                      </button>
                    )
                  })}
                  <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 border border-gray-200 px-1 h-12">
                    {totalSemana > 0 && <span className="text-[10px] sm:text-xs font-semibold text-gray-700 text-center break-words">{fmt(totalSemana)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Calendar, AlertCircle, Clock, Send, Plus, Video, X, CheckCircle2, Flame, ArrowRight } from 'lucide-react'
import { supabase, Evento, Pendencia } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import PendenciaDetalheModal from '../components/PendenciaDetalheModal'
import NovaPendenciaModal from '../components/NovaPendenciaModal'
import NovoEventoModal from '../components/NovoEventoModal'
import EventoDetalheModal from '../components/EventoDetalheModal'

type Stats = {
  eventosAmanha: number
  eventosSemana: number
  eventosAtrasados: number
  pendenciasMinhas: number
  pendenciasEnviadas: number
}

export default function Dashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ eventosAmanha: 0, eventosSemana: 0, eventosAtrasados: 0, pendenciasMinhas: 0, pendenciasEnviadas: 0 })
  const [eventosHoje, setEventosHoje] = useState<Evento[]>([])
  const [pendenciasAlta, setPendenciasAlta] = useState<Pendencia[]>([])
  const [pendenciasSolucao, setPendenciasSolucao] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [showAtrasados, setShowAtrasados] = useState(false)
  const [eventosAtrasados, setEventosAtrasados] = useState<Evento[]>([])
  const [showAmanha, setShowAmanha] = useState(false)
  const [eventosAmanha, setEventosAmanha] = useState<Evento[]>([])
  const [showSemana, setShowSemana] = useState(false)
  const [eventosSemana, setEventosSemana] = useState<Evento[]>([])
  const [showPendComigo, setShowPendComigo] = useState(false)
  const [pendComigo, setPendComigo] = useState<Pendencia[]>([])
  const [showMinhasPend, setShowMinhasPend] = useState(false)
  const [minhasPend, setMinhasPend] = useState<Pendencia[]>([])
  const [pendModalId, setPendModalId] = useState<string | null>(null)
  const [eventoModalId, setEventoModalId] = useState<string | null>(null)
  const [showNovaPendencia, setShowNovaPendencia] = useState(false)
  const [showNovoEvento, setShowNovoEvento] = useState(false)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    const now = new Date()
    function localDate(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    const today = localDate(now)
    const amanha = new Date(now); amanha.setDate(now.getDate() + 1)
    const amanhaStr = localDate(amanha)
    const diaSemana = now.getDay()
    const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana
    const seg = new Date(now); seg.setDate(now.getDate() + diffSeg)
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
    const segStr = localDate(seg)
    const domStr = localDate(dom)

    // data_inicio é salvo em UTC para eventos com hora — um evento às 23h local pode
    // já estar no dia seguinte em UTC. Por isso buscamos com 1 dia de margem de cada lado
    // e filtramos pela data local exata no cliente, em vez de comparar strings direto no banco.
    function dataLocalEvento(ev: Evento): string {
      if (ev.dia_inteiro) return ev.data_inicio.slice(0, 10)
      return localDate(new Date(ev.data_inicio))
    }
    const janelaInicio = new Date(seg); janelaInicio.setDate(seg.getDate() - 1)
    const janelaFim = new Date(dom); janelaFim.setDate(dom.getDate() + 2)
    const janelaInicioStr = localDate(janelaInicio)
    const janelaFimStr = localDate(janelaFim)

    const { data: meusJanela } = await supabase
      .from('eventos').select('*').eq('criado_por', user!.id)
      .gte('data_inicio', janelaInicioStr).lte('data_inicio', janelaFimStr + 'T23:59:59').order('data_inicio')

    const { data: participacoes } = await supabase
      .from('evento_participantes').select('evento_id').eq('usuario_id', user!.id)

    const idsParticipando = (participacoes ?? []).map((p: any) => p.evento_id)
    let extrasJanela: Evento[] = []
    if (idsParticipando.length > 0) {
      const { data } = await supabase.from('eventos').select('*')
        .in('id', idsParticipando).gte('data_inicio', janelaInicioStr).lte('data_inicio', janelaFimStr + 'T23:59:59')
      const meusIds = new Set((meusJanela ?? []).map(e => e.id))
      extrasJanela = (data ?? []).filter(e => !meusIds.has(e.id))
    }

    const todosNaJanela = [...(meusJanela ?? []), ...extrasJanela]
    setEventosHoje(todosNaJanela.filter(ev => dataLocalEvento(ev) === today).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))

    const { data: alta } = await supabase
      .from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(nome), para_usuario:profiles!pendencias_para_usuario_id_fkey(nome)')
      .eq('prioridade', 'alta')
      .neq('status', 'resolvida')
      .or(`para_usuario_id.eq.${profile!.id},de_usuario_id.eq.${profile!.id}`)
      .order('created_at', { ascending: false })
    // solucao_apresentada só some do card alta prioridade se eu sou o destinatário (não o criador)
    setPendenciasAlta((alta ?? []).filter(p =>
      p.status !== 'solucao_apresentada' || p.de_usuario_id === profile!.id
    ).sort((a, b) => {
      if (!a.prazo && !b.prazo) return 0
      if (!a.prazo) return 1
      if (!b.prazo) return -1
      return a.prazo.localeCompare(b.prazo)
    }))

    // Card soluções: pendências que criei e o destinatário apresentou solução
    const { data: solucao } = await supabase
      .from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(nome), para_usuario:profiles!pendencias_para_usuario_id_fkey(nome)')
      .eq('de_usuario_id', profile!.id)
      .eq('status', 'solucao_apresentada')
      .order('created_at', { ascending: false })
    setPendenciasSolucao(solucao ?? [])

    const nowIso = now.toISOString()
    const pendSelect = '*, de_usuario:profiles!pendencias_de_usuario_id_fkey(nome), para_usuario:profiles!pendencias_para_usuario_id_fkey(nome)'
    const [pendComigoData, minhasPendData, atrasados] = await Promise.all([
      supabase.from('pendencias').select(pendSelect).eq('para_usuario_id', profile?.id ?? '').in('status', ['aberta', 'em_andamento']).order('created_at', { ascending: false }),
      supabase.from('pendencias').select(pendSelect).eq('de_usuario_id', profile?.id ?? '').in('status', ['aberta', 'em_andamento', 'solucao_apresentada']).order('created_at', { ascending: false }),
      supabase.from('eventos').select('*').eq('criado_por', user!.id).lt('data_fim', nowIso).eq('concluido', false).eq('dia_inteiro', false).order('data_inicio', { ascending: false }),
    ])

    let extrasAtrasados: Evento[] = []
    if (idsParticipando.length > 0) {
      const { data: pAtrasados } = await supabase.from('eventos').select('*')
        .in('id', idsParticipando).lt('data_fim', nowIso).eq('concluido', false).eq('dia_inteiro', false)
      const atrasadosIds = new Set((atrasados.data ?? []).map(e => e.id))
      extrasAtrasados = (pAtrasados ?? []).filter(e => !atrasadosIds.has(e.id))
    }

    const todosAtrasados = [...(atrasados.data ?? []), ...extrasAtrasados]
    const todosAmanha = todosNaJanela.filter(ev => dataLocalEvento(ev) === amanhaStr)
    const todosSemana = todosNaJanela.filter(ev => dataLocalEvento(ev) >= segStr && dataLocalEvento(ev) <= domStr)

    setEventosAtrasados(todosAtrasados)
    setEventosAmanha(todosAmanha.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))
    setEventosSemana(todosSemana.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))
    setPendComigo(pendComigoData.data ?? [])
    setMinhasPend(minhasPendData.data ?? [])
    setStats({
      eventosAmanha:      todosAmanha.length,
      eventosSemana:      todosSemana.length,
      eventosAtrasados:   todosAtrasados.length,
      pendenciasMinhas:   pendComigoData.data?.length ?? 0,
      pendenciasEnviadas: minhasPendData.data?.length ?? 0,
    })
    setLoading(false)
  }


  async function abrirEvento(ev: Evento) {
    const { data: pendData } = await supabase.from('pendencias').select('id').eq('evento_id', ev.id).order('created_at', { ascending: false }).limit(1)
    if (pendData && pendData.length > 0) { setPendModalId(pendData[0].id); return }
    setEventoModalId(ev.id)
  }

  const cards = [
    { label: 'Eventos amanhã',      value: stats.eventosAmanha,      icon: Calendar,    color: 'bg-indigo-50 text-indigo-600', onClick: () => setShowAmanha(true) },
    { label: 'Eventos esta semana', value: stats.eventosSemana,      icon: Calendar,    color: 'bg-sky-50 text-sky-600',       onClick: () => setShowSemana(true) },
    { label: 'Pendências comigo',   value: stats.pendenciasMinhas,   icon: AlertCircle, color: 'bg-orange-50 text-orange-600', onClick: () => setShowPendComigo(true) },
    { label: 'Minhas pendências',   value: stats.pendenciasEnviadas, icon: Send,        color: 'bg-purple-50 text-purple-600', onClick: () => setShowMinhasPend(true) },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
          Olá, {profile?.nome?.split(' ')[0] ?? 'Usuário'} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-xs sm:text-base">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="card p-6 animate-pulse h-32" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(5)].map((_, i) => <div key={i} className="card p-6 animate-pulse h-24" />)}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ações rápidas */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <button onClick={() => setShowNovoEvento(true)} className="card p-2 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors">
                <Plus size={13} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800 leading-tight">Novo<br className="sm:hidden"/> evento</p>
                <p className="text-xs text-gray-400 hidden sm:block">Adicionar à agenda</p>
              </div>
            </button>
            <button onClick={() => setShowNovaPendencia(true)} className="card p-2 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-red-50 group-hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
                <Plus size={13} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800 leading-tight">Nova<br className="sm:hidden"/> pendência</p>
                <p className="text-xs text-gray-400 hidden sm:block">Criar e atribuir</p>
              </div>
            </button>
            <Link to="/reunioes" className="card p-2 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-purple-50 group-hover:bg-purple-100 flex items-center justify-center shrink-0 transition-colors">
                <Video size={13} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800 leading-tight">Nova<br className="sm:hidden"/> reunião</p>
                <p className="text-xs text-gray-400 hidden sm:block">Organizar reunião</p>
              </div>
            </Link>
          </div>

          {/* Layout: calendário + stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Eventos hoje */}
            <div className="card overflow-hidden lg:col-span-1">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar size={16} className="text-brand-500" /> Hoje
                </h2>
                <Link to="/agenda?view=dia" className="text-sm text-brand-600 hover:underline">Ver agenda →</Link>
              </div>
              {eventosHoje.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">Nenhum evento hoje</p>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-[168px] lg:max-h-none overflow-y-auto">
                  {eventosHoje.map(ev => {
                    const hora = ev.dia_inteiro
                      ? 'Dia inteiro'
                      : new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    const agora = new Date()
                    const inicio = new Date(ev.data_inicio)
                    const atrasado = !ev.concluido && !ev.dia_inteiro && inicio < agora
                    const emBreve = !ev.concluido && !ev.dia_inteiro && inicio >= agora && inicio <= new Date(agora.getTime() + 3600000)
                    return (
                      <li key={ev.id} onClick={() => abrirEvento(ev)}
                        className={`flex items-center gap-2 px-5 cursor-pointer transition-colors ${ev.concluido ? 'py-1.5 bg-green-50 hover:bg-green-100' : atrasado ? 'py-3 bg-red-50 hover:bg-red-100' : emBreve ? 'py-3 bg-yellow-50 hover:bg-yellow-100' : 'py-3 hover:bg-gray-50'}`}>
                        <div className={`rounded-full shrink-0 transition-all ${ev.concluido ? 'w-1 h-4 opacity-40' : 'w-1 h-10'}`} style={{ backgroundColor: ev.cor }} />
                        <div className="flex-1 min-w-0">
                          <p className={`truncate ${ev.concluido ? 'text-xs text-gray-400 line-through' : 'text-sm font-medium text-gray-900'}`}>
                            {ev.titulo}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 text-gray-400 shrink-0 ${ev.concluido ? 'text-xs opacity-50' : 'text-xs'}`}>
                          <Clock size={10} />
                          {hora}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Coluna direita: prioridades + stats */}
            <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Pendências alta prioridade */}
            <div className="card overflow-hidden self-start w-full">
              <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50">
                <h2 className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                  <Flame size={14} /> Alta prioridade
                  {pendenciasAlta.length > 0 && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{pendenciasAlta.length}</span>}
                </h2>
                <Link to="/pendencias" className="text-xs text-red-500 hover:underline"><ArrowRight size={13} /></Link>
              </div>
              {pendenciasAlta.length === 0 ? (
                <p className="px-4 py-5 text-xs text-gray-400 text-center">Nenhuma pendência urgente</p>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-[132px] lg:max-h-none overflow-y-auto">
                  {pendenciasAlta.map(p => {
                    const euSouDest = p.para_usuario_id === profile?.id
                    return (
                      <li key={p.id} onClick={() => setPendModalId(p.id)}
                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{p.titulo}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {euSouDest ? `De: ${(p.de_usuario as any)?.nome?.split(' ')[0]}` : `Para: ${(p.para_usuario as any)?.nome?.split(' ')[0]}`}
                            {p.prazo && (() => {
                              const temHora = p.prazo.includes('T')
                              const d = new Date(temHora ? p.prazo : p.prazo + 'T12:00:00')
                              const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                              const horaFmt = temHora ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null
                              return <> · {dataFmt}{horaFmt && ` ${horaFmt}`}</>
                            })()}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Soluções apresentadas */}
            {pendenciasSolucao.length > 0 && (
              <div className="card overflow-hidden self-start w-full">
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100 bg-purple-50">
                  <h2 className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Soluções para revisar
                    <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">{pendenciasSolucao.length}</span>
                  </h2>
                  <Link to="/pendencias?aba=minhas" className="text-xs text-purple-500 hover:underline"><ArrowRight size={13} /></Link>
                </div>
                <ul className="divide-y divide-gray-100 max-h-[132px] lg:max-h-none overflow-y-auto">
                  {pendenciasSolucao.map(p => (
                    <li key={p.id} onClick={() => setPendModalId(p.id)}
                      className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{p.titulo}</p>
                        <p className="text-xs text-gray-400 truncate">Para: {(p.para_usuario as any)?.nome?.split(' ')[0]} · solução disponível</p>
                      </div>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">Ver</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cards de estatísticas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button onClick={() => setShowAtrasados(true)} className="card p-3 hover:shadow-md transition-shadow text-left">
                <div className="inline-flex p-1.5 rounded-lg bg-red-50 text-red-600 mb-2">
                  <Clock size={15} />
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.eventosAtrasados}</p>
                <p className="text-xs text-gray-500 mt-0.5">Eventos atrasados</p>
              </button>
              {cards.map(({ label, value, icon: Icon, color, onClick }) => (
                <button key={label} onClick={onClick} className="card p-3 hover:shadow-md transition-shadow text-left">
                  <div className={`inline-flex p-1.5 rounded-lg ${color} mb-2`}>
                    <Icon size={15} />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal eventos amanhã */}
      {showAmanha && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAmanha(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Calendar size={16} className="text-indigo-500" /> Eventos amanhã</h3>
                <p className="text-xs text-gray-400 mt-0.5">{eventosAmanha.length} evento{eventosAmanha.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowAmanha(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {eventosAmanha.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Nenhum evento amanhã.</p> : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {eventosAmanha.map(ev => (
                  <li key={ev.id} onClick={() => { setShowAmanha(false); abrirEvento(ev) }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{ev.titulo}</p>
                      {ev.descricao && <p className="text-xs text-gray-400 truncate">{ev.descricao}</p>}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1"><Clock size={11} />{ev.dia_inteiro ? 'Dia inteiro' : new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t"><button onClick={() => { setShowAmanha(false); navigate('/agenda') }} className="w-full text-sm text-brand-600 hover:underline">Ver na agenda →</button></div>
          </div>
        </div>
      )}

      {/* Modal eventos esta semana */}
      {showSemana && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowSemana(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Calendar size={16} className="text-sky-500" /> Eventos esta semana</h3>
                <p className="text-xs text-gray-400 mt-0.5">{eventosSemana.length} evento{eventosSemana.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowSemana(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {eventosSemana.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Nenhum evento esta semana.</p> : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {eventosSemana.map(ev => (
                  <li key={ev.id} onClick={() => { setShowSemana(false); abrirEvento(ev) }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{ev.titulo}</p>
                      {ev.descricao && <p className="text-xs text-gray-400 truncate">{ev.descricao}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">{new Date(ev.data_inicio).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                      <p className="text-xs text-gray-400">{ev.dia_inteiro ? 'Dia inteiro' : new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t"><button onClick={() => { setShowSemana(false); navigate('/agenda?view=semana') }} className="w-full text-sm text-brand-600 hover:underline">Ver na agenda →</button></div>
          </div>
        </div>
      )}

      {/* Modal pendências comigo */}
      {showPendComigo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPendComigo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><AlertCircle size={16} className="text-orange-500" /> Pendências comigo</h3>
                <p className="text-xs text-gray-400 mt-0.5">{pendComigo.length} pendência{pendComigo.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowPendComigo(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {pendComigo.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Nenhuma pendência.</p> : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {pendComigo.map(p => (
                  <li key={p.id} onClick={() => { setShowPendComigo(false); setPendModalId(p.id) }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.titulo}</p>
                      <p className="text-xs text-gray-400">De: {(p.de_usuario as any)?.nome?.split(' ')[0]}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${p.prioridade === 'alta' ? 'bg-red-100 text-red-700' : p.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.prioridade === 'alta' ? 'Alta' : p.prioridade === 'media' ? 'Média' : 'Baixa'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t"><button onClick={() => { setShowPendComigo(false); navigate('/pendencias') }} className="w-full text-sm text-brand-600 hover:underline">Ver todas →</button></div>
          </div>
        </div>
      )}

      {/* Modal minhas pendências */}
      {showMinhasPend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowMinhasPend(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Send size={16} className="text-purple-500" /> Minhas pendências</h3>
                <p className="text-xs text-gray-400 mt-0.5">{minhasPend.length} pendência{minhasPend.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowMinhasPend(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {minhasPend.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Nenhuma pendência.</p> : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {minhasPend.map(p => (
                  <li key={p.id} onClick={() => { setShowMinhasPend(false); setPendModalId(p.id) }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.titulo}</p>
                      <p className="text-xs text-gray-400">Para: {(p.para_usuario as any)?.nome?.split(' ')[0]}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${p.status === 'solucao_apresentada' ? 'bg-purple-100 text-purple-700' : p.status === 'em_andamento' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {p.status === 'solucao_apresentada' ? 'Solução' : p.status === 'em_andamento' ? 'Andamento' : 'Aberta'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t"><button onClick={() => { setShowMinhasPend(false); navigate('/pendencias?aba=minhas') }} className="w-full text-sm text-brand-600 hover:underline">Ver todas →</button></div>
          </div>
        </div>
      )}

      {/* Modal eventos atrasados */}
      {showAtrasados && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAtrasados(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock size={16} className="text-red-500" /> Eventos atrasados
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{eventosAtrasados.length} evento{eventosAtrasados.length !== 1 ? 's' : ''} não concluído{eventosAtrasados.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowAtrasados(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {eventosAtrasados.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum evento atrasado.</p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {eventosAtrasados.map(ev => {
                  const inicio = new Date(ev.data_inicio)
                  const fim = ev.data_fim ? new Date(ev.data_fim) : null
                  const diasAtrasado = Math.floor((Date.now() - (fim ?? inicio).getTime()) / 86400000)
                  return (
                    <li key={ev.id}
                      onClick={() => { setShowAtrasados(false); abrirEvento(ev) }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-red-100 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{ev.titulo}</p>
                        <p className="text-xs text-gray-500">
                          {inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          {' '}{inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {fim && ` – ${fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-red-600 shrink-0">
                        {diasAtrasado === 0 ? 'hoje' : `${diasAtrasado}d atrás`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t">
              <button onClick={() => { setShowAtrasados(false); navigate('/agenda') }}
                className="w-full text-sm text-brand-600 hover:underline">
                Ver na agenda →
              </button>
            </div>
          </div>
        </div>
      )}


      {pendModalId && (
        <PendenciaDetalheModal
          pendenciaId={pendModalId}
          onClose={() => setPendModalId(null)}
          onEditar={() => navigate(`/pendencias?abrir=${pendModalId}`)}
          onChanged={load}
        />
      )}

      {showNovaPendencia && (
        <NovaPendenciaModal onClose={() => setShowNovaPendencia(false)} onCreated={load} />
      )}
      {showNovoEvento && (
        <NovoEventoModal onClose={() => setShowNovoEvento(false)} onCreated={load} />
      )}
      {eventoModalId && (
        <EventoDetalheModal eventoId={eventoModalId} onClose={() => setEventoModalId(null)} onChanged={load} />
      )}
    </div>
  )
}

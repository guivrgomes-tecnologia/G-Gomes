import { useEffect, useState } from 'react'
import { Calendar, AlertCircle, Clock, Send, Plus, Video, X, CheckCircle2, MapPin, Flame, ArrowRight } from 'lucide-react'
import { supabase, Evento, Pendencia } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'

type Stats = {
  eventosAmanha: number
  eventosSemana: number
  pendenciasMinhas: number
  pendenciasEnviadas: number
}

export default function Dashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ eventosAmanha: 0, eventosSemana: 0, pendenciasMinhas: 0, pendenciasEnviadas: 0 })
  const [eventosHoje, setEventosHoje] = useState<Evento[]>([])
  const [pendenciasAlta, setPendenciasAlta] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null)

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

    const { data: meusHoje } = await supabase
      .from('eventos').select('*')
      .gte('data_inicio', today).lte('data_inicio', today + 'T23:59:59').order('data_inicio')

    const { data: participacoes } = await supabase
      .from('evento_participantes').select('evento_id').eq('usuario_id', user!.id)

    const idsParticipando = (participacoes ?? []).map((p: any) => p.evento_id)
    let extrasHoje: Evento[] = []
    if (idsParticipando.length > 0) {
      const { data } = await supabase.from('eventos').select('*')
        .in('id', idsParticipando).gte('data_inicio', today).lte('data_inicio', today + 'T23:59:59')
      const meusIds = new Set((meusHoje ?? []).map(e => e.id))
      extrasHoje = (data ?? []).filter(e => !meusIds.has(e.id))
    }

    setEventosHoje([...(meusHoje ?? []), ...extrasHoje].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))

    const { data: alta } = await supabase
      .from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(nome), para_usuario:profiles!pendencias_para_usuario_id_fkey(nome)')
      .eq('prioridade', 'alta')
      .in('status', ['aberta', 'em_andamento'])
      .or(`para_usuario_id.eq.${profile!.id},de_usuario_id.eq.${profile!.id}`)
      .order('created_at', { ascending: false })
    setPendenciasAlta(alta ?? [])

    const [evAmanha, evSemana, pend, pendEnv] = await Promise.all([
      supabase.from('eventos').select('id', { count: 'exact', head: true }).gte('data_inicio', amanhaStr).lte('data_inicio', amanhaStr + 'T23:59:59'),
      supabase.from('eventos').select('id', { count: 'exact', head: true }).gte('data_inicio', segStr).lte('data_inicio', domStr + 'T23:59:59'),
      supabase.from('pendencias').select('id', { count: 'exact', head: true }).eq('para_usuario_id', profile?.id ?? '').in('status', ['aberta', 'em_andamento']),
      supabase.from('pendencias').select('id', { count: 'exact', head: true }).eq('de_usuario_id', profile?.id ?? '').in('status', ['aberta', 'em_andamento']),
    ])
    setStats({
      eventosAmanha:      evAmanha.count ?? 0,
      eventosSemana:      evSemana.count ?? 0,
      pendenciasMinhas:   pend.count ?? 0,
      pendenciasEnviadas: pendEnv.count ?? 0,
    })
    setLoading(false)
  }

  async function toggleConcluido(ev: Evento) {
    await supabase.from('eventos').update({ concluido: !ev.concluido }).eq('id', ev.id)
    const updated = { ...ev, concluido: !ev.concluido }
    setEventosHoje(prev => prev.map(e => e.id === ev.id ? updated : e))
    setEventoAtivo(updated)
  }

  const cards = [
    { label: 'Eventos amanhã',      value: stats.eventosAmanha,      icon: Calendar,    color: 'bg-indigo-50 text-indigo-600', link: '/agenda' },
    { label: 'Eventos esta semana', value: stats.eventosSemana,      icon: Calendar,    color: 'bg-sky-50 text-sky-600',       link: '/agenda?view=semana' },
    { label: 'Pendências comigo',   value: stats.pendenciasMinhas,   icon: AlertCircle, color: 'bg-red-50 text-red-600',       link: '/pendencias' },
    { label: 'Minhas pendências',   value: stats.pendenciasEnviadas, icon: Send,        color: 'bg-purple-50 text-purple-600', link: '/pendencias?aba=minhas' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Olá, {profile?.nome?.split(' ')[0] ?? 'Usuário'} 👋
        </h1>
        <p className="text-gray-500 mt-1">
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
            <Link to="/agenda?novo=1" className="card p-3 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors">
                <Plus size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800">Novo evento</p>
                <p className="text-xs text-gray-400 hidden sm:block">Adicionar à agenda</p>
              </div>
            </Link>
            <Link to="/pendencias?novo=1" className="card p-3 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-50 group-hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
                <Plus size={16} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800">Nova pendência</p>
                <p className="text-xs text-gray-400 hidden sm:block">Criar e atribuir</p>
              </div>
            </Link>
            <Link to="/reunioes" className="card p-3 sm:p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 hover:border-brand-400 flex flex-col sm:flex-row items-center sm:gap-3 gap-1 group text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-50 group-hover:bg-purple-100 flex items-center justify-center shrink-0 transition-colors">
                <Video size={16} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-800">Nova reunião</p>
                <p className="text-xs text-gray-400 hidden sm:block">Organizar reunião</p>
              </div>
            </Link>
          </div>

          {/* Layout: calendário + stats */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Eventos hoje */}
            <div className="card overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar size={16} className="text-brand-500" /> Hoje
                </h2>
                <Link to="/agenda?view=dia" className="text-sm text-brand-600 hover:underline">Ver agenda →</Link>
              </div>
              {eventosHoje.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">Nenhum evento hoje</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {eventosHoje.map(ev => {
                    const hora = ev.dia_inteiro
                      ? 'Dia inteiro'
                      : new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <li key={ev.id} onClick={() => setEventoAtivo(ev)}
                        className={`flex items-center gap-2 px-5 cursor-pointer transition-colors hover:bg-gray-50 ${ev.concluido ? 'py-1.5' : 'py-3'}`}>
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

            {/* Cards de estatísticas */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-4 content-start">
              {cards.map(({ label, value, icon: Icon, color, link }) => (
                <Link key={label} to={link} className="card p-6 hover:shadow-md transition-shadow">
                  <div className={`inline-flex p-2.5 rounded-lg ${color} mb-4`}>
                    <Icon size={20} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{value}</p>
                  <p className="text-sm text-gray-500 mt-1">{label}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Pendências alta prioridade */}
          {pendenciasAlta.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-red-100 bg-red-50">
                <h2 className="font-semibold text-red-700 flex items-center gap-2">
                  <Flame size={16} /> Prioridade alta
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{pendenciasAlta.length}</span>
                </h2>
                <Link to="/pendencias" className="text-sm text-red-600 hover:underline flex items-center gap-1">Ver todas <ArrowRight size={13} /></Link>
              </div>
              <ul className="divide-y divide-gray-100">
                {pendenciasAlta.map(p => {
                  const euSouDest = p.para_usuario_id === profile?.id
                  return (
                    <li key={p.id} onClick={() => navigate('/pendencias')}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.titulo}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {euSouDest ? `De: ${(p.de_usuario as any)?.nome?.split(' ')[0]}` : `Para: ${(p.para_usuario as any)?.nome?.split(' ')[0]}`}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${p.status === 'aberta' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.status === 'aberta' ? 'A resolver' : 'Em andamento'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Modal detalhe do evento */}

      {eventoAtivo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEventoAtivo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: eventoAtivo.cor }} />
                <h3 className={`font-semibold text-gray-900 text-lg leading-tight ${eventoAtivo.concluido ? 'line-through text-gray-400' : ''}`}>
                  {eventoAtivo.titulo}
                </h3>
              </div>
              <button onClick={() => setEventoAtivo(null)} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock size={14} className="text-gray-400" />
                {eventoAtivo.dia_inteiro
                  ? 'Dia inteiro'
                  : new Date(eventoAtivo.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    + (eventoAtivo.data_fim ? ' – ' + new Date(eventoAtivo.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
                }
              </div>
              {eventoAtivo.descricao && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <span>{eventoAtivo.descricao}</span>
                </div>
              )}
              {eventoAtivo.concluido && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 size={14} /> Concluído
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => toggleConcluido(eventoAtivo)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${eventoAtivo.concluido ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'}`}>
                <CheckCircle2 size={15} />
                {eventoAtivo.concluido ? 'Desmarcar' : 'Concluir'}
              </button>
              <button onClick={() => { setEventoAtivo(null); navigate('/agenda') }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                <Calendar size={15} /> Ver na agenda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

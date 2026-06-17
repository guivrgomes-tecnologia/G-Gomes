import { useEffect, useState } from 'react'
import { Calendar, AlertCircle, Clock, Send } from 'lucide-react'
import { supabase, Evento } from '../lib/supabase'
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    const amanha = new Date(now); amanha.setDate(now.getDate() + 1)
    const amanhaStr = amanha.toISOString().split('T')[0]

    const diaSemana = now.getDay()
    const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana
    const seg = new Date(now); seg.setDate(now.getDate() + diffSeg)
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
    const segStr = seg.toISOString().split('T')[0]
    const domStr = dom.toISOString().split('T')[0]

    // Eventos de hoje (criados por mim ou onde sou participante)
    const { data: meusHoje } = await supabase
      .from('eventos')
      .select('*')
      .gte('data_inicio', today)
      .lte('data_inicio', today + 'T23:59:59')
      .order('data_inicio')

    const { data: participacoes } = await supabase
      .from('evento_participantes')
      .select('evento_id')
      .eq('usuario_id', user!.id)

    const idsParticipando = (participacoes ?? []).map((p: any) => p.evento_id)
    let extrasHoje: Evento[] = []
    if (idsParticipando.length > 0) {
      const { data } = await supabase
        .from('eventos')
        .select('*')
        .in('id', idsParticipando)
        .gte('data_inicio', today)
        .lte('data_inicio', today + 'T23:59:59')
      const meusIds = new Set((meusHoje ?? []).map(e => e.id))
      extrasHoje = (data ?? []).filter(e => !meusIds.has(e.id))
    }

    const todosHoje = [...(meusHoje ?? []), ...extrasHoje]
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
    setEventosHoje(todosHoje)

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
          {/* Eventos hoje */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Calendar size={16} className="text-brand-500" /> Hoje
              </h2>
              <Link to="/agenda" className="text-sm text-brand-600 hover:underline">Ver agenda →</Link>
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
                    <li key={ev.id}
                      onClick={() => navigate('/agenda')}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium text-gray-900 truncate ${ev.concluido ? 'line-through text-gray-400' : ''}`}>
                          {ev.titulo}
                        </p>
                        {ev.descricao && <p className="text-xs text-gray-400 truncate">{ev.descricao}</p>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                        <Clock size={11} />
                        {hora}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
      )}
    </div>
  )
}

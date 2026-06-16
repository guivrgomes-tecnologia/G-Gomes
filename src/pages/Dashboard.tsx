import { useEffect, useState } from 'react'
import { Calendar, ClipboardList, AlertCircle, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'

type Stats = {
  eventosHoje: number
  eventosAmanha: number
  eventosSemana: number
  processosAbertos: number
  pendenciasMinhas: number
  processosAtrasados: number
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<Stats>({ eventosHoje: 0, eventosAmanha: 0, eventosSemana: 0, processosAbertos: 0, pendenciasMinhas: 0, processosAtrasados: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const today = now.toISOString().split('T')[0]

      const amanha = new Date(now); amanha.setDate(now.getDate() + 1)
      const amanhaStr = amanha.toISOString().split('T')[0]

      // Semana de seg a dom
      const diaSemana = now.getDay() // 0=dom, 1=seg...
      const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana
      const seg = new Date(now); seg.setDate(now.getDate() + diffSeg)
      const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
      const segStr = seg.toISOString().split('T')[0]
      const domStr = dom.toISOString().split('T')[0]

      const [ev, evAmanha, evSemana, proc, pend, atras] = await Promise.all([
        supabase.from('eventos').select('id', { count: 'exact', head: true }).gte('data_inicio', today).lte('data_inicio', today + 'T23:59:59'),
        supabase.from('eventos').select('id', { count: 'exact', head: true }).gte('data_inicio', amanhaStr).lte('data_inicio', amanhaStr + 'T23:59:59'),
        supabase.from('eventos').select('id', { count: 'exact', head: true }).gte('data_inicio', segStr).lte('data_inicio', domStr + 'T23:59:59'),
        supabase.from('processos').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_andamento']),
        supabase.from('pendencias').select('id', { count: 'exact', head: true }).eq('para_usuario_id', profile?.id ?? '').in('status', ['aberta', 'em_andamento']),
        supabase.from('processos').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_andamento']).lt('prazo', today),
      ])
      setStats({
        eventosHoje: ev.count ?? 0,
        eventosAmanha: evAmanha.count ?? 0,
        eventosSemana: evSemana.count ?? 0,
        processosAbertos: proc.count ?? 0,
        pendenciasMinhas: pend.count ?? 0,
        processosAtrasados: atras.count ?? 0,
      })
      setLoading(false)
    }
    if (profile) load()
  }, [profile])

  const cards = [
    { label: 'Eventos hoje',        value: stats.eventosHoje,       icon: Calendar,     color: 'bg-blue-50 text-blue-600',    link: '/agenda' },
    { label: 'Eventos amanhã',      value: stats.eventosAmanha,     icon: Calendar,     color: 'bg-indigo-50 text-indigo-600',link: '/agenda' },
    { label: 'Eventos esta semana', value: stats.eventosSemana,     icon: Calendar,     color: 'bg-sky-50 text-sky-600',      link: '/agenda' },
    { label: 'Processos em aberto', value: stats.processosAbertos,  icon: ClipboardList,color: 'bg-yellow-50 text-yellow-600',link: '/processos' },
    { label: 'Pendências comigo',   value: stats.pendenciasMinhas,  icon: AlertCircle,  color: 'bg-red-50 text-red-600',      link: '/pendencias' },
    { label: 'Processos atrasados', value: stats.processosAtrasados,icon: TrendingUp,   color: 'bg-orange-50 text-orange-600',link: '/processos' },
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-10 w-10 bg-gray-200 rounded-lg mb-4" />
              <div className="h-8 bg-gray-200 rounded w-12 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  )
}

import { NavLink, useNavigate } from 'react-router-dom'
import { Calendar, ClipboardList, AlertCircle, LayoutDashboard, LogOut, Building2, Bell, BellOff, Video } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'

const links = [
  { to: '/',          label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/agenda',    label: 'Agenda',      icon: Calendar },
  { to: '/processos', label: 'Processos',   icon: ClipboardList },
  { to: '/pendencias',label: 'Pendências',  icon: AlertCircle },
  { to: '/reunioes',  label: 'Reuniões',    icon: Video },
]

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { status, loading, ativar, desativar } = usePushNotifications()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="w-64 bg-brand-900 text-white flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-brand-800">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500 p-2 rounded-lg">
            <Building2 size={20} />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">G Gomes</p>
            <p className="text-brand-300 text-xs">Gestão Interna</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-brand-200 hover:bg-brand-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-brand-800">
        <button onClick={() => { navigate('/perfil'); onNavigate() }} className="flex items-center gap-3 mb-3 px-1 w-full hover:bg-brand-800 rounded-lg py-1 transition-colors text-left">
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold shrink-0">
            {profile?.nome?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.nome ?? 'Usuário'}</p>
            <p className="text-brand-300 text-xs truncate">{profile?.cargo ?? 'Editar perfil'}</p>
          </div>
        </button>
        {status !== 'unsupported' && (
          <button
            onClick={status === 'granted' ? desativar : ativar}
            disabled={loading || status === 'denied'}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-200 hover:text-white hover:bg-brand-800 rounded-lg transition-colors disabled:opacity-40 mb-1"
            title={status === 'denied' ? 'Notificações bloqueadas no browser' : ''}
          >
            {status === 'granted' ? <BellOff size={16} /> : <Bell size={16} />}
            {loading ? 'Aguarde...' : status === 'granted' ? 'Desativar notificações' : status === 'denied' ? 'Notificações bloqueadas' : 'Ativar notificações'}
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-200 hover:text-white hover:bg-brand-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}

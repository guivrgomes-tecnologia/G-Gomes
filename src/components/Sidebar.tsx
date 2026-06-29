import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Calendar, ClipboardList, AlertCircle, LayoutDashboard, LogOut, Building2, Bell, BellOff, Video, Users, Home, DollarSign, RotateCcw, FileText, ChevronDown, ChevronRight, FolderOpen, Target, LineChart, Percent, Landmark, Receipt, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'

const ALL_LINKS = [
  { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, modulo: null },
  { to: '/agenda',     label: 'Agenda',      icon: Calendar,        modulo: 'agenda' },
  { to: '/processos',  label: 'Processos',   icon: ClipboardList,   modulo: 'processos' },
  { to: '/pendencias', label: 'Pendências',  icon: AlertCircle,     modulo: 'pendencias' },
  { to: '/vendas',     label: 'Vendas',      icon: LineChart,       modulo: null },
  { to: '/financeiro', label: 'Financeiro',  icon: Landmark,        modulo: 'financeiro' },
  { to: '/notas-fiscais', label: 'Notas Fiscais', icon: Receipt,    modulo: null },
  { to: '/reunioes',   label: 'Reuniões',    icon: Video,           modulo: 'reunioes' },
  { to: '/documentos', label: 'Documentos',  icon: FolderOpen,      modulo: 'documentos' },
  { to: '/casa',       label: 'Casa',        icon: Home,            modulo: 'casa' },
]

const CASA_SUB = [
  { tab: 'financas',   label: 'Finanças',    icon: DollarSign },
  { tab: 'rotinas',    label: 'Rotinas',     icon: RotateCcw },
  { tab: 'documentos', label: 'Documentos',  icon: FileText },
]

const VENDAS_SUB = [
  { to: '/metas',      label: 'Metas',      icon: Target,    modulo: 'metas' },
  { to: '/historico',  label: 'Histórico',  icon: LineChart, modulo: 'vendas' },
  { to: '/comissoes',  label: 'Comissões',  icon: Percent,   modulo: 'comissoes' },
]

const NOTAS_FISCAIS_SUB: { to: string; label: string; icon: typeof Upload; modulo: string | null }[] = [
  { to: '/entrada-notas', label: 'Entrada de Notas', icon: Upload, modulo: null },
]

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { status, loading, ativar, desativar } = usePushNotifications()

  const modulos = profile?.modulos ?? ['agenda', 'processos', 'pendencias', 'metas', 'vendas', 'comissoes', 'reunioes', 'casa', 'documentos', 'notas_fiscais']
  const links = ALL_LINKS.filter(l => l.modulo === null || modulos.includes(l.modulo))
  const vendasSubVisivel = VENDAS_SUB.filter(s => modulos.includes(s.modulo))
  const notasFiscaisSubVisivel = NOTAS_FISCAIS_SUB.filter(s => s.modulo === null || modulos.includes(s.modulo))
  const casaAtiva = location.pathname === '/casa' || location.pathname.startsWith('/casa')
  const [casaAberta, setCasaAberta] = useState(casaAtiva)
  const vendasAtiva = vendasSubVisivel.some(s => location.pathname === s.to)
  const [vendasAberta, setVendasAberta] = useState(vendasAtiva)
  const notasFiscaisAtiva = notasFiscaisSubVisivel.some(s => location.pathname === s.to)
  const [notasFiscaisAberta, setNotasFiscaisAberta] = useState(notasFiscaisAtiva)

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
          <div key={to}>
            {to === '/casa' ? (
              <>
                <button
                  onClick={() => setCasaAberta(v => !v)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    casaAtiva ? 'bg-brand-600 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left">{label}</span>
                  {casaAberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {casaAberta && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {CASA_SUB.map(({ tab, label: subLabel, icon: SubIcon }) => {
                      const params = new URLSearchParams(location.search)
                      const activeTab = params.get('tab') ?? 'financas'
                      const isSubActive = casaAtiva && activeTab === tab
                      return (
                        <button
                          key={tab}
                          onClick={() => { navigate(`/casa?tab=${tab}`); onNavigate() }}
                          className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            isSubActive ? 'text-white bg-brand-700' : 'text-brand-300 hover:text-white hover:bg-brand-800'
                          }`}
                        >
                          <SubIcon size={15} />
                          {subLabel}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : to === '/vendas' ? (
              <>
                <button
                  onClick={() => setVendasAberta(v => !v)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    vendasAtiva ? 'bg-brand-600 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left">{label}</span>
                  {vendasAberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {vendasAberta && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {vendasSubVisivel.map(({ to: subTo, label: subLabel, icon: SubIcon }) => (
                      <NavLink
                        key={subTo}
                        to={subTo}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'text-white bg-brand-700' : 'text-brand-300 hover:text-white hover:bg-brand-800'
                          }`
                        }
                      >
                        <SubIcon size={15} />
                        {subLabel}
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            ) : to === '/notas-fiscais' ? (
              <>
                <button
                  onClick={() => setNotasFiscaisAberta(v => !v)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    notasFiscaisAtiva ? 'bg-brand-600 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left">{label}</span>
                  {notasFiscaisAberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {notasFiscaisAberta && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {notasFiscaisSubVisivel.map(({ to: subTo, label: subLabel, icon: SubIcon }) => (
                      <NavLink
                        key={subTo}
                        to={subTo}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'text-white bg-brand-700' : 'text-brand-300 hover:text-white hover:bg-brand-800'
                          }`
                        }
                      >
                        <SubIcon size={15} />
                        {subLabel}
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <NavLink
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
            )}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-brand-800">
        {profile?.is_admin && (
          <button onClick={() => { navigate('/admin'); onNavigate() }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-yellow-300 hover:text-white hover:bg-brand-800 rounded-lg transition-colors mb-1">
            <Users size={16} /> Gerenciar usuários
          </button>
        )}
        <button onClick={() => { navigate('/perfil'); onNavigate() }} className="flex items-center gap-3 mb-3 px-1 w-full hover:bg-brand-800 rounded-lg py-1 transition-colors text-left">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.nome} className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold shrink-0">
              {profile?.nome?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
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

import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificacaoBell from './NotificacaoBell'

export default function Layout() {
  const [menuAberto, setMenuAberto] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex h-screen">
      {/* Sidebar desktop */}
      <div className="hidden lg:block">
        <Sidebar onNavigate={() => {}} />
      </div>

      {/* Overlay mobile */}
      {menuAberto && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMenuAberto(false)}
        />
      )}

      {/* Drawer mobile */}
      <div className={`fixed top-0 left-0 h-full z-50 lg:hidden transition-transform duration-300 ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onNavigate={() => setMenuAberto(false)} />
      </div>

      {/* Conteúdo principal */}
      <main className="flex-1 h-screen overflow-y-auto min-w-0">
        {/* Header (mobile: barra escura com menu; desktop: barra clara só com o sino) */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6 py-3 bg-brand-900 lg:bg-white text-white lg:text-gray-900 lg:border-b lg:border-gray-100">
          <button onClick={() => setMenuAberto(true)} className="lg:hidden p-1.5 hover:bg-brand-800 rounded-lg">
            <Menu size={22} />
          </button>
          <button onClick={() => navigate('/')} className="lg:hidden font-bold text-sm hover:text-brand-300 transition-colors flex-1 text-left">G Gomes</button>
          <div className="hidden lg:block flex-1" />
          <NotificacaoBell />
        </div>

        <Outlet />
      </main>
    </div>
  )
}

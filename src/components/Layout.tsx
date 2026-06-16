import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function Layout() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="flex min-h-screen">
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
      <main className="flex-1 overflow-auto min-w-0">
        {/* Header mobile */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-brand-900 text-white">
          <button onClick={() => setMenuAberto(true)} className="p-1.5 hover:bg-brand-800 rounded-lg">
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm">Brasil Lar</span>
        </div>

        <Outlet />
      </main>
    </div>
  )
}

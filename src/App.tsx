import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Processos from './pages/Processos'
import Pendencias from './pages/Pendencias'
import Reunioes from './pages/Reunioes'
import Perfil from './pages/Perfil'
import Admin from './pages/Admin'
import GoogleCallback from './pages/GoogleCallback'
import MicrosoftCallback from './pages/MicrosoftCallback'
import Financeiro from './pages/Financeiro'
import FinanceiroListagem from './pages/FinanceiroListagem'
import ResetPassword from './pages/ResetPassword'
import Casa from './pages/Casa'
import DocumentosEmpresa from './pages/DocumentosEmpresa'
import Metas from './pages/Metas'
import Historico from './pages/Historico'
import Comissoes from './pages/Comissoes'
import Notificacoes from './pages/Notificacoes'
import EntradaNotas from './pages/EntradaNotas'
import EntradaNotaDetalhe from './pages/EntradaNotaDetalhe'
import Configuracoes from './pages/Configuracoes'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/google/callback" element={<PrivateRoute><GoogleCallback /></PrivateRoute>} />
          <Route path="/auth/microsoft/callback" element={<PrivateRoute><MicrosoftCallback /></PrivateRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="processos" element={<Processos />} />
            <Route path="pendencias" element={<Pendencias />} />
            <Route path="reunioes" element={<Reunioes />} />
            <Route path="casa" element={<Casa />} />
            <Route path="documentos" element={<DocumentosEmpresa />} />
            <Route path="metas" element={<Metas />} />
            <Route path="historico" element={<Historico />} />
            <Route path="comissoes" element={<Comissoes />} />
            <Route path="entrada-notas" element={<EntradaNotas />} />
            <Route path="entrada-notas/:id" element={<EntradaNotaDetalhe />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="financeiro" element={<FinanceiroListagem />} />
            <Route path="financeiro/:dia" element={<Financeiro />} />
            <Route path="notificacoes" element={<Notificacoes />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

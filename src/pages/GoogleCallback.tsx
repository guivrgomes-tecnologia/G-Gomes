import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function GoogleCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [status, setStatus] = useState<'loading' | 'ok' | 'erro'>('loading')
  const [erroMsg, setErroMsg] = useState('')
  const tentou = useRef(false)

  useEffect(() => {
    if (loading) return           // aguarda auth carregar
    if (tentou.current) return    // evita rodar duas vezes
    tentou.current = true

    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) { setErroMsg('Código de autorização não encontrado.'); setStatus('erro'); return }
    if (!user)  { setErroMsg('Usuário não autenticado.'); setStatus('erro'); return }

    supabase.functions.invoke('google-auth-callback', {
      body: { code, user_id: user.id },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        setErroMsg(error?.message ?? data?.error ?? 'Erro desconhecido')
        setStatus('erro')
        return
      }
      setStatus('ok')
      setTimeout(() => navigate('/agenda'), 2000)
    })
  }, [loading, user])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card p-8 text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Conectando ao Google Calendar...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold">Google Calendar conectado!</p>
            <p className="text-gray-500 text-sm mt-1">Redirecionando para a agenda...</p>
          </>
        )}
        {status === 'erro' && (
          <>
            <p className="text-red-600 font-semibold mb-2">Erro ao conectar</p>
            {erroMsg && <p className="text-xs text-gray-500 mb-4">{erroMsg}</p>}
            <button onClick={() => navigate('/agenda')} className="btn-primary">Voltar para agenda</button>
          </>
        )}
      </div>
    </div>
  )
}

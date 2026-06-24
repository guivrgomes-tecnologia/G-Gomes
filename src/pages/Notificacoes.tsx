import { useEffect, useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, Notificacao } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TIPO_ICON: Record<string, string> = {
  pendencia_nova: '📌',
  pendencia_comentario: '💬',
  evento_participante: '📅',
  processo_responsavel: '🗂️',
}

export default function Notificacoes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) carregar() }, [user])

  async function carregar() {
    const ha7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('notificacoes').delete().eq('usuario_id', user!.id).lt('created_at', ha7dias)
    const { data } = await supabase.from('notificacoes')
      .select('*').eq('usuario_id', user!.id).gte('created_at', ha7dias)
      .order('created_at', { ascending: false })
    setNotificacoes(data ?? [])
    setLoading(false)
  }

  async function marcarLida(n: Notificacao) {
    if (!n.lida) {
      await supabase.from('notificacoes').update({ lida: true }).eq('id', n.id)
      setNotificacoes(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x))
    }
    if (n.link) navigate(n.link)
  }

  async function marcarTodasLidas() {
    await supabase.from('notificacoes').update({ lida: true }).eq('usuario_id', user!.id).eq('lida', false)
    setNotificacoes(prev => prev.map(x => ({ ...x, lida: true })))
  }

  const naoLidas = notificacoes.filter(n => !n.lida).length

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} /> Voltar
        </button>
        {naoLidas > 0 && (
          <button onClick={marcarTodasLidas} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            <Check size={12} /> Marcar todas como lidas
          </button>
        )}
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Notificações</h1>
      <p className="text-sm text-gray-400 mb-6">Últimos 7 dias</p>

      {loading ? (
        <div className="card p-12 text-center text-gray-400">Carregando...</div>
      ) : notificacoes.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">Nenhuma notificação nos últimos 7 dias.</div>
      ) : (
        <div className="card overflow-hidden divide-y divide-gray-50">
          {notificacoes.map(n => (
            <button key={n.id} onClick={() => marcarLida(n)}
              className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors flex gap-3 ${!n.lida ? 'bg-brand-50/60' : ''}`}>
              <span className="text-lg shrink-0">{TIPO_ICON[n.tipo] ?? '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.lida ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.titulo}</p>
                {n.mensagem && <p className="text-xs text-gray-500 mt-0.5">{n.mensagem}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {!n.lida && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

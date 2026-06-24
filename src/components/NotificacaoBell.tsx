import { useEffect, useRef, useState } from 'react'
import { Bell, X, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, Notificacao } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TIPO_ICON: Record<string, string> = {
  pendencia_nova: '📌',
  pendencia_comentario: '💬',
  evento_participante: '📅',
  processo_responsavel: '🗂️',
}

function tocarSomNotificacao() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notas = [880, 1320]
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const inicio = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0.0001, inicio)
      gain.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(inicio)
      osc.stop(inicio + 0.2)
    })
    setTimeout(() => ctx.close(), 500)
  } catch {
    // navegador bloqueou áudio sem interação prévia — ignora
  }
}

export default function NotificacaoBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const ref = useRef<HTMLDivElement>(null)

  async function carregar() {
    if (!user) return
    const ha24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ha7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('notificacoes').delete().eq('usuario_id', user.id).lt('created_at', ha7dias)
    const { data } = await supabase.from('notificacoes')
      .select('*').eq('usuario_id', user.id).gte('created_at', ha24h)
      .order('created_at', { ascending: false }).limit(30)
    setNotificacoes(data ?? [])
  }

  useEffect(() => {
    carregar()
    if (!user) return
    const interval = setInterval(carregar, 30000)
    const channel = supabase.channel('notificacoes-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${user.id}` }, () => { tocarSomNotificacao(); carregar() })
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const naoLidas = notificacoes.filter(n => !n.lida).length

  async function marcarLida(n: Notificacao) {
    if (!n.lida) {
      await supabase.from('notificacoes').update({ lida: true }).eq('id', n.id)
      setNotificacoes(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x))
    }
    if (n.link) { navigate(n.link); setOpen(false) }
  }

  async function marcarTodasLidas() {
    if (!user) return
    await supabase.from('notificacoes').update({ lida: true }).eq('usuario_id', user.id).eq('lida', false)
    setNotificacoes(prev => prev.map(x => ({ ...x, lida: true })))
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="relative p-2 rounded-lg transition-colors text-white hover:bg-brand-800 lg:text-gray-500 lg:hover:bg-gray-100">
        <Bell size={20} />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Notificações</p>
            <div className="flex items-center gap-2">
              {naoLidas > 0 && (
                <button onClick={marcarTodasLidas} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                  <Check size={12} /> Marcar todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {notificacoes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma notificação ainda.</p>
            ) : (
              notificacoes.map(n => (
                <button key={n.id} onClick={() => marcarLida(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-2.5 ${!n.lida ? 'bg-brand-50/60' : ''}`}>
                  <span className="text-base shrink-0">{TIPO_ICON[n.tipo] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.lida ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.titulo}</p>
                    {n.mensagem && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensagem}</p>}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.lida && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                </button>
              ))
            )}
          </div>
          <button onClick={() => { setOpen(false); navigate('/notificacoes') }}
            className="text-xs text-gray-500 hover:text-brand-600 hover:bg-gray-50 py-2.5 border-t border-gray-100 transition-colors">
            Ver notificações anteriores
          </button>
        </div>
      )}
    </div>
  )
}

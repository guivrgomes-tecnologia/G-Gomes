import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string
  || 'BI5eBznlH1ccu96BPWaXA-s2dtZ_8PR31G9xmeL25aKLdfR5F54tn-YtiPQFlfnZXynGINxgCc0J_agWiv_Q8Qs'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'granted') setStatus('granted')
    else if (Notification.permission === 'denied') setStatus('denied')
  }, [])

  async function ativar() {
    if (!user) { alert('Usuário não autenticado'); return }
    if (!VAPID_PUBLIC_KEY) { alert('Chave VAPID não configurada. Verifique as variáveis de ambiente no Vercel.'); return }
    if (!('serviceWorker' in navigator)) { alert('Service Worker não suportado neste browser.'); return }
    if (!('PushManager' in window)) { alert('Push notifications não suportado neste browser/dispositivo.'); return }
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); setLoading(false); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const { endpoint, keys } = sub.toJSON() as any
      const { error } = await supabase.from('push_subscriptions').upsert({
        usuario_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }, { onConflict: 'usuario_id,endpoint' })

      if (error) { alert('Erro ao salvar subscription: ' + error.message); setLoading(false); return }
      setStatus('granted')
    } catch (e: any) {
      alert('Erro ao ativar notificações: ' + (e?.message ?? String(e)))
    }
    setLoading(false)
  }

  async function desativar() {
    if (!user) return
    setLoading(true)
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (reg) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
    }
    setStatus('idle')
    setLoading(false)
  }

  return { status, loading, ativar, desativar }
}

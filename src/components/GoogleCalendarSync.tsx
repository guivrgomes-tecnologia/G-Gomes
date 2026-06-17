import { useEffect, useState } from 'react'
import { Link2, Copy, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function GoogleCalendarSync({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [icsUrl, setIcsUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { gerarToken() }, [])

  async function gerarToken() {
    // Busca token existente ou cria um novo
    let { data } = await supabase
      .from('calendar_tokens')
      .select('token')
      .eq('usuario_id', user!.id)
      .single()

    if (!data) {
      const { data: novo } = await supabase
        .from('calendar_tokens')
        .insert({ usuario_id: user!.id })
        .select('token')
        .single()
      data = novo
    }

    if (data) {
      const url = `https://djlxshgumupdzoqpgvui.supabase.co/functions/v1/ics?token=${data.token}`
      setIcsUrl(url)
    }
    setLoading(false)
  }

  async function copiar() {
    await navigator.clipboard.writeText(icsUrl)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const googleUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(icsUrl)}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Link2 size={18} /> Sincronizar com Google Calendar
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">Como funciona</p>
              <p>Seus eventos do G Gomes aparecem automaticamente no Google Calendar. O Google sincroniza a cada ~12h, ou você pode forçar manualmente.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Link da sua agenda</label>
              <div className="flex gap-2">
                <input readOnly value={icsUrl} className="input text-xs flex-1 bg-gray-50 text-gray-600" onClick={e => (e.target as HTMLInputElement).select()} />
                <button onClick={copiar} className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${copiado ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}>
                  {copiado ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
                </button>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Adicionar automaticamente</p>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Abrir no Google Calendar
              </a>
              <p className="text-xs text-gray-400 mt-2 text-center">Abre a página de "Adicionar por URL" do Google Calendar com o link já preenchido</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-600">Ou faça manualmente:</p>
              <p>1. Google Calendar → "+" ao lado de "Outros calendários"</p>
              <p>2. "A partir de URL" → cole o link acima</p>
              <p>3. "Adicionar calendário"</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

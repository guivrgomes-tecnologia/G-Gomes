import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare, Image as ImageIcon, X } from 'lucide-react'
import { supabase, Profile, criarNotificacoes } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadImagemChat } from '../lib/chatHelpers'

type Comentario = {
  id: string
  grupo_id: string
  autor_id: string
  mensagem: string
  imagem_url: string | null
  created_at: string
  autor?: Profile
}

export default function ChatPedido({ grupoId, fornecedor }: { grupoId: string; fornecedor: string | null }) {
  const { user, profile } = useAuth()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [imagemSelecionada, setImagemSelecionada] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const inputImagemRef = useRef<HTMLInputElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { carregar() }, [grupoId])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [comentarios])

  useEffect(() => {
    const ch = supabase.channel('pedido-chat-' + grupoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_comentarios', filter: `grupo_id=eq.${grupoId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [grupoId])

  async function carregar() {
    const { data } = await supabase
      .from('pedido_comentarios')
      .select('*, autor:profiles(id, nome, email, avatar_url, cargo, is_admin, modulos, created_at)')
      .eq('grupo_id', grupoId)
      .order('created_at')
    setComentarios((data ?? []) as Comentario[])
  }

  function selecionarImagem(file: File | null) {
    setImagemSelecionada(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = e => setImagemPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setImagemPreview(null)
    }
  }

  async function enviar() {
    const msg = texto.trim()
    if (!msg && !imagemSelecionada) return
    setEnviando(true)

    let imagemUrl: string | null = null
    if (imagemSelecionada) {
      imagemUrl = await uploadImagemChat(imagemSelecionada, `pedidos/${grupoId}`)
      if (!imagemUrl) { setEnviando(false); return }
    }

    await supabase.from('pedido_comentarios').insert({
      grupo_id: grupoId,
      autor_id: user!.id,
      mensagem: msg,
      imagem_url: imagemUrl,
    })

    // Notificar outros membros (admins + quem já comentou)
    const { data: outrosComentarios } = await supabase
      .from('pedido_comentarios')
      .select('autor_id')
      .eq('grupo_id', grupoId)
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)

    const ids = new Set<string>()
    ;(outrosComentarios ?? []).forEach((c: any) => ids.add(c.autor_id))
    ;(admins ?? []).forEach((a: any) => ids.add(a.id))
    ids.delete(user!.id)

    if (ids.size > 0) {
      await criarNotificacoes(Array.from(ids).map(uid => ({
        usuario_id: uid,
        tipo: 'pedido_comentario',
        titulo: `Nova mensagem no pedido "${fornecedor ?? 'sem nome'}"`,
        mensagem: `${profile?.nome ?? 'Alguém'}: ${msg || '📷 Imagem'}`,
        link: `/pedidos`,
      })))
    }

    setTexto('')
    selecionarImagem(null)
    setEnviando(false)
  }

  const fmtHora = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col border-t border-gray-100 mt-4 pt-4">
      <div className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-gray-700">
        <MessageSquare size={15} className="text-brand-500" /> Chat do pedido
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto mb-3 pr-1">
        {comentarios.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma mensagem ainda.</p>
        )}
        {comentarios.map(c => {
          const souEu = c.autor_id === user?.id
          const autor = c.autor as Profile | undefined
          return (
            <div key={c.id} className={`flex gap-2 ${souEu ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                {(autor?.nome ?? '?')[0].toUpperCase()}
              </div>
              <div className={`max-w-[75%] ${souEu ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                <span className="text-[10px] text-gray-400">
                  {souEu ? 'Você' : (autor?.nome ?? '?')} · {fmtHora(c.created_at)}
                </span>
                <div className={`rounded-2xl px-3 py-2 text-sm ${souEu ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                  {c.imagem_url && (
                    <img src={c.imagem_url} alt="imagem" className="max-h-48 rounded-lg mb-1 object-contain" />
                  )}
                  {c.mensagem && <span>{c.mensagem}</span>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      {imagemPreview && (
        <div className="relative inline-block mb-2">
          <img src={imagemPreview} alt="Pré-visualização" className="h-16 rounded-lg object-cover" />
          <button onClick={() => selecionarImagem(null)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center">
            <X size={11} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input ref={inputImagemRef} type="file" accept="image/*" className="hidden"
          onChange={e => selecionarImagem(e.target.files?.[0] ?? null)} />
        <button onClick={() => inputImagemRef.current?.click()} title="Enviar imagem"
          className="p-2 text-gray-400 hover:text-brand-600 hover:bg-gray-50 rounded-lg transition-colors shrink-0">
          <ImageIcon size={16} />
        </button>
        <textarea
          className="input flex-1 text-sm resize-none"
          rows={1}
          placeholder="Escreva uma mensagem..."
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          onPaste={e => {
            const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
            if (item) { e.preventDefault(); const file = item.getAsFile(); if (file) selecionarImagem(file) }
          }}
        />
        <button onClick={enviar} disabled={enviando || (!texto.trim() && !imagemSelecionada)}
          className="btn-primary p-2 shrink-0 disabled:opacity-50">
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

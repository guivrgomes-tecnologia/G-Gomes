import { useEffect, useRef, useState } from 'react'
import { X, Pencil, Trash2, CheckCircle2, Users, Video, AlertCircle, MessageCircle, Timer, MessageSquare, Send, Image as ImageIcon } from 'lucide-react'
import { supabase, Evento, Profile, CategoriaEvento } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { localDatetimeToISO, calcularDataFim, toLocalInput } from '../lib/eventoHelpers'
import { uploadImagemChat } from '../lib/chatHelpers'
import SeletorDuracao from './SeletorDuracao'
import SeletorLembretes from './SeletorLembretes'

const COR_PADRAO = '#0ea5e9'
const CORES_PRESET = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16']

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function formatDataHora(ev: Evento) {
  if (ev.dia_inteiro) {
    return new Date(ev.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  const inicio = new Date(ev.data_inicio).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const hf = ev.data_fim ? ` – ${formatHora(ev.data_fim)}` : ''
  return `${inicio}, ${formatHora(ev.data_inicio)}${hf}`
}
function useContagem(ev: Evento | null) {
  const [restante, setRestante] = useState('')
  useEffect(() => {
    if (!ev || ev.dia_inteiro || ev.concluido) { setRestante(''); return }
    function calc() {
      const diff = new Date(ev!.data_inicio).getTime() - Date.now()
      if (diff <= 0) { setRestante('Em andamento'); return }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000)
      if (h >= 24) { const d = Math.floor(h / 24); setRestante(`${d}d ${h % 24}h`); return }
      setRestante(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [ev])
  return restante
}

type EventoComentario = { id: string; evento_id: string; autor_id: string; mensagem: string; imagem_url?: string | null; created_at: string; autor?: Profile }

type EditState = Partial<{
  titulo: string; descricao: string; data_inicio: string; duracao: number
  dia_inteiro: boolean; cor: string; categoria_id: string
  participantes: string[]; lembretes: number[]
}>

export default function EventoDetalheModal({ eventoId, onClose, onChanged }: { eventoId: string; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ev, setEv] = useState<Evento | null>(null)
  const [categorias, setCategorias] = useState<CategoriaEvento[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [participantesAtivos, setParticipantesAtivos] = useState<Profile[]>([])
  const [reuniaoVinculada, setReuniaoVinculada] = useState<{ id: string } | null>(null)
  const [pendenciaVinculada, setPendenciaVinculada] = useState<{ id: string; titulo: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [ef, setEf] = useState<EditState>({})
  const [saving, setSaving] = useState(false)
  const [googleConectado, setGoogleConectado] = useState(false)
  const [comentarios, setComentarios] = useState<EventoComentario[]>([])
  const [novoComentario, setNovoComentario] = useState('')
  const [enviandoComentario, setEnviandoComentario] = useState(false)
  const [imagemSelecionada, setImagemSelecionada] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [arrastandoImagem, setArrastandoImagem] = useState(false)
  const inputImagemRef = useRef<HTMLInputElement>(null)
  const fimComentariosRef = useRef<HTMLDivElement>(null)
  const contagem = useContagem(ev)

  useEffect(() => { carregar() }, [eventoId])

  useEffect(() => {
    const channel = supabase.channel('evento-comentarios-' + eventoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evento_comentarios', filter: `evento_id=eq.${eventoId}` }, () => carregarComentarios())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventoId])

  useEffect(() => {
    fimComentariosRef.current?.scrollIntoView({ block: 'end' })
  }, [comentarios])

  async function carregarComentarios() {
    const { data } = await supabase.from('evento_comentarios')
      .select('*, autor:profiles(*)').eq('evento_id', eventoId).order('created_at')
    setComentarios(data ?? [])
  }

  function selecionarImagem(file: File | null) {
    setImagemSelecionada(file)
    setImagemPreview(file ? URL.createObjectURL(file) : null)
  }

  async function enviarComentario() {
    const texto = novoComentario.trim()
    if (!texto && !imagemSelecionada) return
    setEnviandoComentario(true)
    let imagemUrl: string | null = null
    if (imagemSelecionada) {
      imagemUrl = await uploadImagemChat(imagemSelecionada, `eventos/${eventoId}`)
      if (!imagemUrl) { setEnviandoComentario(false); return }
    }
    await supabase.from('evento_comentarios').insert({ evento_id: eventoId, autor_id: user!.id, mensagem: texto, imagem_url: imagemUrl })
    setNovoComentario('')
    selecionarImagem(null)
    await carregarComentarios()
    setEnviandoComentario(false)
  }

  async function carregar() {
    const { data } = await supabase.from('eventos').select('*, categoria:categorias_evento(*)').eq('id', eventoId).single()
    setEv(data as Evento)
    setEditando(false); setEf({})
    const [{ data: cats }, { data: time }, { data: partic }, { data: reun }, { data: pend }, { data: gtok }] = await Promise.all([
      supabase.from('categorias_evento').select('*').order('nome'),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('evento_participantes').select('profile:profiles(*)').eq('evento_id', eventoId),
      supabase.from('reunioes').select('id').eq('evento_id', eventoId).maybeSingle(),
      supabase.from('pendencias').select('id, titulo').eq('evento_id', eventoId).maybeSingle(),
      supabase.from('google_tokens').select('usuario_id').eq('usuario_id', user!.id).single(),
    ])
    setCategorias(cats ?? [])
    setEquipe(time ?? [])
    setParticipantesAtivos((partic ?? []).map((r: any) => r.profile))
    setReuniaoVinculada(reun ?? null)
    setPendenciaVinculada(pend ?? null)
    setGoogleConectado(!!gtok)
    carregarComentarios()
  }

  if (!ev) return null

  const corAtiva = (ev.categoria as CategoriaEvento | undefined)?.cor ?? ev.cor ?? COR_PADRAO
  const catAtiva = ev.categoria as CategoriaEvento | undefined

  async function syncGoogle(action: 'create' | 'update' | 'delete', eventoPayload: any) {
    if (!googleConectado) return
    await supabase.functions.invoke('google-calendar-sync', { body: { action, user_id: user!.id, evento: eventoPayload } })
  }

  async function toggleConcluido() {
    if (!ev) return
    await supabase.from('eventos').update({ concluido: !ev.concluido }).eq('id', ev.id)
    onChanged?.()
    carregar()
  }

  async function salvarParticipantes(ids: string[]) {
    if (!ev) return
    await supabase.from('evento_participantes').delete().eq('evento_id', ev.id)
    if (ids.length > 0) await supabase.from('evento_participantes').insert(ids.map(uid => ({ evento_id: ev.id, usuario_id: uid })))
  }

  async function salvarEdicao() {
    if (!ev) return
    setSaving(true)
    const diaInteiroFinal = ef.dia_inteiro ?? ev.dia_inteiro
    const diBase = ef.data_inicio ?? (ev.dia_inteiro ? ev.data_inicio.split('T')[0] : toLocalInput(ev.data_inicio))
    const duracaoFinal = ef.duracao ?? Math.max(5, Math.round((new Date(ev.data_fim ?? ev.data_inicio).getTime() - new Date(ev.data_inicio).getTime()) / 60000))
    const lembretesFinal = ef.lembretes ?? (ev.lembretes_minutos?.length ? ev.lembretes_minutos : (ev.lembrete_minutos != null ? [ev.lembrete_minutos] : []))
    const dataInicio = diaInteiroFinal ? diBase.split('T')[0] : localDatetimeToISO(diBase)
    const campos = {
      titulo: ef.titulo ?? ev.titulo,
      descricao: ef.descricao ?? ev.descricao,
      data_inicio: dataInicio,
      data_fim: diaInteiroFinal ? null : calcularDataFim(diBase, duracaoFinal),
      dia_inteiro: diaInteiroFinal,
      cor: ef.cor ?? ev.cor,
      categoria_id: ef.categoria_id !== undefined ? (ef.categoria_id || null) : ev.categoria_id,
      lembrete_minutos: lembretesFinal[0] ?? 0,
      lembretes_minutos: lembretesFinal,
    }
    await supabase.from('eventos').update(campos).eq('id', ev.id)
    await salvarParticipantes(ef.participantes ?? participantesAtivos.map(p => p.id))
    syncGoogle('update', { ...ev, ...campos })
    setSaving(false)
    onChanged?.()
    carregar()
  }

  async function deletarEvento() {
    if (!ev) return
    if (!confirm(ev.recorrencia_grupo
      ? 'Este evento faz parte de uma série recorrente. Apagar apenas esta ocorrência?'
      : 'Apagar este evento?')) return
    syncGoogle('delete', ev)
    await supabase.from('eventos').delete().eq('id', ev.id)
    onChanged?.()
    onClose()
  }

  function compartilharWhatsapp() {
    if (!ev) return
    const data = formatDataHora(ev)
    const partic = participantesAtivos.length > 0 ? '\n👥 ' + participantesAtivos.map(p => p.nome.split(' ')[0]).join(', ') : ''
    const desc = ev.descricao ? `\n📝 ${ev.descricao}` : ''
    const texto = `📅 *${ev.titulo}*\n🕐 ${data}${desc}${partic}`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  function toggleParticipante(id: string) {
    const atuais = ef.participantes ?? participantesAtivos.map(p => p.id)
    setEf(f => ({ ...f, participantes: atuais.includes(id) ? atuais.filter(x => x !== id) : [...atuais, id] }))
  }

  const outrosDaEquipe = equipe.filter(p => p.id !== user?.id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corAtiva }} />
            <h3 className="text-lg font-semibold">Evento</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {!editando ? (
          <div className="space-y-3">
            <div>
              <p className={`text-xl font-semibold text-gray-900 ${ev.concluido ? 'line-through text-gray-400' : ''}`}>{ev.titulo}</p>
              <p className="text-sm text-gray-500 mt-1">{formatDataHora(ev)}</p>
            </div>
            {catAtiva && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium text-white" style={{ backgroundColor: catAtiva.cor }}>
                {catAtiva.nome}
              </span>
            )}
            {ev.descricao && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{ev.descricao}</p>}
            {participantesAtivos.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1"><Users size={12} /> Participantes</p>
                <div className="flex flex-wrap gap-2">
                  {participantesAtivos.map(p => (
                    <span key={p.id} className="text-sm text-gray-700">{p.nome.split(' ')[0]}</span>
                  ))}
                </div>
              </div>
            )}
            {reuniaoVinculada && (
              <button onClick={() => { onClose(); navigate(`/reunioes?reuniao=${reuniaoVinculada.id}`) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors border border-purple-200">
                <Video size={15} /> Ver reunião vinculada
              </button>
            )}
            {ev.google_event_id && (
              <a href={`https://calendar.google.com/calendar/event?eid=${btoa(ev.google_event_id)}`} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors border border-blue-200">
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Ver no Google Calendar
              </a>
            )}
            {pendenciaVinculada && (
              <button onClick={() => { onClose(); navigate(`/pendencias?abrir=${pendenciaVinculada.id}`) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors border border-red-200">
                <AlertCircle size={15} />
                <span className="flex-1 text-left truncate">Pendência: {pendenciaVinculada.titulo}</span>
              </button>
            )}
            {contagem && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${contagem === 'Em andamento' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                <Timer size={15} />
                {contagem === 'Em andamento' ? 'Acontecendo agora' : `Faltam ${contagem}`}
              </div>
            )}
            {ev.concluido && (
              <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={16} /> Evento concluído
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 border-t border-gray-100">
              <span>Criado por</span>
              <span className="font-medium text-gray-500">{equipe.find(p => p.id === ev.criado_por)?.nome ?? 'Desconhecido'}</span>
              <span>•</span>
              <span>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={toggleConcluido}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${ev.concluido ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'}`}>
                <CheckCircle2 size={16} />
                {ev.concluido ? 'Marcar como não concluído' : 'Marcar como concluído'}
              </button>
              <button onClick={compartilharWhatsapp}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
                <MessageCircle size={15} /> Compartilhar no WhatsApp
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditando(true)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={deletarEvento}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={14} /> Deletar
                </button>
              </div>
            </div>

            {(ev.criado_por === user?.id || participantesAtivos.some(p => p.id === user?.id)) && (
              <div
                className={`border-t border-gray-100 pt-3 -mx-1 px-1 rounded-lg transition-colors ${arrastandoImagem ? 'bg-brand-50 ring-2 ring-brand-300' : ''}`}
                onDragOver={e => { e.preventDefault(); setArrastandoImagem(true) }}
                onDragLeave={() => setArrastandoImagem(false)}
                onDrop={e => {
                  e.preventDefault()
                  setArrastandoImagem(false)
                  const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
                  if (file) selecionarImagem(file)
                }}
              >
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-2">
                  <MessageSquare size={13} /> Comentários
                </p>
                {arrastandoImagem && (
                  <p className="text-xs text-brand-600 text-center py-2 border-2 border-dashed border-brand-300 rounded-lg mb-2">Solte a imagem aqui</p>
                )}
                <div className="space-y-2 max-h-60 overflow-y-auto mb-2">
                  {comentarios.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda.</p>}
                  {comentarios.map(c => {
                    const autor = c.autor as Profile | undefined
                    const souEu = c.autor_id === user?.id
                    return (
                      <div key={c.id} className={`flex ${souEu ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 ${souEu ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          <p className="text-xs font-semibold mb-0.5 opacity-70">{souEu ? 'Você' : autor?.nome ?? 'Desconhecido'}</p>
                          {c.imagem_url && (
                            <a href={c.imagem_url} target="_blank" rel="noopener noreferrer">
                              <img src={c.imagem_url} alt="Imagem" className="rounded-lg max-w-full max-h-60 mb-1 object-contain" />
                            </a>
                          )}
                          {c.mensagem && <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>}
                          <p className={`text-[10px] mt-0.5 ${souEu ? 'text-white/70 text-right' : 'text-gray-400'}`}>
                            {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={fimComentariosRef} />
                </div>
                {imagemPreview && (
                  <div className="relative inline-block mb-2">
                    <img src={imagemPreview} alt="Pré-visualização" className="h-20 rounded-lg object-cover" />
                    <button onClick={() => selecionarImagem(null)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-900">
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input ref={inputImagemRef} type="file" accept="image/*" className="hidden"
                    onChange={e => selecionarImagem(e.target.files?.[0] ?? null)} />
                  <button onClick={() => inputImagemRef.current?.click()} title="Anexar imagem"
                    className="p-2.5 shrink-0 text-gray-400 hover:text-brand-600 hover:bg-gray-50 rounded-lg transition-colors">
                    <ImageIcon size={18} />
                  </button>
                  <textarea
                    className="input flex-1 text-sm resize-none"
                    rows={1}
                    placeholder="Escreva um comentário... (Shift+Enter para nova linha)"
                    value={novoComentario}
                    onChange={e => setNovoComentario(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentario() } }}
                    onPaste={e => {
                      const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
                      if (item) { e.preventDefault(); const file = item.getAsFile(); if (file) selecionarImagem(file) }
                    }}
                  />
                  <button onClick={enviarComentario} disabled={enviandoComentario || (!novoComentario.trim() && !imagemSelecionada)}
                    className="btn-primary p-2.5 shrink-0 disabled:opacity-50">
                    <Send size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {ev.recorrencia_grupo && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Este evento faz parte de uma série recorrente. As alterações afetam somente esta ocorrência.
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input className="input" value={ef.titulo ?? ev.titulo} onChange={e => setEf(f => ({ ...f, titulo: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea className="input resize-none" rows={2} value={ef.descricao ?? ev.descricao ?? ''} onChange={e => setEf(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            {categorias.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select className="input" value={ef.categoria_id ?? ev.categoria_id ?? ''}
                  onChange={e => {
                    const cat = categorias.find(c => c.id === e.target.value)
                    setEf(f => ({ ...f, categoria_id: e.target.value, cor: cat?.cor ?? f.cor }))
                  }}>
                  <option value="">Sem categoria</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {CORES_PRESET.map(c => (
                <button key={c} onClick={() => setEf(f => ({ ...f, cor: c }))}
                  className={`w-7 h-7 rounded-full transition-transform ${(ef.cor ?? ev.cor) === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ev_dia_inteiro_dash" checked={ef.dia_inteiro ?? ev.dia_inteiro} onChange={e => setEf(f => ({ ...f, dia_inteiro: e.target.checked }))} />
              <label htmlFor="ev_dia_inteiro_dash" className="text-sm text-gray-700">Dia inteiro</label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{(ef.dia_inteiro ?? ev.dia_inteiro) ? 'Data' : 'Início'}</label>
                <input type={(ef.dia_inteiro ?? ev.dia_inteiro) ? 'date' : 'datetime-local'} className="input"
                  value={ef.data_inicio ?? (ev.dia_inteiro ? ev.data_inicio.split('T')[0] : toLocalInput(ev.data_inicio))}
                  onChange={e => setEf(f => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              {!(ef.dia_inteiro ?? ev.dia_inteiro) && (
                <SeletorDuracao
                  value={ef.duracao ?? Math.max(5, Math.round((new Date(ev.data_fim ?? ev.data_inicio).getTime() - new Date(ev.data_inicio).getTime()) / 60000))}
                  onChange={v => setEf(f => ({ ...f, duracao: v }))}
                />
              )}
            </div>
            {outrosDaEquipe.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Users size={14} /> Participantes <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {outrosDaEquipe.map(p => {
                    const sel = (ef.participantes ?? participantesAtivos.map(x => x.id)).includes(p.id)
                    return (
                      <button key={p.id} type="button" onClick={() => toggleParticipante(p.id)}
                        className={`px-2.5 py-1 rounded-full text-sm border transition-colors ${sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                        {p.nome.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <SeletorLembretes
              value={ef.lembretes ?? (ev.lembretes_minutos?.length ? ev.lembretes_minutos : (ev.lembrete_minutos != null ? [ev.lembrete_minutos] : []))}
              onChange={v => setEf(f => ({ ...f, lembretes: v }))}
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setEditando(false); setEf({}) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarEdicao} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

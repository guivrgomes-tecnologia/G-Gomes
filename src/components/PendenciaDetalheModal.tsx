import { useEffect, useRef, useState } from 'react'
import { X, ArrowRight, Pencil, CheckSquare, Square, Trash2, Lightbulb, Send, MessageSquare, Image as ImageIcon, Reply } from 'lucide-react'
import { supabase, Pendencia, Profile, Setor, PendenciaTarefa, PendenciaComentario, PendenciaLeitura, criarNotificacoes } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadImagemChat } from '../lib/chatHelpers'

export const STATUS_LABELS: Record<Pendencia['status'], string> = {
  aberta: 'A resolver',
  em_andamento: 'Em andamento',
  solucao_apresentada: 'Solução apresentada',
  resolvida: 'Resolvida',
}
export const STATUS_COLORS: Record<Pendencia['status'], string> = {
  aberta: 'bg-red-100 text-red-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  solucao_apresentada: 'bg-purple-100 text-purple-700',
  resolvida: 'bg-green-100 text-green-700',
}
export const PRIO_COLORS: Record<Pendencia['prioridade'], string> = {
  baixa: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-red-100 text-red-700',
}
export const STATUS_ORDER: Pendencia['status'][] = ['aberta', 'em_andamento', 'solucao_apresentada', 'resolvida']

export const PENDENCIA_COR = '#1e293b'

function formatPrazo(prazo: string) {
  const d = prazo.includes('T') ? new Date(prazo) : new Date(prazo + 'T12:00:00')
  return prazo.includes('T')
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR')
}

function parsePrazo(prazo: string) { return new Date(prazo.includes('T') ? prazo : prazo + 'T23:59:59') }

export default function PendenciaDetalheModal({ pendenciaId, onClose, onEditar, onChanged }: {
  pendenciaId: string
  onClose: () => void
  onEditar: (pend: Pendencia) => void
  onChanged?: () => void
}) {
  const { user, profile } = useAuth()
  const [pend, setPend] = useState<Pendencia | null>(null)
  const [tarefas, setTarefas] = useState<PendenciaTarefa[]>([])
  const [comentarios, setComentarios] = useState<PendenciaComentario[]>([])
  const fimComentariosRef = useRef<HTMLDivElement>(null)
  const [leituras, setLeituras] = useState<PendenciaLeitura[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [respondendoTarefa, setRespondendoTarefa] = useState<PendenciaTarefa | null>(null)
  const [novoComentario, setNovoComentario] = useState('')
  const [enviandoComentario, setEnviandoComentario] = useState(false)
  const [imagemSelecionada, setImagemSelecionada] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [arrastandoImagem, setArrastandoImagem] = useState(false)
  const inputImagemRef = useRef<HTMLInputElement>(null)
  const [solucaoTexto, setSolucaoTexto] = useState('')
  const [editandoSolucao, setEditandoSolucao] = useState(false)

  useEffect(() => { carregarTudo() }, [pendenciaId])

  useEffect(() => {
    fimComentariosRef.current?.scrollIntoView({ block: 'end' })
  }, [comentarios])

  useEffect(() => {
    const channel = supabase.channel('pendencia-detalhe-' + pendenciaId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencia_comentarios', filter: `pendencia_id=eq.${pendenciaId}` }, () => carregarComentarios())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencia_leituras', filter: `pendencia_id=eq.${pendenciaId}` }, () => carregarLeituras())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencia_tarefas', filter: `pendencia_id=eq.${pendenciaId}` }, () => carregarTarefas())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pendencias', filter: `id=eq.${pendenciaId}` }, () => carregarPendencia())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pendenciaId])

  async function carregarTudo() {
    await Promise.all([carregarPendencia(), carregarTarefas(), carregarComentarios(), carregarLeituras()])
    marcarComoLido()
  }

  async function carregarPendencia() {
    const { data } = await supabase.from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*), setor:setores(*), pendencia_participantes(usuario_id, profile:profiles(*))')
      .eq('id', pendenciaId).single()
    if (data) {
      setPend(data)
      if (data.solucao) setSolucaoTexto(data.solucao)
    }
  }

  async function carregarTarefas() {
    const { data } = await supabase.from('pendencia_tarefas').select('*').eq('pendencia_id', pendenciaId).order('ordem')
    setTarefas(data ?? [])
  }

  async function carregarComentarios() {
    const { data } = await supabase.from('pendencia_comentarios')
      .select('*, autor:profiles(*)').eq('pendencia_id', pendenciaId).order('created_at')
    setComentarios(data ?? [])
  }

  async function carregarLeituras() {
    const { data } = await supabase.from('pendencia_leituras').select('*').eq('pendencia_id', pendenciaId)
    setLeituras(data ?? [])
  }

  async function marcarComoLido() {
    await supabase.from('pendencia_leituras')
      .upsert({ pendencia_id: pendenciaId, usuario_id: user!.id, lido_em: new Date().toISOString() }, { onConflict: 'pendencia_id,usuario_id' })
    carregarLeituras()
  }

  function isParticipante() {
    if (!pend) return false
    const parts = (pend.pendencia_participantes ?? []) as any[]
    if (parts.length > 0) return parts.some(p => p.usuario_id === user?.id)
    return pend.para_usuario_id === user?.id
  }

  async function adicionarTarefa() {
    const texto = novaTarefa.trim()
    if (!texto) return
    await supabase.from('pendencia_tarefas').insert({ pendencia_id: pendenciaId, texto, ordem: tarefas.length })
    setNovaTarefa('')
    carregarTarefas()
  }

  async function toggleTarefa(tarefa: PendenciaTarefa) {
    await supabase.from('pendencia_tarefas').update({ concluida: !tarefa.concluida }).eq('id', tarefa.id)
    carregarTarefas()
  }

  async function deletarTarefa(tarefa: PendenciaTarefa) {
    await supabase.from('pendencia_tarefas').delete().eq('id', tarefa.id)
    carregarTarefas()
  }

  function selecionarImagem(file: File | null) {
    setImagemSelecionada(file)
    setImagemPreview(file ? URL.createObjectURL(file) : null)
  }

  async function enviarComentario() {
    const texto = novoComentario.trim()
    if (!texto && !imagemSelecionada) return
    if (!pend) return
    setEnviandoComentario(true)

    let imagemUrl: string | null = null
    if (imagemSelecionada) {
      imagemUrl = await uploadImagemChat(imagemSelecionada, `pendencias/${pendenciaId}`)
      if (!imagemUrl) { setEnviandoComentario(false); return }
    }

    await supabase.from('pendencia_comentarios').insert({
      pendencia_id: pendenciaId, autor_id: user!.id, mensagem: texto, imagem_url: imagemUrl,
      tarefa_id: respondendoTarefa?.id ?? null, tarefa_texto: respondendoTarefa?.texto ?? null,
    })

    const participantes = (pend.pendencia_participantes ?? []) as any[]
    const envolvidos = Array.from(new Set([
      pend.de_usuario_id,
      ...(participantes.length > 0 ? participantes.map((p: any) => p.usuario_id) : [pend.para_usuario_id]),
    ])).filter((id): id is string => !!id && id !== user!.id)
    await criarNotificacoes(envolvidos.map(uid => ({
      usuario_id: uid, tipo: 'pendencia_comentario',
      titulo: `Novo comentário em "${pend.titulo}"`,
      mensagem: `${profile?.nome ?? 'Alguém'}: ${texto || '📷 Imagem'}`,
      link: `/pendencias?abrir=${pendenciaId}`,
    })))

    setNovoComentario('')
    setRespondendoTarefa(null)
    selecionarImagem(null)
    await carregarComentarios()
    await marcarComoLido()
    setEnviandoComentario(false)
  }

  async function atualizarStatus(status: Pendencia['status']) {
    await supabase.from('pendencias').update({ status, updated_at: new Date().toISOString() }).eq('id', pendenciaId)
    if (pend?.evento_id) {
      await supabase.from('eventos').update({ concluido: status === 'resolvida' }).eq('id', pend.evento_id)
    }
    await carregarPendencia()
    onChanged?.()
  }

  async function salvarSolucao() {
    const texto = solucaoTexto.trim()
    await supabase.from('pendencias').update({
      solucao: texto || null, status: 'solucao_apresentada', updated_at: new Date().toISOString(),
    }).eq('id', pendenciaId)
    setEditandoSolucao(false)
    await carregarPendencia()
    onChanged?.()
  }

  async function removerSolucao() {
    await supabase.from('pendencias').update({ solucao: null, status: 'em_andamento' }).eq('id', pendenciaId)
    await carregarPendencia()
    onChanged?.()
  }

  async function deletar() {
    if (!pend) return
    if (!podeDeletar) return
    if (!confirm('Deletar esta pendência? Ela será removida das listas e agendas de todos os marcados.')) return
    if (pend.evento_id) {
      const { data: evento } = await supabase.from('eventos').select('google_event_id').eq('id', pend.evento_id).single()
      if (evento?.google_event_id) {
        await supabase.functions.invoke('google-calendar-sync', {
          body: { action: 'delete', user_id: pend.criado_por, evento: { google_event_id: evento.google_event_id } },
        })
      }
      await supabase.from('eventos').delete().eq('id', pend.evento_id)
    }
    const { error } = await supabase.from('pendencias').delete().eq('id', pendenciaId)
    if (error) {
      alert('Não foi possível apagar: ' + error.message)
      return
    }
    onChanged?.()
    onClose()
  }

  if (!pend) return null

  const de = pend.de_usuario as Profile | undefined
  const setor = pend.setor as Setor | undefined
  const participantes = (pend.pendencia_participantes ?? []) as any[]
  const destinatarios: Profile[] = participantes.length > 0
    ? participantes.map((p: any) => p.profile).filter(Boolean)
    : (pend.para_usuario ? [pend.para_usuario as Profile] : [])
  const euSouDestinatario = isParticipante()
  const podeDarSolucao = euSouDestinatario && pend.status !== 'resolvida'
  const podeDeletar = pend.de_usuario_id === user?.id || !!profile?.is_admin
  const atrasado = !!pend.prazo && parsePrazo(pend.prazo) < new Date() && pend.status !== 'resolvida'
  const total = tarefas.length
  const concluidas = tarefas.filter(t => t.concluida).length
  const outrosIds = Array.from(new Set([
    pend.de_usuario_id,
    ...(participantes.length > 0 ? participantes.map((p: any) => p.usuario_id) : [pend.para_usuario_id]),
  ])).filter(id => id && id !== user?.id)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900 text-lg">{pend.titulo}</p>
                {atrasado && <span className="badge bg-red-100 text-red-700">Atrasado</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className={`badge ${STATUS_COLORS[pend.status]}`}>{STATUS_LABELS[pend.status]}</span>
                <span className={`badge ${PRIO_COLORS[pend.prioridade]}`}>{pend.prioridade}</span>
                {de && destinatarios.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{de.nome.split(' ')[0]}</span>
                    <ArrowRight size={10} />
                    <span className="font-medium text-gray-700">{destinatarios.map(p => p.nome.split(' ')[0]).join(', ')}</span>
                  </span>
                )}
                {setor && <span className="badge" style={{ backgroundColor: setor.cor + '22', color: setor.cor }}>{setor.nome}</span>}
                {pend.prazo && <span className="badge bg-gray-100 text-gray-600">📅 {formatPrazo(pend.prazo)}</span>}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={20} /></button>
          </div>

          {pend.descricao && <p className="text-sm text-gray-600">{pend.descricao}</p>}

          {/* Solução apresentada */}
          {(pend.status === 'solucao_apresentada' || pend.solucao) && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} /> Solução apresentada
              </p>
              {editandoSolucao ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full text-sm border border-purple-300 rounded-lg p-2 resize-none focus:outline-none focus:border-purple-500 min-h-[80px] bg-white"
                    value={solucaoTexto}
                    onChange={e => setSolucaoTexto(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setEditandoSolucao(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                    <button onClick={salvarSolucao} className="text-xs py-1.5 flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">Salvar solução</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="text-sm text-purple-900 flex-1 whitespace-pre-wrap">{pend.solucao || 'Solução registrada.'}</p>
                  {euSouDestinatario && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditandoSolucao(true); setSolucaoTexto(pend.solucao ?? '') }}
                        className="text-purple-400 hover:text-purple-700"><Pencil size={13} /></button>
                      <button onClick={removerSolucao} className="text-purple-400 hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Campo para apresentar solução */}
          {podeDarSolucao && pend.status !== 'solucao_apresentada' && editandoSolucao && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5"><Lightbulb size={13} /> Apresentar solução</p>
              <textarea
                className="w-full text-sm border border-purple-300 rounded-lg p-2 resize-none focus:outline-none focus:border-purple-500 min-h-[80px] bg-white"
                placeholder="Descreva a solução encontrada..."
                value={solucaoTexto}
                onChange={e => setSolucaoTexto(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setEditandoSolucao(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                <button onClick={salvarSolucao} className="text-xs py-1.5 flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">Salvar solução</button>
              </div>
            </div>
          )}

          {/* Lista de tarefas */}
          <div className="space-y-1.5">
            {total > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-medium text-gray-500">Tarefas</p>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${total === 0 ? 0 : (concluidas / total) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-400">{concluidas}/{total}</span>
              </div>
            )}
            {tarefas.map(t => (
              <div key={t.id} className="flex items-center gap-2 group">
                <button onClick={() => toggleTarefa(t)} className="shrink-0 text-gray-400 hover:text-green-600 transition-colors">
                  {t.concluida ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} />}
                </button>
                <span className={`flex-1 text-sm ${t.concluida ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.texto}</span>
                <button onClick={() => setRespondendoTarefa(t)} title="Responder esta tarefa no chat"
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-brand-600 transition-all">
                  <Reply size={13} />
                </button>
                <button onClick={() => deletarTarefa(t)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <input
                className="flex-1 text-sm border-b border-gray-200 focus:border-brand-400 outline-none py-1 bg-transparent placeholder-gray-300"
                placeholder="+ Adicionar tarefa"
                value={novaTarefa}
                onChange={e => setNovaTarefa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarTarefa()}
              />
              {novaTarefa.trim() && (
                <button onClick={adicionarTarefa} className="text-xs text-brand-600 font-medium hover:underline">Adicionar</button>
              )}
            </div>
          </div>

          {/* Rastro de criação */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>Criado por</span>
            <span className="font-medium text-gray-500">{de?.nome ?? 'Desconhecido'}</span>
            <span>•</span>
            <span>{new Date(pend.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {podeDarSolucao && pend.status !== 'solucao_apresentada' && !editandoSolucao && (
              <button onClick={() => { setEditandoSolucao(true); setSolucaoTexto('') }}
                className="text-xs px-2.5 py-1 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 flex items-center gap-1 transition-colors">
                <Lightbulb size={12} /> Apresentar solução
              </button>
            )}
            {STATUS_ORDER.filter(s => s !== pend.status && s !== 'solucao_apresentada').map(s => (
              <button key={s} onClick={() => atualizarStatus(s)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
                → {STATUS_LABELS[s]}
              </button>
            ))}
            <button onClick={() => onEditar(pend)}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1 transition-colors">
              <Pencil size={12} /> Editar
            </button>
            {podeDeletar && (
              <button onClick={deletar} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto">
                Deletar
              </button>
            )}
          </div>

          {/* Chat interno */}
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
                const visto = souEu && outrosIds.some(id => leituras.some(l => l.usuario_id === id && l.lido_em >= c.created_at))
                return (
                  <div key={c.id} className={`flex ${souEu ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${souEu ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      <p className="text-xs font-semibold mb-0.5 opacity-70">{souEu ? 'Você' : autor?.nome ?? 'Desconhecido'}</p>
                      {c.tarefa_texto && (
                        <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 mb-1.5 border-l-2 ${souEu ? 'bg-white/15 border-white/50' : 'bg-white border-brand-400'}`}>
                          <CheckSquare size={11} className={souEu ? 'text-white/70 shrink-0' : 'text-brand-500 shrink-0'} />
                          <p className={`text-xs truncate ${souEu ? 'text-white/80' : 'text-gray-500'}`}>{c.tarefa_texto}</p>
                        </div>
                      )}
                      {c.imagem_url && (
                        <a href={c.imagem_url} target="_blank" rel="noopener noreferrer">
                          <img src={c.imagem_url} alt="Imagem" className="rounded-lg max-w-full max-h-60 mb-1 object-contain" />
                        </a>
                      )}
                      {c.mensagem && <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>}
                      <div className={`flex items-center gap-1 mt-0.5 ${souEu ? 'justify-end' : ''}`}>
                        <p className={`text-[10px] ${souEu ? 'text-white/70' : 'text-gray-400'}`}>
                          {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {souEu && (
                          <span className={`text-[11px] ${visto ? 'text-sky-300' : 'text-white/60'}`} title={visto ? 'Visto' : 'Enviado'}>
                            {visto ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={fimComentariosRef} />
            </div>
            {respondendoTarefa && (
              <div className="flex items-center gap-2 bg-gray-50 border-l-2 border-brand-500 rounded-lg px-2.5 py-1.5 mb-2">
                <Reply size={13} className="text-brand-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-brand-600">Respondendo à tarefa</p>
                  <p className={`text-xs truncate ${respondendoTarefa.concluida ? 'line-through text-gray-400' : 'text-gray-600'}`}>{respondendoTarefa.texto}</p>
                </div>
                <button onClick={() => setRespondendoTarefa(null)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={14} /></button>
              </div>
            )}
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
        </div>
      </div>
    </div>
  )
}

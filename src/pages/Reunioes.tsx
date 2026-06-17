import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ReuniaPasta, Reuniao, Pendencia, Profile } from '../lib/supabase'
import { Plus, FolderOpen, Folder, ChevronRight, ChevronLeft, Calendar, Trash2, X, Edit2, Link2, MapPin, Video, MessageCircle, Copy, ClipboardList, ChevronDown, ExternalLink, Users } from 'lucide-react'

const CORES = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']

export default function Reunioes() {
  const { user } = useAuth()
  const [pastas, setPastas] = useState<ReuniaPasta[]>([])
  const [pastaSelecionada, setPastaSelecionada] = useState<ReuniaPasta | null>(null)
  const [reunioes, setReunioes] = useState<Reuniao[]>([])
  const [reuniaoAberta, setReuniaoAberta] = useState<Reuniao | null>(null)
  const [saving, setSaving] = useState(false)

  // Pautas fixas
  const [showPautasFixas, setShowPautasFixas] = useState(false)
  const [editPautasFixas, setEditPautasFixas] = useState('')
  const [copiado, setCopiado] = useState(false)

  // Participantes
  const [participantes, setParticipantes] = useState<Profile[]>([])
  const [showAddParticipante, setShowAddParticipante] = useState(false)
  const [participanteParaAdicionar, setParticipanteParaAdicionar] = useState('')

  // Pendências vinculadas
  const [pendenciasVinculadas, setPendenciasVinculadas] = useState<Pendencia[]>([])
  const [todasPendencias, setTodasPendencias] = useState<Pendencia[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [showLinkPendencia, setShowLinkPendencia] = useState(false)
  const [showNovaPendencia, setShowNovaPendencia] = useState(false)
  const [formPendencia, setFormPendencia] = useState({ titulo: '', para_usuario_id: '', prioridade: 'media' as 'baixa' | 'media' | 'alta' })
  const [pendenciaParaLinkar, setPendenciaParaLinkar] = useState('')

  const [showNovaPasta, setShowNovaPasta] = useState(false)
  const [showNovaReuniao, setShowNovaReuniao] = useState(false)
  const [nomePasta, setNomePasta] = useState('')
  const [corPasta, setCorPasta] = useState(CORES[0])

  const [formReuniao, setFormReuniao] = useState({ titulo: '', data: '', hora: '', tipo: 'presencial' as 'presencial' | 'online' })

  const [editPauta, setEditPauta] = useState('')
  const [editTranscricao, setEditTranscricao] = useState('')
  const [editTitulo, setEditTitulo] = useState('')
  const [editData, setEditData] = useState('')
  const [editHora, setEditHora] = useState('')
  const [editTipo, setEditTipo] = useState<'presencial' | 'online'>('presencial')
  const [editLinkVideo, setEditLinkVideo] = useState('')
  const [editandoCabecalho, setEditandoCabecalho] = useState(false)

  const loadPastas = useCallback(async () => {
    const { data } = await supabase.from('reuniao_pastas').select('*').order('created_at')
    setPastas(data ?? [])
  }, [])

  const loadReunioes = useCallback(async (pastaId: string) => {
    const { data } = await supabase.from('reunioes').select('*').eq('pasta_id', pastaId).order('created_at', { ascending: false })
    setReunioes(data ?? [])
  }, [])

  const loadParticipantes = useCallback(async (reuniaoId: string) => {
    const { data } = await supabase
      .from('reuniao_participantes')
      .select('usuario_id, profile:profiles(*)')
      .eq('reuniao_id', reuniaoId)
    setParticipantes((data ?? []).map((d: any) => d.profile).filter(Boolean))
  }, [])

  const loadPendenciasVinculadas = useCallback(async (reuniaoId: string) => {
    const { data } = await supabase
      .from('reuniao_pendencias')
      .select('pendencia_id, pendencia:pendencias(*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*))')
      .eq('reuniao_id', reuniaoId)
    setPendenciasVinculadas((data ?? []).map((d: any) => d.pendencia).filter(Boolean))
  }, [])

  useEffect(() => { loadPastas() }, [loadPastas])

  useEffect(() => {
    if (pastaSelecionada) {
      loadReunioes(pastaSelecionada.id)
      setEditPautasFixas(pastaSelecionada.pautas_fixas ?? '')
    } else {
      setReunioes([])
    }
  }, [pastaSelecionada, loadReunioes])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').then(({ data }) => setEquipe(data ?? []))
    supabase.from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*)')
      .neq('status', 'resolvida')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTodasPendencias(data ?? []))
  }, [user])

  async function criarPasta() {
    if (!nomePasta.trim()) return
    setSaving(true)
    await supabase.from('reuniao_pastas').insert({ nome: nomePasta.trim(), cor: corPasta, criado_por: user!.id })
    setNomePasta(''); setCorPasta(CORES[0]); setShowNovaPasta(false)
    await loadPastas()
    setSaving(false)
  }

  async function deletarPasta(id: string) {
    if (!confirm('Apagar pasta e todas as reuniões dentro dela?')) return
    await supabase.from('reuniao_pastas').delete().eq('id', id)
    if (pastaSelecionada?.id === id) setPastaSelecionada(null)
    await loadPastas()
  }

  async function salvarPautasFixas() {
    if (!pastaSelecionada) return
    await supabase.from('reuniao_pastas').update({ pautas_fixas: editPautasFixas || null }).eq('id', pastaSelecionada.id)
    setPastaSelecionada({ ...pastaSelecionada, pautas_fixas: editPautasFixas || null })
    await loadPastas()
  }

  function copiarPautasFixas() {
    if (!editPautasFixas) return
    navigator.clipboard.writeText(editPautasFixas)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function criarReuniao() {
    if (!formReuniao.titulo.trim() || !pastaSelecionada) return
    setSaving(true)
    let data: string | null = null
    if (formReuniao.data) {
      data = formReuniao.hora
        ? new Date(`${formReuniao.data}T${formReuniao.hora}`).toISOString()
        : formReuniao.data
    }
    const { data: inserted } = await supabase.from('reunioes').insert({
      titulo: formReuniao.titulo.trim(), data, tipo: formReuniao.tipo,
      pasta_id: pastaSelecionada.id, criado_por: user!.id,
    }).select().single()
    setFormReuniao({ titulo: '', data: '', hora: '', tipo: 'presencial' })
    setShowNovaReuniao(false)
    await loadReunioes(pastaSelecionada.id)
    if (inserted) abrirReuniao(inserted)
    setSaving(false)
  }

  function abrirReuniao(r: Reuniao) {
    setReuniaoAberta(r)
    setEditPauta(r.pauta ?? '')
    setEditTranscricao(r.transcricao ?? '')
    setEditTitulo(r.titulo)
    setEditTipo(r.tipo ?? 'presencial')
    setEditLinkVideo(r.link_video ?? '')
    const d = r.data ? new Date(r.data) : null
    setEditData(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')
    setEditHora(d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '')
    setEditandoCabecalho(false)
    setShowAddParticipante(false)
    setParticipanteParaAdicionar('')
    loadPendenciasVinculadas(r.id)
    loadParticipantes(r.id)
  }

  async function salvarReuniao() {
    if (!reuniaoAberta) return
    setSaving(true)
    let data: string | null = null
    if (editData) {
      data = editHora ? new Date(`${editData}T${editHora}`).toISOString() : editData
    }
    const { data: updated } = await supabase.from('reunioes').update({
      titulo: editTitulo, data, tipo: editTipo,
      link_video: editTipo === 'online' ? (editLinkVideo || null) : null,
      pauta: editPauta || null, transcricao: editTranscricao || null,
      updated_at: new Date().toISOString(),
    }).eq('id', reuniaoAberta.id).select().single()
    setEditandoCabecalho(false)
    if (updated) setReuniaoAberta(updated)
    if (pastaSelecionada) await loadReunioes(pastaSelecionada.id)
    setSaving(false)
  }

  async function lancarNaAgenda() {
    if (!reuniaoAberta || !pastaSelecionada) return
    setSaving(true)
    const dataInicio = reuniaoAberta.data ?? new Date().toISOString()
    const descricao = [pastaSelecionada.nome, reuniaoAberta.pauta].filter(Boolean).join(' · ') || null
    const { data: ev } = await supabase.from('eventos').insert({
      titulo: reuniaoAberta.titulo, descricao,
      data_inicio: dataInicio, dia_inteiro: !reuniaoAberta.data?.includes('T'),
      cor: pastaSelecionada.cor, concluido: false, criado_por: user!.id,
    }).select('id').single()
    if (ev) {
      await supabase.from('reunioes').update({ evento_id: ev.id }).eq('id', reuniaoAberta.id)
      setReuniaoAberta({ ...reuniaoAberta, evento_id: ev.id })
    }
    setSaving(false)
    alert('Evento criado na agenda!')
  }

  async function duplicarReuniao() {
    if (!reuniaoAberta || !pastaSelecionada) return
    setSaving(true)
    const { data: nova } = await supabase.from('reunioes').insert({
      titulo: `${reuniaoAberta.titulo} (cópia)`, pasta_id: reuniaoAberta.pasta_id,
      tipo: reuniaoAberta.tipo, link_video: reuniaoAberta.link_video, criado_por: user!.id,
    }).select().single()
    await loadReunioes(pastaSelecionada.id)
    if (nova) abrirReuniao(nova)
    setSaving(false)
  }

  async function deletarReuniao(id: string) {
    if (!confirm('Apagar esta reunião?')) return
    await supabase.from('reunioes').delete().eq('id', id)
    if (reuniaoAberta?.id === id) setReuniaoAberta(null)
    if (pastaSelecionada) await loadReunioes(pastaSelecionada.id)
  }

  async function linkarPendencia() {
    if (!reuniaoAberta || !pendenciaParaLinkar) return
    await supabase.from('reuniao_pendencias').insert({ reuniao_id: reuniaoAberta.id, pendencia_id: pendenciaParaLinkar })
    setPendenciaParaLinkar('')
    setShowLinkPendencia(false)
    await loadPendenciasVinculadas(reuniaoAberta.id)
  }

  async function deslinkarPendencia(pendenciaId: string) {
    if (!reuniaoAberta) return
    await supabase.from('reuniao_pendencias').delete().eq('reuniao_id', reuniaoAberta.id).eq('pendencia_id', pendenciaId)
    await loadPendenciasVinculadas(reuniaoAberta.id)
  }

  async function criarPendenciaNaReuniao() {
    if (!reuniaoAberta || !formPendencia.titulo.trim() || !formPendencia.para_usuario_id) return
    setSaving(true)
    const { data: pend } = await supabase.from('pendencias').insert({
      titulo: formPendencia.titulo.trim(), status: 'aberta',
      prioridade: formPendencia.prioridade,
      de_usuario_id: user!.id, para_usuario_id: formPendencia.para_usuario_id,
      criado_por: user!.id,
    }).select().single()
    if (pend) {
      await supabase.from('reuniao_pendencias').insert({ reuniao_id: reuniaoAberta.id, pendencia_id: pend.id })
      await loadPendenciasVinculadas(reuniaoAberta.id)
    }
    setFormPendencia({ titulo: '', para_usuario_id: '', prioridade: 'media' })
    setShowNovaPendencia(false)
    setSaving(false)
  }

  async function adicionarParticipante() {
    if (!reuniaoAberta || !participanteParaAdicionar) return
    await supabase.from('reuniao_participantes').insert({ reuniao_id: reuniaoAberta.id, usuario_id: participanteParaAdicionar })
    setParticipanteParaAdicionar('')
    setShowAddParticipante(false)
    await loadParticipantes(reuniaoAberta.id)
  }

  async function removerParticipante(usuarioId: string) {
    if (!reuniaoAberta) return
    await supabase.from('reuniao_participantes').delete().eq('reuniao_id', reuniaoAberta.id).eq('usuario_id', usuarioId)
    await loadParticipantes(reuniaoAberta.id)
  }

  function abrirWhatsApp() {
    if (!reuniaoAberta) return
    const titulo = reuniaoAberta.titulo
    const data = reuniaoAberta.data ? formatData(reuniaoAberta.data) : 'a definir'
    const tipo = reuniaoAberta.tipo === 'online' ? 'Online' : 'Presencial'
    const link = reuniaoAberta.tipo === 'online' && reuniaoAberta.link_video ? `\n🔗 Link: ${reuniaoAberta.link_video}` : ''
    const pauta = reuniaoAberta.pauta ? `\n\n📋 Pauta:\n${reuniaoAberta.pauta}` : ''
    const msg = `📅 *Lembrete de Reunião*\n\n*${titulo}*\n🗓 Data: ${data}\n📍 Tipo: ${tipo}${link}${pauta}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function formatData(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const prioridadeCor: Record<string, string> = { baixa: 'bg-green-100 text-green-700', media: 'bg-yellow-100 text-yellow-700', alta: 'bg-red-100 text-red-700' }
  const pendenciasNaoVinculadas = todasPendencias.filter(p => !pendenciasVinculadas.find(v => v.id === p.id))

  // Mobile: passo atual (pastas → reunioes → detalhe)
  const passoMobile = reuniaoAberta ? 2 : pastaSelecionada ? 1 : 0

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Painel de pastas */}
      <div className={`${passoMobile !== 0 ? 'hidden lg:flex' : 'flex'} w-full lg:w-64 bg-white border-r border-gray-200 flex-col`}>
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Reuniões</h2>
          <button onClick={() => setShowNovaPasta(true)} className="text-brand-600 hover:text-brand-800" title="Nova pasta">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {pastas.length === 0 && <p className="text-sm text-gray-400 px-4 py-3">Nenhuma pasta ainda.</p>}
          {pastas.map(p => (
            <div key={p.id} className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg mx-1"
              style={{ borderLeft: pastaSelecionada?.id === p.id ? `3px solid ${p.cor}` : '3px solid transparent' }}
              onClick={() => setPastaSelecionada(pastaSelecionada?.id === p.id ? null : p)}>
              <span style={{ color: p.cor }}>{pastaSelecionada?.id === p.id ? <FolderOpen size={16} /> : <Folder size={16} />}</span>
              <span className="flex-1 text-sm text-gray-700 truncate">{p.nome}</span>
              <button onClick={e => { e.stopPropagation(); deletarPasta(p.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity">
                <Trash2 size={14} />
              </button>
              <ChevronRight size={14} className={`text-gray-400 transition-transform ${pastaSelecionada?.id === p.id ? 'rotate-90' : ''}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Lista de reuniões */}
      <div className={`${passoMobile !== 1 ? 'hidden lg:flex' : 'flex'} w-full lg:w-72 bg-white border-r border-gray-200 flex-col`}>
        {!pastaSelecionada ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
            Selecione uma pasta para ver as reuniões
          </div>
        ) : (
          <>
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setPastaSelecionada(null)} className="lg:hidden p-1 hover:bg-gray-100 rounded-lg text-gray-500">
                  <ChevronLeft size={18} />
                </button>
                <span style={{ color: pastaSelecionada.cor }}><FolderOpen size={16} /></span>
                <h3 className="font-medium text-gray-800 text-sm truncate">{pastaSelecionada.nome}</h3>
              </div>
              <button onClick={() => setShowNovaReuniao(true)} className="text-brand-600 hover:text-brand-800" title="Nova reunião">
                <Plus size={18} />
              </button>
            </div>

            {/* Pautas fixas */}
            <div className="border-b border-gray-100">
              <button onClick={() => setShowPautasFixas(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <span className="flex items-center gap-2"><ClipboardList size={14} /> Pautas fixas</span>
                <ChevronDown size={14} className={`transition-transform ${showPautasFixas ? 'rotate-180' : ''}`} />
              </button>
              {showPautasFixas && (
                <div className="px-4 pb-3 space-y-2">
                  <textarea
                    className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:border-brand-400 min-h-[100px]"
                    placeholder="Pautas recorrentes desta categoria..."
                    value={editPautasFixas}
                    onChange={e => setEditPautasFixas(e.target.value)}
                    onBlur={salvarPautasFixas}
                  />
                  <button onClick={copiarPautasFixas} disabled={!editPautasFixas}
                    className="w-full text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                    <Copy size={12} /> {copiado ? 'Copiado!' : 'Copiar pautas'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {reunioes.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">Nenhuma reunião ainda.</p>
                  <button onClick={() => setShowNovaReuniao(true)} className="text-sm text-brand-600 hover:underline">+ Nova reunião</button>
                </div>
              )}
              {reunioes.map(r => (
                <div key={r.id}
                  className={`group mx-2 mb-1 px-3 py-3 rounded-lg cursor-pointer border transition-colors ${reuniaoAberta?.id === r.id ? 'bg-brand-50 border-brand-200' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => abrirReuniao(r)}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium text-gray-800 truncate flex-1">{r.titulo}</p>
                    <button onClick={e => { e.stopPropagation(); deletarReuniao(r.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 mt-0.5 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{r.data ? formatData(r.data) : 'Sem data'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {r.tipo === 'online'
                      ? <span className="text-xs text-blue-500 flex items-center gap-0.5"><Video size={11} /> Online</span>
                      : <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={11} /> Presencial</span>}
                    {r.evento_id && <span className="text-xs text-green-600">✓ Agenda</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhe da reunião */}
      <div className={`${passoMobile !== 2 ? 'hidden lg:flex' : 'flex'} flex-1 overflow-y-auto flex-col`}>
        {!reuniaoAberta ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Selecione uma reunião para abrir
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4 lg:py-6 w-full">
            {/* Cabeçalho */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setReuniaoAberta(null)} className="lg:hidden p-1 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0">
                    <ChevronLeft size={18} />
                  </button>
                  {editandoCabecalho ? (
                    <input className="input text-lg font-semibold flex-1" value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
                  ) : (
                    <h1 className="text-xl font-bold text-gray-900 flex-1">{reuniaoAberta.titulo}</h1>
                  )}
                </div>
                <button onClick={() => setEditandoCabecalho(v => !v)} className="text-gray-400 hover:text-gray-600 ml-2">
                  <Edit2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Categoria</label>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: pastaSelecionada?.cor }}>
                    {pastaSelecionada?.nome}
                  </span>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Data</label>
                  {editandoCabecalho ? (
                    <div className="flex gap-2">
                      <input type="date" className="input text-sm py-1" value={editData} onChange={e => setEditData(e.target.value)} />
                      <input type="time" className="input text-sm py-1" value={editHora} onChange={e => setEditHora(e.target.value)} />
                    </div>
                  ) : (
                    <span className="text-gray-700">{reuniaoAberta.data ? formatData(reuniaoAberta.data) : '—'}</span>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                  {editandoCabecalho ? (
                    <div className="flex gap-2">
                      <button onClick={() => setEditTipo('presencial')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${editTipo === 'presencial' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                        <MapPin size={13} /> Presencial
                      </button>
                      <button onClick={() => setEditTipo('online')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${editTipo === 'online' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                        <Video size={13} /> Online
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${reuniaoAberta.tipo === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                      {reuniaoAberta.tipo === 'online' ? <><Video size={12} /> Online</> : <><MapPin size={12} /> Presencial</>}
                    </span>
                  )}
                </div>
              </div>
              {editandoCabecalho && editTipo === 'online' && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 block mb-1">Link da videochamada</label>
                  <input className="input text-sm" placeholder="https://meet.google.com/..." value={editLinkVideo} onChange={e => setEditLinkVideo(e.target.value)} />
                </div>
              )}
              {!editandoCabecalho && reuniaoAberta.tipo === 'online' && reuniaoAberta.link_video && (
                <div className="mt-3">
                  <a href={reuniaoAberta.link_video} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors">
                    <Link2 size={14} /> Entrar na videochamada
                  </a>
                </div>
              )}
              {editandoCabecalho && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setEditandoCabecalho(false)} className="btn-secondary text-sm py-1.5">Cancelar</button>
                  <button onClick={salvarReuniao} disabled={saving} className="btn-primary text-sm py-1.5">Salvar</button>
                </div>
              )}
            </div>

            {/* Pauta */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Pauta / Organização</h2>
              <textarea className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[160px]"
                placeholder="Organize os tópicos da reunião aqui..."
                value={editPauta} onChange={e => setEditPauta(e.target.value)} onBlur={salvarReuniao} />
            </div>

            {/* Pendências */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ClipboardList size={15} /> Pendências da reunião
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => { setShowLinkPendencia(true); setShowNovaPendencia(false) }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                    Vincular existente
                  </button>
                  <button onClick={() => { setShowNovaPendencia(true); setShowLinkPendencia(false) }}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                    <Plus size={12} /> Nova
                  </button>
                </div>
              </div>

              {/* Vincular existente */}
              {showLinkPendencia && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                  <select className="input text-sm" value={pendenciaParaLinkar} onChange={e => setPendenciaParaLinkar(e.target.value)}>
                    <option value="">Selecione uma pendência...</option>
                    {pendenciasNaoVinculadas.map(p => (
                      <option key={p.id} value={p.id}>{p.titulo}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setShowLinkPendencia(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                    <button onClick={linkarPendencia} disabled={!pendenciaParaLinkar} className="btn-primary text-xs py-1.5 flex-1">Vincular</button>
                  </div>
                </div>
              )}

              {/* Nova pendência */}
              {showNovaPendencia && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                  <input className="input text-sm" placeholder="Título da pendência *" value={formPendencia.titulo}
                    onChange={e => setFormPendencia(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                  <select className="input text-sm" value={formPendencia.para_usuario_id}
                    onChange={e => setFormPendencia(f => ({ ...f, para_usuario_id: e.target.value }))}>
                    <option value="">Para quem? *</option>
                    {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <select className="input text-sm" value={formPendencia.prioridade}
                    onChange={e => setFormPendencia(f => ({ ...f, prioridade: e.target.value as any }))}>
                    <option value="baixa">Baixa prioridade</option>
                    <option value="media">Média prioridade</option>
                    <option value="alta">Alta prioridade</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNovaPendencia(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                    <button onClick={criarPendenciaNaReuniao} disabled={saving || !formPendencia.titulo.trim() || !formPendencia.para_usuario_id} className="btn-primary text-xs py-1.5 flex-1">Criar</button>
                  </div>
                </div>
              )}

              {pendenciasVinculadas.length === 0 && !showLinkPendencia && !showNovaPendencia && (
                <p className="text-sm text-gray-400 py-2">Nenhuma pendência vinculada.</p>
              )}
              <div className="space-y-2">
                {pendenciasVinculadas.map(p => (
                  <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium text-gray-800 ${p.status === 'resolvida' ? 'line-through text-gray-400' : ''}`}>{p.titulo}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${prioridadeCor[p.prioridade]}`}>{p.prioridade}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.status === 'resolvida' ? '✓ Resolvida' : p.status === 'em_andamento' ? 'Em andamento' : 'Aberta'}
                        {p.para_usuario && <> · Para: {(p.para_usuario as Profile).nome.split(' ')[0]}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href="/pendencias" className="text-gray-400 hover:text-brand-600" title="Ver pendências">
                        <ExternalLink size={13} />
                      </a>
                      <button onClick={() => deslinkarPendencia(p.id)} className="text-gray-400 hover:text-red-500" title="Desvincular">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Participantes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users size={15} /> Participantes
                </h2>
                <button onClick={() => setShowAddParticipante(v => !v)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              {showAddParticipante && (
                <div className="mb-3 flex gap-2">
                  <select className="input text-sm flex-1" value={participanteParaAdicionar}
                    onChange={e => setParticipanteParaAdicionar(e.target.value)}>
                    <option value="">Selecione um usuário...</option>
                    {equipe.filter(p => p.id !== user!.id && !participantes.find(pt => pt.id === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <button onClick={adicionarParticipante} disabled={!participanteParaAdicionar}
                    className="btn-primary text-xs py-1.5 px-3">Confirmar</button>
                  <button onClick={() => setShowAddParticipante(false)} className="btn-secondary text-xs py-1.5 px-3">Cancelar</button>
                </div>
              )}
              {participantes.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum participante adicionado</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {participantes.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-sm text-gray-700">
                      <span>{p.nome.split(' ')[0]}</span>
                      <button onClick={() => removerParticipante(p.id)} className="text-gray-400 hover:text-red-500 ml-1">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Ações</h2>
              <div className="flex flex-wrap gap-3">
                {reuniaoAberta.evento_id ? (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium px-3 py-2 bg-green-50 rounded-lg">
                    <Calendar size={15} /> Na agenda
                  </span>
                ) : (
                  <button onClick={lancarNaAgenda} disabled={saving}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors">
                    <Calendar size={15} /> Lançar na agenda
                  </button>
                )}
                <button onClick={abrirWhatsApp}
                  className="flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
                  <MessageCircle size={15} /> Lembrete WhatsApp
                </button>
                <button onClick={duplicarReuniao} disabled={saving}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                  <Copy size={15} /> Duplicar
                </button>
              </div>
            </div>

            {/* Transcrição */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Transcrição</h2>
              <textarea className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[200px]"
                placeholder="Cole ou escreva a transcrição da reunião aqui..."
                value={editTranscricao} onChange={e => setEditTranscricao(e.target.value)} onBlur={salvarReuniao} />
            </div>
          </div>
        )}
      </div>

      {/* Modal nova pasta */}
      {showNovaPasta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova pasta</h3>
              <button onClick={() => setShowNovaPasta(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input className="input" placeholder="Ex: Comercial" value={nomePasta}
                  onChange={e => setNomePasta(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && criarPasta()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} onClick={() => setCorPasta(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${corPasta === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNovaPasta(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={criarPasta} disabled={saving || !nomePasta.trim()} className="btn-primary flex-1">Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova reunião */}
      {showNovaReuniao && pastaSelecionada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova reunião</h3>
              <button onClick={() => setShowNovaReuniao(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" placeholder="Ex: Reunião de planejamento" value={formReuniao.titulo}
                  onChange={e => setFormReuniao(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: pastaSelecionada.cor }}>
                  {pastaSelecionada.nome}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormReuniao(f => ({ ...f, tipo: 'presencial' }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${formReuniao.tipo === 'presencial' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                    <MapPin size={14} /> Presencial
                  </button>
                  <button onClick={() => setFormReuniao(f => ({ ...f, tipo: 'online' }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${formReuniao.tipo === 'online' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                    <Video size={14} /> Online
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" className="input" value={formReuniao.data} onChange={e => setFormReuniao(f => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" className="input" value={formReuniao.hora} onChange={e => setFormReuniao(f => ({ ...f, hora: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNovaReuniao(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={criarReuniao} disabled={saving || !formReuniao.titulo.trim()} className="btn-primary flex-1">Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

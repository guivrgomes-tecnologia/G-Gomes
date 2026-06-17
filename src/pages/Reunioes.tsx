import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ReuniaPasta, Reuniao } from '../lib/supabase'
import { Plus, FolderOpen, Folder, ChevronRight, Calendar, Trash2, X, Edit2 } from 'lucide-react'

const CORES = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']

export default function Reunioes() {
  const { user } = useAuth()
  const [pastas, setPastas] = useState<ReuniaPasta[]>([])
  const [pastaSelecionada, setPastaSelecionada] = useState<ReuniaPasta | null>(null)
  const [reunioes, setReunioes] = useState<Reuniao[]>([])
  const [reuniaoAberta, setReuniaoAberta] = useState<Reuniao | null>(null)
  const [saving, setSaving] = useState(false)

  // Modais
  const [showNovaPasta, setShowNovaPasta] = useState(false)
  const [showNovaReuniao, setShowNovaReuniao] = useState(false)
  const [nomePasta, setNomePasta] = useState('')
  const [corPasta, setCorPasta] = useState(CORES[0])

  // Form reunião
  const [formReuniao, setFormReuniao] = useState({ titulo: '', data: '', hora: '' })

  // Edição inline da reunião aberta
  const [editPauta, setEditPauta] = useState('')
  const [editTranscricao, setEditTranscricao] = useState('')
  const [editTitulo, setEditTitulo] = useState('')
  const [editData, setEditData] = useState('')
  const [editHora, setEditHora] = useState('')
  const [editandoCabecalho, setEditandoCabecalho] = useState(false)

  const loadPastas = useCallback(async () => {
    const { data } = await supabase.from('reuniao_pastas').select('*').order('created_at')
    setPastas(data ?? [])
  }, [])

  const loadReunioes = useCallback(async (pastaId: string) => {
    const { data } = await supabase.from('reunioes').select('*').eq('pasta_id', pastaId).order('created_at', { ascending: false })
    setReunioes(data ?? [])
  }, [])

  useEffect(() => { loadPastas() }, [loadPastas])

  useEffect(() => {
    if (pastaSelecionada) loadReunioes(pastaSelecionada.id)
    else setReunioes([])
  }, [pastaSelecionada, loadReunioes])

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
      titulo: formReuniao.titulo.trim(),
      data,
      pasta_id: pastaSelecionada.id,
      criado_por: user!.id,
    }).select().single()
    setFormReuniao({ titulo: '', data: '', hora: '' })
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
    const d = r.data ? new Date(r.data) : null
    setEditData(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')
    setEditHora(d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '')
    setEditandoCabecalho(false)
  }

  async function salvarReuniao() {
    if (!reuniaoAberta) return
    setSaving(true)
    let data: string | null = null
    if (editData) {
      data = editHora
        ? new Date(`${editData}T${editHora}`).toISOString()
        : editData
    }
    const { data: updated } = await supabase.from('reunioes').update({
      titulo: editTitulo,
      data,
      pauta: editPauta || null,
      transcricao: editTranscricao || null,
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
    const cor = pastaSelecionada.cor
    const dataInicio = reuniaoAberta.data ?? new Date().toISOString()
    const { data: ev } = await supabase.from('eventos').insert({
      titulo: reuniaoAberta.titulo,
      descricao: reuniaoAberta.pauta || null,
      data_inicio: dataInicio,
      dia_inteiro: !reuniaoAberta.data?.includes('T'),
      cor,
      concluido: false,
      criado_por: user!.id,
    }).select('id').single()
    if (ev) {
      await supabase.from('reunioes').update({ evento_id: ev.id }).eq('id', reuniaoAberta.id)
      setReuniaoAberta({ ...reuniaoAberta, evento_id: ev.id })
    }
    setSaving(false)
    alert('Evento criado na agenda!')
  }

  async function deletarReuniao(id: string) {
    if (!confirm('Apagar esta reunião?')) return
    await supabase.from('reunioes').delete().eq('id', id)
    if (reuniaoAberta?.id === id) setReuniaoAberta(null)
    if (pastaSelecionada) await loadReunioes(pastaSelecionada.id)
  }

  function formatData(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Painel de pastas */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Reuniões</h2>
          <button onClick={() => setShowNovaPasta(true)} className="text-brand-600 hover:text-brand-800" title="Nova pasta">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {pastas.length === 0 && (
            <p className="text-sm text-gray-400 px-4 py-3">Nenhuma pasta ainda.</p>
          )}
          {pastas.map(p => (
            <div key={p.id} className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg mx-1"
              style={{ borderLeft: pastaSelecionada?.id === p.id ? `3px solid ${p.cor}` : '3px solid transparent' }}
              onClick={() => setPastaSelecionada(pastaSelecionada?.id === p.id ? null : p)}>
              <span style={{ color: p.cor }}>
                {pastaSelecionada?.id === p.id ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
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
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        {!pastaSelecionada ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
            Selecione uma pasta para ver as reuniões
          </div>
        ) : (
          <>
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{ color: pastaSelecionada.cor }}><FolderOpen size={16} /></span>
                <h3 className="font-medium text-gray-800 text-sm truncate">{pastaSelecionada.nome}</h3>
              </div>
              <button onClick={() => setShowNovaReuniao(true)} className="text-brand-600 hover:text-brand-800" title="Nova reunião">
                <Plus size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {reunioes.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">Nenhuma reunião ainda.</p>
                  <button onClick={() => setShowNovaReuniao(true)} className="text-sm text-brand-600 hover:underline">
                    + Nova reunião
                  </button>
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
                  {r.evento_id && <span className="text-xs text-green-600 mt-1 block">✓ Na agenda</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhe da reunião */}
      <div className="flex-1 overflow-y-auto">
        {!reuniaoAberta ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Selecione uma reunião para abrir
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Cabeçalho */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                {editandoCabecalho ? (
                  <input className="input text-lg font-semibold flex-1 mr-3"
                    value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
                ) : (
                  <h1 className="text-xl font-bold text-gray-900 flex-1">{reuniaoAberta.titulo}</h1>
                )}
                <button onClick={() => setEditandoCabecalho(v => !v)} className="text-gray-400 hover:text-gray-600 ml-2">
                  <Edit2 size={16} />
                </button>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Categoria</label>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: pastaSelecionada?.cor }}>
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
              </div>

              {editandoCabecalho && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEditandoCabecalho(false)} className="btn-secondary text-sm py-1.5">Cancelar</button>
                  <button onClick={salvarReuniao} disabled={saving} className="btn-primary text-sm py-1.5">Salvar</button>
                </div>
              )}
            </div>

            {/* Pauta */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Pauta / Organização</h2>
              <textarea
                className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[160px]"
                placeholder="Organize os tópicos da reunião aqui..."
                value={editPauta}
                onChange={e => setEditPauta(e.target.value)}
                onBlur={salvarReuniao}
              />
            </div>

            {/* Lançar na agenda */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Agenda</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {reuniaoAberta.evento_id ? 'Esta reunião já está na agenda.' : 'Adicione esta reunião à agenda.'}
                  </p>
                </div>
                {reuniaoAberta.evento_id ? (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <Calendar size={16} /> Na agenda
                  </span>
                ) : (
                  <button onClick={lancarNaAgenda} disabled={saving} className="btn-primary flex items-center gap-2 text-sm py-2">
                    <Calendar size={16} /> Lançar na agenda
                  </button>
                )}
              </div>
            </div>

            {/* Transcrição */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Transcrição</h2>
              <textarea
                className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[200px]"
                placeholder="Cole ou escreva a transcrição da reunião aqui..."
                value={editTranscricao}
                onChange={e => setEditTranscricao(e.target.value)}
                onBlur={salvarReuniao}
              />
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
                  onChange={e => setNomePasta(e.target.value)} autoFocus
                  onKeyDown={e => e.key === 'Enter' && criarPasta()} />
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
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: pastaSelecionada.cor }}>
                  {pastaSelecionada.nome}
                </span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" className="input" value={formReuniao.data}
                    onChange={e => setFormReuniao(f => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" className="input" value={formReuniao.hora}
                    onChange={e => setFormReuniao(f => ({ ...f, hora: e.target.value }))} />
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

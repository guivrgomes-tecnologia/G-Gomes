import { useEffect, useState } from 'react'
import { Plus, X, AlertCircle, ChevronDown, ArrowRight, CalendarPlus, Pencil, CheckSquare, Square, Trash2, Lightbulb } from 'lucide-react'
import { supabase, Pendencia, Profile, Setor, PendenciaTarefa } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'

const STATUS_LABELS: Record<Pendencia['status'], string> = {
  aberta: 'A resolver',
  em_andamento: 'Em andamento',
  solucao_apresentada: 'Solução apresentada',
  resolvida: 'Resolvida',
}
const STATUS_COLORS: Record<Pendencia['status'], string> = {
  aberta: 'bg-red-100 text-red-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  solucao_apresentada: 'bg-purple-100 text-purple-700',
  resolvida: 'bg-green-100 text-green-700',
}
const PRIO_COLORS: Record<Pendencia['prioridade'], string> = {
  baixa: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-red-100 text-red-700',
}
const STATUS_ORDER: Pendencia['status'][] = ['aberta', 'em_andamento', 'solucao_apresentada', 'resolvida']

type FormState = {
  titulo: string; descricao: string; status: Pendencia['status']
  prioridade: Pendencia['prioridade']; para_usuario_ids: string[]
  prazo: string; hora: string; setor_id: string; criar_evento: boolean; reuniao_id: string
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', status: 'aberta', prioridade: 'media',
  para_usuario_ids: [], prazo: '', hora: '', setor_id: '', criar_evento: false, reuniao_id: '',
}

type Aba = 'comigo' | 'minhas' | 'todas'
type FiltroStatus = 'todos' | Pendencia['status']

function Avatar({ nome }: { nome: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-semibold shrink-0" title={nome}>
      {nome[0]?.toUpperCase()}
    </div>
  )
}

function SeletorUsuarios({ selecionados, equipe, userId, onChange }: {
  selecionados: string[]; equipe: Profile[]; userId: string; onChange: (ids: string[]) => void
}) {
  function toggle(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter(x => x !== id) : [...selecionados, id])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {equipe.map(p => {
        const sel = selecionados.includes(p.id)
        return (
          <button key={p.id} type="button" onClick={() => toggle(p.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm border transition-colors ${sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
            <Avatar nome={p.nome} />
            {p.nome.split(' ')[0]}{p.id === userId ? ' (eu)' : ''}
          </button>
        )
      })}
    </div>
  )
}

async function criarEventoDaPendencia(titulo: string, descricao: string | null, prazo: string, hora: string, userId: string) {
  const dataInicio = hora ? `${prazo}T${hora}` : prazo
  const dataFim = hora ? `${prazo}T${String(Number(hora.split(':')[0]) + 1).padStart(2, '0')}:${hora.split(':')[1]}` : null
  await supabase.from('eventos').insert({
    titulo, descricao: descricao || null,
    data_inicio: dataInicio, data_fim: dataFim,
    dia_inteiro: !hora, cor: '#ef4444', concluido: false, criado_por: userId,
  })
}

function FormModal({ title, f, setF, onSave, onClose, equipe, setores, reunioes, userId, saving }: {
  title: string; f: FormState; setF: (fn: (prev: FormState) => FormState) => void
  onSave: () => void; onClose: () => void
  equipe: Profile[]; setores: Setor[]; reunioes: { id: string; titulo: string; pasta?: { nome: string } }[]
  userId: string; saving: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input className="input" value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Enviar relatório mensal" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea className="input resize-none" rows={2} value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Para quem * <span className="text-gray-400 font-normal">(pode selecionar mais de um)</span></label>
            <SeletorUsuarios selecionados={f.para_usuario_ids} equipe={equipe} userId={userId} onChange={ids => setF(p => ({ ...p, para_usuario_ids: ids }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
              <select className="input" value={f.prioridade} onChange={e => setF(p => ({ ...p, prioridade: e.target.value as Pendencia['prioridade'] }))}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input" value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value as Pendencia['status'] }))}>
                <option value="aberta">A resolver</option>
                <option value="em_andamento">Em andamento</option>
                <option value="solucao_apresentada">Solução apresentada</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select className="input" value={f.setor_id} onChange={e => setF(p => ({ ...p, setor_id: e.target.value }))}>
                <option value="">Nenhum</option>
                {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" className="input" value={f.prazo} onChange={e => setF(p => ({ ...p, prazo: e.target.value }))} />
            </div>
          </div>
          {f.prazo && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="time" className="input" value={f.hora} onChange={e => setF(p => ({ ...p, hora: e.target.value }))} />
            </div>
          )}
          {f.prazo && (
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-indigo-100 bg-indigo-50 cursor-pointer hover:bg-indigo-100 transition-colors">
              <input type="checkbox" checked={f.criar_evento} onChange={e => setF(p => ({ ...p, criar_evento: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
              <div>
                <p className="text-sm font-medium text-indigo-800">Criar evento na agenda</p>
                <p className="text-xs text-indigo-500">Adiciona automaticamente à minha agenda</p>
              </div>
            </label>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vincular a uma reunião <span className="text-gray-400 font-normal">(opcional)</span></label>
            <select className="input" value={f.reuniao_id} onChange={e => setF(p => ({ ...p, reuniao_id: e.target.value }))}>
              <option value="">Nenhuma</option>
              {reunioes.map(r => <option key={r.id} value={r.id}>{(r.pasta as any)?.nome ? `${(r.pasta as any).nome} · ` : ''}{r.titulo}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={onSave} disabled={saving || !f.titulo || f.para_usuario_ids.length === 0} className="btn-primary flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

async function salvarParticipantes(pendenciaId: string, ids: string[]) {
  await supabase.from('pendencia_participantes').delete().eq('pendencia_id', pendenciaId)
  if (ids.length > 0) {
    await supabase.from('pendencia_participantes').insert(ids.map(uid => ({ pendencia_id: pendenciaId, usuario_id: uid })))
  }
}

export default function Pendencias() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [reunioes, setReunioes] = useState<{ id: string; titulo: string; pasta?: { nome: string } }[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<Aba>('comigo')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtroSetor, setFiltroSetor] = useState<string>('')
  const [criandoEvento, setCriandoEvento] = useState<string | null>(null)
  const [editando, setEditando] = useState<Pendencia | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_INITIAL)
  const [novasTarefas, setNovasTarefas] = useState<Record<string, string>>({})
  const [tarefasExpandidas, setTarefasExpandidas] = useState<Record<string, PendenciaTarefa[]>>({})
  // Solução
  const [solucaoTexto, setSolucaoTexto] = useState<Record<string, string>>({})
  const [editandoSolucao, setEditandoSolucao] = useState<string | null>(null)

  useEffect(() => {
    loadData().then(() => {
      if (searchParams.get('novo') === '1') setShowModal(true)
      if (searchParams.get('aba') === 'minhas') setAba('minhas')
    })
  }, [])

  useEffect(() => {
    const abrirId = searchParams.get('abrir')
    if (abrirId && pendencias.length > 0) {
      setExpandido(abrirId)
      // tenta encontrar a aba correta
      const p = pendencias.find(p => p.id === abrirId)
      if (p) {
        if (p.para_usuario_id === user?.id) setAba('comigo')
        else if (p.de_usuario_id === user?.id) setAba('minhas')
        else setAba('todas')
      }
      setTimeout(() => {
        document.getElementById(`pend-${abrirId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [pendencias])

  async function loadData() {
    const [{ data: pends }, { data: perfis }, { data: setsData }, { data: reunData }] = await Promise.all([
      supabase.from('pendencias').select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*), setor:setores(*), pendencia_participantes(usuario_id, profile:profiles(*)), pendencia_tarefas(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('setores').select('*').order('nome'),
      supabase.from('reunioes').select('id, titulo, pasta:reuniao_pastas(nome)').order('created_at', { ascending: false }),
    ])
    setPendencias(pends ?? [])
    setEquipe(perfis ?? [])
    setSetores(setsData ?? [])
    setReunioes((reunData ?? []) as any)
  }

  async function salvar() {
    if (!form.titulo || form.para_usuario_ids.length === 0) return
    setSaving(true)
    const prazoSalvo = form.prazo ? (form.hora ? `${form.prazo}T${form.hora}` : form.prazo) : null
    const { data: inserted } = await supabase.from('pendencias').insert({
      titulo: form.titulo, descricao: form.descricao || null,
      status: form.status, prioridade: form.prioridade,
      de_usuario_id: user!.id, para_usuario_id: form.para_usuario_ids[0],
      setor_id: form.setor_id || null, prazo: prazoSalvo, criado_por: user!.id,
    }).select('id').single()

    if (inserted) {
      await salvarParticipantes(inserted.id, form.para_usuario_ids)
      if (form.reuniao_id) {
        await supabase.from('reuniao_pendencias').insert({ reuniao_id: form.reuniao_id, pendencia_id: inserted.id })
      }
    }

    if (form.criar_evento && form.prazo && inserted) {
      await criarEventoDaPendencia(form.titulo, form.descricao || null, form.prazo, form.hora, user!.id)
    }

    setSaving(false); setShowModal(false); setForm(FORM_INITIAL); loadData()
  }

  function abrirEdicao(pend: Pendencia) {
    const prazoBase = pend.prazo ? pend.prazo.split('T')[0] : ''
    const horaBase = pend.prazo && pend.prazo.includes('T') ? pend.prazo.split('T')[1].substring(0, 5) : ''
    const participantesIds = (pend.pendencia_participantes ?? []).map((p: any) => p.usuario_id)
    const ids = participantesIds.length > 0 ? participantesIds : (pend.para_usuario_id ? [pend.para_usuario_id] : [])
    setEditForm({
      titulo: pend.titulo, descricao: pend.descricao ?? '', status: pend.status,
      prioridade: pend.prioridade, para_usuario_ids: ids,
      prazo: prazoBase, hora: horaBase, setor_id: pend.setor_id ?? '', criar_evento: false, reuniao_id: '',
    })
    setEditando(pend)
  }

  async function salvarEdicao() {
    if (!editando || !editForm.titulo || editForm.para_usuario_ids.length === 0) return
    setSaving(true)
    const prazoSalvo = editForm.prazo ? (editForm.hora ? `${editForm.prazo}T${editForm.hora}` : editForm.prazo) : null
    await supabase.from('pendencias').update({
      titulo: editForm.titulo, descricao: editForm.descricao || null,
      status: editForm.status, prioridade: editForm.prioridade,
      para_usuario_id: editForm.para_usuario_ids[0],
      setor_id: editForm.setor_id || null, prazo: prazoSalvo,
      updated_at: new Date().toISOString(),
    }).eq('id', editando.id)
    await salvarParticipantes(editando.id, editForm.para_usuario_ids)
    setSaving(false); setEditando(null); loadData()
  }

  async function adicionarTarefa(pendenciaId: string) {
    const texto = (novasTarefas[pendenciaId] ?? '').trim()
    if (!texto) return
    const tarefasAtuais = tarefasExpandidas[pendenciaId] ?? []
    await supabase.from('pendencia_tarefas').insert({ pendencia_id: pendenciaId, texto, ordem: tarefasAtuais.length })
    setNovasTarefas(prev => ({ ...prev, [pendenciaId]: '' }))
    recarregarTarefas(pendenciaId)
  }

  async function toggleTarefa(tarefa: PendenciaTarefa) {
    await supabase.from('pendencia_tarefas').update({ concluida: !tarefa.concluida }).eq('id', tarefa.id)
    recarregarTarefas(tarefa.pendencia_id)
  }

  async function deletarTarefa(tarefa: PendenciaTarefa) {
    await supabase.from('pendencia_tarefas').delete().eq('id', tarefa.id)
    recarregarTarefas(tarefa.pendencia_id)
  }

  async function recarregarTarefas(pendenciaId: string) {
    const { data } = await supabase.from('pendencia_tarefas').select('*').eq('pendencia_id', pendenciaId).order('ordem')
    setTarefasExpandidas(prev => ({ ...prev, [pendenciaId]: data ?? [] }))
  }

  async function atualizarStatus(id: string, status: Pendencia['status']) {
    await supabase.from('pendencias').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    loadData()
  }

  async function salvarSolucao(pend: Pendencia) {
    const texto = (solucaoTexto[pend.id] ?? pend.solucao ?? '').trim()
    await supabase.from('pendencias').update({
      solucao: texto || null,
      status: 'solucao_apresentada',
      updated_at: new Date().toISOString(),
    }).eq('id', pend.id)
    setEditandoSolucao(null)
    loadData()
  }

  async function deletar(id: string) {
    if (!confirm('Deletar esta pendência?')) return
    await supabase.from('pendencias').delete().eq('id', id)
    loadData()
  }

  async function criarEventoManual(pend: Pendencia) {
    setCriandoEvento(pend.id)
    const prazoStr = pend.prazo ? pend.prazo.split('T')[0] : new Date().toISOString().split('T')[0]
    const horaStr = pend.prazo && pend.prazo.includes('T') ? pend.prazo.split('T')[1].substring(0, 5) : ''
    await criarEventoDaPendencia(pend.titulo, pend.descricao, prazoStr, horaStr, user!.id)
    setCriandoEvento(null)
    alert('Evento criado na agenda!')
  }

  function isParticipante(pend: Pendencia) {
    const parts = (pend.pendencia_participantes ?? []) as any[]
    if (parts.length > 0) return parts.some(p => p.usuario_id === user?.id)
    return pend.para_usuario_id === user?.id
  }

  const lista = pendencias.filter(p => {
    const matchAba = aba === 'comigo'
      ? isParticipante(p)
      : aba === 'minhas' ? p.de_usuario_id === user?.id : true
    const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    return matchAba && matchSetor && matchStatus
  })

  const isAtrasado = (p: Pendencia) => p.prazo && new Date(p.prazo) < new Date() && p.status !== 'resolvida'
  const countComigo = pendencias.filter(p => isParticipante(p) && p.status !== 'resolvida').length

  // Contagens por status para a aba atual
  const countsPorStatus = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = pendencias.filter(p => {
      const matchAba = aba === 'comigo' ? isParticipante(p) : aba === 'minhas' ? p.de_usuario_id === user?.id : true
      const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
      return matchAba && matchSetor && p.status === s
    }).length
    return acc
  }, {} as Record<string, number>)

  function formatPrazo(prazo: string) {
    const d = new Date(prazo)
    return prazo.includes('T')
      ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR')
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pendências</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nova pendência
        </button>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([['comigo', 'Comigo'], ['minhas', 'Minhas'], ['todas', 'Todas']] as [Aba, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setAba(val)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${aba === val ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
            {val === 'comigo' && countComigo > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${aba === val ? 'bg-white text-brand-600' : 'bg-red-500 text-white'}`}>{countComigo}</span>
            )}
          </button>
        ))}
        {setores.length > 0 && (
          <select className="input text-sm py-1.5 ml-auto" value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
            <option value="">Todos os setores</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
      </div>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setFiltroStatus('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${filtroStatus === 'todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          Todos ({Object.values(countsPorStatus).reduce((a, b) => a + b, 0)})
        </button>
        {STATUS_ORDER.map(s => (
          <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? 'todos' : s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${filtroStatus === s ? `${STATUS_COLORS[s]} border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {STATUS_LABELS[s]} ({countsPorStatus[s] ?? 0})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {lista.length === 0 && (
          <div className="card p-12 text-center text-gray-400">
            <AlertCircle size={40} className="mx-auto mb-3 opacity-40" />
            <p>Nenhuma pendência aqui</p>
          </div>
        )}
        {lista.map(pend => {
          const de = pend.de_usuario as Profile | undefined
          const setor = pend.setor as Setor | undefined
          const participantes = (pend.pendencia_participantes ?? []) as any[]
          const destinatarios: Profile[] = participantes.length > 0
            ? participantes.map((p: any) => p.profile).filter(Boolean)
            : (pend.para_usuario ? [pend.para_usuario as Profile] : [])
          const euSouDestinatario = isParticipante(pend)
          const podeDarSolucao = euSouDestinatario && pend.status !== 'resolvida'

          return (
            <div key={pend.id} id={`pend-${pend.id}`} className={`card overflow-hidden ${isAtrasado(pend) ? 'border-red-300' : ''}`}>
              <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => {
                const abrindo = expandido !== pend.id
                setExpandido(abrindo ? pend.id : null)
                if (abrindo) {
                  recarregarTarefas(pend.id)
                  if (pend.solucao) setSolucaoTexto(prev => ({ ...prev, [pend.id]: pend.solucao! }))
                }
              }}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900">{pend.titulo}</p>
                    {isAtrasado(pend) && <span className="badge bg-red-100 text-red-700">Atrasado</span>}
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
                    {pend.solucao && <span className="badge bg-purple-100 text-purple-700 flex items-center gap-1"><Lightbulb size={10} /> Solução</span>}
                  </div>
                </div>
                <ChevronDown size={16} className={`text-gray-400 mt-1 transition-transform ${expandido === pend.id ? 'rotate-180' : ''}`} />
              </div>

              {expandido === pend.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                  {pend.descricao && <p className="text-sm text-gray-600">{pend.descricao}</p>}

                  {/* Solução apresentada */}
                  {(pend.status === 'solucao_apresentada' || pend.solucao) && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5 mb-2">
                        <Lightbulb size={13} /> Solução apresentada
                      </p>
                      {editandoSolucao === pend.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full text-sm border border-purple-300 rounded-lg p-2 resize-none focus:outline-none focus:border-purple-500 min-h-[80px] bg-white"
                            value={solucaoTexto[pend.id] ?? pend.solucao ?? ''}
                            onChange={e => setSolucaoTexto(prev => ({ ...prev, [pend.id]: e.target.value }))}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setEditandoSolucao(null)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                            <button onClick={() => salvarSolucao(pend)} className="text-xs py-1.5 flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">Salvar solução</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-purple-900 flex-1 whitespace-pre-wrap">{pend.solucao || 'Solução registrada.'}</p>
                          {euSouDestinatario && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => { setEditandoSolucao(pend.id); setSolucaoTexto(prev => ({ ...prev, [pend.id]: pend.solucao ?? '' })) }}
                                className="text-purple-400 hover:text-purple-700"><Pencil size={13} /></button>
                              <button onClick={async () => {
                                await supabase.from('pendencias').update({ solucao: null, status: 'em_andamento' }).eq('id', pend.id)
                                setPendencias(prev => prev.map(p => p.id === pend.id ? { ...p, solucao: null, status: 'em_andamento' } : p))
                              }} className="text-purple-400 hover:text-red-600"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Campo para apresentar solução */}
                  {podeDarSolucao && pend.status !== 'solucao_apresentada' && editandoSolucao === pend.id && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5"><Lightbulb size={13} /> Apresentar solução</p>
                      <textarea
                        className="w-full text-sm border border-purple-300 rounded-lg p-2 resize-none focus:outline-none focus:border-purple-500 min-h-[80px] bg-white"
                        placeholder="Descreva a solução encontrada..."
                        value={solucaoTexto[pend.id] ?? ''}
                        onChange={e => setSolucaoTexto(prev => ({ ...prev, [pend.id]: e.target.value }))}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setEditandoSolucao(null)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                        <button onClick={() => salvarSolucao(pend)} className="text-xs py-1.5 flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">Salvar solução</button>
                      </div>
                    </div>
                  )}

                  {/* Lista de tarefas */}
                  <div>
                    {(() => {
                      const tarefas = tarefasExpandidas[pend.id] ?? (pend.pendencia_tarefas ?? []) as PendenciaTarefa[]
                      const total = tarefas.length
                      const concluidas = tarefas.filter(t => t.concluida).length
                      return (
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
                              <button onClick={() => deletarTarefa(t)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              className="flex-1 text-sm border-b border-gray-200 focus:border-brand-400 outline-none py-1 bg-transparent placeholder-gray-300"
                              placeholder="+ Adicionar tarefa"
                              value={novasTarefas[pend.id] ?? ''}
                              onChange={e => setNovasTarefas(prev => ({ ...prev, [pend.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && adicionarTarefa(pend.id)}
                            />
                            {(novasTarefas[pend.id] ?? '').trim() && (
                              <button onClick={() => adicionarTarefa(pend.id)} className="text-xs text-brand-600 font-medium hover:underline">Adicionar</button>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Botão apresentar solução */}
                    {podeDarSolucao && pend.status !== 'solucao_apresentada' && editandoSolucao !== pend.id && (
                      <button onClick={() => { setEditandoSolucao(pend.id); setSolucaoTexto(prev => ({ ...prev, [pend.id]: '' })) }}
                        className="text-xs px-2.5 py-1 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 flex items-center gap-1 transition-colors">
                        <Lightbulb size={12} /> Apresentar solução
                      </button>
                    )}
                    {/* Mudança de status */}
                    {STATUS_ORDER.filter(s => s !== pend.status && s !== 'solucao_apresentada').map(s => (
                      <button key={s} onClick={() => atualizarStatus(pend.id, s)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
                        → {STATUS_LABELS[s]}
                      </button>
                    ))}
                    <button onClick={() => abrirEdicao(pend)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1 transition-colors">
                      <Pencil size={12} /> Editar
                    </button>
                    {euSouDestinatario && (
                      <button onClick={() => criarEventoManual(pend)} disabled={criandoEvento === pend.id}
                        className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 transition-colors">
                        <CalendarPlus size={12} />
                        {criandoEvento === pend.id ? 'Criando...' : 'Criar evento'}
                      </button>
                    )}
                    <button onClick={() => deletar(pend.id)} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto">
                      Deletar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showModal && (
        <FormModal title="Nova Pendência" f={form} setF={setForm} onSave={salvar}
          onClose={() => { setShowModal(false); setForm(FORM_INITIAL) }}
          equipe={equipe} setores={setores} reunioes={reunioes} userId={user!.id} saving={saving} />
      )}
      {editando && (
        <FormModal title="Editar Pendência" f={editForm} setF={setEditForm} onSave={salvarEdicao}
          onClose={() => setEditando(null)}
          equipe={equipe} setores={setores} reunioes={reunioes} userId={user!.id} saving={saving} />
      )}
    </div>
  )
}

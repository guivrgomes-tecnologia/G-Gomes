import { useEffect, useState } from 'react'
import { Plus, X, AlertCircle, ChevronDown, ArrowRight, Lightbulb, ArrowUpDown, List, LayoutGrid } from 'lucide-react'
import { supabase, Pendencia, Profile, Setor } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'
import PendenciaDetalheModal, { STATUS_LABELS, STATUS_COLORS, PRIO_COLORS, STATUS_ORDER } from '../components/PendenciaDetalheModal'
import NovaPendenciaModal from '../components/NovaPendenciaModal'
import Avatar from '../components/Avatar'
import { criarEventoDaPendencia, atualizarEventoDaPendencia, atualizarParticipantesEvento } from '../lib/pendenciaEventoHelper'

type FormState = {
  titulo: string; descricao: string; status: Pendencia['status']
  prioridade: Pendencia['prioridade']; para_usuario_ids: string[]
  prazo: string; hora: string; setor_id: string; reuniao_id: string
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', status: 'aberta', prioridade: 'media',
  para_usuario_ids: [], prazo: '', hora: '', setor_id: '', reuniao_id: '',
}

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Aba = 'comigo' | 'minhas' | 'todas'
type FiltroStatus = 'todos' | Pendencia['status']
type Ordenacao = 'data_desc' | 'data_asc' | 'nome_asc' | 'nome_desc' | 'prioridade' | 'categoria'
type ViewPendencias = 'lista' | 'cards'


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
            <Avatar nome={p.nome} avatarUrl={p.avatar_url} size={24} />
            {p.nome.split(' ')[0]}{p.id === userId ? ' (eu)' : ''}
          </button>
        )
      })}
    </div>
  )
}

function localToISO(dt: string) { return new Date(dt).toISOString() }

const PENDENCIA_COR = '#1e293b'

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
              {f.hora ? (
                <div className="flex gap-2">
                  <input type="time" className="input flex-1" value={f.hora} onChange={e => setF(p => ({ ...p, hora: e.target.value }))} />
                  <button type="button" onClick={() => setF(p => ({ ...p, hora: '' }))} className="btn-secondary text-xs px-3 whitespace-nowrap">Sem hora definida</button>
                </div>
              ) : (
                <button type="button" onClick={() => setF(p => ({ ...p, hora: nowHHMM() }))} className="input text-left text-gray-400">
                  Sem hora definida — toque para definir
                </button>
              )}
            </div>
          )}
          {f.prazo && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PENDENCIA_COR }} />
              <p className="text-xs text-indigo-600">Esta pendência vai aparecer automaticamente na agenda.</p>
            </div>
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
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<Aba>('todas')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('aberta')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtroSetor, setFiltroSetor] = useState<string>('')
  const [filtroPessoa, setFiltroPessoa] = useState<string>('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('data_desc')
  const [viewPendencias, setViewPendencias] = useState<ViewPendencias>('cards')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editando, setEditando] = useState<Pendencia | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_INITIAL)

  useEffect(() => {
    loadData().then(() => {
      if (searchParams.get('novo') === '1') setShowModal(true)
      if (searchParams.get('aba') === 'minhas') setAba('minhas')
    })
  }, [])

  useEffect(() => {
    const channel = supabase.channel('pendencias-lista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencias' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencia_participantes' }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
    }
  }, [pendencias, searchParams])

  async function loadData() {
    const [{ data: pends }, { data: perfis }, { data: setsData }, { data: reunData }] = await Promise.all([
      supabase.from('pendencias').select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*), setor:setores(*), pendencia_participantes(usuario_id, profile:profiles(*)), pendencia_tarefas(*), pendencia_comentarios(id)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('setores').select('*').order('nome'),
      supabase.from('reunioes').select('id, titulo, pasta:reuniao_pastas(nome)').order('created_at', { ascending: false }),
    ])
    setPendencias(pends ?? [])
    setEquipe(perfis ?? [])
    setSetores(setsData ?? [])
    setReunioes((reunData ?? []) as any)
  }

  function abrirEdicao(pend: Pendencia) {
    const prazoBase = pend.prazo ? pend.prazo.split('T')[0] : ''
    const horaBase = pend.prazo && pend.prazo.includes('T') ? pend.prazo.split('T')[1].substring(0, 5) : ''
    const participantesIds = (pend.pendencia_participantes ?? []).map((p: any) => p.usuario_id)
    const ids = participantesIds.length > 0 ? participantesIds : (pend.para_usuario_id ? [pend.para_usuario_id] : [])
    setEditForm({
      titulo: pend.titulo, descricao: pend.descricao ?? '', status: pend.status,
      prioridade: pend.prioridade, para_usuario_ids: ids,
      prazo: prazoBase, hora: horaBase, setor_id: pend.setor_id ?? '', reuniao_id: '',
    })
    setEditando(pend)
  }

  async function salvarEdicao() {
    if (!editando || !editForm.titulo || editForm.para_usuario_ids.length === 0) return
    setSaving(true)
    const prazoSalvo = editForm.prazo ? (editForm.hora ? localToISO(`${editForm.prazo}T${editForm.hora}`) : editForm.prazo) : null
    await supabase.from('pendencias').update({
      titulo: editForm.titulo, descricao: editForm.descricao || null,
      status: editForm.status, prioridade: editForm.prioridade,
      para_usuario_id: editForm.para_usuario_ids[0],
      setor_id: editForm.setor_id || null, prazo: prazoSalvo,
      updated_at: new Date().toISOString(),
    }).eq('id', editando.id)
    await salvarParticipantes(editando.id, editForm.para_usuario_ids)
    if (editando.evento_id) {
      await atualizarParticipantesEvento(editando.evento_id, editForm.para_usuario_ids)
      if (editForm.prazo) {
        // Reaplica título/data/descrição no evento já existente e propaga a mudança pra todas
        // as cópias no Google Calendar (criador + participantes conectados), não só a do criador.
        await atualizarEventoDaPendencia(
          editando.evento_id, editForm.titulo, editForm.descricao || null, editForm.prazo, editForm.hora,
          editando.criado_por, editForm.status === 'resolvida'
        )
      }
    } else if (editForm.prazo) {
      // A pendência não tinha data antes (por isso nunca ganhou um evento) e agora ganhou uma —
      // cria o evento agora, já com todos os destinatários sincronizados.
      await criarEventoDaPendencia(editForm.titulo, editForm.descricao || null, editForm.prazo, editForm.hora, editando.criado_por, editando.id, editForm.para_usuario_ids)
    }
    setSaving(false); setEditando(null); loadData()
  }

  function isParticipante(pend: Pendencia) {
    const parts = (pend.pendencia_participantes ?? []) as any[]
    if (parts.length > 0) return parts.some(p => p.usuario_id === user?.id)
    return pend.para_usuario_id === user?.id
  }

  const PRIO_ORDER = { alta: 0, media: 1, baixa: 2 }

  const lista = pendencias.filter(p => {
    const matchAba = aba === 'comigo'
      ? isParticipante(p)
      : aba === 'minhas' ? p.de_usuario_id === user?.id : true
    const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    const matchPessoa = filtroPessoa === '' || p.de_usuario_id === filtroPessoa ||
      p.para_usuario_id === filtroPessoa ||
      (p.pendencia_participantes as any[])?.some((pp: any) => pp.usuario_id === filtroPessoa)
    return matchAba && matchSetor && matchStatus && matchPessoa
  }).sort((a, b) => {
    switch (ordenacao) {
      case 'data_asc':  return (a.prazo ?? a.created_at ?? '').localeCompare(b.prazo ?? b.created_at ?? '')
      case 'data_desc': return (b.prazo ?? b.created_at ?? '').localeCompare(a.prazo ?? a.created_at ?? '')
      case 'nome_asc':  return a.titulo.localeCompare(b.titulo)
      case 'nome_desc': return b.titulo.localeCompare(a.titulo)
      case 'prioridade': return (PRIO_ORDER[a.prioridade] ?? 1) - (PRIO_ORDER[b.prioridade] ?? 1)
      case 'categoria': return ((a.setor as any)?.nome ?? '').localeCompare((b.setor as any)?.nome ?? '')
      default: return 0
    }
  })

  // Lista para a view Cards: mesmos filtros, exceto status (cada coluna já é um status)
  const listaCards = pendencias.filter(p => {
    const matchAba = aba === 'comigo'
      ? isParticipante(p)
      : aba === 'minhas' ? p.de_usuario_id === user?.id : true
    const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
    const matchPessoa = filtroPessoa === '' || p.de_usuario_id === filtroPessoa ||
      p.para_usuario_id === filtroPessoa ||
      (p.pendencia_participantes as any[])?.some((pp: any) => pp.usuario_id === filtroPessoa)
    return matchAba && matchSetor && matchPessoa
  })

  async function moverParaStatus(pendId: string, status: Pendencia['status']) {
    setDraggingId(null)
    const pend = pendencias.find(p => p.id === pendId)
    if (!pend || pend.status === status) return
    await supabase.from('pendencias').update({ status, updated_at: new Date().toISOString() }).eq('id', pendId)
    loadData()
  }

  // datas sem hora: atrasado só após fim do dia; com hora: usa o datetime exato (já salvo em UTC)
  function parsePrazo(prazo: string) { return new Date(prazo.includes('T') ? prazo : prazo + 'T23:59:59') }
  const isAtrasado = (p: Pendencia) => p.prazo && parsePrazo(p.prazo) < new Date() && p.status !== 'resolvida'
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
    const d = prazo.includes('T') ? new Date(prazo) : new Date(prazo + 'T12:00:00')
    return prazo.includes('T')
      ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR')
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pendências</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewPendencias('lista')} title="Lista"
              className={`p-1.5 rounded-lg transition-colors ${viewPendencias === 'lista' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <List size={15} />
            </button>
            <button onClick={() => setViewPendencias('cards')} title="Cards"
              className={`p-1.5 rounded-lg transition-colors ${viewPendencias === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              <LayoutGrid size={15} />
            </button>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova pendência
          </button>
        </div>
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
      </div>

      {/* Filtros: setor, pessoa, ordenação */}
      <div className="flex flex-wrap gap-2 mb-4">
        {setores.length > 0 && (
          <select className="input text-sm py-1.5" value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
            <option value="">Todos os setores</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        <select className="input text-sm py-1.5" value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {equipe.map(p => <option key={p.id} value={p.id}>{p.nome.split(' ')[0]}</option>)}
        </select>
        <div className="flex items-center gap-1.5 ml-auto">
          <ArrowUpDown size={14} className="text-gray-400" />
          <select className="input text-sm py-1.5" value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)}>
            <option value="data_desc">Data ↓</option>
            <option value="data_asc">Data ↑</option>
            <option value="nome_asc">Nome A→Z</option>
            <option value="nome_desc">Nome Z→A</option>
            <option value="prioridade">Prioridade</option>
            <option value="categoria">Categoria</option>
          </select>
        </div>
      </div>

      {/* Filtros de status */}
      {viewPendencias === 'lista' && (
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
      )}

      {/* VIEW CARDS (estilo Trello) */}
      {viewPendencias === 'cards' && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {STATUS_ORDER.map(status => {
            const cards = listaCards.filter(p => p.status === status)
            return (
              <div key={status}
                onDragOver={e => e.preventDefault()}
                onDrop={() => draggingId && moverParaStatus(draggingId, status)}
                className="bg-gray-50 rounded-xl p-3 w-72 shrink-0 flex flex-col">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                  <span className="text-xs text-gray-400 font-medium">{cards.length}</span>
                </div>
                <div className="space-y-2 flex-1 min-h-[40px]">
                  {cards.map(pend => {
                    const setor = pend.setor as Setor | undefined
                    const participantes = (pend.pendencia_participantes ?? []) as any[]
                    const destinatarios: Profile[] = participantes.length > 0
                      ? participantes.map((p: any) => p.profile).filter(Boolean)
                      : (pend.para_usuario ? [pend.para_usuario as Profile] : [])
                    const souParticipante = isParticipante(pend)
                    const souCriador = pend.de_usuario_id === user?.id
                    const corOrigem = souParticipante ? 'border-l-orange-400' : souCriador ? 'border-l-blue-400' : 'border-l-transparent'
                    const corFundo = souParticipante ? 'bg-orange-100' : souCriador ? 'bg-blue-100' : 'bg-white'
                    return (
                      <div key={pend.id}
                        draggable
                        onDragStart={() => setDraggingId(pend.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => setExpandido(pend.id)}
                        className={`${corFundo} rounded-lg border-t border-r border-b border-l-4 ${corOrigem} p-3 cursor-pointer hover:shadow-md transition-shadow relative ${isAtrasado(pend) ? 'border-red-300' : 'border-gray-200'} ${draggingId === pend.id ? 'opacity-40' : ''}`}>
                        {(pend.pendencia_comentarios?.length ?? 0) > 0 && (
                          <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-500" title="Tem comentário" />
                        )}
                        <div className={`h-1 rounded-full mb-2 ${PRIO_COLORS[pend.prioridade].split(' ')[0]}`} />
                        <p className="text-sm font-medium text-gray-900 mb-1.5 pr-3">{pend.titulo}</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {isAtrasado(pend) && <span className="badge bg-red-100 text-red-700 text-[10px]">Atrasado</span>}
                          {souParticipante && <span className="badge bg-orange-50 text-orange-700 text-[10px]">Comigo</span>}
                          {souCriador && <span className="badge bg-blue-50 text-blue-700 text-[10px]">Minha</span>}
                          {setor && <span className="badge text-[10px]" style={{ backgroundColor: setor.cor + '22', color: setor.cor }}>{setor.nome}</span>}
                          {pend.prazo && <span className="badge bg-gray-100 text-gray-600 text-[10px]">📅 {formatPrazo(pend.prazo)}</span>}
                        </div>
                        {destinatarios.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {destinatarios.map(p => <Avatar key={p.id} nome={p.nome} avatarUrl={p.avatar_url} size={24} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">Vazio</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {viewPendencias === 'lista' && (
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
          return (
            <div key={pend.id} id={`pend-${pend.id}`} className={`card overflow-hidden ${isAtrasado(pend) ? 'border-red-300' : ''}`}>
              <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => setExpandido(pend.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {(pend.pendencia_comentarios?.length ?? 0) > 0 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" title="Tem comentário" />
                    )}
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
                <ChevronDown size={16} className="text-gray-400 mt-1 -rotate-90" />
              </div>
            </div>
          )
        })}
      </div>
      )}

      {expandido && (
        <PendenciaDetalheModal
          pendenciaId={expandido}
          onClose={() => setExpandido(null)}
          onEditar={(p) => { setExpandido(null); abrirEdicao(p) }}
          onChanged={loadData}
        />
      )}


      {showModal && (
        <NovaPendenciaModal onClose={() => setShowModal(false)} onCreated={loadData} />
      )}
      {editando && (
        <FormModal title="Editar Pendência" f={editForm} setF={setEditForm} onSave={salvarEdicao}
          onClose={() => setEditando(null)}
          equipe={equipe} setores={setores} reunioes={reunioes} userId={user!.id} saving={saving} />
      )}
    </div>
  )
}

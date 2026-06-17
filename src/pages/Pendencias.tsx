import { useEffect, useState } from 'react'
import { Plus, X, AlertCircle, ChevronDown, ArrowRight, CalendarPlus, Pencil } from 'lucide-react'
import { supabase, Pendencia, Profile, Setor } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'

const STATUS_LABELS: Record<Pendencia['status'], string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', resolvida: 'Resolvida',
}
const STATUS_COLORS: Record<Pendencia['status'], string> = {
  aberta: 'bg-red-100 text-red-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  resolvida: 'bg-green-100 text-green-700',
}
const PRIO_COLORS: Record<Pendencia['prioridade'], string> = {
  baixa: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-red-100 text-red-700',
}

type FormState = {
  titulo: string; descricao: string; status: Pendencia['status']
  prioridade: Pendencia['prioridade']; para_usuario_ids: string[]
  prazo: string; hora: string; setor_id: string; criar_evento: boolean
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', status: 'aberta', prioridade: 'media',
  para_usuario_ids: [], prazo: '', hora: '', setor_id: '', criar_evento: false,
}

type Aba = 'comigo' | 'minhas' | 'todas'

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
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<Aba>('comigo')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtroSetor, setFiltroSetor] = useState<string>('')
  const [criandoEvento, setCriandoEvento] = useState<string | null>(null)
  const [editando, setEditando] = useState<Pendencia | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_INITIAL)

  useEffect(() => {
    loadData()
    if (searchParams.get('novo') === '1') setShowModal(true)
    if (searchParams.get('aba') === 'minhas') setAba('minhas')
  }, [])

  async function loadData() {
    const [{ data: pends }, { data: perfis }, { data: setsData }] = await Promise.all([
      supabase.from('pendencias').select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*), setor:setores(*), pendencia_participantes(usuario_id, profile:profiles(*))').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('setores').select('*').order('nome'),
    ])
    setPendencias(pends ?? [])
    setEquipe(perfis ?? [])
    setSetores(setsData ?? [])
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
      prazo: prazoBase, hora: horaBase, setor_id: pend.setor_id ?? '', criar_evento: false,
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

  async function atualizarStatus(id: string, status: Pendencia['status']) {
    await supabase.from('pendencias').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
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
      ? isParticipante(p) && p.status !== 'resolvida'
      : aba === 'minhas' ? p.de_usuario_id === user?.id : true
    const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
    return matchAba && matchSetor
  })

  const isAtrasado = (p: Pendencia) => p.prazo && new Date(p.prazo) < new Date() && p.status !== 'resolvida'
  const countComigo = pendencias.filter(p => isParticipante(p) && p.status !== 'resolvida').length

  function formatPrazo(prazo: string) {
    const d = new Date(prazo)
    return prazo.includes('T')
      ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR')
  }

  function FormModal({ title, f, setF, onSave, onClose }: {
    title: string; f: FormState; setF: (fn: (prev: FormState) => FormState) => void
    onSave: () => void; onClose: () => void
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
              <SeletorUsuarios selecionados={f.para_usuario_ids} equipe={equipe} userId={user!.id} onChange={ids => setF(p => ({ ...p, para_usuario_ids: ids }))} />
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
                  <option value="aberta">Aberta</option>
                  <option value="em_andamento">Em andamento</option>
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pendências</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nova pendência
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
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

          return (
            <div key={pend.id} className={`card overflow-hidden ${isAtrasado(pend) ? 'border-red-300' : ''}`}>
              <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => setExpandido(expandido === pend.id ? null : pend.id)}>
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
                        <span className="font-medium text-gray-700">
                          {destinatarios.map(p => p.nome.split(' ')[0]).join(', ')}
                        </span>
                      </span>
                    )}
                    {setor && (
                      <span className="badge" style={{ backgroundColor: setor.cor + '22', color: setor.cor }}>{setor.nome}</span>
                    )}
                    {pend.prazo && (
                      <span className="badge bg-gray-100 text-gray-600">📅 {formatPrazo(pend.prazo)}</span>
                    )}
                  </div>
                </div>
                <ChevronDown size={16} className={`text-gray-400 mt-1 transition-transform ${expandido === pend.id ? 'rotate-180' : ''}`} />
              </div>

              {expandido === pend.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  {pend.descricao && <p className="text-sm text-gray-600 mb-3">{pend.descricao}</p>}
                  <div className="flex flex-wrap gap-2">
                    {(['aberta', 'em_andamento', 'resolvida'] as Pendencia['status'][]).map(s => (
                      <button key={s} disabled={pend.status === s} onClick={() => atualizarStatus(pend.id, s)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${pend.status === s ? 'bg-gray-100 text-gray-400 cursor-default' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
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
        <FormModal
          title="Nova Pendência"
          f={form}
          setF={setForm}
          onSave={salvar}
          onClose={() => { setShowModal(false); setForm(FORM_INITIAL) }}
        />
      )}
      {editando && (
        <FormModal
          title="Editar Pendência"
          f={editForm}
          setF={setEditForm}
          onSave={salvarEdicao}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}

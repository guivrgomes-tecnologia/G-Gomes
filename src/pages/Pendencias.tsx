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
  prioridade: Pendencia['prioridade']; para_usuario_id: string
  prazo: string; hora: string; setor_id: string; criar_evento: boolean
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', status: 'aberta', prioridade: 'media',
  para_usuario_id: '', prazo: '', hora: '', setor_id: '', criar_evento: false,
}

type Aba = 'comigo' | 'minhas' | 'todas'

async function criarEventoDaPendencia(titulo: string, descricao: string | null, prazo: string, hora: string, userId: string) {
  const dataInicio = hora ? `${prazo}T${hora}` : prazo
  const dataFim = hora ? `${prazo}T${String(Number(hora.split(':')[0]) + 1).padStart(2, '0')}:${hora.split(':')[1]}` : null
  await supabase.from('eventos').insert({
    titulo,
    descricao: descricao || null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    dia_inteiro: !hora,
    cor: '#ef4444',
    concluido: false,
    criado_por: userId,
  })
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
      supabase.from('pendencias').select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*), setor:setores(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('setores').select('*').order('nome'),
    ])
    setPendencias(pends ?? [])
    setEquipe(perfis ?? [])
    setSetores(setsData ?? [])
  }

  async function salvar() {
    if (!form.titulo || !form.para_usuario_id) return
    setSaving(true)
    const prazoSalvo = form.prazo
      ? (form.hora ? `${form.prazo}T${form.hora}` : form.prazo)
      : null

    await supabase.from('pendencias').insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      status: form.status,
      prioridade: form.prioridade,
      de_usuario_id: user!.id,
      para_usuario_id: form.para_usuario_id,
      setor_id: form.setor_id || null,
      prazo: prazoSalvo,
      criado_por: user!.id,
    })

    if (form.criar_evento && form.prazo) {
      await criarEventoDaPendencia(form.titulo, form.descricao || null, form.prazo, form.hora, user!.id)
    }

    setSaving(false)
    setShowModal(false)
    setForm(FORM_INITIAL)
    loadData()
  }

  function abrirEdicao(pend: Pendencia) {
    const prazoBase = pend.prazo ? pend.prazo.split('T')[0] : ''
    const horaBase = pend.prazo && pend.prazo.includes('T') ? pend.prazo.split('T')[1].substring(0, 5) : ''
    setEditForm({
      titulo: pend.titulo,
      descricao: pend.descricao ?? '',
      status: pend.status,
      prioridade: pend.prioridade,
      para_usuario_id: pend.para_usuario_id,
      prazo: prazoBase,
      hora: horaBase,
      setor_id: pend.setor_id ?? '',
      criar_evento: false,
    })
    setEditando(pend)
  }

  async function salvarEdicao() {
    if (!editando || !editForm.titulo || !editForm.para_usuario_id) return
    setSaving(true)
    const prazoSalvo = editForm.prazo
      ? (editForm.hora ? `${editForm.prazo}T${editForm.hora}` : editForm.prazo)
      : null
    await supabase.from('pendencias').update({
      titulo: editForm.titulo,
      descricao: editForm.descricao || null,
      status: editForm.status,
      prioridade: editForm.prioridade,
      para_usuario_id: editForm.para_usuario_id,
      setor_id: editForm.setor_id || null,
      prazo: prazoSalvo,
      updated_at: new Date().toISOString(),
    }).eq('id', editando.id)
    setSaving(false)
    setEditando(null)
    loadData()
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

  const lista = pendencias.filter(p => {
    const matchAba = aba === 'comigo'
      ? p.para_usuario_id === user?.id && p.status !== 'resolvida'
      : aba === 'minhas'
      ? p.de_usuario_id === user?.id
      : true
    const matchSetor = filtroSetor === '' || p.setor_id === filtroSetor
    return matchAba && matchSetor
  })

  const isAtrasado = (p: Pendencia) => p.prazo && new Date(p.prazo) < new Date() && p.status !== 'resolvida'
  const countComigo = pendencias.filter(p => p.para_usuario_id === user?.id && p.status !== 'resolvida').length

  function formatPrazo(prazo: string) {
    const d = new Date(prazo)
    const temHora = prazo.includes('T')
    if (temHora) {
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('pt-BR')
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
          <button
            key={val}
            onClick={() => setAba(val)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${aba === val ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
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
          const para = pend.para_usuario as Profile | undefined
          const setor = pend.setor as Setor | undefined
          const isParaMim = pend.para_usuario_id === user?.id
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
                    {de && para && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{de.nome.split(' ')[0]}</span>
                        <ArrowRight size={10} />
                        <span className="font-medium text-gray-700">{para.nome.split(' ')[0]}</span>
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
                    {isParaMim && (
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nova Pendência</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Enviar relatório mensal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="input resize-none" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Para quem *</label>
                  <select className="input" value={form.para_usuario_id} onChange={e => setForm(f => ({ ...f, para_usuario_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}{p.id === user?.id ? ' (eu)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select className="input" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Pendencia['prioridade'] }))}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
                  <select className="input" value={form.setor_id} onChange={e => setForm(f => ({ ...f, setor_id: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" className="input" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
                </div>
              </div>
              {form.prazo && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input type="time" className="input" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
              )}
              {form.prazo && (
                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-indigo-100 bg-indigo-50 cursor-pointer hover:bg-indigo-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.criar_evento}
                    onChange={e => setForm(f => ({ ...f, criar_evento: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-indigo-800">Criar evento na agenda</p>
                    <p className="text-xs text-indigo-500">Adiciona automaticamente à minha agenda</p>
                  </div>
                </label>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvar} disabled={saving || !form.titulo || !form.para_usuario_id} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Editar Pendência</h3>
              <button onClick={() => setEditando(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="input resize-none" rows={3} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Para quem *</label>
                  <select className="input" value={editForm.para_usuario_id} onChange={e => setEditForm(f => ({ ...f, para_usuario_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}{p.id === user?.id ? ' (eu)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select className="input" value={editForm.prioridade} onChange={e => setEditForm(f => ({ ...f, prioridade: e.target.value as Pendencia['prioridade'] }))}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select className="input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Pendencia['status'] }))}>
                    <option value="aberta">Aberta</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="resolvida">Resolvida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
                  <select className="input" value={editForm.setor_id} onChange={e => setEditForm(f => ({ ...f, setor_id: e.target.value }))}>
                    <option value="">Nenhum</option>
                    {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" className="input" value={editForm.prazo} onChange={e => setEditForm(f => ({ ...f, prazo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
                  <input type="time" className="input" value={editForm.hora} onChange={e => setEditForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditando(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarEdicao} disabled={saving || !editForm.titulo || !editForm.para_usuario_id} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, X, ClipboardList, ChevronDown, Filter } from 'lucide-react'
import { supabase, Processo, Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const STATUS_LABELS: Record<Processo['status'], string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado',
}
const STATUS_COLORS: Record<Processo['status'], string> = {
  pendente: 'bg-gray-100 text-gray-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluido: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
}
const PRIO_COLORS: Record<Processo['prioridade'], string> = {
  baixa: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-red-100 text-red-700',
}

type FormState = {
  titulo: string; descricao: string; categoria: string; status: Processo['status']
  prioridade: Processo['prioridade']; responsavel_id: string; prazo: string
}
const FORM_INITIAL: FormState = { titulo: '', descricao: '', categoria: '', status: 'pendente', prioridade: 'media', responsavel_id: '', prazo: '' }

export default function Processos() {
  const { user } = useAuth()
  const [processos, setProcessos] = useState<Processo[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: procs }, { data: perfis }] = await Promise.all([
      supabase.from('processos').select('*, responsavel:profiles!processos_responsavel_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
    ])
    setProcessos(procs ?? [])
    setEquipe(perfis ?? [])
  }

  async function salvar() {
    if (!form.titulo) return
    setSaving(true)
    await supabase.from('processos').insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      categoria: form.categoria || 'Geral',
      status: form.status,
      prioridade: form.prioridade,
      responsavel_id: form.responsavel_id || null,
      prazo: form.prazo || null,
      criado_por: user!.id,
    })
    setSaving(false)
    setShowModal(false)
    setForm(FORM_INITIAL)
    loadData()
  }

  async function atualizarStatus(id: string, status: Processo['status']) {
    await supabase.from('processos').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    loadData()
  }

  async function deletar(id: string) {
    if (!confirm('Deletar este processo?')) return
    await supabase.from('processos').delete().eq('id', id)
    loadData()
  }

  const lista = filtroStatus === 'todos' ? processos : processos.filter(p => p.status === filtroStatus)
  const isAtrasado = (p: Processo) => p.prazo && new Date(p.prazo) < new Date() && !['concluido', 'cancelado'].includes(p.status)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Processos</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo processo
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['todos', 'pendente', 'em_andamento', 'concluido', 'cancelado'].map(s => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroStatus === s ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {s === 'todos' ? 'Todos' : STATUS_LABELS[s as Processo['status']]}
            <span className="ml-1.5 text-xs opacity-70">
              {s === 'todos' ? processos.length : processos.filter(p => p.status === s).length}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {lista.length === 0 && (
          <div className="card p-12 text-center text-gray-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
            <p>Nenhum processo encontrado</p>
          </div>
        )}
        {lista.map(proc => (
          <div key={proc.id} className={`card overflow-hidden ${isAtrasado(proc) ? 'border-red-300' : ''}`}>
            <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => setExpandido(expandido === proc.id ? null : proc.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-medium text-gray-900">{proc.titulo}</p>
                  {isAtrasado(proc) && <span className="badge bg-red-100 text-red-700">Atrasado</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`badge ${STATUS_COLORS[proc.status]}`}>{STATUS_LABELS[proc.status]}</span>
                  <span className={`badge ${PRIO_COLORS[proc.prioridade]}`}>{proc.prioridade}</span>
                  {proc.categoria && <span className="badge bg-gray-100 text-gray-600">{proc.categoria}</span>}
                  {proc.responsavel && <span className="badge bg-purple-100 text-purple-700">{(proc.responsavel as Profile).nome}</span>}
                  {proc.prazo && <span className="badge bg-gray-100 text-gray-600">📅 {new Date(proc.prazo).toLocaleDateString('pt-BR')}</span>}
                </div>
              </div>
              <ChevronDown size={16} className={`text-gray-400 mt-1 transition-transform ${expandido === proc.id ? 'rotate-180' : ''}`} />
            </div>

            {expandido === proc.id && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                {proc.descricao && <p className="text-sm text-gray-600 mb-3">{proc.descricao}</p>}
                <div className="flex flex-wrap gap-2">
                  {(['pendente', 'em_andamento', 'concluido', 'cancelado'] as Processo['status'][]).map(s => (
                    <button
                      key={s}
                      disabled={proc.status === s}
                      onClick={() => atualizarStatus(proc.id, s)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${proc.status === s ? 'bg-gray-100 text-gray-400 cursor-default' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                    >
                      → {STATUS_LABELS[s]}
                    </button>
                  ))}
                  <button onClick={() => deletar(proc.id)} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto">
                    Deletar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Novo Processo</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Renovação de contrato" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="input resize-none" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <input className="input" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Financeiro" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select className="input" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Processo['prioridade'] }))}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                  <select className="input" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                    <option value="">Ninguém</option>
                    {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prazo</label>
                  <input type="date" className="input" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvar} disabled={saving || !form.titulo} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

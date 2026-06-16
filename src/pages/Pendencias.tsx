import { useEffect, useState } from 'react'
import { Plus, X, AlertCircle, ChevronDown, ArrowRight } from 'lucide-react'
import { supabase, Pendencia, Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  prioridade: Pendencia['prioridade']; para_usuario_id: string; prazo: string
}
const FORM_INITIAL: FormState = { titulo: '', descricao: '', status: 'aberta', prioridade: 'media', para_usuario_id: '', prazo: '' }

type Aba = 'comigo' | 'minhas' | 'todas'

export default function Pendencias() {
  const { user } = useAuth()
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)
  const [aba, setAba] = useState<Aba>('comigo')
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: pends }, { data: perfis }] = await Promise.all([
      supabase.from('pendencias').select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('nome'),
    ])
    setPendencias(pends ?? [])
    setEquipe(perfis ?? [])
  }

  async function salvar() {
    if (!form.titulo || !form.para_usuario_id) return
    setSaving(true)
    await supabase.from('pendencias').insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      status: form.status,
      prioridade: form.prioridade,
      de_usuario_id: user!.id,
      para_usuario_id: form.para_usuario_id,
      prazo: form.prazo || null,
      criado_por: user!.id,
    })
    setSaving(false)
    setShowModal(false)
    setForm(FORM_INITIAL)
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

  const lista = pendencias.filter(p => {
    if (aba === 'comigo') return p.para_usuario_id === user?.id && p.status !== 'resolvida'
    if (aba === 'minhas') return p.de_usuario_id === user?.id
    return true
  })

  const isAtrasado = (p: Pendencia) => p.prazo && new Date(p.prazo) < new Date() && p.status !== 'resolvida'

  const countComigo = pendencias.filter(p => p.para_usuario_id === user?.id && p.status !== 'resolvida').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pendências</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nova pendência
        </button>
      </div>

      <div className="flex gap-2 mb-6">
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
                    {pend.prazo && <span className="badge bg-gray-100 text-gray-600">📅 {new Date(pend.prazo).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <ChevronDown size={16} className={`text-gray-400 mt-1 transition-transform ${expandido === pend.id ? 'rotate-180' : ''}`} />
              </div>

              {expandido === pend.id && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  {pend.descricao && <p className="text-sm text-gray-600 mb-3">{pend.descricao}</p>}
                  <div className="flex flex-wrap gap-2">
                    {(['aberta', 'em_andamento', 'resolvida'] as Pendencia['status'][]).map(s => (
                      <button
                        key={s}
                        disabled={pend.status === s}
                        onClick={() => atualizarStatus(pend.id, s)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${pend.status === s ? 'bg-gray-100 text-gray-400 cursor-default' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                      >
                        → {STATUS_LABELS[s]}
                      </button>
                    ))}
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
          <div className="card w-full max-w-lg p-6">
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
                    {equipe.filter(p => p.id !== user?.id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prazo</label>
                <input type="date" className="input" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
              </div>
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
    </div>
  )
}

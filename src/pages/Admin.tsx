import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Profile } from '../lib/supabase'
import { Plus, Trash2, Edit2, X, Check, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const MODULOS = [
  { key: 'agenda',     label: 'Agenda' },
  { key: 'processos',  label: 'Processos' },
  { key: 'pendencias', label: 'Pendências' },
  { key: 'reunioes',   label: 'Reuniões' },
]

export default function Admin() {
  const { profile, session } = useAuth()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showNovo, setShowNovo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)

  const [form, setForm] = useState({ nome: '', email: '', senha: '', cargo: '', modulos: ['agenda', 'processos', 'pendencias', 'reunioes'] as string[] })
  const [editForm, setEditForm] = useState<{ nome: string; cargo: string; modulos: string[] }>({ nome: '', cargo: '', modulos: [] })

  useEffect(() => {
    if (!profile?.is_admin) { navigate('/'); return }
    load()
  }, [profile])

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('nome')
    setUsuarios(data ?? [])
    setLoading(false)
  }

  function toggleModulo(modulo: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(modulo) ? current.filter(m => m !== modulo) : [...current, modulo])
  }

  async function criarUsuario() {
    if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) { setErro('Preencha nome, e-mail e senha.'); return }
    if (form.senha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); return }
    setSaving(true); setErro('')
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify({ email: form.email.trim(), password: form.senha, nome: form.nome.trim(), cargo: form.cargo.trim(), modulos: form.modulos }),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { setErro(json.error); return }
    setForm({ nome: '', email: '', senha: '', cargo: '', modulos: ['agenda', 'processos', 'pendencias', 'reunioes'] })
    setShowNovo(false)
    await load()
  }

  async function salvarEdicao(id: string) {
    await supabase.from('profiles').update({ nome: editForm.nome, cargo: editForm.cargo || null, modulos: editForm.modulos }).eq('id', id)
    setEditando(null)
    await load()
  }

  async function deletarUsuario(u: Profile) {
    if (!confirm(`Apagar o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('profiles').delete().eq('id', u.id)
    await load()
  }

  if (!profile?.is_admin) return null

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users size={22} /> Gestão de usuários
        </h1>
        <button onClick={() => { setShowNovo(true); setErro('') }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo usuário
        </button>
      </div>

      {/* Formulário novo usuário */}
      {showNovo && (
        <div className="card p-6 mb-6 border-brand-200 border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Novo usuário</h2>
            <button onClick={() => setShowNovo(false)}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input className="input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input className="input" placeholder="Ex: Gerente" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Módulos disponíveis</label>
            <div className="flex flex-wrap gap-2">
              {MODULOS.map(m => (
                <button key={m.key} onClick={() => toggleModulo(m.key, form.modulos, v => setForm(f => ({ ...f, modulos: v })))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${form.modulos.includes(m.key) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
          <div className="flex gap-3">
            <button onClick={() => setShowNovo(false)} className="btn-secondary">Cancelar</button>
            <button onClick={criarUsuario} disabled={saving} className="btn-primary">
              {saving ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de usuários */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card p-4 animate-pulse h-16" />)}</div>
      ) : (
        <div className="space-y-3">
          {usuarios.map(u => (
            <div key={u.id} className="card p-4">
              {editando === u.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                      <input className="input text-sm" value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
                      <input className="input text-sm" value={editForm.cargo} onChange={e => setEditForm(f => ({ ...f, cargo: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Módulos</label>
                    <div className="flex flex-wrap gap-2">
                      {MODULOS.map(m => (
                        <button key={m.key} onClick={() => toggleModulo(m.key, editForm.modulos, v => setEditForm(f => ({ ...f, modulos: v })))}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${editForm.modulos.includes(m.key) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(null)} className="btn-secondary text-xs py-1.5">Cancelar</button>
                    <button onClick={() => salvarEdicao(u.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Check size={13} /> Salvar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {u.nome?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{u.nome}</p>
                      {u.is_admin && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Admin</span>}
                    </div>
                    <p className="text-xs text-gray-400">{u.email}{u.cargo ? ` · ${u.cargo}` : ''}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(u.modulos ?? []).map((m: string) => (
                        <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {MODULOS.find(x => x.key === m)?.label ?? m}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!u.is_admin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditando(u.id); setEditForm({ nome: u.nome, cargo: u.cargo ?? '', modulos: u.modulos ?? [] }) }}
                        className="p-2 text-gray-400 hover:text-brand-600 hover:bg-gray-50 rounded-lg transition-colors">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => deletarUsuario(u)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

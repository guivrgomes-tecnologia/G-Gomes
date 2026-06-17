import { useEffect, useState } from 'react'
import { Plus, X, ChevronRight, ChevronLeft, Pencil, Trash2, Users, Settings, Building2 } from 'lucide-react'
import { supabase, Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Setor = {
  id: string; nome: string; descricao: string | null; cor: string; criado_por: string
}
type Processo = {
  id: string; titulo: string; descricao: string | null; setor_id: string | null
  responsavel_id: string | null; criado_por: string; created_at: string; updated_at: string
  responsavel?: Profile
}

const CORES_SETOR = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316']

export default function Processos() {
  const { user, profile } = useAuth()
  const isAdmin = (profile as any)?.is_admin ?? false

  const [setores, setSetores] = useState<Setor[]>([])
  const [setorAtivo, setSetorAtivo] = useState<Setor | null>(null)
  const [processos, setProcessos] = useState<Processo[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [usuariosSetor, setUsuariosSetor] = useState<string[]>([])
  const [processoAtivo, setProcessoAtivo] = useState<Processo | null>(null)

  // modais
  const [showNovoSetor, setShowNovoSetor] = useState(false)
  const [showGerenciarSetor, setShowGerenciarSetor] = useState(false)
  const [showNovoProcesso, setShowNovoProcesso] = useState(false)
  const [editandoProcesso, setEditandoProcesso] = useState(false)
  const [editandoSetor, setEditandoSetor] = useState(false)

  const [formSetor, setFormSetor] = useState({ nome: '', descricao: '', cor: CORES_SETOR[0] })
  const [formProcesso, setFormProcesso] = useState({ titulo: '', descricao: '', responsavel_id: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSetores(); loadEquipe() }, [])
  useEffect(() => { if (setorAtivo) { loadProcessos(setorAtivo.id); loadUsuariosSetor(setorAtivo.id) } }, [setorAtivo])

  async function loadEquipe() {
    const { data } = await supabase.from('profiles').select('*').order('nome')
    setEquipe(data ?? [])
  }

  async function loadSetores() {
    const { data: todos } = await supabase.from('setores').select('*').order('nome')
    if (isAdmin) {
      setSetores(todos ?? [])
      if (!setorAtivo && todos && todos.length > 0) setSetorAtivo(todos[0])
    } else {
      const { data: meus } = await supabase.from('setor_usuarios').select('setor_id').eq('usuario_id', user!.id)
      const ids = new Set((meus ?? []).map((r: any) => r.setor_id))
      const filtrados = (todos ?? []).filter(s => ids.has(s.id))
      setSetores(filtrados)
      if (!setorAtivo && filtrados.length > 0) setSetorAtivo(filtrados[0])
    }
  }

  async function loadProcessos(setorId: string) {
    const { data } = await supabase
      .from('processos')
      .select('*, responsavel:profiles!processos_responsavel_id_fkey(*)')
      .eq('setor_id', setorId)
      .order('titulo')
    setProcessos(data ?? [])
  }

  async function loadUsuariosSetor(setorId: string) {
    const { data } = await supabase.from('setor_usuarios').select('usuario_id').eq('setor_id', setorId)
    setUsuariosSetor((data ?? []).map((r: any) => r.usuario_id))
  }

  async function salvarSetor() {
    if (!formSetor.nome) return
    setSaving(true)
    if (editandoSetor && setorAtivo) {
      await supabase.from('setores').update({ nome: formSetor.nome, descricao: formSetor.descricao || null, cor: formSetor.cor }).eq('id', setorAtivo.id)
    } else {
      await supabase.from('setores').insert({ nome: formSetor.nome, descricao: formSetor.descricao || null, cor: formSetor.cor, criado_por: user!.id })
    }
    setSaving(false); setShowNovoSetor(false); setEditandoSetor(false)
    loadSetores()
  }

  async function deletarSetor(id: string) {
    if (!confirm('Deletar este setor e todos os seus processos?')) return
    await supabase.from('setores').delete().eq('id', id)
    setSetorAtivo(null); loadSetores()
  }

  async function salvarProcesso() {
    if (!formProcesso.titulo || !setorAtivo) return
    setSaving(true)
    const payload = {
      titulo: formProcesso.titulo,
      descricao: formProcesso.descricao || null,
      responsavel_id: formProcesso.responsavel_id || null,
      setor_id: setorAtivo.id,
      criado_por: user!.id,
    }
    if (editandoProcesso && processoAtivo) {
      await supabase.from('processos').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', processoAtivo.id)
    } else {
      await supabase.from('processos').insert(payload)
    }
    setSaving(false); setShowNovoProcesso(false); setEditandoProcesso(false); setProcessoAtivo(null)
    loadProcessos(setorAtivo.id)
  }

  async function deletarProcesso(id: string) {
    if (!confirm('Deletar este processo?')) return
    await supabase.from('processos').delete().eq('id', id)
    setProcessoAtivo(null); loadProcessos(setorAtivo!.id)
  }

  async function toggleUsuarioSetor(uid: string) {
    if (usuariosSetor.includes(uid)) {
      await supabase.from('setor_usuarios').delete().eq('setor_id', setorAtivo!.id).eq('usuario_id', uid)
      setUsuariosSetor(u => u.filter(x => x !== uid))
    } else {
      await supabase.from('setor_usuarios').insert({ setor_id: setorAtivo!.id, usuario_id: uid })
      setUsuariosSetor(u => [...u, uid])
    }
  }

  function abrirNovoSetor() {
    setFormSetor({ nome: '', descricao: '', cor: CORES_SETOR[0] })
    setEditandoSetor(false); setShowNovoSetor(true)
  }

  function abrirEditarSetor() {
    if (!setorAtivo) return
    setFormSetor({ nome: setorAtivo.nome, descricao: setorAtivo.descricao ?? '', cor: setorAtivo.cor })
    setEditandoSetor(true); setShowNovoSetor(true)
  }

  function abrirNovoProcesso() {
    setFormProcesso({ titulo: '', descricao: '', responsavel_id: '' })
    setEditandoProcesso(false); setShowNovoProcesso(true)
  }

  function abrirEditarProcesso(p: Processo) {
    setFormProcesso({ titulo: p.titulo, descricao: p.descricao ?? '', responsavel_id: p.responsavel_id ?? '' })
    setProcessoAtivo(p); setEditandoProcesso(true); setShowNovoProcesso(true)
  }

  return (
    <div className="flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden">

      {/* Sidebar de setores — oculta no mobile quando setor selecionado */}
      <div className={`${setorAtivo ? 'hidden lg:flex' : 'flex'} w-full lg:w-64 bg-white border-r border-gray-200 flex-col shrink-0`}>
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Setores</h2>
          {isAdmin && (
            <button onClick={abrirNovoSetor} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700">
              <Plus size={16} />
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {setores.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6 px-4">
              {isAdmin ? 'Nenhum setor. Clique em + para criar.' : 'Você não tem acesso a nenhum setor.'}
            </p>
          )}
          {setores.map(s => (
            <button
              key={s.id}
              onClick={() => setSetorAtivo(s)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${setorAtivo?.id === s.id ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
              <span className="truncate">{s.nome}</span>
              {setorAtivo?.id === s.id && <ChevronRight size={14} className="ml-auto shrink-0 text-gray-400" />}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo principal — oculta no mobile quando nenhum setor selecionado */}
      <div className={`${!setorAtivo ? 'hidden lg:flex' : 'flex'} flex-1 overflow-y-auto flex-col`}>
        {!setorAtivo ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p>Selecione um setor</p>
            </div>
          </div>
        ) : (
          <div className="p-4 lg:p-6">
            {/* Header do setor */}
            <div className="flex items-start justify-between mb-6 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setSetorAtivo(null)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0">
                  <ChevronLeft size={18} />
                </button>
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: setorAtivo.cor }} />
                <div className="min-w-0">
                  <h1 className="text-lg lg:text-xl font-bold text-gray-900 truncate">{setorAtivo.nome}</h1>
                  {setorAtivo.descricao && <p className="text-xs lg:text-sm text-gray-500 mt-0.5">{setorAtivo.descricao}</p>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {isAdmin && (
                  <>
                    <button onClick={() => setShowGerenciarSetor(true)} className="btn-secondary flex items-center gap-1 text-xs px-2 py-1.5">
                      <Users size={12} /> <span className="hidden sm:inline">Acesso</span>
                    </button>
                    <button onClick={abrirEditarSetor} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deletarSetor(setorAtivo.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                {isAdmin && (
                  <button onClick={abrirNovoProcesso} className="btn-primary flex items-center gap-1 text-xs px-2.5 py-1.5">
                    <Plus size={13} /> Novo
                  </button>
                )}
              </div>
            </div>

            {/* Lista de processos */}
            {processos.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <Settings size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum processo cadastrado neste setor</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {processos.map(p => (
                  <div key={p.id} onClick={() => setProcessoAtivo(p)}
                    className="card p-5 cursor-pointer hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{p.titulo}</h3>
                        {p.descricao && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.descricao}</p>
                        )}
                        {p.responsavel && (
                          <p className="text-xs text-gray-400 mt-2">
                            Responsável: <span className="text-gray-600 font-medium">{(p.responsavel as Profile).nome}</span>
                          </p>
                        )}
                      </div>
                      <ChevronRight size={16} className="text-gray-300 mt-1 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal detalhe do processo */}
      {processoAtivo && !showNovoProcesso && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: setorAtivo?.cor }} />
                  <span className="text-xs text-gray-400 uppercase tracking-wide">{setorAtivo?.nome}</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{processoAtivo.titulo}</h2>
                {processoAtivo.responsavel && (
                  <p className="text-sm text-gray-500 mt-1">
                    Responsável: <span className="font-medium text-gray-700">{(processoAtivo.responsavel as Profile).nome}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setProcessoAtivo(null)} className="p-1 hover:bg-gray-100 rounded shrink-0"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {processoAtivo.descricao ? (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {processoAtivo.descricao}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Sem documentação cadastrada.</p>
              )}
            </div>

            {isAdmin && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => abrirEditarProcesso(processoAtivo)} className="btn-secondary flex items-center gap-2 flex-1">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => deletarProcesso(processoAtivo.id)} className="flex items-center gap-2 flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={14} /> Deletar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal novo/editar setor */}
      {showNovoSetor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editandoSetor ? 'Editar setor' : 'Novo setor'}</h3>
              <button onClick={() => setShowNovoSetor(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input className="input" value={formSetor.nome} onChange={e => setFormSetor(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Financeiro" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input className="input" value={formSetor.descricao} onChange={e => setFormSetor(f => ({ ...f, descricao: e.target.value }))} placeholder="Breve descrição do setor" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES_SETOR.map(cor => (
                    <button key={cor} onClick={() => setFormSetor(f => ({ ...f, cor }))}
                      className={`w-7 h-7 rounded-full transition-transform ${formSetor.cor === cor ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: cor }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNovoSetor(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarSetor} disabled={saving || !formSetor.nome} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo/editar processo */}
      {showNovoProcesso && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editandoProcesso ? 'Editar processo' : 'Novo processo'}</h3>
              <button onClick={() => { setShowNovoProcesso(false); setEditandoProcesso(false); setProcessoAtivo(null) }} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" value={formProcesso.titulo} onChange={e => setFormProcesso(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Fechamento de caixa" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                <select className="input" value={formProcesso.responsavel_id} onChange={e => setFormProcesso(f => ({ ...f, responsavel_id: e.target.value }))}>
                  <option value="">Ninguém</option>
                  {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Documentação</label>
                <textarea
                  className="input resize-none"
                  rows={12}
                  value={formProcesso.descricao}
                  onChange={e => setFormProcesso(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descreva como este processo funciona, quais são os passos, regras, observações importantes..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => { setShowNovoProcesso(false); setEditandoProcesso(false); setProcessoAtivo(null) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarProcesso} disabled={saving || !formProcesso.titulo} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gerenciar acesso ao setor */}
      {showGerenciarSetor && setorAtivo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Acesso ao setor</h3>
              <button onClick={() => setShowGerenciarSetor(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Selecione quem pode ver os processos de <strong>{setorAtivo.nome}</strong>:</p>
            <div className="space-y-2">
              {equipe.filter(p => p.id !== user?.id).map(p => {
                const temAcesso = usuariosSetor.includes(p.id)
                return (
                  <label key={p.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={temAcesso} onChange={() => toggleUsuarioSetor(p.id)} className="w-4 h-4 accent-brand-600" />
                    <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
                      {p.nome[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                      <p className="text-xs text-gray-400">{p.cargo ?? p.email}</p>
                    </div>
                  </label>
                )
              })}
            </div>
            <button onClick={() => setShowGerenciarSetor(false)} className="btn-primary w-full mt-4">Concluído</button>
          </div>
        </div>
      )}
    </div>
  )
}

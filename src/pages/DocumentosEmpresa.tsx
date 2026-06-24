import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, X, ExternalLink, FileText, Pencil, FolderOpen, Search, KeyRound, Eye, EyeOff, Copy, Check } from 'lucide-react'

type Documento = {
  id: string; titulo: string; descricao: string | null
  url: string | null; categoria: string; criado_por: string; created_at: string
}
type FormDoc = { titulo: string; descricao: string; url: string; categoria: string }
const FORM_DOC_VAZIO: FormDoc = { titulo: '', descricao: '', url: '', categoria: '' }

type Senha = {
  id: string; titulo: string; usuario: string | null; senha: string
  url: string | null; endereco: string | null; observacoes: string | null; categoria: string | null; criado_por: string; created_at: string
}
type FormSenha = { titulo: string; usuario: string; senha: string; url: string; endereco: string; observacoes: string; categoria: string }
const FORM_SENHA_VAZIO: FormSenha = { titulo: '', usuario: '', senha: '', url: '', endereco: '', observacoes: '', categoria: '' }

type Aba = 'documentos' | 'senhas'

export default function DocumentosEmpresa() {
  const { user } = useAuth()
  const [aba, setAba] = useState<Aba>('documentos')

  // Documentos
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Documento | null>(null)
  const [form, setForm] = useState<FormDoc>(FORM_DOC_VAZIO)

  // Senhas
  const [senhas, setSenhas] = useState<Senha[]>([])
  const [buscaSenha, setBuscaSenha] = useState('')
  const [categoriaSenha, setCategoriaSenha] = useState<string | null>(null)
  const [showFormSenha, setShowFormSenha] = useState(false)
  const [editandoSenha, setEditandoSenha] = useState<Senha | null>(null)
  const [formSenha, setFormSenha] = useState<FormSenha>(FORM_SENHA_VAZIO)
  const [senhasVisiveis, setSenhasVisiveis] = useState<Record<string, boolean>>({})
  const [copiado, setCopiado] = useState<string | null>(null)
  const [mostrarSenhaForm, setMostrarSenhaForm] = useState(false)

  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const [{ data: docs }, { data: profs }, { data: senhasData }] = await Promise.all([
      supabase.from('documentos_empresa').select('*').order('categoria').order('titulo'),
      supabase.from('profiles').select('id, nome'),
      supabase.from('senhas_empresa').select('*').order('titulo'),
    ])
    setDocumentos(docs ?? [])
    setSenhas(senhasData ?? [])
    const map: Record<string, string> = {}
    for (const p of profs ?? []) map[p.id] = p.nome
    setProfiles(map)
  }

  // ===== DOCUMENTOS =====
  const categorias = [...new Set(documentos.map(d => d.categoria))].sort()
  const docsFiltrados = documentos.filter(d => {
    const matchCat = !categoriaSelecionada || d.categoria === categoriaSelecionada
    const matchBusca = !busca || d.titulo.toLowerCase().includes(busca.toLowerCase()) || d.descricao?.toLowerCase().includes(busca.toLowerCase()) || d.categoria.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })
  const docsPorCategoria = categorias.reduce<Record<string, Documento[]>>((acc, cat) => {
    const docs = docsFiltrados.filter(d => d.categoria === cat)
    if (docs.length > 0) acc[cat] = docs
    return acc
  }, {})

  function abrirNovo() {
    setEditando(null)
    setForm({ ...FORM_DOC_VAZIO, categoria: categoriaSelecionada ?? '' })
    setShowForm(true)
  }
  function abrirEdicao(doc: Documento) {
    setEditando(doc)
    setForm({ titulo: doc.titulo, descricao: doc.descricao ?? '', url: doc.url ?? '', categoria: doc.categoria })
    setShowForm(true)
  }
  async function salvar() {
    if (!form.titulo.trim() || !form.categoria.trim()) return
    setSaving(true)
    if (editando) {
      await supabase.from('documentos_empresa').update({
        titulo: form.titulo.trim(), descricao: form.descricao.trim() || null,
        url: form.url.trim() || null, categoria: form.categoria.trim(),
      }).eq('id', editando.id)
    } else {
      await supabase.from('documentos_empresa').insert({
        titulo: form.titulo.trim(), descricao: form.descricao.trim() || null,
        url: form.url.trim() || null, categoria: form.categoria.trim(), criado_por: user!.id,
      })
    }
    setForm(FORM_DOC_VAZIO); setShowForm(false); setEditando(null)
    await load(); setSaving(false)
  }
  async function deletar(id: string) {
    if (!confirm('Apagar este documento?')) return
    await supabase.from('documentos_empresa').delete().eq('id', id)
    await load()
  }

  // ===== SENHAS =====
  const categoriasSenha = [...new Set(senhas.map(s => s.categoria).filter(Boolean) as string[])].sort()

  const senhasFiltradas = senhas.filter(s => {
    const matchCat = !categoriaSenha || s.categoria === categoriaSenha
    const matchBusca = !buscaSenha || s.titulo.toLowerCase().includes(buscaSenha.toLowerCase()) ||
      s.usuario?.toLowerCase().includes(buscaSenha.toLowerCase()) ||
      s.url?.toLowerCase().includes(buscaSenha.toLowerCase()) ||
      s.categoria?.toLowerCase().includes(buscaSenha.toLowerCase())
    return matchCat && matchBusca
  })

  const senhasPorCategoria = (() => {
    const cats = [...new Set(senhasFiltradas.map(s => s.categoria ?? 'Geral'))].sort()
    return cats.reduce<Record<string, Senha[]>>((acc, cat) => {
      acc[cat] = senhasFiltradas.filter(s => (s.categoria ?? 'Geral') === cat)
      return acc
    }, {})
  })()

  function abrirNovaSenha() {
    setEditandoSenha(null)
    setFormSenha({ ...FORM_SENHA_VAZIO, categoria: categoriaSenha ?? '' })
    setMostrarSenhaForm(false)
    setShowFormSenha(true)
  }
  function abrirEdicaoSenha(s: Senha) {
    setEditandoSenha(s)
    setFormSenha({ titulo: s.titulo, usuario: s.usuario ?? '', senha: s.senha, url: s.url ?? '', endereco: s.endereco ?? '', observacoes: s.observacoes ?? '', categoria: s.categoria ?? '' })
    setMostrarSenhaForm(true)
    setShowFormSenha(true)
  }
  async function salvarSenha() {
    if (!formSenha.titulo.trim() || !formSenha.senha.trim()) return
    setSaving(true)
    if (editandoSenha) {
      await supabase.from('senhas_empresa').update({
        titulo: formSenha.titulo.trim(), usuario: formSenha.usuario.trim() || null,
        senha: formSenha.senha, url: formSenha.url.trim() || null,
        endereco: formSenha.endereco.trim() || null,
        observacoes: formSenha.observacoes.trim() || null,
        categoria: formSenha.categoria.trim() || null,
      }).eq('id', editandoSenha.id)
    } else {
      await supabase.from('senhas_empresa').insert({
        titulo: formSenha.titulo.trim(), usuario: formSenha.usuario.trim() || null,
        senha: formSenha.senha, url: formSenha.url.trim() || null,
        endereco: formSenha.endereco.trim() || null,
        observacoes: formSenha.observacoes.trim() || null,
        categoria: formSenha.categoria.trim() || null, criado_por: user!.id,
      })
    }
    setFormSenha(FORM_SENHA_VAZIO); setShowFormSenha(false); setEditandoSenha(null)
    await load(); setSaving(false)
  }
  async function deletarSenha(id: string) {
    if (!confirm('Apagar esta senha?')) return
    await supabase.from('senhas_empresa').delete().eq('id', id)
    await load()
  }
  function toggleVisivel(id: string) {
    setSenhasVisiveis(v => ({ ...v, [id]: !v[id] }))
  }
  async function copiarSenha(id: string, texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiado(id)
    setTimeout(() => setCopiado(c => c === id ? null : c), 2000)
  }

  const catSugestoes = [...categorias].sort()

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
        </div>
        <button
          onClick={() => aba === 'documentos' ? abrirNovo() : abrirNovaSenha()}
          className="btn-primary flex items-center gap-1.5 text-sm py-2 px-4">
          <Plus size={16} /> {aba === 'documentos' ? 'Novo documento' : 'Nova senha'}
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setAba('documentos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'documentos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <FolderOpen size={15} /> Documentos
        </button>
        <button onClick={() => setAba('senhas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'senhas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <KeyRound size={15} /> Senhas
        </button>
      </div>

      {/* ===== ABA DOCUMENTOS ===== */}
      {aba === 'documentos' && (<>
        {/* Busca + filtro categoria */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar documentos..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCategoriaSelecionada(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!categoriaSelecionada ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Todos
            </button>
            {categorias.map(cat => (
              <button key={cat} onClick={() => setCategoriaSelecionada(categoriaSelecionada === cat ? null : cat)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${categoriaSelecionada === cat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Modal form documento */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{editando ? 'Editar documento' : 'Novo documento'}</h3>
                <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <input className="input" placeholder="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoria *</label>
                <input className="input" placeholder="Ex: Jurídico, RH, Financeiro, Imóvel..."
                  value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} list="cat-sugestoes" />
                <datalist id="cat-sugestoes">{catSugestoes.map(c => <option key={c} value={c} />)}</datalist>
                {categorias.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {categorias.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, categoria: c }))}
                        className={`px-2 py-0.5 rounded-md text-xs transition-colors ${form.categoria === c ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea className="input resize-none" rows={2} placeholder="Descrição / observações"
                value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              <input className="input" placeholder="Link (Google Drive, Dropbox...)"
                value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={salvar} disabled={saving || !form.titulo.trim() || !form.categoria.trim()} className="btn-primary flex-1 text-sm">
                  {editando ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {documentos.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <FolderOpen size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Nenhum documento cadastrado</p>
            <p className="text-sm mt-1">Adicione documentos da empresa organizados por setor</p>
          </div>
        )}
        {docsFiltrados.length === 0 && documentos.length > 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhum documento encontrado.</div>
        )}

        <div className="space-y-6">
          {Object.entries(docsPorCategoria).map(([cat, docs]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={16} className="text-brand-500" />
                <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{cat}</h2>
                <span className="text-xs text-gray-400">({docs.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docs.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 group hover:border-brand-200 transition-colors">
                    <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={16} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{d.titulo}</p>
                      {d.descricao && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{d.descricao}</p>}
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline mt-1">
                          <ExternalLink size={11} /> Abrir link
                        </a>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5">
                        {profiles[d.criado_por] ?? 'Desconhecido'} • {new Date(d.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => abrirEdicao(d)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded-lg hover:bg-brand-50 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deletar(d.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>)}

      {/* ===== ABA SENHAS ===== */}
      {aba === 'senhas' && (<>
        {/* Busca + filtro categoria */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar senhas..." value={buscaSenha} onChange={e => setBuscaSenha(e.target.value)} />
          </div>
          {categoriasSenha.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setCategoriaSenha(null)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!categoriaSenha ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Todas
              </button>
              {categoriasSenha.map(cat => (
                <button key={cat} onClick={() => setCategoriaSenha(categoriaSenha === cat ? null : cat)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${categoriaSenha === cat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal form senha */}
        {showFormSenha && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowFormSenha(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{editandoSenha ? 'Editar senha' : 'Nova senha'}</h3>
                <button onClick={() => setShowFormSenha(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <input className="input" placeholder="Serviço / sistema *" value={formSenha.titulo}
                onChange={e => setFormSenha(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              <input className="input" placeholder="Usuário / e-mail" value={formSenha.usuario}
                onChange={e => setFormSenha(f => ({ ...f, usuario: e.target.value }))} />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Senha *</label>
                <div className="relative">
                  <input className="input pr-10" type={mostrarSenhaForm ? 'text' : 'password'} placeholder="Senha"
                    value={formSenha.senha} onChange={e => setFormSenha(f => ({ ...f, senha: e.target.value }))} />
                  <button type="button" onClick={() => setMostrarSenhaForm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {mostrarSenhaForm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Categoria</label>
                <input className="input" placeholder="Ex: Câmeras, E-mails, Alarmes, Wi-Fi..."
                  value={formSenha.categoria} onChange={e => setFormSenha(f => ({ ...f, categoria: e.target.value }))}
                  list="cat-senha-sugestoes" />
                <datalist id="cat-senha-sugestoes">{categoriasSenha.map(c => <option key={c} value={c} />)}</datalist>
                {categoriasSenha.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {categoriasSenha.map(c => (
                      <button key={c} type="button" onClick={() => setFormSenha(f => ({ ...f, categoria: c }))}
                        className={`px-2 py-0.5 rounded-md text-xs transition-colors ${formSenha.categoria === c ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input className="input" placeholder="URL (opcional)" value={formSenha.url}
                onChange={e => setFormSenha(f => ({ ...f, url: e.target.value }))} />
              <input className="input" placeholder="Endereço (ex: Rua Principal, 123 / Sede SP)" value={formSenha.endereco}
                onChange={e => setFormSenha(f => ({ ...f, endereco: e.target.value }))} />
              <textarea className="input resize-none" rows={2} placeholder="Observações"
                value={formSenha.observacoes} onChange={e => setFormSenha(f => ({ ...f, observacoes: e.target.value }))} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowFormSenha(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={salvarSenha} disabled={saving || !formSenha.titulo.trim() || !formSenha.senha.trim()} className="btn-primary flex-1 text-sm">
                  {editandoSenha ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {senhas.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <KeyRound size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Nenhuma senha cadastrada</p>
            <p className="text-sm mt-1">Guarde as senhas da empresa com segurança</p>
          </div>
        )}
        {senhasFiltradas.length === 0 && senhas.length > 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhuma senha encontrada.</div>
        )}

        <div className="space-y-6">
          {Object.entries(senhasPorCategoria).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <KeyRound size={15} className="text-yellow-500" />
                <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{cat}</h2>
                <span className="text-xs text-gray-400">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map(s => (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 group hover:border-brand-200 transition-colors">
                    <div className="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center shrink-0">
                      <KeyRound size={16} className="text-yellow-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">{s.titulo}</p>
                      {s.usuario && <p className="text-sm text-gray-500 truncate">{s.usuario}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-mono text-gray-700 tracking-wider">
                          {senhasVisiveis[s.id] ? s.senha : '••••••••'}
                        </span>
                        <button onClick={() => toggleVisivel(s.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {senhasVisiveis[s.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button onClick={() => copiarSenha(s.id, s.senha)} className="text-gray-400 hover:text-brand-600 transition-colors">
                          {copiado === s.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                        </button>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-brand-600 transition-colors">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      {s.endereco && <p className="text-xs text-gray-500 mt-0.5">📍 {s.endereco}</p>}
                      {s.observacoes && <p className="text-xs text-gray-400 mt-0.5">{s.observacoes}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {profiles[s.criado_por] ?? 'Desconhecido'} • {new Date(s.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => abrirEdicaoSenha(s)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded-lg hover:bg-brand-50 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deletarSenha(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>)}
    </div>
  )
}

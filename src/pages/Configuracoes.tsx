import { useEffect, useState } from 'react'
import { Settings, Plus, Trash2, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type ConfigLoja = { id: string; nome: string; percentual_padrao: number; ordem: number }

export default function Configuracoes() {
  const { user } = useAuth()
  const [lojas, setLojas] = useState<ConfigLoja[]>([])
  const [loading, setLoading] = useState(true)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})
  const [novaLoja, setNovaLoja] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('config_lojas').select('*').order('ordem')
    setLojas(data ?? [])
    setLoading(false)
  }

  async function adicionarLoja() {
    if (!novaLoja.trim()) return
    setSalvando(true)
    const ordem = lojas.length
    const { data } = await supabase.from('config_lojas').insert({ nome: novaLoja.trim(), percentual_padrao: 120, ordem, usuario_id: user!.id }).select().single()
    if (data) setLojas(prev => [...prev, data])
    setNovaLoja('')
    setSalvando(false)
  }

  async function atualizarLoja(id: string, valor: string) {
    setLojas(prev => prev.map(l => l.id === id ? { ...l, nome: valor } : l))
    await supabase.from('config_lojas').update({ nome: valor }).eq('id', id)
  }

  async function removerLoja(id: string) {
    if (!confirm('Remover essa loja da lista? Listas de preço que já usam ela não são afetadas.')) return
    await supabase.from('config_lojas').delete().eq('id', id)
    setLojas(prev => prev.filter(l => l.id !== id))
  }

  if (loading) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings size={24} /> Configurações</h1>
        <p className="text-sm text-gray-400">Listas centrais usadas em outras telas do app</p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <Store size={15} /> Lojas
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Essa lista aparece sempre que uma tela pedir pra escolher entre as lojas (ex.: novas listas de preço na entrada de notas).
          Alterar aqui muda em todo lugar que usa essa lista. A margem de cada lista de preço é definida na própria página de cálculo de preços.
        </p>

        <div className="space-y-2 mb-3">
          {lojas.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <input className="flex-1 input text-sm" value={editBuffer[`nome-${l.id}`] ?? l.nome}
                onChange={e => setEditBuffer(b => ({ ...b, [`nome-${l.id}`]: e.target.value }))}
                onBlur={e => { atualizarLoja(l.id, e.target.value); setEditBuffer(b => { const x = { ...b }; delete x[`nome-${l.id}`]; return x }) }} />
              <button onClick={() => removerLoja(l.id)} className="text-gray-300 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>
            </div>
          ))}
          {lojas.length === 0 && <p className="text-sm text-gray-400 italic py-2">Nenhuma loja cadastrada ainda.</p>}
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <input className="input text-sm flex-1" placeholder="Nome da loja" value={novaLoja}
            onChange={e => setNovaLoja(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarLoja()} />
          <button onClick={adicionarLoja} disabled={salvando || !novaLoja.trim()} className="btn-primary text-sm flex items-center gap-1.5 px-3 shrink-0">
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Settings, Plus, Trash2, Store, GripVertical } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type ConfigLoja = { id: string; nome: string; percentual_padrao: number; ordem: number; cnpj?: string }

export default function Configuracoes() {
  const { user } = useAuth()
  const [lojas, setLojas] = useState<ConfigLoja[]>([])
  const [loading, setLoading] = useState(true)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})
  const [novaLoja, setNovaLoja] = useState('')
  const [salvando, setSalvando] = useState(false)

  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

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
    const { data } = await supabase
      .from('config_lojas')
      .insert({ nome: novaLoja.trim(), percentual_padrao: 120, ordem, usuario_id: user!.id })
      .select().single()
    if (data) setLojas(prev => [...prev, data])
    setNovaLoja('')
    setSalvando(false)
  }

  async function atualizarCampo(id: string, campo: 'nome' | 'cnpj', valor: string) {
    setLojas(prev => prev.map(l => l.id === id ? { ...l, [campo]: valor } : l))
    await supabase.from('config_lojas').update({ [campo]: valor }).eq('id', id)
  }

  async function removerLoja(id: string) {
    if (!confirm('Remover essa loja da lista? Listas de preço que já usam ela não são afetadas.')) return
    await supabase.from('config_lojas').delete().eq('id', id)
    setLojas(prev => prev.filter(l => l.id !== id))
  }

  function handleDragStart(index: number) { dragIndex.current = index }
  function handleDragOver(e: React.DragEvent, index: number) { e.preventDefault(); setDragOver(index) }
  function handleDrop(dropIndex: number) {
    const from = dragIndex.current
    if (from === null || from === dropIndex) { reset(); return }
    const reordered = [...lojas]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(dropIndex, 0, moved)
    const comOrdem = reordered.map((l, i) => ({ ...l, ordem: i }))
    setLojas(comOrdem)
    reset()
    Promise.all(comOrdem.map(l => supabase.from('config_lojas').update({ ordem: l.ordem }).eq('id', l.id)))
  }
  function reset() { dragIndex.current = null; setDragOver(null) }

  if (loading) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings size={24} /> Configurações</h1>
        <p className="text-sm text-gray-400">Listas centrais usadas em outras telas do app</p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <Store size={15} /> Lojas
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          O CNPJ é usado para reconhecer automaticamente as lojas ao importar pedidos em xlsx.
          Arraste pelo <GripVertical size={11} className="inline" /> para reordenar.
        </p>

        {/* Header das colunas */}
        <div className="flex items-center gap-2 px-1 mb-1">
          <span className="w-5 shrink-0" />
          <span className="flex-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">Nome da loja</span>
          <span className="w-44 shrink-0 text-[11px] font-medium text-gray-400 uppercase tracking-wide">CNPJ</span>
          <span className="w-6 shrink-0" />
        </div>

        <div className="space-y-2 mb-3">
          {lojas.map((l, index) => (
            <div
              key={l.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={reset}
              className={`flex items-center gap-2 rounded-lg transition-all ${
                dragOver === index && dragIndex.current !== index ? 'ring-2 ring-brand-400 bg-brand-50' : ''
              } ${dragIndex.current === index ? 'opacity-40' : ''}`}
            >
              <span className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 touch-none">
                <GripVertical size={16} />
              </span>
              <input
                className="flex-1 input text-sm"
                value={editBuffer[`nome-${l.id}`] ?? l.nome}
                onChange={e => setEditBuffer(b => ({ ...b, [`nome-${l.id}`]: e.target.value }))}
                onBlur={e => {
                  atualizarCampo(l.id, 'nome', e.target.value)
                  setEditBuffer(b => { const x = { ...b }; delete x[`nome-${l.id}`]; return x })
                }}
              />
              <input
                className="w-44 shrink-0 input text-sm font-mono"
                placeholder="00.000.000/0000-00"
                value={editBuffer[`cnpj-${l.id}`] ?? (l.cnpj ?? '')}
                onChange={e => setEditBuffer(b => ({ ...b, [`cnpj-${l.id}`]: e.target.value }))}
                onBlur={e => {
                  atualizarCampo(l.id, 'cnpj', e.target.value)
                  setEditBuffer(b => { const x = { ...b }; delete x[`cnpj-${l.id}`]; return x })
                }}
              />
              <button onClick={() => removerLoja(l.id)} className="text-gray-300 hover:text-red-400 shrink-0 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {lojas.length === 0 && (
            <p className="text-sm text-gray-400 italic py-2">Nenhuma loja cadastrada ainda.</p>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <input
            className="input text-sm flex-1"
            placeholder="Nome da loja"
            value={novaLoja}
            onChange={e => setNovaLoja(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarLoja()}
          />
          <button
            onClick={adicionarLoja}
            disabled={salvando || !novaLoja.trim()}
            className="btn-primary text-sm flex items-center gap-1.5 px-3 shrink-0"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}

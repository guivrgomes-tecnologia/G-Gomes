import { useEffect, useState } from 'react'
import { Calendar, X } from 'lucide-react'
import { supabase, CategoriaEvento } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { localDatetimeToISO, calcularDataFim } from '../lib/eventoHelpers'
import SeletorDuracao from './SeletorDuracao'
import SeletorLembretes from './SeletorLembretes'

const CORES_PRESET = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16']

function agoraLocal() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NovoEventoModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { user } = useAuth()
  const [categorias, setCategorias] = useState<CategoriaEvento[]>([])
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [cor, setCor] = useState(CORES_PRESET[0])
  const [diaInteiro, setDiaInteiro] = useState(false)
  const [dataInicio, setDataInicio] = useState(agoraLocal())
  const [duracao, setDuracao] = useState(15)
  const [lembretes, setLembretes] = useState<number[]>([15])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('categorias_evento').select('*').order('nome').then(({ data }) => setCategorias(data ?? []))
  }, [])

  function escolherCategoria(id: string) {
    setCategoriaId(id)
    const cat = categorias.find(c => c.id === id)
    if (cat) setCor(cat.cor)
  }

  async function salvar() {
    if (!titulo.trim() || !dataInicio) return
    setSaving(true)
    const base = diaInteiro ? dataInicio.split('T')[0] : localDatetimeToISO(dataInicio)
    await supabase.from('eventos').insert({
      titulo: titulo.trim(), descricao: descricao.trim() || null,
      data_inicio: base, data_fim: diaInteiro ? null : calcularDataFim(dataInicio, duracao),
      dia_inteiro: diaInteiro, cor, categoria_id: categoriaId || null,
      criado_por: user!.id, concluido: false, lembrete_minutos: lembretes[0] ?? 0, lembretes_minutos: lembretes,
    })
    setSaving(false)
    onCreated?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Calendar size={18} /> Novo evento</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Reunião de equipe" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea className="input resize-none" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          {categorias.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select className="input" value={categoriaId} onChange={e => escolherCategoria(e.target.value)}>
                <option value="">Sem categoria</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {CORES_PRESET.map(c => (
                <button key={c} onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${cor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="dia_inteiro_dash" checked={diaInteiro} onChange={e => setDiaInteiro(e.target.checked)} />
            <label htmlFor="dia_inteiro_dash" className="text-sm text-gray-700">Dia inteiro</label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{diaInteiro ? 'Data' : 'Início'} *</label>
              <input type={diaInteiro ? 'date' : 'datetime-local'} className="input"
                value={diaInteiro ? dataInicio.split('T')[0] : dataInicio}
                onChange={e => setDataInicio(e.target.value)} />
            </div>
            {!diaInteiro && (
              <SeletorDuracao value={duracao} onChange={setDuracao} />
            )}
          </div>

          <SeletorLembretes value={lembretes} onChange={setLembretes} />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={salvar} disabled={saving || !titulo.trim() || !dataInicio} className="btn-primary flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

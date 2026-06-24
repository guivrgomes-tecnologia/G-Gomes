import { Plus, X } from 'lucide-react'
import { LEMBRETE_OPCOES, MAX_LEMBRETES } from '../lib/eventoHelpers'

export default function SeletorLembretes({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  function atualizar(i: number, minutos: number) {
    onChange(value.map((v, idx) => idx === i ? minutos : v))
  }
  function remover(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }
  function adicionar() {
    const proximo = LEMBRETE_OPCOES.find(o => !value.includes(o.value))?.value ?? 15
    onChange([...value, proximo])
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Lembretes</label>
      <div className="space-y-2">
        {value.length === 0 && <p className="text-xs text-gray-400">Nenhum lembrete.</p>}
        {value.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className="input flex-1" value={v} onChange={e => atualizar(i, Number(e.target.value))}>
              {LEMBRETE_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => remover(i)} className="text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>
      {value.length < MAX_LEMBRETES && (
        <button onClick={adicionar} className="mt-2 flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
          <Plus size={14} /> Adicionar lembrete
        </button>
      )}
    </div>
  )
}

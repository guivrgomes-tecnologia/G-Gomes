import { useState } from 'react'
import { DURACAO_OPCOES, formatDuracao } from '../lib/eventoHelpers'

export default function SeletorDuracao({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [personalizada, setPersonalizada] = useState(() => !DURACAO_OPCOES.includes(value))
  const [unidade, setUnidade] = useState<'min' | 'h'>(() => (value >= 60 && value % 60 === 0 ? 'h' : 'min'))
  const [quantidade, setQuantidade] = useState(() => (value >= 60 && value % 60 === 0 ? value / 60 : value))

  function aplicar(qtd: number, un: 'min' | 'h') {
    const q = Math.max(1, qtd)
    setQuantidade(q)
    setUnidade(un)
    onChange(q * (un === 'h' ? 60 : 1))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Duração</label>
      <select className="input" value={personalizada ? 'custom' : value}
        onChange={e => {
          if (e.target.value === 'custom') { setPersonalizada(true); return }
          setPersonalizada(false)
          onChange(Number(e.target.value))
        }}>
        {DURACAO_OPCOES.map(d => <option key={d} value={d}>{formatDuracao(d)}</option>)}
        <option value="custom">Personalizada...</option>
      </select>
      {personalizada && (
        <div className="flex items-center gap-2 mt-2">
          <input type="number" min={1} className="input" value={quantidade} onChange={e => aplicar(Number(e.target.value), unidade)} />
          <select className="input" value={unidade} onChange={e => aplicar(quantidade, e.target.value as 'min' | 'h')}>
            <option value="min">minutos</option>
            <option value="h">horas</option>
          </select>
        </div>
      )}
    </div>
  )
}

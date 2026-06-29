type Serie = { name: string; color: string; values: number[] }

export default function BarChart({ labels, series, formatValue = String, height = 240 }: {
  labels: string[]
  series: Serie[]
  formatValue?: (v: number) => string
  height?: number
}) {
  const max = Math.max(1, ...series.flatMap(s => s.values))
  const colWidth = 90
  const chartHeight = height - 40
  const totalWidth = Math.max(labels.length * colWidth, 320)

  if (labels.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-12">Sem dados pra mostrar.</p>
  }

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${totalWidth} ${height}`} className="w-full" style={{ minWidth: totalWidth }}>
          {[0.25, 0.5, 0.75, 1].map(f => {
            const y = chartHeight - f * chartHeight + 10
            return <line key={f} x1={0} x2={totalWidth} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
          })}
          {labels.map((label, i) => {
            const groupX = i * colWidth + 8
            const barAreaWidth = colWidth - 16
            const barWidth = barAreaWidth / series.length
            return (
              <g key={label}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0
                  const barHeight = max > 0 ? (v / max) * chartHeight : 0
                  const x = groupX + si * barWidth
                  const y = chartHeight - barHeight + 10
                  return (
                    <g key={s.name}>
                      <rect x={x} y={y} width={Math.max(barWidth - 4, 2)} height={Math.max(barHeight, 0)} fill={s.color} rx={3} />
                      {v > 0 && (
                        <text x={x + (barWidth - 4) / 2} y={y - 4} fontSize={9} textAnchor="middle" fill="#374151">
                          {formatValue(v)}
                        </text>
                      )}
                    </g>
                  )
                })}
                <text x={groupX + barAreaWidth / 2} y={chartHeight + 26} fontSize={10} textAnchor="middle" fill="#6b7280">
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {series.length > 1 && (
        <div className="flex items-center gap-4 mt-2 flex-wrap justify-center">
          {series.map(s => (
            <div key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

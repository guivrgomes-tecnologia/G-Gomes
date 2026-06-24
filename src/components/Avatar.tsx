export default function Avatar({ nome, avatarUrl, size = 24, className = '' }: {
  nome: string; avatarUrl?: string | null; size?: number; className?: string
}) {
  const px = `${size}px`
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={nome} title={nome}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px }} />
    )
  }
  return (
    <div title={nome}
      className={`rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{ width: px, height: px, fontSize: size * 0.45 }}>
      {nome?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

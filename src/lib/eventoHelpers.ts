export const DURACAO_OPCOES = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480]
export const MAX_LEMBRETES = 5

export const LEMBRETE_OPCOES = [
  { label: 'Na hora do evento', value: 0 },
  { label: '5 minutos antes', value: 5 },
  { label: '10 minutos antes', value: 10 },
  { label: '15 minutos antes', value: 15 },
  { label: '30 minutos antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '2 horas antes', value: 120 },
  { label: '1 dia antes', value: 1440 },
  { label: '2 dias antes', value: 2880 },
  { label: '1 semana antes', value: 10080 },
]

export function formatDuracao(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}

export function localDatetimeToISO(dt: string) {
  return new Date(dt).toISOString()
}

export function calcularDataFim(dataInicioLocal: string, duracaoMin: number) {
  return new Date(new Date(dataInicioLocal).getTime() + duracaoMin * 60000).toISOString()
}

export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

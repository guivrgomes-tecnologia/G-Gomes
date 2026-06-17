import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function dtStart(iso: string, diaInteiro: boolean): string {
  if (diaInteiro) return 'DTSTART;VALUE=DATE:' + iso.split('T')[0].replace(/-/g, '')
  return 'DTSTART:' + new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function dtEnd(fim: string | null, inicio: string, diaInteiro: boolean): string {
  if (diaInteiro) return 'DTEND;VALUE=DATE:' + inicio.split('T')[0].replace(/-/g, '')
  const end = fim
    ? new Date(fim).toISOString()
    : new Date(new Date(inicio).getTime() + 3600000).toISOString()
  return 'DTEND:' + end.replace(/[-:]/g, '').split('.')[0] + 'Z'
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) return new Response('Token obrigatório', { status: 400 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: calToken } = await supabase
    .from('calendar_tokens')
    .select('usuario_id')
    .eq('token', token)
    .single()

  if (!calToken) return new Response('Token inválido', { status: 401 })

  const userId = calToken.usuario_id

  // Eventos criados pelo usuário
  const { data: meusEventos } = await supabase
    .from('eventos')
    .select('*')
    .eq('criado_por', userId)

  // Eventos onde é participante
  const { data: participacoes } = await supabase
    .from('evento_participantes')
    .select('evento_id')
    .eq('usuario_id', userId)

  const idsParticipando = (participacoes ?? []).map((p: any) => p.evento_id)

  let eventosParticipando: any[] = []
  if (idsParticipando.length > 0) {
    const { data } = await supabase
      .from('eventos')
      .select('*')
      .in('id', idsParticipando)
    eventosParticipando = data ?? []
  }

  // Merge sem duplicatas
  const meusIds = new Set((meusEventos ?? []).map((e: any) => e.id))
  const todos = [
    ...(meusEventos ?? []),
    ...eventosParticipando.filter((e: any) => !meusIds.has(e.id)),
  ].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brasil Lar//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Brasil Lar',
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ]

  for (const ev of todos) {
    linhas.push('BEGIN:VEVENT')
    linhas.push(`UID:${ev.id}@brasil-lar`)
    linhas.push(`DTSTAMP:${now}`)
    linhas.push(dtStart(ev.data_inicio, ev.dia_inteiro))
    linhas.push(dtEnd(ev.data_fim, ev.data_inicio, ev.dia_inteiro))
    linhas.push(`SUMMARY:${(ev.titulo as string).replace(/\n/g, '\\n')}`)
    if (ev.descricao) linhas.push(`DESCRIPTION:${(ev.descricao as string).replace(/\n/g, '\\n')}`)
    if (ev.concluido) linhas.push('STATUS:COMPLETED')
    linhas.push('END:VEVENT')
  }

  linhas.push('END:VCALENDAR')

  return new Response(linhas.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
})

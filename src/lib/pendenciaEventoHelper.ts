import { supabase } from './supabase'

const PENDENCIA_COR = '#1e293b'

function localToISO(dt: string) { return new Date(dt).toISOString() }

type EventoSyncPayload = {
  id: string
  titulo: string
  titulo_google: string
  descricao?: string | null
  data_inicio: string
  data_fim?: string | null
  dia_inteiro: boolean
}

async function contasConectadas(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await supabase.from('google_tokens').select('usuario_id').in('usuario_id', ids)
  return new Set((data ?? []).map(r => r.usuario_id))
}

// Sincroniza um evento novo com o Google Calendar de TODOS os envolvidos conectados (criador + participantes),
// não só do criador. Cada conta ganha sua própria cópia do evento; guardamos o id de cada cópia em
// evento_participante_google pra poder atualizar/excluir depois. A cópia do criador continua usando a
// coluna eventos.google_event_id (comportamento já existente, mantido por compatibilidade com o resto do app).
export async function sincronizarCriacaoGoogle(payload: EventoSyncPayload, criadorId: string, participantesIds: string[]) {
  const todos = Array.from(new Set([criadorId, ...participantesIds]))
  const conectados = await contasConectadas(todos)
  for (const uid of todos) {
    if (!conectados.has(uid)) continue
    const ehCriador = uid === criadorId
    const { data } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'create', user_id: uid, evento: { ...payload, atualizar_tabela_eventos: ehCriador } },
    })
    if (data?.google_event_id && !ehCriador) {
      await supabase.from('evento_participante_google').upsert(
        { evento_id: payload.id, usuario_id: uid, google_event_id: data.google_event_id },
        { onConflict: 'evento_id,usuario_id' }
      )
    }
  }
}

export async function sincronizarAtualizacaoGoogle(payload: EventoSyncPayload, criadorId: string) {
  const [{ data: eventoRow }, { data: vinculos }] = await Promise.all([
    supabase.from('eventos').select('google_event_id').eq('id', payload.id).maybeSingle(),
    supabase.from('evento_participante_google').select('usuario_id, google_event_id').eq('evento_id', payload.id),
  ])
  const alvos = [{ usuario_id: criadorId, google_event_id: eventoRow?.google_event_id ?? null }, ...(vinculos ?? [])]
  for (const v of alvos) {
    if (!v.google_event_id) continue
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'update', user_id: v.usuario_id, evento: { ...payload, google_event_id: v.google_event_id } },
    })
  }
}

export async function sincronizarExclusaoGoogle(eventoId: string, criadorId: string) {
  const [{ data: eventoRow }, { data: vinculos }] = await Promise.all([
    supabase.from('eventos').select('google_event_id').eq('id', eventoId).maybeSingle(),
    supabase.from('evento_participante_google').select('usuario_id, google_event_id').eq('evento_id', eventoId),
  ])
  const alvos = [{ usuario_id: criadorId, google_event_id: eventoRow?.google_event_id ?? null }, ...(vinculos ?? [])]
  for (const v of alvos) {
    if (!v.google_event_id) continue
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'delete', user_id: v.usuario_id, evento: { google_event_id: v.google_event_id } },
    })
  }
  await supabase.from('evento_participante_google').delete().eq('evento_id', eventoId)
}

export async function criarEventoDaPendencia(
  titulo: string, descricao: string | null, prazo: string, hora: string,
  userId: string, pendenciaId: string, participantesIds: string[] = []
): Promise<string | null> {
  const dataInicio = hora ? localToISO(`${prazo}T${hora}`) : prazo
  let horaFim: string | null = null
  if (hora) {
    const [h, m] = hora.split(':').map(Number)
    const d = new Date(2000, 0, 1, h, m + 1)
    horaFim = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const dataFim = horaFim ? localToISO(`${prazo}T${horaFim}`) : null
  const { data: evento } = await supabase.from('eventos').insert({
    titulo: `📌 ${titulo}`, descricao: descricao || null,
    data_inicio: dataInicio, data_fim: dataFim,
    dia_inteiro: !hora, cor: PENDENCIA_COR, concluido: false, criado_por: userId,
  }).select('id').single()
  if (!evento) return null

  // Inclui todos os destinatários como participantes, inclusive o próprio criador quando ele se marcou
  // como destinatário (necessário pra Agenda decidir se o evento deve aparecer pra ele).
  await supabase.from('pendencias').update({ evento_id: evento.id }).eq('id', pendenciaId)
  if (participantesIds.length > 0) {
    await supabase.from('evento_participantes').insert(participantesIds.map(uid => ({ evento_id: evento.id, usuario_id: uid })))
  }

  await sincronizarCriacaoGoogle(
    { id: evento.id, titulo: `📌 ${titulo}`, titulo_google: `P - ${titulo}`, descricao: descricao || null, data_inicio: dataInicio, data_fim: dataFim, dia_inteiro: !hora },
    userId, participantesIds,
  )
  return evento.id
}

// Reaplica título/data/descrição no evento vinculado a uma pendência editada, e propaga a mudança
// pra todas as cópias no Google Calendar (criador + participantes conectados).
export async function atualizarEventoDaPendencia(
  eventoId: string, titulo: string, descricao: string | null, prazo: string, hora: string, criadorId: string, concluido: boolean
) {
  const dataInicio = hora ? localToISO(`${prazo}T${hora}`) : prazo
  let horaFim: string | null = null
  if (hora) {
    const [h, m] = hora.split(':').map(Number)
    const d = new Date(2000, 0, 1, h, m + 1)
    horaFim = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const dataFim = horaFim ? localToISO(`${prazo}T${horaFim}`) : null
  const prefixo = concluido ? '✅' : '📌'
  const tituloEvento = `${prefixo} ${titulo}`

  await supabase.from('eventos').update({
    titulo: tituloEvento, descricao: descricao || null,
    data_inicio: dataInicio, data_fim: dataFim, dia_inteiro: !hora, concluido,
  }).eq('id', eventoId)

  await sincronizarAtualizacaoGoogle({
    id: eventoId, titulo: tituloEvento, titulo_google: `${concluido ? '✅' : 'P'} - ${titulo}`,
    descricao: descricao || null, data_inicio: dataInicio, data_fim: dataFim, dia_inteiro: !hora,
  }, criadorId)
}

// Só atualiza o status de concluído (usado quando a pendência muda de status, sem editar título/data).
export async function sincronizarConclusaoPendencia(eventoId: string, criadorId: string, concluido: boolean) {
  const { data: evt } = await supabase.from('eventos').select('*').eq('id', eventoId).single()
  if (!evt) return
  const tituloBase = (evt.titulo as string).replace(/^(📌|✅)\s*/, '')
  const novoTitulo = `${concluido ? '✅' : '📌'} ${tituloBase}`
  await supabase.from('eventos').update({ titulo: novoTitulo, concluido }).eq('id', eventoId)
  await sincronizarAtualizacaoGoogle({
    id: eventoId, titulo: novoTitulo, titulo_google: `${concluido ? '✅' : 'P'} - ${tituloBase}`,
    descricao: evt.descricao, data_inicio: evt.data_inicio, data_fim: evt.data_fim, dia_inteiro: evt.dia_inteiro,
  }, criadorId)
}

export async function atualizarParticipantesEvento(eventoId: string, novosIds: string[]) {
  await supabase.from('evento_participantes').delete().eq('evento_id', eventoId)
  if (novosIds.length > 0) {
    await supabase.from('evento_participantes').insert(novosIds.map(uid => ({ evento_id: eventoId, usuario_id: uid })))
  }
}

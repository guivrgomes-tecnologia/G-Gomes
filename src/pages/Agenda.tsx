import { useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Calendar, Pencil, Trash2, CheckCircle2, Users, Link2, Settings, Tag, Video, AlertCircle } from 'lucide-react'
import { supabase, Evento, Profile, CategoriaEvento } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import GoogleCalendarSync from '../components/GoogleCalendarSync'

const COR_PADRAO = '#0ea5e9'
const CORES_PRESET = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA_ABREV = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

type View = 'mes' | 'semana' | 'dia'
type Recorrencia = 'nao' | 'diario' | 'semanal' | 'mensal' | 'anual'

const LEMBRETE_OPCOES = [
  { label: 'Na hora do evento', value: 0 },
  { label: '10 minutos antes', value: 10 },
  { label: '15 minutos antes', value: 15 },
  { label: '20 minutos antes', value: 20 },
  { label: '30 minutos antes', value: 30 },
  { label: '45 minutos antes', value: 45 },
  { label: '1 hora antes', value: 60 },
  { label: '2 horas antes', value: 120 },
  { label: '3 horas antes', value: 180 },
  { label: '6 horas antes', value: 360 },
  { label: '8 horas antes', value: 480 },
  { label: '12 horas antes', value: 720 },
  { label: '24 horas antes', value: 1440 },
]

type FormState = {
  titulo: string; descricao: string; data_inicio: string; data_fim: string
  dia_inteiro: boolean; cor: string; categoria_id: string; recorrencia: Recorrencia; recorrencia_ate: string
  participantes: string[]; lembrete_minutos: number
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', data_inicio: '', data_fim: '',
  dia_inteiro: true, cor: COR_PADRAO, categoria_id: '', recorrencia: 'nao', recorrencia_ate: '',
  participantes: [], lembrete_minutos: 15,
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function getMondayOf(d: Date) { const day = d.getDay(); return addDays(d, day === 0 ? -6 : 1 - day) }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay() }

function gerarDatasRecorrentes(base: string, rec: Recorrencia, ate: string): string[] {
  const datas: string[] = []
  const fim = new Date(ate)
  let atual = new Date(base)
  while (atual <= fim && datas.length < 365) {
    datas.push(toDateStr(atual))
    if (rec === 'diario') atual = addDays(atual, 1)
    else if (rec === 'semanal') atual = addDays(atual, 7)
    else if (rec === 'mensal') { atual = new Date(atual); atual.setMonth(atual.getMonth() + 1) }
    else if (rec === 'anual') { atual = new Date(atual); atual.setFullYear(atual.getFullYear() + 1) }
    else break
  }
  return datas
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
// Converte datetime-local (sem fuso) para ISO com offset correto do browser
function localDatetimeToISO(dt: string) {
  return new Date(dt).toISOString()
}
function formatDataHora(ev: Evento) {
  if (ev.dia_inteiro) {
    return new Date(ev.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  const inicio = new Date(ev.data_inicio).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const hf = ev.data_fim ? ` – ${formatHora(ev.data_fim)}` : ''
  return `${inicio}, ${formatHora(ev.data_inicio)}${hf}`
}

function corDoEvento(ev: Evento): string {
  return (ev.categoria as CategoriaEvento | undefined)?.cor ?? ev.cor ?? COR_PADRAO
}

function Avatar({ nome, size = 'sm' }: { nome: string; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  return (
    <div className={`${s} rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold shrink-0`} title={nome}>
      {nome[0]?.toUpperCase()}
    </div>
  )
}

export default function Agenda() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [categorias, setCategorias] = useState<CategoriaEvento[]>([])
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<View>((searchParams.get('view') as View) ?? 'mes')
  const [hoje] = useState(new Date())
  const [cursor, setCursor] = useState(new Date())
  const semanaRef = useRef<HTMLDivElement>(null)

  const [showNovo, setShowNovo] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [showCats, setShowCats] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)

  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null)
  const [reuniaoVinculada, setReuniaoVinculada] = useState<{ id: string; pasta_id: string } | null>(null)
  const [pendenciaVinculada, setPendenciaVinculada] = useState<{ id: string; titulo: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [editForm, setEditForm] = useState<Partial<FormState>>({})
  const [participantesAtivos, setParticipantesAtivos] = useState<Profile[]>([])

  // escopo de recorrência (deletar/editar)
  const [modalEscopo, setModalEscopo] = useState<{ tipo: 'deletar' | 'editar' } | null>(null)

  // gerenciar categorias
  const [catNome, setCatNome] = useState('')
  const [catCor, setCatCor] = useState(CORES_PRESET[0])
  const [savingCat, setSavingCat] = useState(false)

  useEffect(() => { loadEventos(); loadEquipe(); loadCategorias() }, [cursor, view])

  useEffect(() => {
    if (searchParams.get('novo') === '1') abrirNovo()
  }, [])

  useEffect(() => {
    if (view === 'semana' && semanaRef.current) {
      const hora = new Date().getHours()
      semanaRef.current.scrollTop = Math.max(0, hora - 1) * 56
    }
  }, [view])

  async function loadEquipe() {
    const { data } = await supabase.from('profiles').select('*').order('nome')
    setEquipe(data ?? [])
  }

  async function loadCategorias() {
    const { data } = await supabase.from('categorias_evento').select('*').order('nome')
    setCategorias(data ?? [])
  }

  async function loadEventos() {
    let inicio: string, fim: string
    if (view === 'mes') {
      inicio = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
      fim    = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
    } else if (view === 'semana') {
      const seg = getMondayOf(cursor)
      inicio = toDateStr(seg); fim = toDateStr(addDays(seg, 6))
    } else {
      inicio = fim = toDateStr(cursor)
    }

    const { data: meus } = await supabase.from('eventos')
      .select('*, categoria:categorias_evento(*)')
      .gte('data_inicio', inicio).lte('data_inicio', fim + 'T23:59:59').order('data_inicio')

    const { data: participando } = await supabase
      .from('evento_participantes').select('evento_id').eq('usuario_id', user!.id)

    const idsParticipando = (participando ?? []).map(p => p.evento_id)

    if (idsParticipando.length > 0) {
      const { data: eventosParticipando } = await supabase.from('eventos')
        .select('*, categoria:categorias_evento(*)')
        .in('id', idsParticipando)
        .gte('data_inicio', inicio).lte('data_inicio', fim + 'T23:59:59')
      const meusIds = new Set((meus ?? []).map(e => e.id))
      const extras = (eventosParticipando ?? []).filter(e => !meusIds.has(e.id))
      setEventos([...(meus ?? []), ...extras])
    } else {
      setEventos(meus ?? [])
    }
  }

  async function loadParticipantes(eventoId: string) {
    const { data } = await supabase
      .from('evento_participantes').select('profile:profiles(*)').eq('evento_id', eventoId)
    setParticipantesAtivos((data ?? []).map((r: any) => r.profile))
  }

  async function salvarParticipantes(eventoId: string, ids: string[]) {
    await supabase.from('evento_participantes').delete().eq('evento_id', eventoId)
    if (ids.length > 0) {
      await supabase.from('evento_participantes').insert(ids.map(uid => ({ evento_id: eventoId, usuario_id: uid })))
    }
  }

  function eventosNaData(dateStr: string) {
    return eventos.filter(e => e.data_inicio.startsWith(dateStr))
  }

  function abrirNovo(dateStr?: string) {
    setForm({ ...FORM_INITIAL, data_inicio: dateStr ? dateStr + 'T08:00' : '', data_fim: dateStr ? dateStr + 'T09:00' : '' })
    setShowNovo(true)
  }

  async function abrirEvento(ev: Evento, e: React.MouseEvent) {
    e.stopPropagation()
    setEventoAtivo(ev)
    setEditando(false)
    setReuniaoVinculada(null)
    setPendenciaVinculada(null)
    loadParticipantes(ev.id)
    const { data: reunData } = await supabase.from('reunioes').select('id, pasta_id').eq('evento_id', ev.id).maybeSingle()
    if (reunData) setReuniaoVinculada(reunData)
    const { data: pendData } = await supabase.from('pendencias').select('id, titulo').eq('evento_id', ev.id).maybeSingle()
    if (pendData) setPendenciaVinculada(pendData)
  }

  async function salvarNovo() {
    if (!form.titulo || !form.data_inicio) return
    setSaving(true)
    const base = form.dia_inteiro ? form.data_inicio.split('T')[0] : localDatetimeToISO(form.data_inicio)
    const comum = {
      titulo: form.titulo, descricao: form.descricao || null,
      data_fim: form.data_fim ? localDatetimeToISO(form.data_fim) : null, dia_inteiro: form.dia_inteiro,
      cor: form.cor, categoria_id: form.categoria_id || null,
      criado_por: user!.id, concluido: false, lembrete_minutos: form.lembrete_minutos,
    }

    if (form.recorrencia !== 'nao' && form.recorrencia_ate) {
      const grupo = crypto.randomUUID()
      const datas = gerarDatasRecorrentes(base, form.recorrencia, form.recorrencia_ate)
      const { data: inserted } = await supabase.from('eventos').insert(datas.map(d => ({ ...comum, data_inicio: d, recorrencia_grupo: grupo }))).select('id')
      if (form.participantes.length > 0 && inserted) {
        const rows = inserted.flatMap((ev: { id: string }) => form.participantes.map(uid => ({ evento_id: ev.id, usuario_id: uid })))
        await supabase.from('evento_participantes').insert(rows)
      }
    } else {
      const { data: inserted } = await supabase.from('eventos').insert({ ...comum, data_inicio: base }).select('id').single()
      if (form.participantes.length > 0 && inserted) {
        await salvarParticipantes(inserted.id, form.participantes)
      }
    }
    setSaving(false); setShowNovo(false); loadEventos()
  }

  function pedirEscopo(tipo: 'deletar' | 'editar') {
    if (eventoAtivo?.recorrencia_grupo) {
      setModalEscopo({ tipo })
    } else {
      if (tipo === 'deletar') executarDeletar('este')
      else executarEdicao('este')
    }
  }

  async function executarEdicao(escopo: 'este' | 'proximos' | 'todos') {
    if (!eventoAtivo) return
    if (!editando && escopo === 'este') { setModalEscopo(null); setEditando(true); return }
    setSaving(true)
    const campos = {
      titulo:       editForm.titulo      ?? eventoAtivo.titulo,
      descricao:    editForm.descricao   ?? eventoAtivo.descricao,
      data_fim:     editForm.data_fim    ?? eventoAtivo.data_fim,
      dia_inteiro:  editForm.dia_inteiro ?? eventoAtivo.dia_inteiro,
      cor:          editForm.cor         ?? eventoAtivo.cor,
      categoria_id: editForm.categoria_id !== undefined ? (editForm.categoria_id || null) : eventoAtivo.categoria_id,
      lembrete_minutos: editForm.lembrete_minutos ?? eventoAtivo.lembrete_minutos,
    }
    if (escopo === 'este') {
      const di = editForm.data_inicio ?? eventoAtivo.data_inicio
      await supabase.from('eventos').update({ ...campos, data_inicio: campos.dia_inteiro ? di.split('T')[0] : localDatetimeToISO(di) }).eq('id', eventoAtivo.id)
      await salvarParticipantes(eventoAtivo.id, editForm.participantes ?? participantesAtivos.map(p => p.id))
    } else if (escopo === 'proximos' && eventoAtivo.recorrencia_grupo) {
      await supabase.from('eventos').update(campos)
        .eq('recorrencia_grupo', eventoAtivo.recorrencia_grupo)
        .gte('data_inicio', eventoAtivo.data_inicio)
    } else if (escopo === 'todos' && eventoAtivo.recorrencia_grupo) {
      await supabase.from('eventos').update(campos).eq('recorrencia_grupo', eventoAtivo.recorrencia_grupo)
    }
    setSaving(false); setModalEscopo(null); setEventoAtivo(null); loadEventos()
  }

  async function executarDeletar(escopo: 'este' | 'proximos' | 'todos') {
    if (!eventoAtivo) return
    if (escopo === 'este') {
      await supabase.from('eventos').delete().eq('id', eventoAtivo.id)
    } else if (escopo === 'proximos' && eventoAtivo.recorrencia_grupo) {
      await supabase.from('eventos').delete()
        .eq('recorrencia_grupo', eventoAtivo.recorrencia_grupo)
        .gte('data_inicio', eventoAtivo.data_inicio)
    } else if (escopo === 'todos' && eventoAtivo.recorrencia_grupo) {
      await supabase.from('eventos').delete().eq('recorrencia_grupo', eventoAtivo.recorrencia_grupo)
    }
    setModalEscopo(null); setEventoAtivo(null); loadEventos()
  }

  async function toggleConcluido(ev: Evento) {
    await supabase.from('eventos').update({ concluido: !ev.concluido }).eq('id', ev.id)
    setEventoAtivo(null); loadEventos()
  }

  async function deletarEvento() {
    pedirEscopo('deletar')
  }

  async function salvarCategoria() {
    if (!catNome.trim()) return
    setSavingCat(true)
    await supabase.from('categorias_evento').insert({ nome: catNome.trim(), cor: catCor, criado_por: user!.id })
    setCatNome(''); setCatCor(CORES_PRESET[0])
    setSavingCat(false)
    loadCategorias()
  }

  async function deletarCategoria(id: string) {
    if (!confirm('Deletar esta categoria?')) return
    await supabase.from('categorias_evento').delete().eq('id', id)
    loadCategorias()
  }

  function navAnterior() {
    if (view === 'mes')         setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
    else if (view === 'semana') setCursor(addDays(cursor, -7))
    else                        setCursor(addDays(cursor, -1))
  }
  function navProximo() {
    if (view === 'mes')         setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    else if (view === 'semana') setCursor(addDays(cursor, 7))
    else                        setCursor(addDays(cursor, 1))
  }

  function tituloPeriodo() {
    if (view === 'mes') return `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'semana') {
      const seg = getMondayOf(cursor), dom = addDays(seg, 6)
      if (seg.getMonth() === dom.getMonth())
        return `${seg.getDate()} – ${dom.getDate()} de ${MESES[seg.getMonth()]} ${seg.getFullYear()}`
      return `${seg.getDate()} ${MESES[seg.getMonth()]} – ${dom.getDate()} ${MESES[dom.getMonth()]} ${dom.getFullYear()}`
    }
    return cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const isHoje = (ds: string) => ds === toDateStr(hoje)

  function toggleParticipante(id: string, lista: string[], setLista: (v: string[]) => void) {
    setLista(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id])
  }

  function SeletorParticipantes({ selecionados, onChange }: { selecionados: string[]; onChange: (v: string[]) => void }) {
    const outros = equipe.filter(p => p.id !== user?.id)
    if (outros.length === 0) return null
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
          <Users size={14} /> Participantes <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {outros.map(p => {
            const sel = selecionados.includes(p.id)
            return (
              <button key={p.id} type="button" onClick={() => toggleParticipante(p.id, selecionados, onChange)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm border transition-colors ${sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                <Avatar nome={p.nome} />
                {p.nome.split(' ')[0]}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function SeletorCategoria({ value, onChange }: { value: string; onChange: (id: string, cor: string) => void }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
          <Tag size={14} /> Categoria <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        {categorias.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma categoria criada. Use o botão <strong>Categorias</strong> para criar.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange('', COR_PADRAO)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${value === '' ? 'bg-gray-200 text-gray-800 border-gray-300' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              Nenhuma
            </button>
            {categorias.map(cat => (
              <button key={cat.id} type="button" onClick={() => onChange(cat.id, cat.cor)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${value === cat.id ? 'text-white' : 'text-gray-700 hover:opacity-80'}`}
                style={value === cat.id ? { backgroundColor: cat.cor, borderColor: cat.cor } : { borderColor: cat.cor + '88' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.cor }} />
                {cat.nome}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function EventoChip({ ev, extraClass = '' }: { ev: Evento; extraClass?: string }) {
    const cor = corDoEvento(ev)
    const ehParticipante = ev.criado_por !== user?.id
    return (
      <div onClick={e => abrirEvento(ev, e)}
        className={`text-xs px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-90 transition-opacity ${ev.concluido ? 'opacity-60' : ''} ${extraClass}`}
        style={{ backgroundColor: cor }} title={ev.titulo}>
        <span className={ev.concluido ? 'line-through' : ''}>
          {ehParticipante && <span className="mr-1 opacity-80">👥</span>}
          {!ev.dia_inteiro && <span className="opacity-80 mr-1">{formatHora(ev.data_inicio)}</span>}
          {ev.titulo}
        </span>
      </div>
    )
  }

  const HORAS = Array.from({ length: 24 }, (_, i) => i)

  function ViewMes() {
    const daysInMonth = getDaysInMonth(cursor.getFullYear(), cursor.getMonth())
    const firstDay    = getFirstDayOfMonth(cursor.getFullYear(), cursor.getMonth())
    return (
      <div className="grid grid-cols-7">
        {DIAS_SEMANA_ABREV.map(d => <div key={d} className="text-center text-xs font-medium text-gray-500 py-3 border-b border-gray-100">{d}</div>)}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="border-b border-r border-gray-100 min-h-[100px]" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dia = i + 1
          const ds = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
          const evs = eventosNaData(ds)
          const isTd = isHoje(ds)
          return (
            <div key={dia} onClick={() => abrirNovo(ds)}
              className={`border-b border-r border-gray-100 min-h-[100px] p-2 cursor-pointer hover:bg-gray-50 transition-colors ${(firstDay + dia - 1) % 7 === 6 ? 'border-r-0' : ''}`}>
              <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full ${isTd ? 'bg-brand-600 text-white' : 'text-gray-700'}`}>{dia}</span>
              <div className="mt-1 space-y-0.5">
                {evs.slice(0, 3).map(ev => <EventoChip key={ev.id} ev={ev} />)}
                {evs.length > 3 && <p className="text-xs text-gray-400">+{evs.length - 3} mais</p>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function ViewSemana() {
    const seg = getMondayOf(cursor)
    const dias = Array.from({ length: 7 }, (_, i) => addDays(seg, i))
    return (
      <div ref={semanaRef} className="overflow-auto max-h-[70vh]">
        <div className="grid grid-cols-8 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="py-3 px-2" />
          {dias.map((d, i) => {
            const ds = toDateStr(d); const isTd = isHoje(ds)
            return (
              <div key={i} onClick={() => { setCursor(d); setView('dia') }} className="py-3 text-center cursor-pointer hover:bg-gray-50 transition-colors">
                <p className="text-xs text-gray-500">{DIAS_SEMANA_ABREV[d.getDay()]}</p>
                <span className={`inline-flex items-center justify-center w-8 h-8 text-sm font-semibold rounded-full mt-0.5 ${isTd ? 'bg-brand-600 text-white' : 'text-gray-700'}`}>{d.getDate()}</span>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-8">
          {HORAS.map(h => (
            <>
              <div key={`h${h}`} className="border-b border-gray-100 py-2 px-2 text-right text-xs text-gray-400 min-h-[56px]">{h > 0 && `${String(h).padStart(2,'0')}:00`}</div>
              {dias.map((d, di) => {
                const ds = toDateStr(d)
                const evs = eventosNaData(ds).filter(ev => ev.dia_inteiro ? h === 0 : new Date(ev.data_inicio).getHours() === h)
                return (
                  <div key={`${h}-${di}`} onClick={() => abrirNovo(ds)} className="border-b border-l border-gray-100 min-h-[56px] p-0.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    {evs.map(ev => <EventoChip key={ev.id} ev={ev} extraClass="mb-0.5" />)}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
    )
  }

  function ViewDia() {
    const ds = toDateStr(cursor)
    const evsDiaInteiro = eventosNaData(ds).filter(ev => ev.dia_inteiro)
    return (
      <div className="overflow-auto max-h-[70vh]">
        {evsDiaInteiro.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-200 flex flex-wrap gap-1.5">
            <span className="text-xs text-gray-400 mr-1 self-center">Dia inteiro:</span>
            {evsDiaInteiro.map(ev => <EventoChip key={ev.id} ev={ev} />)}
          </div>
        )}
        {HORAS.map(h => {
          const evs = eventosNaData(ds).filter(ev => !ev.dia_inteiro && new Date(ev.data_inicio).getHours() === h)
          const isCurrent = isHoje(ds) && new Date().getHours() === h
          return (
            <div key={h} onClick={() => abrirNovo(ds)} className={`flex border-b border-gray-100 min-h-[60px] cursor-pointer hover:bg-gray-50 transition-colors ${isCurrent ? 'bg-brand-50' : ''}`}>
              <div className="w-16 shrink-0 py-2 px-3 text-right text-xs text-gray-400 font-medium">{`${String(h).padStart(2,'0')}:00`}</div>
              <div className="flex-1 p-1.5 space-y-0.5">
                {evs.map(ev => {
                  const cor = corDoEvento(ev)
                  return (
                    <div key={ev.id} onClick={e => abrirEvento(ev, e)}
                      className={`text-sm px-2 py-1 rounded text-white cursor-pointer hover:opacity-90 ${ev.concluido ? 'opacity-60' : ''}`}
                      style={{ backgroundColor: cor }}>
                      <span className={ev.concluido ? 'line-through font-medium' : 'font-medium'}>{ev.titulo}</span>
                      {ev.data_fim && <span className="opacity-80 ml-2 text-xs">{formatHora(ev.data_inicio)} – {formatHora(ev.data_fim)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function ModalEvento() {
    if (!eventoAtivo) return null
    const ev = eventoAtivo
    const ef = editForm
    const idsEdit = ef.participantes ?? participantesAtivos.map(p => p.id)
    const catAtiva = (ev.categoria as CategoriaEvento | undefined)
    const corAtiva = corDoEvento(ev)

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corAtiva }} />
              <h3 className="text-lg font-semibold">{editando ? 'Editar evento' : 'Evento'}</h3>
            </div>
            <button onClick={() => setEventoAtivo(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          {!editando ? (
            <div className="space-y-3">
              <div>
                <p className={`text-xl font-semibold text-gray-900 ${ev.concluido ? 'line-through text-gray-400' : ''}`}>{ev.titulo}</p>
                <p className="text-sm text-gray-500 mt-1">{formatDataHora(ev)}</p>
              </div>
              {catAtiva && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium text-white" style={{ backgroundColor: catAtiva.cor }}>
                  <Tag size={10} /> {catAtiva.nome}
                </span>
              )}
              {ev.descricao && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{ev.descricao}</p>}
              {participantesAtivos.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1"><Users size={12} /> Participantes</p>
                  <div className="flex flex-wrap gap-2">
                    {participantesAtivos.map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Avatar nome={p.nome} size="sm" />
                        {p.nome.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {reuniaoVinculada && (
                <button
                  onClick={() => { setEventoAtivo(null); navigate('/reunioes') }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors border border-purple-200">
                  <Video size={15} /> Ver reunião vinculada
                </button>
              )}
              {pendenciaVinculada && (
                <button
                  onClick={() => { setEventoAtivo(null); navigate('/pendencias') }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors border border-red-200">
                  <AlertCircle size={15} />
                  <span className="flex-1 text-left truncate">Pendência: {pendenciaVinculada.titulo}</span>
                </button>
              )}
              {ev.concluido && (
                <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Evento concluído
                </p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => toggleConcluido(ev)}
                  className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${ev.concluido ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'}`}>
                  <CheckCircle2 size={16} />
                  {ev.concluido ? 'Marcar como não concluído' : 'Marcar como concluído'}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setEditForm({ titulo: ev.titulo, descricao: ev.descricao ?? '', data_inicio: ev.data_inicio, data_fim: ev.data_fim ?? '', dia_inteiro: ev.dia_inteiro, cor: ev.cor, categoria_id: ev.categoria_id ?? '', participantes: participantesAtivos.map(p => p.id), lembrete_minutos: ev.lembrete_minutos ?? 15 })
                    pedirEscopo('editar')
                  }} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => deletarEvento()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} /> Deletar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input className="input" value={ef.titulo ?? ''} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="input resize-none" rows={2} value={ef.descricao ?? ''} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <SeletorCategoria
                value={ef.categoria_id ?? ev.categoria_id ?? ''}
                onChange={(id, cor) => setEditForm(f => ({ ...f, categoria_id: id, cor }))}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="edit_dia_inteiro" checked={ef.dia_inteiro ?? ev.dia_inteiro} onChange={e => setEditForm(f => ({ ...f, dia_inteiro: e.target.checked }))} />
                <label htmlFor="edit_dia_inteiro" className="text-sm text-gray-700">Dia inteiro</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{(ef.dia_inteiro ?? ev.dia_inteiro) ? 'Data' : 'Início'}</label>
                  <input type={(ef.dia_inteiro ?? ev.dia_inteiro) ? 'date' : 'datetime-local'} className="input"
                    value={(ef.dia_inteiro ?? ev.dia_inteiro) ? (ef.data_inicio ?? ev.data_inicio).split('T')[0] : (ef.data_inicio ?? ev.data_inicio)}
                    onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                {!(ef.dia_inteiro ?? ev.dia_inteiro) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
                    <input type="datetime-local" className="input" value={ef.data_fim ?? ev.data_fim ?? ''} onChange={e => setEditForm(f => ({ ...f, data_fim: e.target.value }))} />
                  </div>
                )}
              </div>
              <SeletorParticipantes selecionados={idsEdit} onChange={ids => setEditForm(f => ({ ...f, participantes: ids }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lembrete</label>
                <select className="input" value={ef.lembrete_minutos ?? ev.lembrete_minutos ?? 15} onChange={e => setEditForm(f => ({ ...f, lembrete_minutos: Number(e.target.value) }))}>
                  {LEMBRETE_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditando(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => pedirEscopo('editar')} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function ModalCategorias() {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="card w-full max-w-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Tag size={18} /> Categorias</h3>
            <button onClick={() => setShowCats(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>

          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {categorias.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Nenhuma categoria ainda</p>}
            {categorias.map(cat => (
              <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
                <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: cat.cor }} />
                <span className="flex-1 text-sm text-gray-800">{cat.nome}</span>
                <button onClick={() => deletarCategoria(cat.id)} className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Nova categoria</p>
            <input className="input" placeholder="Nome da categoria" value={catNome} onChange={e => setCatNome(e.target.value)} />
            <div>
              <p className="text-xs text-gray-500 mb-2">Cor</p>
              <div className="flex flex-wrap gap-2">
                {CORES_PRESET.map(cor => (
                  <button key={cor} onClick={() => setCatCor(cor)}
                    className={`w-7 h-7 rounded-full transition-transform ${catCor === cor ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                    style={{ backgroundColor: cor }} />
                ))}
              </div>
            </div>
            <button onClick={salvarCategoria} disabled={savingCat || !catNome.trim()} className="btn-primary w-full">
              {savingCat ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
        <div className="flex gap-2">
          {profile?.is_admin && (
            <button onClick={() => setShowCats(true)} className="btn-secondary flex items-center gap-2">
              <Settings size={16} /> Categorias
            </button>
          )}
          <button onClick={() => setShowSync(true)} className="btn-secondary flex items-center gap-2">
            <Link2 size={16} /> Google Calendar
          </button>
          <button onClick={() => abrirNovo()} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo evento
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={navAnterior} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
            <h2 className="text-base font-semibold min-w-[220px] text-center">{tituloPeriodo()}</h2>
            <button onClick={navProximo}  className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['mes','semana','dia'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
        </div>

        {view === 'mes'    && <ViewMes />}
        {view === 'semana' && <ViewSemana />}
        {view === 'dia'    && <ViewDia />}
      </div>

      {showNovo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Calendar size={18} /> Novo Evento</h3>
              <button onClick={() => setShowNovo(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Reunião de equipe" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="input resize-none" rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <SeletorCategoria
                value={form.categoria_id}
                onChange={(id, cor) => setForm(f => ({ ...f, categoria_id: id, cor }))}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="dia_inteiro" checked={form.dia_inteiro} onChange={e => setForm(f => ({ ...f, dia_inteiro: e.target.checked }))} />
                <label htmlFor="dia_inteiro" className="text-sm text-gray-700">Dia inteiro</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{form.dia_inteiro ? 'Data' : 'Início'} *</label>
                  <input type={form.dia_inteiro ? 'date' : 'datetime-local'} className="input"
                    value={form.dia_inteiro ? form.data_inicio.split('T')[0] : form.data_inicio}
                    onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                {!form.dia_inteiro && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
                    <input type="datetime-local" className="input" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repetir</label>
                <select className="input" value={form.recorrencia} onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value as Recorrencia, recorrencia_ate: '' }))}>
                  <option value="nao">Não repete</option>
                  <option value="diario">Diariamente</option>
                  <option value="semanal">Semanalmente</option>
                  <option value="mensal">Mensalmente</option>
                  <option value="anual">Anualmente</option>
                </select>
              </div>
              {form.recorrencia !== 'nao' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repetir até *</label>
                  <input type="date" className="input" value={form.recorrencia_ate} onChange={e => setForm(f => ({ ...f, recorrencia_ate: e.target.value }))} />
                </div>
              )}
              <SeletorParticipantes selecionados={form.participantes} onChange={ids => setForm(f => ({ ...f, participantes: ids }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lembrete</label>
                <select className="input" value={form.lembrete_minutos} onChange={e => setForm(f => ({ ...f, lembrete_minutos: Number(e.target.value) }))}>
                  {LEMBRETE_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNovo(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarNovo} disabled={saving || !form.titulo || !form.data_inicio || (form.recorrencia !== 'nao' && !form.recorrencia_ate)} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalEvento />
      {showCats && <ModalCategorias />}
      {showSync && <GoogleCalendarSync onClose={() => setShowSync(false)} />}

      {modalEscopo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {modalEscopo.tipo === 'deletar' ? 'Deletar evento recorrente' : 'Editar evento recorrente'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">Este evento faz parte de uma série. O que deseja {modalEscopo.tipo === 'deletar' ? 'deletar' : 'editar'}?</p>
            <div className="space-y-2">
              <button onClick={() => modalEscopo.tipo === 'deletar' ? executarDeletar('este') : executarEdicao('este')}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <p className="text-sm font-medium text-gray-900">Somente este evento</p>
                <p className="text-xs text-gray-400 mt-0.5">Não afeta os demais da série</p>
              </button>
              <button onClick={() => modalEscopo.tipo === 'deletar' ? executarDeletar('proximos') : executarEdicao('proximos')}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <p className="text-sm font-medium text-gray-900">Este e os próximos</p>
                <p className="text-xs text-gray-400 mt-0.5">A partir desta data em diante</p>
              </button>
              <button onClick={() => modalEscopo.tipo === 'deletar' ? executarDeletar('todos') : executarEdicao('todos')}
                className="w-full text-left px-4 py-3 rounded-lg border border-red-100 hover:bg-red-50 transition-colors">
                <p className="text-sm font-medium text-red-700">Todos os eventos da série</p>
                <p className="text-xs text-red-400 mt-0.5">Remove ou altera toda a recorrência</p>
              </button>
            </div>
            <button onClick={() => setModalEscopo(null)} className="mt-4 w-full btn-secondary text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

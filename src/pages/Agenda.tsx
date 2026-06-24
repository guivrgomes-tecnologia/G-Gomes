import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Calendar, Pencil, Trash2, CheckCircle2, Users, Settings, Tag, Video, AlertCircle, MessageCircle, Timer, MessageSquare, Send, Image as ImageIcon } from 'lucide-react'
import { supabase, Evento, Profile, CategoriaEvento, criarNotificacoes } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import GoogleCalendarSync from '../components/GoogleCalendarSync'
import SeletorDuracao from '../components/SeletorDuracao'
import SeletorLembretes from '../components/SeletorLembretes'
import { calcularDataFim } from '../lib/eventoHelpers'
import { uploadImagemChat } from '../lib/chatHelpers'

const COR_PADRAO = '#0ea5e9'
const CORES_PRESET = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#f97316','#14b8a6','#6366f1','#84cc16']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA_ABREV = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

type View = 'mes' | 'semana' | 'dia'
type EventoComentario = { id: string; evento_id: string; autor_id: string; mensagem: string; imagem_url?: string | null; created_at: string; autor?: Profile }
type Recorrencia = 'nao' | 'diario' | 'semanal' | 'mensal' | 'anual'

function SeletorCategoria({ value, onChange, categorias, userId, onCategoriaCriada }: {
  value: string; onChange: (id: string, cor: string) => void
  categorias: CategoriaEvento[]; userId: string; onCategoriaCriada: () => void
}) {
  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES_PRESET[0])
  const [saving, setSaving] = useState(false)

  async function criar() {
    if (!nome.trim()) return
    setSaving(true)
    const { data } = await supabase.from('categorias_evento').insert({ nome: nome.trim(), cor, criado_por: userId }).select().single()
    setSaving(false)
    setNome(''); setCor(CORES_PRESET[0]); setMostrarNovo(false)
    onCategoriaCriada()
    if (data) onChange(data.id, data.cor)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <Tag size={14} /> Categoria <span className="text-gray-400 font-normal">(opcional)</span>
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
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
        <button type="button" onClick={() => setMostrarNovo(v => !v)}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-sm border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
          <Plus size={13} /> Nova categoria
        </button>
      </div>
      {mostrarNovo && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 bg-gray-50">
          <input className="input flex-1 text-sm" placeholder="Nome da categoria" value={nome} onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar() } }} autoFocus />
          <div className="flex gap-1 shrink-0">
            {CORES_PRESET.slice(0, 6).map(c => (
              <button key={c} type="button" onClick={() => setCor(c)}
                className={`w-5 h-5 rounded-full transition-transform ${cor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <button type="button" onClick={criar} disabled={saving || !nome.trim()} className="btn-primary text-xs px-3 py-1.5 shrink-0">
            {saving ? '...' : 'Adicionar'}
          </button>
        </div>
      )}
    </div>
  )
}

function ModalCategorias({ categorias, catNome, setCatNome, catCor, setCatCor, savingCat, onSalvar, onDeletar, onClose }: {
  categorias: CategoriaEvento[]; catNome: string; setCatNome: (v: string) => void
  catCor: string; setCatCor: (v: string) => void; savingCat: boolean
  onSalvar: () => void; onDeletar: (id: string) => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Tag size={18} /> Categorias</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {categorias.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Nenhuma categoria ainda</p>}
          {categorias.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
              <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: cat.cor }} />
              <span className="flex-1 text-sm text-gray-800">{cat.nome}</span>
              <button onClick={() => onDeletar(cat.id)} className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition-colors">
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
          <button onClick={onSalvar} disabled={savingCat || !catNome.trim()} className="btn-primary w-full">
            {savingCat ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

type FormState = {
  titulo: string; descricao: string; data_inicio: string; duracao: number
  dia_inteiro: boolean; cor: string; categoria_id: string; recorrencia: Recorrencia; recorrencia_ate: string
  participantes: string[]; lembretes: number[]
}
function formInicial(): FormState {
  const agora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  return {
    titulo: '', descricao: '', data_inicio: toLocal(agora), duracao: 5,
    dia_inteiro: false, cor: COR_PADRAO, categoria_id: '', recorrencia: 'nao', recorrencia_ate: '',
    participantes: [], lembretes: [15],
  }
}
const FORM_INITIAL: FormState = formInicial()

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function getMondayOf(d: Date) { const day = d.getDay(); return addDays(d, day === 0 ? -6 : 1 - day) }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay() }

function gerarDatasRecorrentes(base: string, rec: Recorrencia, ate: string, diaInteiro: boolean): string[] {
  const datas: string[] = []
  const fim = new Date(ate + 'T23:59:59')
  let atual = new Date(base)
  while (atual <= fim && datas.length < 365) {
    datas.push(diaInteiro ? toDateStr(atual) : atual.toISOString())
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
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function Avatar({ nome, avatarUrl, size = 'sm' }: { nome: string; avatarUrl?: string | null; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  if (avatarUrl) {
    return <img src={avatarUrl} alt={nome} title={nome} className={`${s} rounded-full object-cover shrink-0`} />
  }
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
  const [diaSemanaAtivo, setDiaSemanaAtivo] = useState<string | null>(null)

  const [showNovo, setShowNovo] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [showCats, setShowCats] = useState(false)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(FORM_INITIAL)
  const [saving, setSaving] = useState(false)

  const [eventoAtivo, setEventoAtivo] = useState<Evento | null>(null)
  const contagemEventoAtivo = useContagem(eventoAtivo)
  const [reuniaoVinculada, setReuniaoVinculada] = useState<{ id: string; pasta_id: string } | null>(null)
  const [pendenciaVinculada, setPendenciaVinculada] = useState<{ id: string; titulo: string } | null>(null)
  const [editando, setEditando] = useState(false)
  const [editForm, setEditForm] = useState<Partial<FormState>>({})
  const [participantesAtivos, setParticipantesAtivos] = useState<Profile[]>([])
  const [comentariosEvento, setComentariosEvento] = useState<EventoComentario[]>([])
  const [novoComentarioEvento, setNovoComentarioEvento] = useState('')
  const [imagemSelecionadaEvento, setImagemSelecionadaEvento] = useState<File | null>(null)
  const [imagemPreviewEvento, setImagemPreviewEvento] = useState<string | null>(null)
  const [arrastandoImagemEvento, setArrastandoImagemEvento] = useState(false)
  const inputImagemEventoRef = useRef<HTMLInputElement>(null)
  const [enviandoComentarioEvento, setEnviandoComentarioEvento] = useState(false)

  const [googleConectado, setGoogleConectado] = useState(false)

  // escopo de recorrência (deletar/editar)
  const [modalEscopo, setModalEscopo] = useState<{ tipo: 'deletar' | 'editar' } | null>(null)

  // gerenciar categorias
  const [catNome, setCatNome] = useState('')
  const [catCor, setCatCor] = useState(CORES_PRESET[0])
  const [savingCat, setSavingCat] = useState(false)

  useEffect(() => { loadEventos(); loadEquipe(); loadCategorias(); checkGoogle() }, [cursor, view])

  useEffect(() => {
    if (searchParams.get('novo') === '1') abrirNovo()
    const eventoId = searchParams.get('evento')
    if (eventoId) {
      supabase.from('eventos').select('*, categoria:categorias_evento(*)').eq('id', eventoId).single()
        .then(({ data }) => { if (data) abrirEvento(data as Evento) })
    }
  }, [])

  async function checkGoogle() {
    const { data } = await supabase.from('google_tokens').select('usuario_id').eq('usuario_id', user!.id).single()
    setGoogleConectado(!!data)
  }

  function conectarGoogle() {
    const params = new URLSearchParams({
      client_id: '867246627124-nril1gae58sbuh4moairmh1rhivq2uib.apps.googleusercontent.com',
      redirect_uri: 'https://g-gomes.vercel.app/auth/google/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  async function syncGoogle(action: 'create' | 'update' | 'delete', evento: any) {
    if (!googleConectado) return
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action, user_id: user!.id, evento },
    })
  }

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
      .eq('criado_por', user!.id)
      .gte('data_inicio', inicio).lte('data_inicio', toDateStr(addDays(new Date(fim), 1)) + 'T02:59:59Z').order('data_inicio')

    const { data: participando } = await supabase
      .from('evento_participantes').select('evento_id').eq('usuario_id', user!.id)

    const idsParticipando = (participando ?? []).map(p => p.evento_id)

    if (idsParticipando.length > 0) {
      const { data: eventosParticipando } = await supabase.from('eventos')
        .select('*, categoria:categorias_evento(*)')
        .in('id', idsParticipando)
        .gte('data_inicio', inicio).lte('data_inicio', toDateStr(addDays(new Date(fim), 1)) + 'T02:59:59Z')
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
    return eventos.filter(e => {
      if (e.dia_inteiro) return e.data_inicio.startsWith(dateStr)
      return toDateStr(new Date(e.data_inicio)) === dateStr
    })
  }

  function abrirNovo(dateStr?: string) {
    const base = formInicial()
    if (dateStr) {
      base.data_inicio = dateStr + 'T' + base.data_inicio.split('T')[1]
    }
    setForm(base)
    setShowNovo(true)
  }

  async function abrirEvento(ev: Evento, e?: React.MouseEvent) {
    e?.stopPropagation()
    setEventoAtivo(ev)
    setEditando(false)
    setReuniaoVinculada(null)
    setPendenciaVinculada(null)
    loadParticipantes(ev.id)
    const { data: reunData } = await supabase.from('reunioes').select('id, pasta_id').eq('evento_id', ev.id).maybeSingle()
    if (reunData) setReuniaoVinculada(reunData)
    const { data: pendData } = await supabase.from('pendencias').select('id, titulo').eq('evento_id', ev.id).maybeSingle()
    if (pendData) setPendenciaVinculada(pendData)
    loadComentariosEvento(ev.id)
  }

  const loadComentariosEvento = useCallback(async (eventoId: string) => {
    const { data } = await supabase.from('evento_comentarios')
      .select('*, autor:profiles(*)').eq('evento_id', eventoId).order('created_at')
    setComentariosEvento(data ?? [])
  }, [])

  function selecionarImagemEvento(file: File | null) {
    setImagemSelecionadaEvento(file)
    setImagemPreviewEvento(file ? URL.createObjectURL(file) : null)
  }

  async function enviarComentarioEvento() {
    const texto = novoComentarioEvento.trim()
    if (!eventoAtivo) return
    if (!texto && !imagemSelecionadaEvento) return
    setEnviandoComentarioEvento(true)
    let imagemUrl: string | null = null
    if (imagemSelecionadaEvento) {
      imagemUrl = await uploadImagemChat(imagemSelecionadaEvento, `eventos/${eventoAtivo.id}`)
      if (!imagemUrl) { setEnviandoComentarioEvento(false); return }
    }
    await supabase.from('evento_comentarios').insert({ evento_id: eventoAtivo.id, autor_id: user!.id, mensagem: texto, imagem_url: imagemUrl })
    setNovoComentarioEvento('')
    selecionarImagemEvento(null)
    await loadComentariosEvento(eventoAtivo.id)
    setEnviandoComentarioEvento(false)
  }

  useEffect(() => {
    if (!eventoAtivo) return
    const channel = supabase.channel('evento-comentarios-' + eventoAtivo.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evento_comentarios', filter: `evento_id=eq.${eventoAtivo.id}` }, () => loadComentariosEvento(eventoAtivo.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventoAtivo?.id, loadComentariosEvento])

  async function salvarNovo() {
    if (!form.titulo || !form.data_inicio) return
    setSaving(true)
    const base = form.dia_inteiro ? form.data_inicio.split('T')[0] : localDatetimeToISO(form.data_inicio)
    const comum = {
      titulo: form.titulo, descricao: form.descricao || null,
      dia_inteiro: form.dia_inteiro,
      cor: form.cor, categoria_id: form.categoria_id || null,
      criado_por: user!.id, concluido: false, lembrete_minutos: form.lembretes[0] ?? 0, lembretes_minutos: form.lembretes,
    }

    if (form.recorrencia !== 'nao' && form.recorrencia_ate) {
      const grupo = crypto.randomUUID()
      const datas = gerarDatasRecorrentes(base, form.recorrencia, form.recorrencia_ate, form.dia_inteiro)
      const { data: inserted } = await supabase.from('eventos').insert(datas.map(d => ({
        ...comum, data_inicio: d, recorrencia_grupo: grupo,
        data_fim: form.dia_inteiro ? null : calcularDataFim(d, form.duracao),
      }))).select('id')
      if (form.participantes.length > 0 && inserted) {
        const rows = inserted.flatMap((ev: { id: string }) => form.participantes.map(uid => ({ evento_id: ev.id, usuario_id: uid })))
        await supabase.from('evento_participantes').insert(rows)
      }
    } else {
      const { data: inserted } = await supabase.from('eventos').insert({
        ...comum, data_inicio: base,
        data_fim: form.dia_inteiro ? null : calcularDataFim(form.data_inicio, form.duracao),
      }).select('id').single()
      if (form.participantes.length > 0 && inserted) {
        await salvarParticipantes(inserted.id, form.participantes)
        await criarNotificacoes(form.participantes.filter(uid => uid !== user!.id).map(uid => ({
          usuario_id: uid, tipo: 'evento_participante',
          titulo: `Você foi adicionado ao evento "${form.titulo}"`,
          mensagem: `${profile?.nome ?? 'Alguém'} te adicionou em um evento`,
          link: `/agenda`,
        })))
      }
      if (inserted) syncGoogle('create', { ...comum, data_inicio: base, data_fim: form.dia_inteiro ? null : calcularDataFim(form.data_inicio, form.duracao), id: inserted.id })
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
    const diaInteiroFinal = editForm.dia_inteiro ?? eventoAtivo.dia_inteiro
    const diBase = editForm.data_inicio ?? (eventoAtivo.dia_inteiro ? eventoAtivo.data_inicio.split('T')[0] : toLocalInput(eventoAtivo.data_inicio))
    const duracaoFinal = editForm.duracao ?? Math.max(5, Math.round((new Date(eventoAtivo.data_fim ?? eventoAtivo.data_inicio).getTime() - new Date(eventoAtivo.data_inicio).getTime()) / 60000))
    const campos = {
      titulo:       editForm.titulo      ?? eventoAtivo.titulo,
      descricao:    editForm.descricao   ?? eventoAtivo.descricao,
      data_fim:     diaInteiroFinal ? null : calcularDataFim(diBase, duracaoFinal),
      dia_inteiro:  diaInteiroFinal,
      cor:          editForm.cor         ?? eventoAtivo.cor,
      categoria_id: editForm.categoria_id !== undefined ? (editForm.categoria_id || null) : eventoAtivo.categoria_id,
      lembrete_minutos: (editForm.lembretes ?? eventoAtivo.lembretes_minutos ?? [])[0] ?? 0,
      lembretes_minutos: editForm.lembretes ?? eventoAtivo.lembretes_minutos ?? [],
    }
    if (escopo === 'este') {
      const di = editForm.data_inicio ?? eventoAtivo.data_inicio
      const dataInicio = campos.dia_inteiro ? di.split('T')[0] : localDatetimeToISO(di)
      await supabase.from('eventos').update({ ...campos, data_inicio: dataInicio }).eq('id', eventoAtivo.id)
      await salvarParticipantes(eventoAtivo.id, editForm.participantes ?? participantesAtivos.map(p => p.id))
      syncGoogle('update', { ...eventoAtivo, ...campos, data_inicio: dataInicio })
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
      syncGoogle('delete', eventoAtivo)
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
                <Avatar nome={p.nome} avatarUrl={p.avatar_url} />
                {p.nome.split(' ')[0]}
              </button>
            )
          })}
        </div>
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
            <div key={dia} onClick={() => setDiaSelecionado(ds)}
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
    const datasSemanaStr = dias.map(toDateStr)
    const diaAtivo = diaSemanaAtivo && datasSemanaStr.includes(diaSemanaAtivo)
      ? diaSemanaAtivo
      : (datasSemanaStr.find(isHoje) ?? datasSemanaStr[0])
    const diaObj = new Date(diaAtivo + 'T12:00:00')
    const evsDia = eventosNaData(diaAtivo).sort((a, b) => a.dia_inteiro ? -1 : b.dia_inteiro ? 1 : a.data_inicio.localeCompare(b.data_inicio))

    return (
      <div ref={semanaRef} className="p-4 space-y-3">
        {/* Seletor de dias da semana */}
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d, i) => {
            const ds = datasSemanaStr[i]
            const temEventos = eventosNaData(ds).length > 0
            const ativo = ds === diaAtivo
            const isTd = isHoje(ds)
            return (
              <button key={i} onClick={() => setDiaSemanaAtivo(ds)}
                className={`flex flex-col items-center py-2.5 rounded-xl transition-colors ${ativo ? 'bg-brand-600' : 'hover:bg-gray-50'}`}>
                <span className={`text-xs font-medium ${ativo ? 'text-white/80' : 'text-gray-400'}`}>{DIAS_SEMANA_ABREV[d.getDay()][0]}</span>
                <span className={`text-base font-semibold mt-0.5 ${ativo ? 'text-white' : isTd ? 'text-brand-600' : 'text-gray-800'}`}>{d.getDate()}</span>
                <span className={`w-1.5 h-1.5 rounded-full mt-1 ${temEventos ? (ativo ? 'bg-white' : 'bg-brand-500') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {/* Detalhe do dia selecionado */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-semibold text-gray-900 mb-3 capitalize">
            {diaObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {evsDia.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum evento neste dia.</p>
          ) : (
            <div className="space-y-3">
              {evsDia.map(ev => {
                const cor = corDoEvento(ev)
                return (
                  <div key={ev.id} onClick={e => abrirEvento(ev, e)} className="bg-white rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow">
                    {!ev.dia_inteiro && <p className="text-sm font-semibold text-gray-500 mb-0.5">{formatHora(ev.data_inicio)}</p>}
                    <p className={`font-semibold text-gray-900 ${ev.concluido ? 'line-through opacity-60' : ''}`}>{ev.titulo}</p>
                    {ev.descricao && <p className="text-sm text-gray-400 mt-0.5">{ev.descricao}</p>}
                    <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: cor + '1a', color: cor }}>
                      {ev.concluido ? 'Concluído' : 'Confirmado'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <button onClick={() => abrirNovo(diaAtivo)}
            className="w-full mt-3 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm font-medium flex items-center justify-center gap-1.5">
            <Plus size={15} /> Novo agendamento
          </button>
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

  function useContagem(ev: Evento | null) {
    const [restante, setRestante] = useState('')
    useEffect(() => {
      if (!ev || ev.dia_inteiro || ev.concluido) { setRestante(''); return }
      function calc() {
        const agora = Date.now()
        const inicio = new Date(ev!.data_inicio).getTime()
        const diff = inicio - agora
        if (diff <= 0) { setRestante('Em andamento'); return }
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        const s = Math.floor((diff % 60000) / 1000)
        if (h >= 24) { const d = Math.floor(h / 24); setRestante(`${d}d ${h % 24}h`); return }
        setRestante(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
      }
      calc()
      const id = setInterval(calc, 1000)
      return () => clearInterval(id)
    }, [ev])
    return restante
  }

  function ModalEvento() {
    if (!eventoAtivo) return null
    const ev = eventoAtivo
    const ef = editForm
    const idsEdit = ef.participantes ?? participantesAtivos.map(p => p.id)
    const catAtiva = (ev.categoria as CategoriaEvento | undefined)
    const corAtiva = corDoEvento(ev)
    const contagem = contagemEventoAtivo

    function compartilharWhatsapp() {
      const data = formatDataHora(ev)
      const partic = participantesAtivos.length > 0
        ? '\n👥 ' + participantesAtivos.map(p => p.nome.split(' ')[0]).join(', ')
        : ''
      const desc = ev.descricao ? `\n📝 ${ev.descricao}` : ''
      const texto = `📅 *${ev.titulo}*\n🕐 ${data}${desc}${partic}`
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    }

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
                        <Avatar nome={p.nome} avatarUrl={p.avatar_url} size="sm" />
                        {p.nome.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {reuniaoVinculada && (
                <button
                  onClick={() => { setEventoAtivo(null); navigate(`/reunioes?reuniao=${reuniaoVinculada.id}`) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors border border-purple-200">
                  <Video size={15} /> Ver reunião vinculada
                </button>
              )}
              {ev.google_event_id && (
                <a href={`https://calendar.google.com/calendar/event?eid=${btoa(ev.google_event_id)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors border border-blue-200">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Ver no Google Calendar
                </a>
              )}
              {pendenciaVinculada && (
                <button
                  onClick={() => { setEventoAtivo(null); navigate(`/pendencias?abrir=${pendenciaVinculada.id}`) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors border border-red-200">
                  <AlertCircle size={15} />
                  <span className="flex-1 text-left truncate">Pendência: {pendenciaVinculada.titulo}</span>
                </button>
              )}
              {contagem && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${contagem === 'Em andamento' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                  <Timer size={15} />
                  {contagem === 'Em andamento' ? 'Acontecendo agora' : `Faltam ${contagem}`}
                </div>
              )}
              {ev.concluido && (
                <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Evento concluído
                </p>
              )}
              {(() => {
                const criador = equipe.find(p => p.id === ev.criado_por)
                return (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 border-t border-gray-100">
                    <span>Criado por</span>
                    <span className="font-medium text-gray-500">{criador?.nome ?? 'Desconhecido'}</span>
                    <span>•</span>
                    <span>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })()}
              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => toggleConcluido(ev)}
                  className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${ev.concluido ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'}`}>
                  <CheckCircle2 size={16} />
                  {ev.concluido ? 'Marcar como não concluído' : 'Marcar como concluído'}
                </button>
                <button onClick={compartilharWhatsapp}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
                  <MessageCircle size={15} /> Compartilhar no WhatsApp
                </button>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setEditForm({
                      titulo: ev.titulo, descricao: ev.descricao ?? '',
                      data_inicio: ev.dia_inteiro ? ev.data_inicio.split('T')[0] : toLocalInput(ev.data_inicio),
                      duracao: ev.data_fim ? Math.max(5, Math.round((new Date(ev.data_fim).getTime() - new Date(ev.data_inicio).getTime()) / 60000)) : 5,
                      dia_inteiro: ev.dia_inteiro, cor: ev.cor, categoria_id: ev.categoria_id ?? '',
                      participantes: participantesAtivos.map(p => p.id),
                      lembretes: ev.lembretes_minutos?.length ? ev.lembretes_minutos : (ev.lembrete_minutos != null ? [ev.lembrete_minutos] : []),
                    })
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

              {(ev.criado_por === user?.id || participantesAtivos.some(p => p.id === user?.id)) && (
                <div
                  className={`border-t border-gray-100 pt-3 -mx-1 px-1 rounded-lg transition-colors ${arrastandoImagemEvento ? 'bg-brand-50 ring-2 ring-brand-300' : ''}`}
                  onDragOver={e => { e.preventDefault(); setArrastandoImagemEvento(true) }}
                  onDragLeave={() => setArrastandoImagemEvento(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setArrastandoImagemEvento(false)
                    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
                    if (file) selecionarImagemEvento(file)
                  }}
                >
                  <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-2">
                    <MessageSquare size={13} /> Comentários
                  </p>
                  {arrastandoImagemEvento && (
                    <p className="text-xs text-brand-600 text-center py-2 border-2 border-dashed border-brand-300 rounded-lg mb-2">Solte a imagem aqui</p>
                  )}
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-2">
                    {comentariosEvento.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda.</p>}
                    {comentariosEvento.map(c => {
                      const autor = c.autor as Profile | undefined
                      const souEu = c.autor_id === user?.id
                      return (
                        <div key={c.id} className={`flex ${souEu ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-xl px-3 py-2 ${souEu ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                            <p className="text-xs font-semibold mb-0.5 opacity-70">{souEu ? 'Você' : autor?.nome ?? 'Desconhecido'}</p>
                            {c.imagem_url && (
                              <a href={c.imagem_url} target="_blank" rel="noopener noreferrer">
                                <img src={c.imagem_url} alt="Imagem" className="rounded-lg max-w-full max-h-60 mb-1 object-contain" />
                              </a>
                            )}
                            {c.mensagem && <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>}
                            <p className={`text-[10px] mt-0.5 ${souEu ? 'text-white/70 text-right' : 'text-gray-400'}`}>
                              {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {imagemPreviewEvento && (
                    <div className="relative inline-block mb-2">
                      <img src={imagemPreviewEvento} alt="Pré-visualização" className="h-20 rounded-lg object-cover" />
                      <button onClick={() => selecionarImagemEvento(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-900">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input ref={inputImagemEventoRef} type="file" accept="image/*" className="hidden"
                      onChange={e => selecionarImagemEvento(e.target.files?.[0] ?? null)} />
                    <button onClick={() => inputImagemEventoRef.current?.click()} title="Anexar imagem"
                      className="p-2.5 shrink-0 text-gray-400 hover:text-brand-600 hover:bg-gray-50 rounded-lg transition-colors">
                      <ImageIcon size={18} />
                    </button>
                    <textarea
                      className="input flex-1 text-sm resize-none"
                      rows={1}
                      placeholder="Escreva um comentário... (Shift+Enter para nova linha)"
                      value={novoComentarioEvento}
                      onChange={e => setNovoComentarioEvento(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentarioEvento() } }}
                      onPaste={e => {
                        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
                        if (item) { e.preventDefault(); const file = item.getAsFile(); if (file) selecionarImagemEvento(file) }
                      }}
                    />
                    <button onClick={enviarComentarioEvento} disabled={enviandoComentarioEvento || (!novoComentarioEvento.trim() && !imagemSelecionadaEvento)}
                      className="btn-primary p-2.5 shrink-0 disabled:opacity-50">
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              )}
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
                categorias={categorias} userId={user!.id} onCategoriaCriada={loadCategorias}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="edit_dia_inteiro" checked={ef.dia_inteiro ?? ev.dia_inteiro} onChange={e => setEditForm(f => ({ ...f, dia_inteiro: e.target.checked }))} />
                <label htmlFor="edit_dia_inteiro" className="text-sm text-gray-700">Dia inteiro</label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{(ef.dia_inteiro ?? ev.dia_inteiro) ? 'Data' : 'Início'}</label>
                  <input type={(ef.dia_inteiro ?? ev.dia_inteiro) ? 'date' : 'datetime-local'} className="input"
                    value={ef.data_inicio ?? (ev.dia_inteiro ? ev.data_inicio.split('T')[0] : toLocalInput(ev.data_inicio))}
                    onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                {!(ef.dia_inteiro ?? ev.dia_inteiro) && (
                  <SeletorDuracao value={ef.duracao ?? 5} onChange={v => setEditForm(f => ({ ...f, duracao: v }))} />
                )}
              </div>
              <SeletorParticipantes selecionados={idsEdit} onChange={ids => setEditForm(f => ({ ...f, participantes: ids }))} />
              <SeletorLembretes
                value={ef.lembretes ?? (ev.lembretes_minutos?.length ? ev.lembretes_minutos : (ev.lembrete_minutos != null ? [ev.lembrete_minutos] : []))}
                onChange={v => setEditForm(f => ({ ...f, lembretes: v }))}
              />
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

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agenda</h1>
        <div className="flex gap-1.5 sm:gap-2">
          {profile?.is_admin && (
            <button onClick={() => setShowCats(true)} className="btn-secondary flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2">
              <Settings size={14} /> <span className="hidden sm:inline">Categorias</span><span className="sm:hidden">Cat.</span>
            </button>
          )}
          {googleConectado ? (
            <button onClick={() => setShowSync(true)} className="btn-secondary flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 text-green-700 border-green-300">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <span className="hidden sm:inline">Google conectado</span><span className="sm:hidden">Google</span>
            </button>
          ) : (
            <button onClick={conectarGoogle} className="btn-secondary flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <span className="hidden sm:inline">Conectar Google</span><span className="sm:hidden">Google</span>
            </button>
          )}
          <button onClick={() => abrirNovo()} className="btn-primary flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2">
            <Plus size={14} /> <span className="hidden sm:inline">Novo evento</span><span className="sm:hidden">Novo</span>
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
                categorias={categorias} userId={user!.id} onCategoriaCriada={loadCategorias}
              />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="dia_inteiro" checked={form.dia_inteiro} onChange={e => setForm(f => ({ ...f, dia_inteiro: e.target.checked }))} />
                <label htmlFor="dia_inteiro" className="text-sm text-gray-700">Dia inteiro</label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{form.dia_inteiro ? 'Data' : 'Início'} *</label>
                  <input type={form.dia_inteiro ? 'date' : 'datetime-local'} className="input"
                    value={form.dia_inteiro ? form.data_inicio.split('T')[0] : form.data_inicio}
                    onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                {!form.dia_inteiro && (
                  <SeletorDuracao value={form.duracao} onChange={v => setForm(f => ({ ...f, duracao: v }))} />
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
              <SeletorLembretes value={form.lembretes} onChange={v => setForm(f => ({ ...f, lembretes: v }))} />
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

      {ModalEvento()}
      {showCats && (
        <ModalCategorias
          categorias={categorias} catNome={catNome} setCatNome={setCatNome}
          catCor={catCor} setCatCor={setCatCor} savingCat={savingCat}
          onSalvar={salvarCategoria} onDeletar={deletarCategoria} onClose={() => setShowCats(false)}
        />
      )}
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

      {/* Modal eventos do dia */}
      {diaSelecionado && (() => {
        const evsDia = eventosNaData(diaSelecionado).sort((a, b) => {
          if (a.dia_inteiro && !b.dia_inteiro) return -1
          if (!a.dia_inteiro && b.dia_inteiro) return 1
          return a.data_inicio.localeCompare(b.data_inicio)
        })
        const dataFmt = new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDiaSelecionado(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900 capitalize">{dataFmt}</h3>
                  <p className="text-xs text-gray-400">{evsDia.length === 0 ? 'Nenhum evento' : `${evsDia.length} evento${evsDia.length > 1 ? 's' : ''}`}</p>
                </div>
                <button onClick={() => setDiaSelecionado(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto flex-1">
                {evsDia.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum evento neste dia</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {evsDia.map(ev => {
                      const hora = ev.dia_inteiro
                        ? 'Dia inteiro'
                        : new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          + (ev.data_fim ? ' – ' + new Date(ev.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
                      return (
                        <li key={ev.id} onClick={() => { setDiaSelecionado(null); abrirEvento(ev, { stopPropagation: () => {} } as any) }}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                          <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: ev.cor }} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${ev.concluido ? 'line-through text-gray-400' : 'text-gray-900'}`}>{ev.titulo}</p>
                            <p className="text-xs text-gray-400">{hora}</p>
                          </div>
                          {ev.concluido && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100">
                <button onClick={() => { setDiaSelecionado(null); abrirNovo(diaSelecionado) }}
                  className="w-full btn-primary flex items-center justify-center gap-2 text-sm">
                  <Plus size={15} /> Novo evento neste dia
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

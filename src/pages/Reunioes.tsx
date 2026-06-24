import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ReuniaPasta, Reuniao, Pendencia, Profile, DadosImportados, DadosImportadosMetas, DadosImportadosHistorico, PautaTopico } from '../lib/supabase'
import { Plus, FolderOpen, Folder, ChevronRight, ChevronLeft, Calendar, Trash2, X, Edit2, Link2, MapPin, Video, MessageCircle, Copy, ClipboardList, ExternalLink, Users, MessageSquare, Send, Download, Target, LineChart, Lock } from 'lucide-react'

const CORES = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']

type ReuniaoComentario = { id: string; reuniao_id: string; autor_id: string; mensagem: string; created_at: string; autor?: Profile }

type MetaMes = { id: string; mes: string; titulo: string }
type MetaSemana = { id: string; mes_id: string; label: string; ordem: number }
type MetaLoja = { id: string; mes_id: string; nome: string; gerente: string | null; meta_mes: number; ordem: number }
type MetaValor = { id: string; loja_id: string; semana_id: string; meta: number; realizado: number | null }
type VendaLoja = { id: string; nome: string; ordem: number }
type VendaRegistro = {
  id: string; loja_id: string; ano: number
  jan: number; fev: number; mar: number; abr: number; mai: number; jun: number
  jul: number; ago: number; set: number; out: number; nov: number; dez: number
}
const MESES_VENDA: { key: keyof VendaRegistro; label: string }[] = [
  { key: 'jan', label: 'Janeiro' }, { key: 'fev', label: 'Fevereiro' }, { key: 'mar', label: 'Março' },
  { key: 'abr', label: 'Abril' }, { key: 'mai', label: 'Maio' }, { key: 'jun', label: 'Junho' },
  { key: 'jul', label: 'Julho' }, { key: 'ago', label: 'Agosto' }, { key: 'set', label: 'Setembro' },
  { key: 'out', label: 'Outubro' }, { key: 'nov', label: 'Novembro' }, { key: 'dez', label: 'Dezembro' },
]
const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Reunioes() {
  const { user, profile } = useAuth()
  const isAdmin = (profile as any)?.is_admin ?? false
  const [searchParams] = useSearchParams()
  const [pastas, setPastas] = useState<ReuniaPasta[]>([])
  const [pastaSelecionada, setPastaSelecionada] = useState<ReuniaPasta | null>(null)
  const [reunioes, setReunioes] = useState<Reuniao[]>([])
  const [minhasReunioes, setMinhasReunioes] = useState<Reuniao[]>([])
  const [reuniaoAberta, setReuniaoAberta] = useState<Reuniao | null>(null)
  const [saving, setSaving] = useState(false)

  function conteudoLiberado(r: Reuniao | null): boolean {
    if (!r) return false
    if (isAdmin || r.criado_por === user?.id) return true
    if (!r.data) return true
    return Date.now() >= new Date(r.data).getTime() - 5 * 60 * 1000
  }

  // Participantes
  const [participantes, setParticipantes] = useState<Profile[]>([])
  const [showAddParticipante, setShowAddParticipante] = useState(false)
  const [participanteParaAdicionar, setParticipanteParaAdicionar] = useState('')

  // Pendências vinculadas
  const [pendenciasVinculadas, setPendenciasVinculadas] = useState<Pendencia[]>([])
  const [todasPendencias, setTodasPendencias] = useState<Pendencia[]>([])
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [showLinkPendencia, setShowLinkPendencia] = useState(false)
  const [showNovaPendencia, setShowNovaPendencia] = useState(false)
  const [formPendencia, setFormPendencia] = useState({ titulo: '', para_usuario_id: '', prioridade: 'media' as 'baixa' | 'media' | 'alta', prazo: '' })
  const [pendenciaParaLinkar, setPendenciaParaLinkar] = useState('')

  const [showNovaPasta, setShowNovaPasta] = useState(false)
  const [showNovaReuniao, setShowNovaReuniao] = useState(false)
  const [nomePasta, setNomePasta] = useState('')
  const [corPasta, setCorPasta] = useState(CORES[0])

  const [formReuniao, setFormReuniao] = useState({ titulo: '', data: '', hora: '', tipo: 'presencial' as 'presencial' | 'online', duracao: 60 })

  const [editPauta, setEditPauta] = useState('')
  const [topicosPauta, setTopicosPauta] = useState<PautaTopico[]>([])
  const [topicoEditando, setTopicoEditando] = useState<string | null>(null)
  const [editTranscricao, setEditTranscricao] = useState('')
  const [notaPrivada, setNotaPrivada] = useState('')
  const [editTitulo, setEditTitulo] = useState('')
  const [editData, setEditData] = useState('')
  const [editHora, setEditHora] = useState('')
  const [editTipo, setEditTipo] = useState<'presencial' | 'online'>('presencial')
  const [editLinkVideo, setEditLinkVideo] = useState('')
  const [googleConectado, setGoogleConectado] = useState(false)
  const [gerandoMeet, setGerandoMeet] = useState(false)
  const [editandoCabecalho, setEditandoCabecalho] = useState(false)

  // Chat da reunião
  const [comentariosReuniao, setComentariosReuniao] = useState<ReuniaoComentario[]>([])
  const [novoComentarioReuniao, setNovoComentarioReuniao] = useState('')
  const [enviandoComentarioReuniao, setEnviandoComentarioReuniao] = useState(false)

  // Importar dados (Metas / Histórico)
  const [showImportar, setShowImportar] = useState(false)
  const [importarTab, setImportarTab] = useState<'metas' | 'historico'>('metas')
  const [metasMeses, setMetasMeses] = useState<MetaMes[]>([])
  const [metasMesEscolhido, setMetasMesEscolhido] = useState('')
  const [metasSemanas, setMetasSemanas] = useState<MetaSemana[]>([])
  const [metasLojas, setMetasLojas] = useState<MetaLoja[]>([])
  const [metasValores, setMetasValores] = useState<MetaValor[]>([])
  const [metasModoSelecao, setMetasModoSelecao] = useState<'uma' | 'todas' | 'uma_total'>('uma')
  const [metasSemanaEscolhida, setMetasSemanaEscolhida] = useState('')
  const [vendasLojas, setVendasLojas] = useState<VendaLoja[]>([])
  const [vendasRegistros, setVendasRegistros] = useState<VendaRegistro[]>([])
  const [vendasAnoEscolhido, setVendasAnoEscolhido] = useState<number | null>(null)
  const [vendasMesEscolhido, setVendasMesEscolhido] = useState<keyof VendaRegistro>('jan')
  const [importando, setImportando] = useState(false)

  const loadComentariosReuniao = useCallback(async (reuniaoId: string) => {
    const { data } = await supabase.from('reuniao_comentarios')
      .select('*, autor:profiles(*)').eq('reuniao_id', reuniaoId).order('created_at')
    setComentariosReuniao(data ?? [])
  }, [])

  async function enviarComentarioReuniao() {
    const texto = novoComentarioReuniao.trim()
    if (!texto || !reuniaoAberta) return
    setEnviandoComentarioReuniao(true)
    await supabase.from('reuniao_comentarios').insert({ reuniao_id: reuniaoAberta.id, autor_id: user!.id, mensagem: texto })
    setNovoComentarioReuniao('')
    await loadComentariosReuniao(reuniaoAberta.id)
    setEnviandoComentarioReuniao(false)
  }

  // ===== Pauta em tópicos =====
  async function salvarTopicos(novos: PautaTopico[]) {
    setTopicosPauta(novos)
    if (!reuniaoAberta) return
    await supabase.from('reunioes').update({ pauta_topicos: novos }).eq('id', reuniaoAberta.id)
    setReuniaoAberta({ ...reuniaoAberta, pauta_topicos: novos })
  }

  function adicionarTopico() {
    const novo = { id: crypto.randomUUID(), titulo: '', duracao: '', descricao: '' }
    salvarTopicos([...topicosPauta, novo])
    setTopicoEditando(novo.id)
  }

  function atualizarTopicoLocal(id: string, campo: keyof PautaTopico, valor: string) {
    setTopicosPauta(ts => ts.map(t => t.id === id ? { ...t, [campo]: valor } : t))
  }

  function confirmarTopico() {
    salvarTopicos(topicosPauta)
  }

  function removerTopico(id: string) {
    salvarTopicos(topicosPauta.filter(t => t.id !== id))
  }

  // ===== Importar dados =====
  async function abrirImportar() {
    setShowImportar(true)
    setImportarTab('metas')
    const [{ data: meses }, { data: vLojas }, { data: vRegs }] = await Promise.all([
      supabase.from('metas_meses').select('*').order('mes', { ascending: false }),
      supabase.from('vendas_lojas').select('*').order('ordem'),
      supabase.from('vendas').select('*'),
    ])
    setMetasMeses(meses ?? [])
    setVendasLojas(vLojas ?? [])
    setVendasRegistros((vRegs ?? []) as VendaRegistro[])
    const anosDisp = Array.from(new Set((vRegs ?? []).map((r: any) => r.ano))).sort((a, b) => b - a)
    setVendasAnoEscolhido(anosDisp[0] ?? null)
    if (meses && meses.length > 0) await carregarMetasMes(meses[0].id)
  }

  async function carregarMetasMes(mesId: string) {
    setMetasMesEscolhido(mesId)
    const [{ data: sem }, { data: loj }, { data: val }] = await Promise.all([
      supabase.from('metas_semanas').select('*').eq('mes_id', mesId).order('ordem'),
      supabase.from('metas_lojas').select('*').eq('mes_id', mesId).order('ordem'),
      supabase.from('metas_valores').select('*, loja:metas_lojas!inner(mes_id)').eq('loja.mes_id', mesId),
    ])
    setMetasSemanas(sem ?? [])
    setMetasLojas(loj ?? [])
    setMetasValores((val ?? []) as any)
    setMetasSemanaEscolhida(sem && sem.length > 0 ? sem[0].id : '')
  }

  function montarBlocosMetas(): DadosImportadosMetas['blocos'] {
    const valorDe = (lojaId: string, semanaId: string) => metasValores.find(v => v.loja_id === lojaId && v.semana_id === semanaId)
    function blocoSemana(sem: MetaSemana) {
      const lojas = metasLojas.map(l => {
        const v = valorDe(l.id, sem.id)
        return { nome: l.nome, gerente: l.gerente, meta: v?.meta ?? 0, realizado: v?.realizado ?? null }
      })
      return {
        label: sem.label,
        lojas,
        totalMeta: lojas.reduce((s, l) => s + l.meta, 0),
        totalRealizado: lojas.reduce((s, l) => s + (l.realizado ?? 0), 0),
      }
    }
    if (metasModoSelecao === 'todas') return metasSemanas.map(blocoSemana)
    const semEscolhida = metasSemanas.find(s => s.id === metasSemanaEscolhida)
    if (!semEscolhida) return []
    const blocos = [blocoSemana(semEscolhida)]
    if (metasModoSelecao === 'uma_total') {
      const lojas = metasLojas.map(l => {
        const totalMeta = metasSemanas.reduce((s, sem) => s + (valorDe(l.id, sem.id)?.meta ?? 0), 0)
        const totalReal = metasSemanas.reduce((s, sem) => s + (valorDe(l.id, sem.id)?.realizado ?? 0), 0)
        return { nome: l.nome, gerente: l.gerente, meta: totalMeta, realizado: totalReal }
      })
      blocos.push({
        label: 'Total do mês',
        lojas,
        totalMeta: lojas.reduce((s, l) => s + l.meta, 0),
        totalRealizado: lojas.reduce((s, l) => s + (l.realizado ?? 0), 0),
      })
    }
    return blocos
  }

  async function importarMetas() {
    if (!reuniaoAberta) return
    const mes = metasMeses.find(m => m.id === metasMesEscolhido)
    if (!mes) return
    setImportando(true)
    const bloco: DadosImportadosMetas = {
      id: crypto.randomUUID(), tipo: 'metas', titulo: `Metas — ${mes.titulo}`,
      criado_em: new Date().toISOString(), mesTitulo: mes.titulo, blocos: montarBlocosMetas(),
    }
    const atuais = (reuniaoAberta.dados_importados ?? []) as DadosImportados[]
    const novos = [...atuais, bloco]
    await supabase.from('reunioes').update({ dados_importados: novos }).eq('id', reuniaoAberta.id)
    setReuniaoAberta({ ...reuniaoAberta, dados_importados: novos })
    setShowImportar(false)
    setImportando(false)
  }

  async function importarHistorico() {
    if (!reuniaoAberta || !vendasAnoEscolhido) return
    setImportando(true)
    const mesInfo = MESES_VENDA.find(m => m.key === vendasMesEscolhido)!
    const lojasData = vendasLojas.map(l => {
      const atual = vendasRegistros.find(r => r.loja_id === l.id && r.ano === vendasAnoEscolhido)
      const ano1 = vendasRegistros.find(r => r.loja_id === l.id && r.ano === vendasAnoEscolhido - 1)
      const ano2 = vendasRegistros.find(r => r.loja_id === l.id && r.ano === vendasAnoEscolhido - 2)
      const valor = (atual?.[vendasMesEscolhido] as number) ?? 0
      const v1 = ano1 ? (ano1[vendasMesEscolhido] as number) : null
      const v2 = ano2 ? (ano2[vendasMesEscolhido] as number) : null
      return {
        nome: l.nome, valor,
        var1: v1 && v1 > 0 ? (valor - v1) / v1 : null,
        var2: v2 && v2 > 0 ? (valor - v2) / v2 : null,
      }
    })
    const totalRede = lojasData.reduce((s, l) => s + l.valor, 0)
    const totalAno1 = vendasLojas.reduce((s, l) => {
      const r = vendasRegistros.find(reg => reg.loja_id === l.id && reg.ano === vendasAnoEscolhido! - 1)
      return s + ((r?.[vendasMesEscolhido] as number) ?? 0)
    }, 0)
    const totalAno2 = vendasLojas.reduce((s, l) => {
      const r = vendasRegistros.find(reg => reg.loja_id === l.id && reg.ano === vendasAnoEscolhido! - 2)
      return s + ((r?.[vendasMesEscolhido] as number) ?? 0)
    }, 0)
    const bloco: DadosImportadosHistorico = {
      id: crypto.randomUUID(), tipo: 'historico', titulo: `Histórico — ${mesInfo.label} ${vendasAnoEscolhido}`,
      criado_em: new Date().toISOString(), ano: vendasAnoEscolhido, mesLabel: mesInfo.label,
      lojas: lojasData, totalRede,
      totalVar1: totalAno1 > 0 ? (totalRede - totalAno1) / totalAno1 : null,
      totalVar2: totalAno2 > 0 ? (totalRede - totalAno2) / totalAno2 : null,
    }
    const atuais = (reuniaoAberta.dados_importados ?? []) as DadosImportados[]
    const novos = [...atuais, bloco]
    await supabase.from('reunioes').update({ dados_importados: novos }).eq('id', reuniaoAberta.id)
    setReuniaoAberta({ ...reuniaoAberta, dados_importados: novos })
    setShowImportar(false)
    setImportando(false)
  }

  async function removerDadosImportados(blocoId: string) {
    if (!reuniaoAberta) return
    const novos = (reuniaoAberta.dados_importados ?? []).filter(b => b.id !== blocoId)
    await supabase.from('reunioes').update({ dados_importados: novos }).eq('id', reuniaoAberta.id)
    setReuniaoAberta({ ...reuniaoAberta, dados_importados: novos })
  }

  const loadPastas = useCallback(async () => {
    const { data } = await supabase.from('reuniao_pastas').select('*').order('created_at')
    setPastas(data ?? [])
  }, [])

  function porData(a: Reuniao, b: Reuniao) {
    if (!a.data && !b.data) return b.created_at.localeCompare(a.created_at)
    if (!a.data) return 1
    if (!b.data) return -1
    return b.data.localeCompare(a.data)
  }

  const loadReunioes = useCallback(async (pastaId: string) => {
    const { data } = await supabase.from('reunioes').select('*').eq('pasta_id', pastaId)
    setReunioes((data ?? []).sort(porData))
  }, [])

  const loadMinhasReunioes = useCallback(async (usuarioId: string) => {
    const { data } = await supabase
      .from('reuniao_participantes')
      .select('reuniao:reunioes(*, pasta:reuniao_pastas(*))')
      .eq('usuario_id', usuarioId)
    const lista = (data ?? []).map((d: any) => d.reuniao).filter(Boolean).sort(porData)
    setMinhasReunioes(lista)
  }, [])

  const loadParticipantes = useCallback(async (reuniaoId: string) => {
    const { data } = await supabase
      .from('reuniao_participantes')
      .select('usuario_id, profile:profiles(*)')
      .eq('reuniao_id', reuniaoId)
    setParticipantes((data ?? []).map((d: any) => d.profile).filter(Boolean))
  }, [])

  const loadPendenciasVinculadas = useCallback(async (reuniaoId: string) => {
    const { data } = await supabase
      .from('reuniao_pendencias')
      .select('pendencia_id, pendencia:pendencias(*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*))')
      .eq('reuniao_id', reuniaoId)
    setPendenciasVinculadas((data ?? []).map((d: any) => d.pendencia).filter(Boolean))
  }, [])

  useEffect(() => {
    if (isAdmin) loadPastas()
    else if (user) loadMinhasReunioes(user.id)
  }, [loadPastas, loadMinhasReunioes, isAdmin, user])

  useEffect(() => {
    if (!user) return
    supabase.from('google_tokens').select('usuario_id').eq('usuario_id', user.id).single()
      .then(({ data }) => setGoogleConectado(!!data))
  }, [user])

  async function gerarLinkMeet() {
    if (!reuniaoAberta) return
    setGerandoMeet(true)
    const dataInicio = reuniaoAberta.data ?? new Date().toISOString()
    const dataFim = new Date(new Date(dataInicio).getTime() + 3600000).toISOString()
    const payload = {
      id: reuniaoAberta.id, titulo: editTitulo || reuniaoAberta.titulo,
      data_inicio: dataInicio, data_fim: dataFim, dia_inteiro: false,
      criar_meet: true, atualizar_tabela_eventos: false,
      google_event_id: reuniaoAberta.google_event_id ?? null,
    }
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: reuniaoAberta.google_event_id ? 'update' : 'create', user_id: user!.id, evento: payload },
    })
    setGerandoMeet(false)
    if (error || !data?.hangoutLink) { alert('Não foi possível gerar o link. Confira se sua conta do Google está conectada na Agenda.'); return }
    setEditLinkVideo(data.hangoutLink)
    const updates: Partial<Reuniao> = { link_video: data.hangoutLink }
    if (data.google_event_id) updates.google_event_id = data.google_event_id
    await supabase.from('reunioes').update(updates).eq('id', reuniaoAberta.id)
    setReuniaoAberta({ ...reuniaoAberta, ...updates })
  }

  useEffect(() => {
    if (pastaSelecionada) {
      if (isAdmin) loadReunioes(pastaSelecionada.id)
    } else if (isAdmin) {
      setReunioes([])
    }
  }, [pastaSelecionada, loadReunioes, isAdmin])

  useEffect(() => {
    const reuniaoId = searchParams.get('reuniao')
    if (!reuniaoId || !user) return
    supabase.from('reunioes').select('*').eq('id', reuniaoId).single().then(({ data: r }) => {
      if (!r) return
      supabase.from('reuniao_pastas').select('*').eq('id', r.pasta_id).single().then(({ data: pasta }) => {
        if (pasta) {
          setPastaSelecionada(pasta)
          loadReunioes(pasta.id).then(() => abrirReuniao(r))
        }
      })
    })
  }, [user, searchParams])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').then(({ data }) => setEquipe(data ?? []))
    supabase.from('pendencias')
      .select('*, de_usuario:profiles!pendencias_de_usuario_id_fkey(*), para_usuario:profiles!pendencias_para_usuario_id_fkey(*)')
      .neq('status', 'resolvida')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTodasPendencias(data ?? []))
  }, [user])

  async function criarPasta() {
    if (!nomePasta.trim()) return
    setSaving(true)
    await supabase.from('reuniao_pastas').insert({ nome: nomePasta.trim(), cor: corPasta, criado_por: user!.id })
    setNomePasta(''); setCorPasta(CORES[0]); setShowNovaPasta(false)
    await loadPastas()
    setSaving(false)
  }

  async function deletarPasta(id: string) {
    if (!confirm('Apagar pasta e todas as reuniões dentro dela?')) return
    await supabase.from('reuniao_pastas').delete().eq('id', id)
    if (pastaSelecionada?.id === id) setPastaSelecionada(null)
    await loadPastas()
  }

  async function criarReuniao() {
    if (!formReuniao.titulo.trim() || !pastaSelecionada) return
    setSaving(true)
    let dataInicio: string | null = null
    if (formReuniao.data) {
      dataInicio = formReuniao.hora
        ? new Date(`${formReuniao.data}T${formReuniao.hora}`).toISOString()
        : formReuniao.data
    }
    const { data: inserted } = await supabase.from('reunioes').insert({
      titulo: formReuniao.titulo.trim(), data: dataInicio, tipo: formReuniao.tipo,
      pasta_id: pastaSelecionada.id, criado_por: user!.id,
    }).select().single()

    // Criar evento na agenda automaticamente
    if (inserted && dataInicio) {
      const dataFim = new Date(new Date(dataInicio).getTime() + formReuniao.duracao * 60000).toISOString()
      const { data: ev } = await supabase.from('eventos').insert({
        titulo: inserted.titulo,
        descricao: pastaSelecionada.nome,
        data_inicio: dataInicio,
        data_fim: dataFim,
        dia_inteiro: false,
        cor: pastaSelecionada.cor,
        concluido: false,
        criado_por: user!.id,
        lembrete_minutos: 15,
      }).select('id').single()
      if (ev) {
        await supabase.from('reunioes').update({ evento_id: ev.id }).eq('id', inserted.id)
        inserted.evento_id = ev.id
      }
    }

    setFormReuniao({ titulo: '', data: '', hora: '', tipo: 'presencial', duracao: 60 })
    setShowNovaReuniao(false)
    await loadReunioes(pastaSelecionada.id)
    if (inserted) abrirReuniao(inserted)
    setSaving(false)
  }

  function abrirReuniao(r: Reuniao) {
    setReuniaoAberta(r)
    setEditPauta(r.pauta ?? '')
    setTopicosPauta(r.pauta_topicos ?? [])
    setTopicoEditando(null)
    setEditTranscricao(r.transcricao ?? '')
    setEditTitulo(r.titulo)
    setEditTipo(r.tipo ?? 'presencial')
    setEditLinkVideo(r.link_video ?? '')
    const d = r.data ? new Date(r.data) : null
    setEditData(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')
    setEditHora(d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '')
    setEditandoCabecalho(false)
    setShowAddParticipante(false)
    setParticipanteParaAdicionar('')
    loadPendenciasVinculadas(r.id)
    loadParticipantes(r.id)
    loadComentariosReuniao(r.id)
    loadNotaPrivada(r.id)
  }

  async function loadNotaPrivada(reuniaoId: string) {
    const { data } = await supabase.from('reuniao_notas_privadas').select('texto')
      .eq('reuniao_id', reuniaoId).eq('usuario_id', user!.id).maybeSingle()
    setNotaPrivada(data?.texto ?? '')
  }

  async function salvarNotaPrivada() {
    if (!reuniaoAberta) return
    await supabase.from('reuniao_notas_privadas')
      .upsert({ reuniao_id: reuniaoAberta.id, usuario_id: user!.id, texto: notaPrivada, updated_at: new Date().toISOString() }, { onConflict: 'reuniao_id,usuario_id' })
  }

  function abrirReuniaoFlat(r: Reuniao) {
    if (r.pasta) setPastaSelecionada(r.pasta as ReuniaPasta)
    abrirReuniao(r)
  }

  async function salvarReuniao() {
    if (!reuniaoAberta) return
    setSaving(true)
    let data: string | null = null
    if (editData) {
      data = editHora ? new Date(`${editData}T${editHora}`).toISOString() : editData
    }
    const { data: updated } = await supabase.from('reunioes').update({
      titulo: editTitulo, data, tipo: editTipo,
      link_video: editTipo === 'online' ? (editLinkVideo || null) : null,
      pauta: editPauta || null, transcricao: editTranscricao || null,
      updated_at: new Date().toISOString(),
    }).eq('id', reuniaoAberta.id).select().single()
    setEditandoCabecalho(false)
    if (updated) setReuniaoAberta(updated)
    if (pastaSelecionada) await loadReunioes(pastaSelecionada.id)
    setSaving(false)
  }

  async function lancarNaAgenda() {
    if (!reuniaoAberta || !pastaSelecionada) return
    setSaving(true)
    const dataInicio = reuniaoAberta.data ?? new Date().toISOString()
    const descricao = [pastaSelecionada.nome, reuniaoAberta.pauta].filter(Boolean).join(' · ') || null
    const { data: ev } = await supabase.from('eventos').insert({
      titulo: reuniaoAberta.titulo, descricao,
      data_inicio: dataInicio, dia_inteiro: !reuniaoAberta.data?.includes('T'),
      cor: pastaSelecionada.cor, concluido: false, criado_por: user!.id,
    }).select('id').single()
    if (ev) {
      await supabase.from('reunioes').update({ evento_id: ev.id }).eq('id', reuniaoAberta.id)
      setReuniaoAberta({ ...reuniaoAberta, evento_id: ev.id })
    }
    setSaving(false)
    alert('Evento criado na agenda!')
  }

  async function duplicarReuniao() {
    if (!reuniaoAberta || !pastaSelecionada) return
    setSaving(true)
    const { data: nova } = await supabase.from('reunioes').insert({
      titulo: `${reuniaoAberta.titulo} (cópia)`, pasta_id: reuniaoAberta.pasta_id,
      tipo: reuniaoAberta.tipo, link_video: reuniaoAberta.link_video, criado_por: user!.id,
    }).select().single()
    await loadReunioes(pastaSelecionada.id)
    if (nova) abrirReuniao(nova)
    setSaving(false)
  }

  async function deletarReuniao(id: string) {
    if (!confirm('Apagar esta reunião?')) return
    const reuniao = reunioes.find(r => r.id === id) ?? (reuniaoAberta?.id === id ? reuniaoAberta : null)
    if (reuniao?.evento_id) {
      await supabase.from('eventos').delete().eq('id', reuniao.evento_id)
    }
    await supabase.from('reunioes').delete().eq('id', id)
    if (reuniaoAberta?.id === id) setReuniaoAberta(null)
    if (pastaSelecionada) await loadReunioes(pastaSelecionada.id)
  }

  async function linkarPendencia() {
    if (!reuniaoAberta || !pendenciaParaLinkar) return
    await supabase.from('reuniao_pendencias').insert({ reuniao_id: reuniaoAberta.id, pendencia_id: pendenciaParaLinkar })
    setPendenciaParaLinkar('')
    setShowLinkPendencia(false)
    await loadPendenciasVinculadas(reuniaoAberta.id)
  }

  async function deslinkarPendencia(pendenciaId: string) {
    if (!reuniaoAberta) return
    await supabase.from('reuniao_pendencias').delete().eq('reuniao_id', reuniaoAberta.id).eq('pendencia_id', pendenciaId)
    await loadPendenciasVinculadas(reuniaoAberta.id)
  }

  async function criarPendenciaNaReuniao() {
    if (!reuniaoAberta || !formPendencia.titulo.trim() || !formPendencia.para_usuario_id) return
    setSaving(true)
    const { data: pend } = await supabase.from('pendencias').insert({
      titulo: formPendencia.titulo.trim(), status: 'aberta',
      prioridade: formPendencia.prioridade, prazo: formPendencia.prazo || null,
      de_usuario_id: user!.id, para_usuario_id: formPendencia.para_usuario_id,
      criado_por: user!.id,
    }).select().single()
    if (pend) {
      await supabase.from('reuniao_pendencias').insert({ reuniao_id: reuniaoAberta.id, pendencia_id: pend.id })
      await loadPendenciasVinculadas(reuniaoAberta.id)
    }
    setFormPendencia({ titulo: '', para_usuario_id: '', prioridade: 'media', prazo: '' })
    setShowNovaPendencia(false)
    setSaving(false)
  }

  async function adicionarParticipante() {
    if (!reuniaoAberta || !participanteParaAdicionar) return
    await supabase.from('reuniao_participantes').insert({ reuniao_id: reuniaoAberta.id, usuario_id: participanteParaAdicionar })
    if (reuniaoAberta.evento_id && participanteParaAdicionar !== user!.id) {
      await supabase.from('evento_participantes').insert({ evento_id: reuniaoAberta.evento_id, usuario_id: participanteParaAdicionar })
    }
    setParticipanteParaAdicionar('')
    setShowAddParticipante(false)
    await loadParticipantes(reuniaoAberta.id)
  }

  async function removerParticipante(usuarioId: string) {
    if (!reuniaoAberta) return
    if (!podeGerenciarParticipantes) return
    await supabase.from('reuniao_participantes').delete().eq('reuniao_id', reuniaoAberta.id).eq('usuario_id', usuarioId)
    if (reuniaoAberta.evento_id) {
      await supabase.from('evento_participantes').delete().eq('evento_id', reuniaoAberta.evento_id).eq('usuario_id', usuarioId)
    }
    await loadParticipantes(reuniaoAberta.id)
  }

  function abrirWhatsApp() {
    if (!reuniaoAberta) return
    const titulo = reuniaoAberta.titulo
    const data = reuniaoAberta.data ? formatData(reuniaoAberta.data) : 'a definir'
    const tipo = reuniaoAberta.tipo === 'online' ? 'Online' : 'Presencial'
    const link = reuniaoAberta.tipo === 'online' && reuniaoAberta.link_video ? `\n🔗 Link: ${reuniaoAberta.link_video}` : ''
    const topicos = reuniaoAberta.pauta_topicos ?? []
    const pauta = topicos.length > 0
      ? `\n\n📋 Pauta:\n${topicos.map((t, i) => `${i + 1}. ${t.titulo}${t.duracao ? ` (${t.duracao})` : ''}${t.descricao ? `\n   ${t.descricao}` : ''}`).join('\n')}`
      : ''
    const msg = `📅 *Lembrete de Reunião*\n\n*${titulo}*\n🗓 Data: ${data}\n📍 Tipo: ${tipo}${link}${pauta}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function formatData(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const prioridadeCor: Record<string, string> = { baixa: 'bg-green-100 text-green-700', media: 'bg-yellow-100 text-yellow-700', alta: 'bg-red-100 text-red-700' }
  const pendenciasNaoVinculadas = todasPendencias.filter(p => !pendenciasVinculadas.find(v => v.id === p.id))

  // Mobile: passo atual (pastas → reunioes → detalhe)
  const passoMobile = reuniaoAberta ? 2 : (isAdmin ? (pastaSelecionada ? 1 : 0) : 1)
  const podeGerenciarParticipantes = !!reuniaoAberta && (isAdmin || reuniaoAberta.criado_por === user?.id)
  const souParticipanteReuniao = !!reuniaoAberta && (podeGerenciarParticipantes || participantes.some(p => p.id === user?.id))

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Painel de pastas (somente admin) */}
      {isAdmin && (
        <div className={`${passoMobile !== 0 ? 'hidden' : 'flex'} w-full lg:w-80 bg-white border-r border-gray-200 flex-col`}>
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Reuniões</h2>
            <button onClick={() => setShowNovaPasta(true)} className="text-brand-600 hover:text-brand-800" title="Nova pasta">
              <Plus size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {pastas.length === 0 && <p className="text-sm text-gray-400 px-4 py-3">Nenhuma pasta ainda.</p>}
            {pastas.map(p => (
              <div key={p.id} className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg mx-1"
                style={{ borderLeft: pastaSelecionada?.id === p.id ? `3px solid ${p.cor}` : '3px solid transparent' }}
                onClick={() => setPastaSelecionada(pastaSelecionada?.id === p.id ? null : p)}>
                <span style={{ color: p.cor }}>{pastaSelecionada?.id === p.id ? <FolderOpen size={16} /> : <Folder size={16} />}</span>
                <span className="flex-1 text-sm text-gray-700 truncate">{p.nome}</span>
                <button onClick={e => { e.stopPropagation(); deletarPasta(p.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity">
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={14} className={`text-gray-400 transition-transform ${pastaSelecionada?.id === p.id ? 'rotate-90' : ''}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de reuniões */}
      <div className={`${passoMobile !== 1 ? 'hidden' : 'flex'} w-full lg:w-80 bg-white border-r border-gray-200 flex-col`}>
        {!isAdmin ? (
          <>
            <div className="px-4 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">Minhas reuniões</h2>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {minhasReunioes.length === 0 && (
                <p className="text-sm text-gray-400 px-4 py-3">Você ainda não foi adicionado a nenhuma reunião.</p>
              )}
              {minhasReunioes.map(r => {
                const pasta = r.pasta as ReuniaPasta | undefined
                return (
                  <div key={r.id}
                    className={`group mx-2 mb-1 px-3 py-3 rounded-lg cursor-pointer border transition-colors ${reuniaoAberta?.id === r.id ? 'bg-brand-50 border-brand-200' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => abrirReuniaoFlat(r)}>
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-gray-800 truncate flex-1">{r.titulo}</p>
                    </div>
                    {pasta && (
                      <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: pasta.cor }}>
                        <Folder size={11} /> {pasta.nome}
                      </span>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{r.data ? formatData(r.data) : 'Sem data'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {r.tipo === 'online'
                        ? <span className="text-xs text-blue-500 flex items-center gap-0.5"><Video size={11} /> Online</span>
                        : <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={11} /> Presencial</span>}
                      {r.evento_id && <span className="text-xs text-green-600">✓ Agenda</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : !pastaSelecionada ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
            Selecione uma pasta para ver as reuniões
          </div>
        ) : (
          <>
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setPastaSelecionada(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500" title="Voltar para pastas">
                  <ChevronLeft size={18} />
                </button>
                <span style={{ color: pastaSelecionada.cor }}><FolderOpen size={16} /></span>
                <h3 className="font-medium text-gray-800 text-sm truncate">{pastaSelecionada.nome}</h3>
              </div>
              <button onClick={() => setShowNovaReuniao(true)} className="text-brand-600 hover:text-brand-800" title="Nova reunião">
                <Plus size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {reunioes.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">Nenhuma reunião ainda.</p>
                  <button onClick={() => setShowNovaReuniao(true)} className="text-sm text-brand-600 hover:underline">+ Nova reunião</button>
                </div>
              )}
              {reunioes.map(r => (
                <div key={r.id}
                  className={`group mx-2 mb-1 px-3 py-3 rounded-lg cursor-pointer border transition-colors ${reuniaoAberta?.id === r.id ? 'bg-brand-50 border-brand-200' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => abrirReuniao(r)}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium text-gray-800 truncate flex-1">{r.titulo}</p>
                    <button onClick={e => { e.stopPropagation(); deletarReuniao(r.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 mt-0.5 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{r.data ? formatData(r.data) : 'Sem data'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {r.tipo === 'online'
                      ? <span className="text-xs text-blue-500 flex items-center gap-0.5"><Video size={11} /> Online</span>
                      : <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={11} /> Presencial</span>}
                    {r.evento_id && <span className="text-xs text-green-600">✓ Agenda</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhe da reunião */}
      <div className={`${passoMobile !== 2 ? 'hidden' : 'flex'} flex-1 overflow-y-auto flex-col`}>
        {!reuniaoAberta ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Selecione uma reunião para abrir
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 lg:px-8 py-4 lg:py-8 w-full">
            {/* Cabeçalho */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setReuniaoAberta(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0" title="Voltar para a lista">
                    <ChevronLeft size={18} />
                  </button>
                  {editandoCabecalho ? (
                    <input className="input text-lg font-semibold flex-1" value={editTitulo} onChange={e => setEditTitulo(e.target.value)} />
                  ) : (
                    <h1 className="text-xl font-bold text-gray-900 flex-1">{reuniaoAberta.titulo}</h1>
                  )}
                </div>
                <button onClick={() => setEditandoCabecalho(v => !v)} className="text-gray-400 hover:text-gray-600 ml-2">
                  <Edit2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Categoria</label>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: pastaSelecionada?.cor }}>
                    {pastaSelecionada?.nome}
                  </span>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Data</label>
                  {editandoCabecalho ? (
                    <div className="flex gap-2">
                      <input type="date" className="input text-sm py-1" value={editData} onChange={e => setEditData(e.target.value)} />
                      <input type="time" className="input text-sm py-1" value={editHora} onChange={e => setEditHora(e.target.value)} />
                    </div>
                  ) : (
                    <span className="text-gray-700">{reuniaoAberta.data ? formatData(reuniaoAberta.data) : '—'}</span>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                  {editandoCabecalho ? (
                    <div className="flex gap-2">
                      <button onClick={() => setEditTipo('presencial')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${editTipo === 'presencial' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                        <MapPin size={13} /> Presencial
                      </button>
                      <button onClick={() => setEditTipo('online')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${editTipo === 'online' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                        <Video size={13} /> Online
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${reuniaoAberta.tipo === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                      {reuniaoAberta.tipo === 'online' ? <><Video size={12} /> Online</> : <><MapPin size={12} /> Presencial</>}
                    </span>
                  )}
                </div>
              </div>
              {editandoCabecalho && editTipo === 'online' && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 block mb-1">Link da videochamada</label>
                  <div className="flex gap-2">
                    <input className="input text-sm flex-1" placeholder="https://meet.google.com/..." value={editLinkVideo} onChange={e => setEditLinkVideo(e.target.value)} />
                    {googleConectado && (
                      <button onClick={gerarLinkMeet} disabled={gerandoMeet}
                        className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap shrink-0">
                        {gerandoMeet ? 'Gerando...' : 'Gerar link do Meet'}
                      </button>
                    )}
                  </div>
                  {!googleConectado && (
                    <p className="text-xs text-gray-400 mt-1">Conecte sua conta do Google na Agenda pra gerar o link automaticamente.</p>
                  )}
                </div>
              )}
              {!editandoCabecalho && reuniaoAberta.tipo === 'online' && reuniaoAberta.link_video && (
                <div className="mt-3">
                  <a href={reuniaoAberta.link_video} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors">
                    <Link2 size={14} /> Entrar na videochamada
                  </a>
                </div>
              )}
              {editandoCabecalho && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setEditandoCabecalho(false)} className="btn-secondary text-sm py-1.5">Cancelar</button>
                  <button onClick={salvarReuniao} disabled={saving} className="btn-primary text-sm py-1.5">Salvar</button>
                </div>
              )}
            </div>

            {/* Pauta */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Pauta / Organização</h2>
                {conteudoLiberado(reuniaoAberta) && (
                  <button onClick={adicionarTopico}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                    <Plus size={12} /> Tópico
                  </button>
                )}
              </div>

              {!conteudoLiberado(reuniaoAberta) ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Lock size={15} /> Disponível 5 minutos antes do início da reunião.
                </div>
              ) : topicosPauta.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Nenhum tópico ainda. Clique em "Tópico" para começar.</p>
              ) : (
                <div className="space-y-3">
                  {topicosPauta.map((t, i) => (
                    <div key={t.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60 group">
                      {topicoEditando === t.id ? (
                        <>
                          <div className="flex items-start gap-2 mb-1">
                            <span className="text-xs text-gray-400 font-medium shrink-0 mt-1">{i + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <input
                                className="w-full font-bold text-sm text-gray-800 bg-white border border-gray-200 focus:outline-none focus:border-brand-400 rounded px-2 py-1.5"
                                placeholder="Título do tópico"
                                value={t.titulo}
                                onChange={e => atualizarTopicoLocal(t.id, 'titulo', e.target.value)}
                                autoFocus
                              />
                              <input
                                className="w-full italic text-xs text-gray-500 bg-white border border-gray-200 focus:outline-none focus:border-brand-400 rounded px-2 py-1 mt-1.5"
                                placeholder="Duração (ex: 10 min)"
                                value={t.duracao}
                                onChange={e => atualizarTopicoLocal(t.id, 'duracao', e.target.value)}
                              />
                            </div>
                            <button onClick={() => removerTopico(t.id)} className="text-gray-300 hover:text-red-400 shrink-0 mt-1">
                              <X size={14} />
                            </button>
                          </div>
                          <textarea
                            className="w-full text-sm text-gray-700 bg-white border border-gray-200 resize-none focus:outline-none focus:border-brand-400 rounded px-2 py-1.5 min-h-[60px] mt-1.5"
                            placeholder="Descreva o tópico..."
                            value={t.descricao}
                            onChange={e => atualizarTopicoLocal(t.id, 'descricao', e.target.value)}
                          />
                          <div className="flex justify-end mt-2">
                            <button onClick={() => { confirmarTopico(); setTopicoEditando(null) }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors">
                              Fechar
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-gray-400 font-medium shrink-0 mt-0.5">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-800">{t.titulo || 'Sem título'}</p>
                            {t.duracao && <p className="italic text-xs text-gray-500">{t.duracao}</p>}
                            {t.descricao && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{t.descricao}</p>}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => setTopicoEditando(t.id)} className="text-gray-400 hover:text-brand-600 p-1"><Edit2 size={13} /></button>
                            <button onClick={() => removerTopico(t.id)} className="text-gray-400 hover:text-red-500 p-1"><X size={14} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pendências */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ClipboardList size={15} /> Pendências da reunião
                </h2>
                {conteudoLiberado(reuniaoAberta) && (
                  <div className="flex gap-2">
                    <button onClick={() => { setShowLinkPendencia(true); setShowNovaPendencia(false) }}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                      Vincular existente
                    </button>
                    <button onClick={() => { setShowNovaPendencia(true); setShowLinkPendencia(false) }}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                      <Plus size={12} /> Nova
                    </button>
                  </div>
                )}
              </div>

              {!conteudoLiberado(reuniaoAberta) ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Lock size={15} /> Disponível 5 minutos antes do início da reunião.
                </div>
              ) : (
              <>
              {/* Vincular existente */}
              {showLinkPendencia && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                  <select className="input text-sm" value={pendenciaParaLinkar} onChange={e => setPendenciaParaLinkar(e.target.value)}>
                    <option value="">Selecione uma pendência...</option>
                    {pendenciasNaoVinculadas.map(p => (
                      <option key={p.id} value={p.id}>{p.titulo}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setShowLinkPendencia(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                    <button onClick={linkarPendencia} disabled={!pendenciaParaLinkar} className="btn-primary text-xs py-1.5 flex-1">Vincular</button>
                  </div>
                </div>
              )}

              {/* Nova pendência */}
              {showNovaPendencia && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                  <input className="input text-sm" placeholder="Título da pendência *" value={formPendencia.titulo}
                    onChange={e => setFormPendencia(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                  <select className="input text-sm" value={formPendencia.para_usuario_id}
                    onChange={e => setFormPendencia(f => ({ ...f, para_usuario_id: e.target.value }))}>
                    <option value="">Para quem? *</option>
                    {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <select className="input text-sm" value={formPendencia.prioridade}
                    onChange={e => setFormPendencia(f => ({ ...f, prioridade: e.target.value as any }))}>
                    <option value="baixa">Baixa prioridade</option>
                    <option value="media">Média prioridade</option>
                    <option value="alta">Alta prioridade</option>
                  </select>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prazo</label>
                    <input type="date" className="input text-sm" value={formPendencia.prazo}
                      onChange={e => setFormPendencia(f => ({ ...f, prazo: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNovaPendencia(false)} className="btn-secondary text-xs py-1.5 flex-1">Cancelar</button>
                    <button onClick={criarPendenciaNaReuniao} disabled={saving || !formPendencia.titulo.trim() || !formPendencia.para_usuario_id} className="btn-primary text-xs py-1.5 flex-1">Criar</button>
                  </div>
                </div>
              )}

              {pendenciasVinculadas.length === 0 && !showLinkPendencia && !showNovaPendencia && (
                <p className="text-sm text-gray-400 py-2">Nenhuma pendência vinculada.</p>
              )}
              <div className="space-y-2">
                {pendenciasVinculadas.map(p => (
                  <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium text-gray-800 ${p.status === 'resolvida' ? 'line-through text-gray-400' : ''}`}>{p.titulo}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${prioridadeCor[p.prioridade]}`}>{p.prioridade}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.status === 'resolvida' ? '✓ Resolvida' : p.status === 'em_andamento' ? 'Em andamento' : 'Aberta'}
                        {p.para_usuario && <> · Para: {(p.para_usuario as Profile).nome.split(' ')[0]}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href="/pendencias" className="text-gray-400 hover:text-brand-600" title="Ver pendências">
                        <ExternalLink size={13} />
                      </a>
                      <button onClick={() => deslinkarPendencia(p.id)} className="text-gray-400 hover:text-red-500" title="Desvincular">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </>
              )}
            </div>

            {/* Dados importados (Metas / Histórico) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Download size={15} /> Dados para apresentar
                </h2>
                {conteudoLiberado(reuniaoAberta) && (
                  <button onClick={abrirImportar}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                    <Plus size={12} /> Importar
                  </button>
                )}
              </div>
              {!conteudoLiberado(reuniaoAberta) ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Lock size={15} /> Disponível 5 minutos antes do início da reunião.
                </div>
              ) : (!reuniaoAberta.dados_importados || reuniaoAberta.dados_importados.length === 0) ? (
                <p className="text-sm text-gray-400 py-2">Nenhum dado importado ainda.</p>
              ) : (
                <div className="space-y-4">
                  {reuniaoAberta.dados_importados.map(bloco => (
                    <div key={bloco.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                          {bloco.tipo === 'metas' ? <Target size={14} className="text-brand-600" /> : <LineChart size={14} className="text-brand-600" />}
                          {bloco.titulo}
                        </p>
                        <button onClick={() => removerDadosImportados(bloco.id)} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
                      </div>

                      {bloco.tipo === 'metas' && (
                        <div className="space-y-4">
                          {bloco.blocos.map((b, i) => {
                            const pct = b.totalMeta > 0 ? b.totalRealizado / b.totalMeta : 0
                            return (
                              <div key={i}>
                                <p className="text-xs font-semibold text-gray-500 mb-1.5">{b.label}</p>

                                {/* Cards (mobile) */}
                                <div className="sm:hidden space-y-2">
                                  {b.lojas.map((l, j) => {
                                    const lp = l.meta > 0 && l.realizado != null ? l.realizado / l.meta : null
                                    return (
                                      <div key={j} className="border border-gray-200 rounded-lg p-2.5">
                                        <div className="flex items-center justify-between">
                                          <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                                          <span className={`text-xs font-semibold ${lp === null ? 'text-gray-300' : lp >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                                            {lp !== null ? `${(lp * 100).toFixed(1)}%` : '—'}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                                          <span>Meta: {fmtR(l.meta)}</span>
                                          <span className="text-blue-700">Realizado: {l.realizado != null ? fmtR(l.realizado) : '—'}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  <div className="border-t-2 border-gray-200 rounded-lg p-2.5 bg-gray-50 font-semibold">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm text-gray-800">TOTAL</p>
                                      <span className={`text-xs ${pct >= 1 ? 'text-green-600' : 'text-red-500'}`}>{(pct * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                                      <span>Meta: {fmtR(b.totalMeta)}</span>
                                      <span className="text-blue-700">Realizado: {fmtR(b.totalRealizado)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Tabela (desktop) */}
                                <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
                                  <table className="min-w-full text-xs">
                                    <thead><tr className="bg-gray-100 text-gray-500">
                                      <th className="text-left p-2">Loja</th>
                                      <th className="text-right p-2">Meta</th>
                                      <th className="text-right p-2">Realizado</th>
                                      <th className="text-right p-2">%</th>
                                    </tr></thead>
                                    <tbody>
                                      {b.lojas.map((l, j) => {
                                        const lp = l.meta > 0 && l.realizado != null ? l.realizado / l.meta : null
                                        return (
                                          <tr key={j} className="border-t border-gray-100">
                                            <td className="p-2 font-medium text-gray-800 whitespace-nowrap">{l.nome}</td>
                                            <td className="p-2 text-right whitespace-nowrap">{fmtR(l.meta)}</td>
                                            <td className="p-2 text-right text-blue-700">{l.realizado != null ? fmtR(l.realizado) : '—'}</td>
                                            <td className={`p-2 text-right font-semibold ${lp === null ? 'text-gray-300' : lp >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                                              {lp !== null ? `${(lp * 100).toFixed(1)}%` : '—'}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                      <tr className="border-t-2 border-gray-200 font-semibold bg-white">
                                        <td className="p-2">TOTAL</td>
                                        <td className="p-2 text-right">{fmtR(b.totalMeta)}</td>
                                        <td className="p-2 text-right text-blue-700">{fmtR(b.totalRealizado)}</td>
                                        <td className={`p-2 text-right ${pct >= 1 ? 'text-green-600' : 'text-red-500'}`}>{(pct * 100).toFixed(1)}%</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {bloco.tipo === 'historico' && (
                        <>
                        {/* Cards (mobile) */}
                        <div className="sm:hidden space-y-2">
                          {bloco.lojas.map((l, j) => (
                            <div key={j} className="border border-gray-200 rounded-lg p-2.5">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                                <span className="text-sm font-semibold text-gray-800">{fmtR(l.valor)}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs mt-1">
                                <span className={l.var1 === null ? 'text-gray-300' : l.var1 >= 0 ? 'text-green-600' : 'text-red-500'}>
                                  vs {bloco.ano - 1}: {l.var1 !== null ? `${l.var1 >= 0 ? '+' : ''}${(l.var1 * 100).toFixed(1)}%` : '—'}
                                </span>
                                <span className={l.var2 === null ? 'text-gray-300' : l.var2 >= 0 ? 'text-green-600' : 'text-red-500'}>
                                  vs {bloco.ano - 2}: {l.var2 !== null ? `${l.var2 >= 0 ? '+' : ''}${(l.var2 * 100).toFixed(1)}%` : '—'}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div className="border-t-2 border-gray-200 rounded-lg p-2.5 bg-gray-50 font-semibold">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-800">TOTAL REDE</p>
                              <span className="text-sm text-gray-800">{fmtR(bloco.totalRede)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs mt-1">
                              <span className={bloco.totalVar1 === null ? 'text-gray-300' : bloco.totalVar1 >= 0 ? 'text-green-600' : 'text-red-500'}>
                                vs {bloco.ano - 1}: {bloco.totalVar1 !== null ? `${bloco.totalVar1 >= 0 ? '+' : ''}${(bloco.totalVar1 * 100).toFixed(1)}%` : '—'}
                              </span>
                              <span className={bloco.totalVar2 === null ? 'text-gray-300' : bloco.totalVar2 >= 0 ? 'text-green-600' : 'text-red-500'}>
                                vs {bloco.ano - 2}: {bloco.totalVar2 !== null ? `${bloco.totalVar2 >= 0 ? '+' : ''}${(bloco.totalVar2 * 100).toFixed(1)}%` : '—'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Tabela (desktop) */}
                        <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
                          <table className="min-w-full text-xs">
                            <thead><tr className="bg-gray-100 text-gray-500">
                              <th className="text-left p-2">Loja</th>
                              <th className="text-right p-2">{bloco.mesLabel} {bloco.ano}</th>
                              <th className="text-right p-2">vs {bloco.ano - 1}</th>
                              <th className="text-right p-2">vs {bloco.ano - 2}</th>
                            </tr></thead>
                            <tbody>
                              {bloco.lojas.map((l, j) => (
                                <tr key={j} className="border-t border-gray-100">
                                  <td className="p-2 font-medium text-gray-800 whitespace-nowrap">{l.nome}</td>
                                  <td className="p-2 text-right whitespace-nowrap">{fmtR(l.valor)}</td>
                                  <td className={`p-2 text-right font-medium ${l.var1 === null ? 'text-gray-300' : l.var1 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {l.var1 !== null ? `${l.var1 >= 0 ? '+' : ''}${(l.var1 * 100).toFixed(1)}%` : '—'}
                                  </td>
                                  <td className={`p-2 text-right font-medium ${l.var2 === null ? 'text-gray-300' : l.var2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {l.var2 !== null ? `${l.var2 >= 0 ? '+' : ''}${(l.var2 * 100).toFixed(1)}%` : '—'}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-gray-200 font-semibold bg-white">
                                <td className="p-2">TOTAL REDE</td>
                                <td className="p-2 text-right">{fmtR(bloco.totalRede)}</td>
                                <td className={`p-2 text-right ${bloco.totalVar1 === null ? 'text-gray-300' : bloco.totalVar1 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {bloco.totalVar1 !== null ? `${bloco.totalVar1 >= 0 ? '+' : ''}${(bloco.totalVar1 * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td className={`p-2 text-right ${bloco.totalVar2 === null ? 'text-gray-300' : bloco.totalVar2 >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {bloco.totalVar2 !== null ? `${bloco.totalVar2 >= 0 ? '+' : ''}${(bloco.totalVar2 * 100).toFixed(1)}%` : '—'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Participantes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users size={15} /> Participantes
                </h2>
                {podeGerenciarParticipantes && (
                  <button onClick={() => setShowAddParticipante(v => !v)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex items-center gap-1">
                    <Plus size={12} /> Adicionar
                  </button>
                )}
              </div>
              {podeGerenciarParticipantes && showAddParticipante && (
                <div className="mb-3 flex gap-2">
                  <select className="input text-sm flex-1" value={participanteParaAdicionar}
                    onChange={e => setParticipanteParaAdicionar(e.target.value)}>
                    <option value="">Selecione um usuário...</option>
                    {equipe.filter(p => p.id !== user!.id && !participantes.find(pt => pt.id === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <button onClick={adicionarParticipante} disabled={!participanteParaAdicionar}
                    className="btn-primary text-xs py-1.5 px-3">Confirmar</button>
                  <button onClick={() => setShowAddParticipante(false)} className="btn-secondary text-xs py-1.5 px-3">Cancelar</button>
                </div>
              )}
              {participantes.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum participante adicionado</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {participantes.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-sm text-gray-700">
                      <span>{p.nome.split(' ')[0]}</span>
                      {podeGerenciarParticipantes && (
                        <button onClick={() => removerParticipante(p.id)} className="text-gray-400 hover:text-red-500 ml-1">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Ações</h2>
              <div className="flex flex-wrap gap-3">
                {reuniaoAberta.evento_id ? (
                  <a href={`/agenda?evento=${reuniaoAberta.evento_id}`}
                    className="flex items-center gap-1.5 text-sm text-green-600 font-medium px-3 py-2 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                    <Calendar size={15} /> Na agenda
                  </a>
                ) : (
                  <button onClick={lancarNaAgenda} disabled={saving}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors">
                    <Calendar size={15} /> Lançar na agenda
                  </button>
                )}
                <button onClick={abrirWhatsApp}
                  className="flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
                  <MessageCircle size={15} /> Lembrete WhatsApp
                </button>
                <button onClick={duplicarReuniao} disabled={saving}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                  <Copy size={15} /> Duplicar
                </button>
              </div>
            </div>

            {/* Anotações privadas */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Minhas anotações</h2>
              <p className="text-xs text-gray-400 mb-3">Visível só para você. Mais nenhum participante consegue ver.</p>
              <textarea className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[120px] bg-gray-50 rounded-lg p-3"
                placeholder="Escreva suas anotações pessoais sobre esta reunião..."
                value={notaPrivada} onChange={e => setNotaPrivada(e.target.value)} onBlur={salvarNotaPrivada} />
            </div>

            {/* Transcrição */}
            {(isAdmin || reuniaoAberta.criado_por === user?.id) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Transcrição</h2>
                <textarea className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[200px]"
                  placeholder="Cole ou escreva a transcrição da reunião aqui..."
                  value={editTranscricao} onChange={e => setEditTranscricao(e.target.value)} onBlur={salvarReuniao} />
              </div>
            )}

            {/* Chat da reunião */}
            {souParticipanteReuniao && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                  <MessageSquare size={15} /> Comentários
                </p>
                <p className="text-xs text-gray-400 mb-3">Visível apenas para os participantes desta reunião.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto mb-2">
                  {comentariosReuniao.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda.</p>}
                  {comentariosReuniao.map(c => {
                    const autor = c.autor as Profile | undefined
                    const souEu = c.autor_id === user?.id
                    return (
                      <div key={c.id} className={`flex ${souEu ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 ${souEu ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          <p className="text-xs font-semibold mb-0.5 opacity-70">{souEu ? 'Você' : autor?.nome ?? 'Desconhecido'}</p>
                          <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>
                          <p className={`text-[10px] mt-0.5 ${souEu ? 'text-white/70' : 'text-gray-400'}`}>
                            {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-end gap-2">
                  <textarea className="input flex-1 text-sm resize-none" rows={1}
                    placeholder="Escreva um comentário... (Shift+Enter para nova linha)"
                    value={novoComentarioReuniao} onChange={e => setNovoComentarioReuniao(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentarioReuniao() } }} />
                  <button onClick={enviarComentarioReuniao} disabled={enviandoComentarioReuniao || !novoComentarioReuniao.trim()}
                    className="btn-primary p-2.5 shrink-0 disabled:opacity-50">
                    <Send size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Rastro */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 px-1 mt-4">
              <span>Criado por</span>
              <span className="font-medium text-gray-500">{equipe.find(p => p.id === reuniaoAberta.criado_por)?.nome ?? 'Desconhecido'}</span>
              <span>•</span>
              <span>{new Date(reuniaoAberta.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal nova pasta */}
      {showNovaPasta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova pasta</h3>
              <button onClick={() => setShowNovaPasta(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input className="input" placeholder="Ex: Comercial" value={nomePasta}
                  onChange={e => setNomePasta(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && criarPasta()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES.map(c => (
                    <button key={c} onClick={() => setCorPasta(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${corPasta === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNovaPasta(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={criarPasta} disabled={saving || !nomePasta.trim()} className="btn-primary flex-1">Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova reunião */}
      {showNovaReuniao && pastaSelecionada && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova reunião</h3>
              <button onClick={() => setShowNovaReuniao(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="input" placeholder="Ex: Reunião de planejamento" value={formReuniao.titulo}
                  onChange={e => setFormReuniao(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: pastaSelecionada.cor }}>
                  {pastaSelecionada.nome}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormReuniao(f => ({ ...f, tipo: 'presencial' }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${formReuniao.tipo === 'presencial' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                    <MapPin size={14} /> Presencial
                  </button>
                  <button onClick={() => setFormReuniao(f => ({ ...f, tipo: 'online' }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${formReuniao.tipo === 'online' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                    <Video size={14} /> Online
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" className="input" value={formReuniao.data} onChange={e => setFormReuniao(f => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" className="input" value={formReuniao.hora} onChange={e => setFormReuniao(f => ({ ...f, hora: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duração prevista</label>
                <select className="input" value={formReuniao.duracao} onChange={e => setFormReuniao(f => ({ ...f, duracao: Number(e.target.value) }))}>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1h 30min</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNovaReuniao(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={criarReuniao} disabled={saving || !formReuniao.titulo.trim()} className="btn-primary flex-1">Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar dados */}
      {showImportar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowImportar(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Download size={18} /> Importar dados</h3>
              <button onClick={() => setShowImportar(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>

            <div className="flex gap-2 mb-4 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setImportarTab('metas')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${importarTab === 'metas' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                <Target size={14} /> Metas
              </button>
              <button onClick={() => setImportarTab('historico')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${importarTab === 'historico' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                <LineChart size={14} /> Histórico
              </button>
            </div>

            {importarTab === 'metas' ? (
              <div className="space-y-3">
                {metasMeses.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Nenhum mês de metas cadastrado ainda.</p>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Mês</label>
                      <select className="input" value={metasMesEscolhido} onChange={e => carregarMetasMes(e.target.value)}>
                        {metasMeses.map(m => (
                          <option key={m.id} value={m.id}>
                            {new Date(m.mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    {metasModoSelecao !== 'todas' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Semana</label>
                        <select className="input" value={metasSemanaEscolhida} onChange={e => setMetasSemanaEscolhida(e.target.value)}>
                          {metasSemanas.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">O que importar?</label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" checked={metasModoSelecao === 'uma'} onChange={() => setMetasModoSelecao('uma')} className="accent-brand-600" />
                          Somente a semana escolhida
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" checked={metasModoSelecao === 'uma_total'} onChange={() => setMetasModoSelecao('uma_total')} className="accent-brand-600" />
                          A semana escolhida + total do mês
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" checked={metasModoSelecao === 'todas'} onChange={() => setMetasModoSelecao('todas')} className="accent-brand-600" />
                          Todas as semanas do mês
                        </label>
                      </div>
                    </div>
                    <button onClick={importarMetas} disabled={importando || !metasMesEscolhido} className="btn-primary w-full">
                      {importando ? 'Importando...' : 'Importar'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {vendasLojas.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Nenhum histórico de vendas cadastrado ainda.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Ano</label>
                        <input type="number" className="input" value={vendasAnoEscolhido ?? ''}
                          onChange={e => setVendasAnoEscolhido(Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Mês</label>
                        <select className="input" value={vendasMesEscolhido} onChange={e => setVendasMesEscolhido(e.target.value as keyof VendaRegistro)}>
                          {MESES_VENDA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">Mostra o total de cada loja no mês escolhido, comparado com o mesmo mês nos 2 anos anteriores.</p>
                    <button onClick={importarHistorico} disabled={importando || !vendasAnoEscolhido} className="btn-primary w-full">
                      {importando ? 'Importando...' : 'Importar'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

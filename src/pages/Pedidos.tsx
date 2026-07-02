import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase, criarNotificacoes } from '../lib/supabase'
import ChatPedido from '../components/ChatPedido'
import {
  Plus, X, Link2, CheckCircle2, XCircle, Clock, Search,
  Package, Trash2, Edit2, Ban, ClipboardCheck, AlertTriangle, Check,
  Upload, Eye, History, Pencil,
} from 'lucide-react'
import type { ConfigLoja } from './Configuracoes'
import { useAuth } from '../contexts/AuthContext'

type PedidoItem = {
  id: string
  grupo_id: string
  codigo: string | null
  descricao: string | null
  tamanho: string | null
  qt_caixa: number | null
  preco_unitario: number | null
  preco_final: number | null
  lojas: Record<string, { nome: string; qty: number; valor: number }>
}

type ItemHistorico = {
  id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string | null
  criado_em: string
}

type Pedido = {
  id: string
  grupo_id: string
  numero_pedido: number | null
  data_pedido: string | null
  data_aprovacao: string | null
  qt_parcelas: number | null
  prazo_pagamento: number[]
  valor_pedido: number | null
  percentual_nota: number | null
  fornecedor: string | null
  loja_id: string | null
  loja_nome: string | null
  itens: string | null
  entrada_nota_id: string | null
  nota: string | null
  valor_nota: number | null
  status: string
  created_at: string
  data_faturamento: string | null
}

type EntradaNota = {
  id: string
  numero_nota: string | null
  fornecedor: string | null
  emitida_em: string | null
  valor_total: number | null
}

type ConferenciaData = {
  pedido: Pedido
  nf: EntradaNota
}

const STATUS_CONFIG = {
  PENDENTE:  { label: 'Pendente',  cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APROVADO:  { label: 'Aprovado',  cor: 'bg-blue-100 text-blue-700',     icon: CheckCircle2 },
  ENTREGUE:  { label: 'Entregue', cor: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  CANCELADO: { label: 'Cancelado', cor: 'bg-red-100 text-red-700',      icon: XCircle },
}

const fmt = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('pt-BR')
}

type FormState = {
  data_pedido: string; data_aprovacao: string; fornecedor: string; grupo_id: string
  loja_id: string; qt_parcelas: number; prazo_pagamento: number[]
  valor_pedido: string; percentual_nota: string; itens: string; status: string
}

const FORM_VAZIO: FormState = {
  data_pedido: '', data_aprovacao: '', fornecedor: '', grupo_id: '',
  loja_id: '', qt_parcelas: 3, prazo_pagamento: [30, 60, 90],
  valor_pedido: '', percentual_nota: '100', itens: '', status: 'PENDENTE',
}

function pedidoParaForm(p: Pedido): FormState {
  return {
    data_pedido: p.data_pedido ?? '', data_aprovacao: p.data_aprovacao ?? '',
    fornecedor: p.fornecedor ?? '', grupo_id: p.grupo_id,
    loja_id: p.loja_id ?? '',
    qt_parcelas: p.qt_parcelas ?? 3,
    prazo_pagamento: p.prazo_pagamento?.length ? p.prazo_pagamento : [30, 60, 90],
    valor_pedido: p.valor_pedido != null ? String(p.valor_pedido) : '',
    percentual_nota: p.percentual_nota != null ? String(p.percentual_nota) : '100',
    itens: p.itens ?? '', status: p.status,
  }
}

function normNome(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [lojas, setLojas] = useState<ConfigLoja[]>([])
  const [loading, setLoading] = useState(true)
  const [fornecedores, setFornecedores] = useState<string[]>([])
  const [itensList, setItensList] = useState<string[]>([])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [saving, setSaving] = useState(false)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(FORM_VAZIO)
  const [savingEdit, setSavingEdit] = useState(false)

  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'numero_desc' | 'numero_asc' | 'data_desc' | 'data_asc' | 'fornecedor_asc' | 'valor_desc'>('numero_desc')
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtros, setFiltros] = useState({
    fornecedor: '', dataDe: '', dataAte: '', valorMin: '', valorMax: '', lojaId: '', itens: '',
  })

  function limparFiltros() {
    setFiltros({ fornecedor: '', dataDe: '', dataAte: '', valorMin: '', valorMax: '', lojaId: '', itens: '' })
  }
  const filtrosAtivos = Object.values(filtros).some(v => v !== '')

  const [importando, setImportando] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ dados: object[]; fornecedor: string; prazos: number[]; dataSugerida: string } | null>(null)
  const [importData, setImportData] = useState('')
  const [importAprovacao, setImportAprovacao] = useState('')
  const [importItens, setImportItens] = useState('')

  const reimportFileRef = useRef<HTMLInputElement>(null)

  const [visualizarGrupoId, setVisualizarGrupoId] = useState<string | null>(null)
  const [itensPedido, setItensPedido] = useState<PedidoItem[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [editandoItens, setEditandoItens] = useState(false)
  const [editItensBuffer, setEditItensBuffer] = useState<Record<string, Partial<PedidoItem>>>({})
  const [salvandoItens, setSalvandoItens] = useState(false)
  const [historico, setHistorico] = useState<ItemHistorico[]>([])
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

  const { profile } = useAuth()

  const [vincularId, setVincularId] = useState<string | null>(null)
  const [notasDisponiveis, setNotasDisponiveis] = useState<EntradaNota[]>([])
  const [searchNF, setSearchNF] = useState('')

  const [conferencia, setConferencia] = useState<ConferenciaData | null>(null)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: ped }, { data: loj }] = await Promise.all([
      supabase.from('pedidos').select('*').order('numero_pedido', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('config_lojas').select('*').order('ordem'),
    ])
    setPedidos(ped ?? [])
    setLojas(loj ?? [])
    const unicos = [...new Set((ped ?? []).map(p => p.fornecedor).filter(Boolean) as string[])].sort()
    setFornecedores(unicos)
    const unicosItens = [...new Set((ped ?? []).map(p => p.itens).filter(Boolean) as string[])].sort()
    setItensList(unicosItens)
    setLoading(false)
  }

  const q = busca.toLowerCase().trim()

  const grupos = Object.entries(
    pedidos.reduce<Record<string, Pedido[]>>((acc, p) => {
      if (!acc[p.grupo_id]) acc[p.grupo_id] = []
      acc[p.grupo_id].push(p)
      return acc
    }, {})
  )
    .sort(([, a], [, b]) => {
      const pa = a[0], pb = b[0]
      switch (ordem) {
        case 'numero_asc':     return (pa.numero_pedido ?? 0) - (pb.numero_pedido ?? 0)
        case 'data_desc':      return (pb.data_pedido ?? '').localeCompare(pa.data_pedido ?? '')
        case 'data_asc':       return (pa.data_pedido ?? '').localeCompare(pb.data_pedido ?? '')
        case 'fornecedor_asc': return (pa.fornecedor ?? '').localeCompare(pb.fornecedor ?? '', 'pt-BR')
        case 'valor_desc':     return b.reduce((s, i) => s + (i.valor_pedido ?? 0), 0) - a.reduce((s, i) => s + (i.valor_pedido ?? 0), 0)
        default:               return (pb.numero_pedido ?? 0) - (pa.numero_pedido ?? 0)
      }
    })
    .filter(([, itens]) => {
      const primeiro = itens[0]
      const numStr = primeiro.numero_pedido != null ? String(primeiro.numero_pedido).padStart(3, '0') : ''
      const totalGrupo = itens.reduce((s, i) => s + (i.valor_pedido ?? 0), 0)

      // busca textual
      if (q && !(
        primeiro.fornecedor?.toLowerCase().includes(q) ||
        numStr.includes(q) ||
        itens.some(p =>
          p.loja_nome?.toLowerCase().includes(q) ||
          p.itens?.toLowerCase().includes(q) ||
          p.nota?.toLowerCase().includes(q) ||
          (p.valor_pedido != null && String(p.valor_pedido).includes(q)) ||
          (p.valor_nota != null && String(p.valor_nota).includes(q))
        )
      )) return false

      // filtros
      if (filtros.fornecedor && !primeiro.fornecedor?.toLowerCase().includes(filtros.fornecedor.toLowerCase())) return false
      if (filtros.dataDe && (primeiro.data_pedido ?? '') < filtros.dataDe) return false
      if (filtros.dataAte && (primeiro.data_pedido ?? '') > filtros.dataAte) return false
      if (filtros.valorMin && totalGrupo < parseFloat(filtros.valorMin)) return false
      if (filtros.valorMax && totalGrupo > parseFloat(filtros.valorMax)) return false
      if (filtros.lojaId && !itens.some(p => p.loja_id === filtros.lojaId)) return false
      if (filtros.itens && !itens.some(p => p.itens?.toLowerCase().includes(filtros.itens.toLowerCase()))) return false

      return true
    })

  // ── Criar ───────────────────────────────────────────────────────────

  function abrirNovoGrupo() { setForm(FORM_VAZIO); setShowForm(true) }

  function abrirNovaLoja(primeiro: Pedido) {
    setForm({
      ...FORM_VAZIO,
      grupo_id: primeiro.grupo_id,
      data_pedido: primeiro.data_pedido ?? '',
      data_aprovacao: primeiro.data_aprovacao ?? '',
      fornecedor: primeiro.fornecedor ?? '',
    })
    setShowForm(true)
  }

  async function salvar() {
    setSaving(true)
    const grupoId = form.grupo_id || crypto.randomUUID()
    const loja = lojas.find(l => l.id === form.loja_id)

    // Número sequencial — só no primeiro item do grupo
    let numeroPedido: number | null = null
    if (!form.grupo_id) {
      const { data: maxRow } = await supabase
        .from('pedidos').select('numero_pedido').order('numero_pedido', { ascending: false }).limit(1).maybeSingle()
      numeroPedido = (maxRow?.numero_pedido ?? 0) + 1
    }

    const { error } = await supabase.from('pedidos').insert({
      grupo_id: grupoId,
      numero_pedido: numeroPedido ?? pedidos.find(p => p.grupo_id === form.grupo_id)?.numero_pedido ?? null,
      data_pedido: form.data_pedido || null,
      data_aprovacao: form.data_aprovacao || null,
      qt_parcelas: form.qt_parcelas,
      prazo_pagamento: form.prazo_pagamento,
      valor_pedido: form.valor_pedido ? parseFloat(form.valor_pedido.replace(',', '.')) : null,
      percentual_nota: form.percentual_nota ? parseFloat(form.percentual_nota.replace(',', '.')) : null,
      fornecedor: form.fornecedor || null,
      loja_id: form.loja_id || null,
      loja_nome: loja?.nome ?? null,
      itens: form.itens || null,
      status: form.status,
    })
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }

    // Notificar admins sobre novo pedido (exceto o próprio criador)
    if (!form.grupo_id) {
      const { data: admins } = await supabase.from('profiles').select('id').eq('is_admin', true)
      const ids = (admins ?? []).map((a: any) => a.id).filter((id: string) => id !== profile?.id)
      if (ids.length > 0) {
        await criarNotificacoes(ids.map((uid: string) => ({
          usuario_id: uid,
          tipo: 'pedido_novo',
          titulo: `Novo pedido de ${form.fornecedor || 'fornecedor'}`,
          mensagem: `${profile?.nome ?? 'Alguém'} criou o pedido #${String(numeroPedido ?? '').padStart(3, '0')}`,
          link: '/pedidos',
        })))
      }
    }

    setShowForm(false)
    setForm(FORM_VAZIO)
    await carregar()
  }

  // ── Editar ──────────────────────────────────────────────────────────

  async function salvarEdicao() {
    if (!editandoId) return
    setSavingEdit(true)
    const loja = lojas.find(l => l.id === editForm.loja_id)

    const grupoPayload = {
      data_pedido: editForm.data_pedido || null,
      data_aprovacao: editForm.data_aprovacao || null,
      fornecedor: editForm.fornecedor || null,
    }
    const lojaPayload = {
      loja_id: editForm.loja_id || null,
      loja_nome: loja?.nome ?? null,
      qt_parcelas: editForm.qt_parcelas,
      prazo_pagamento: editForm.prazo_pagamento,
      valor_pedido: editForm.valor_pedido ? parseFloat(editForm.valor_pedido.replace(',', '.')) : null,
      percentual_nota: editForm.percentual_nota ? parseFloat(editForm.percentual_nota.replace(',', '.')) : null,
      itens: editForm.itens || null,
      status: editForm.status,
    }

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('pedidos').update(grupoPayload).eq('grupo_id', editForm.grupo_id),
      supabase.from('pedidos').update(lojaPayload).eq('id', editandoId),
    ])
    setSavingEdit(false)
    if (e1 || e2) { alert('Erro ao salvar: ' + (e1?.message ?? e2?.message)); return }
    setEditandoId(null)
    await carregar()
  }

  // ── Apagar / Cancelar ───────────────────────────────────────────────

  async function apagarLoja(pedido: Pedido, totalNoGrupo: number) {
    const msg = totalNoGrupo === 1
      ? `Apagar o pedido completo de "${pedido.fornecedor ?? 'fornecedor'}" (${fmtDate(pedido.data_pedido)})?`
      : `Apagar a loja "${pedido.loja_nome ?? '—'}" deste pedido?`
    if (!confirm(msg)) return
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    await carregar()
  }

  async function apagarGrupo(grupoId: string, fornecedor: string | null, data: string | null) {
    if (!confirm(`Apagar o pedido completo de "${fornecedor ?? 'fornecedor'}" (${fmtDate(data)}) e todas as lojas vinculadas?`)) return
    await supabase.from('pedidos').delete().eq('grupo_id', grupoId)
    await carregar()
  }

  async function cancelarGrupo(grupoId: string) {
    if (!confirm('Marcar o pedido inteiro como Cancelado?')) return
    await supabase.from('pedidos').update({ status: 'CANCELADO' }).eq('grupo_id', grupoId)
    setPedidos(prev => prev.map(p => p.grupo_id === grupoId ? { ...p, status: 'CANCELADO' } : p))
  }

  async function alterarStatus(pedidoId: string, status: string) {
    await supabase.from('pedidos').update({ status }).eq('id', pedidoId)
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, status } : p))
  }

  // ── Importar xlsx ───────────────────────────────────────────────────

  async function handleImportarXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportando(true)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

      // Fornecedor e prazo: linha 7, col B (índice 1)
      const fornecedorRaw = String(raw[6]?.[1] ?? '').trim()
      const fornecedor = fornecedorRaw.replace(/\s+\d+\/\d+.*$/i, '').trim() || fornecedorRaw

      // Prazo: extrair números de "30/60/90"
      const prazoMatch = fornecedorRaw.match(/(\d+(?:\/\d+)+)/)
      const prazos = prazoMatch ? prazoMatch[1].split('/').map(Number) : [30, 60, 90]

      // CNPJs: linha 11 (índice 10), a partir da col M (índice 12), posições pares
      const cnpjRow = raw[10] as (string | null)[]
      // Monta mapa CNPJ → loja
      const lojasByCnpj: Record<string, ConfigLoja> = {}
      for (const l of lojas) {
        if (l.cnpj) {
          const key = l.cnpj.replace(/[.\-\/]/g, '').trim()
          lojasByCnpj[key] = l
        }
      }

      // Colunas de lojas: a partir do índice 12, pares (qtd, valor)
      // Cada par de 2 em 2: col 12+0=qtd, col 12+1=valor, col 12+2=qtd, ...
      // CNPJ da loja está na linha 11, no índice da coluna de qtd
      type StoreCol = { colQtd: number; colVal: number; cnpj: string; loja: ConfigLoja | undefined; nome: string }
      const storeCols: StoreCol[] = []
      const headerRow = raw[11] as (string | null)[]
      let col = 12
      while (col + 1 < (headerRow?.length ?? 0)) {
        const nomeCol = String(headerRow?.[col] ?? '').trim()
        if (!nomeCol || nomeCol.toUpperCase() === 'TOTAL') break
        const cnpjRaw = String(cnpjRow?.[col] ?? '').replace(/[.\-\/\s]/g, '')
        let loja: ConfigLoja | undefined = lojasByCnpj[cnpjRaw]
        if (!loja) {
          const nCol = normNome(nomeCol)
          loja = lojas.find(l => {
            const nL = normNome(l.nome)
            return nL.includes(nCol) || nCol.includes(nL) || nCol.split(' ').every(p => nL.includes(p))
          }) ?? undefined
        }
        storeCols.push({ colQtd: col, colVal: col + 1, cnpj: cnpjRaw, loja, nome: nomeCol })
        col += 2
      }

      // Produtos: linhas 13+ (índice 12+), onde col A tem código e col B tem descrição
      type ItemRow = { codigo: string; descricao: string; tamanho: string; qt_caixa: number | null; preco_unitario: number | null; preco_final: number | null; lojas: Record<string, { nome: string; qty: number; valor: number }> }
      const itensImport: ItemRow[] = []

      for (let r = 12; r < raw.length; r++) {
        const row = raw[r] as (unknown)[]
        const codigo = row?.[0]
        const descricao = String(row?.[1] ?? '').trim()
        if (!descricao || descricao.toUpperCase().includes('VALOR TOTAL')) break

        // Só produtos que têm código (não categorias)
        if (!codigo) continue

        const lojaQtds: Record<string, { nome: string; qty: number; valor: number }> = {}
        let algumQtd = false
        for (const sc of storeCols) {
          const qty = Number(row?.[sc.colQtd] ?? 0)
          const valor = Number(row?.[sc.colVal] ?? 0)
          if (qty > 0 && sc.loja) {
            lojaQtds[sc.loja.id] = { nome: sc.loja.nome, qty, valor }
            algumQtd = true
          }
        }
        if (!algumQtd) continue

        itensImport.push({
          codigo: String(codigo).trim(),
          descricao,
          tamanho: String(row?.[2] ?? '').trim(),
          qt_caixa: Number(row?.[3]) || null,
          preco_unitario: Number(row?.[4]) || null,
          preco_final: Number(row?.[11]) || null,
          lojas: lojaQtds,
        })
      }

      if (itensImport.length === 0) {
        alert('Nenhum produto com quantidade encontrado na planilha.')
        setImportando(false)
        return
      }

      // Pausar para o usuário informar a data manualmente
      setPendingImport({ dados: itensImport, fornecedor, prazos, dataSugerida: '' })
      setPendingImport({ dados: itensImport, fornecedor, prazos, dataSugerida: '' })
      setImportData('')
      setImportAprovacao('')
      setImportItens('')
      setImportando(false)
    } catch (err) {
      alert('Erro ao ler arquivo: ' + (err instanceof Error ? err.message : String(err)))
      setImportando(false)
    }
  }

  async function confirmarImport() {
    if (!pendingImport || !importData) return
    setImportando(true)
    try {
      const { dados, fornecedor, prazos } = pendingImport
      const itensImport = dados as { codigo: string; descricao: string; tamanho: string; qt_caixa: number | null; preco_unitario: number | null; preco_final: number | null; lojas: Record<string, { nome: string; qty: number; valor: number }> }[]

      const grupoId = crypto.randomUUID()
      const { data: maxRow } = await supabase
        .from('pedidos').select('numero_pedido').order('numero_pedido', { ascending: false }).limit(1).maybeSingle()
      const numeroPedido = (maxRow?.numero_pedido ?? 0) + 1

      const lojasComProduto = new Map<string, ConfigLoja>()
      for (const item of itensImport)
        for (const lojaId of Object.keys(item.lojas)) {
          const l = lojas.find(x => x.id === lojaId)
          if (l) lojasComProduto.set(lojaId, l)
        }

      const valorPorLoja: Record<string, number> = {}
      for (const item of itensImport)
        for (const [lojaId, lv] of Object.entries(item.lojas))
          valorPorLoja[lojaId] = (valorPorLoja[lojaId] ?? 0) + lv.valor

      const pedidoInserts = [...lojasComProduto.entries()].map(([lojaId, loja]) => ({
        grupo_id: grupoId,
        numero_pedido: numeroPedido,
        data_pedido: importData || null,
        data_aprovacao: importAprovacao || null,
        fornecedor,
        loja_id: lojaId,
        loja_nome: loja.nome,
        qt_parcelas: prazos.length,
        prazo_pagamento: prazos,
        valor_pedido: Math.round((valorPorLoja[lojaId] ?? 0) * 100) / 100,
        percentual_nota: 100,
        itens: importItens || null,
        status: 'PENDENTE',
      }))

      const { error: ePed } = await supabase.from('pedidos').insert(pedidoInserts)
      if (ePed) throw new Error(ePed.message)

      const itemInserts = itensImport.map(item => ({
        grupo_id: grupoId,
        codigo: item.codigo,
        descricao: item.descricao,
        tamanho: item.tamanho || null,
        qt_caixa: item.qt_caixa,
        preco_unitario: item.preco_unitario,
        preco_final: item.preco_final,
        lojas: item.lojas,
      }))

      const { error: eItems } = await supabase.from('pedido_itens').insert(itemInserts)
      if (eItems) throw new Error(eItems.message)

      setPendingImport(null)
      await carregar()
      alert(`Pedido #${String(numeroPedido).padStart(3, '0')} importado! ${itensImport.length} produtos, ${lojasComProduto.size} lojas.`)
    } catch (err) {
      alert('Erro ao importar: ' + (err instanceof Error ? err.message : String(err)))
    }
    setImportando(false)
  }

  // ── Visualizar itens ────────────────────────────────────────────────

  async function abrirVisualizacao(grupoId: string) {
    setVisualizarGrupoId(grupoId)
    setEditandoItens(false)
    setEditItensBuffer({})
    setMostrarHistorico(false)
    setLoadingItens(true)
    const { data } = await supabase
      .from('pedido_itens')
      .select('*')
      .eq('grupo_id', grupoId)
      .order('created_at')
    setItensPedido((data ?? []) as PedidoItem[])
    setLoadingItens(false)
  }

  async function salvarEdicaoItens() {
    if (!visualizarGrupoId) return
    setSalvandoItens(true)
    const historicoInserts: object[] = []

    for (const [itemId, changes] of Object.entries(editItensBuffer)) {
      const original = itensPedido.find(i => i.id === itemId)
      if (!original) continue

      const { error } = await supabase.from('pedido_itens').update(changes).eq('id', itemId)
      if (error) { alert('Erro: ' + error.message); setSalvandoItens(false); return }

      for (const [campo, valorNovo] of Object.entries(changes)) {
        const valorAnterior = (original as Record<string, unknown>)[campo]
        historicoInserts.push({
          pedido_item_id: itemId,
          usuario_id: profile?.id ?? null,
          campo,
          valor_anterior: valorAnterior != null ? String(valorAnterior) : null,
          valor_novo: valorNovo != null ? String(valorNovo) : null,
        })
      }
    }

    if (historicoInserts.length > 0) {
      await supabase.from('pedido_itens_historico').insert(historicoInserts)
    }

    setEditandoItens(false)
    setEditItensBuffer({})
    setSalvandoItens(false)
    await abrirVisualizacao(visualizarGrupoId)
  }

  async function carregarHistorico(_grupoId: string) {
    const ids = itensPedido.map(i => i.id)
    if (ids.length === 0) return
    const { data } = await supabase
      .from('pedido_itens_historico')
      .select('*')
      .in('pedido_item_id', ids)
      .order('criado_em', { ascending: false })
      .limit(50)
    setHistorico((data ?? []) as ItemHistorico[])
    setMostrarHistorico(true)
  }

  async function handleReimportarXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !visualizarGrupoId) return
    e.target.value = ''
    setLoadingItens(true)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

      const cnpjRow = raw[10] as (string | null)[]
      const lojasByCnpj: Record<string, ConfigLoja> = {}
      for (const l of lojas) {
        if (l.cnpj) lojasByCnpj[l.cnpj.replace(/[.\-\/]/g, '').trim()] = l
      }

      type StoreCol = { colQtd: number; colVal: number; loja: ConfigLoja | undefined }
      const storeCols: StoreCol[] = []
      const headerRow = raw[11] as (string | null)[]
      let col = 12
      while (col + 1 < (headerRow?.length ?? 0)) {
        const nomeCol = String(headerRow?.[col] ?? '').trim()
        if (!nomeCol || nomeCol.toUpperCase() === 'TOTAL') break
        const cnpjRaw = String(cnpjRow?.[col] ?? '').replace(/[.\-\/\s]/g, '')
        let loja: ConfigLoja | undefined = lojasByCnpj[cnpjRaw]
        if (!loja) {
          const nCol = normNome(nomeCol)
          loja = lojas.find(l => {
            const nL = normNome(l.nome)
            return nL.includes(nCol) || nCol.includes(nL) || nCol.split(' ').every(p => nL.includes(p))
          }) ?? undefined
        }
        storeCols.push({ colQtd: col, colVal: col + 1, loja })
        col += 2
      }

      // Itens existentes indexados por código
      const existentesPorCodigo: Record<string, PedidoItem> = {}
      for (const it of itensPedido) {
        if (it.codigo) existentesPorCodigo[it.codigo.trim()] = it
      }

      const toInsert: object[] = []
      const toUpdate: { id: string; lojas: object }[] = []

      for (let r = 12; r < raw.length; r++) {
        const row = raw[r] as unknown[]
        const codigo = row?.[0]
        const descricao = String(row?.[1] ?? '').trim()
        if (!descricao || descricao.toUpperCase().includes('VALOR TOTAL')) break
        if (!codigo) continue

        const codigoStr = String(codigo).trim()
        const lojaQtds: Record<string, { nome: string; qty: number; valor: number }> = {}
        let algum = false
        for (const sc of storeCols) {
          const qty = Number(row?.[sc.colQtd] ?? 0)
          const valor = Number(row?.[sc.colVal] ?? 0)
          if (qty > 0 && sc.loja) {
            lojaQtds[sc.loja.id] = { nome: sc.loja.nome, qty, valor }
            algum = true
          }
        }
        if (!algum) continue

        const existente = existentesPorCodigo[codigoStr]
        if (existente) {
          // Mescla lojas: mantém existentes + adiciona/atualiza do novo arquivo
          const lojasAtualizadas = { ...existente.lojas, ...lojaQtds }
          toUpdate.push({ id: existente.id, lojas: lojasAtualizadas })
        } else {
          toInsert.push({
            grupo_id: visualizarGrupoId,
            codigo: codigoStr,
            descricao,
            tamanho: String(row?.[2] ?? '').trim() || null,
            qt_caixa: Number(row?.[3]) || null,
            preco_unitario: Number(row?.[4]) || null,
            preco_final: Number(row?.[11]) || null,
            lojas: lojaQtds,
          })
        }
      }

      await Promise.all([
        ...toUpdate.map(u => supabase.from('pedido_itens').update({ lojas: u.lojas }).eq('id', u.id)),
        toInsert.length > 0 ? supabase.from('pedido_itens').insert(toInsert) : Promise.resolve(),
      ])

      await abrirVisualizacao(visualizarGrupoId)
      alert(`Reimportado: ${toUpdate.length} itens atualizados, ${toInsert.length} novos.`)
    } catch (err) {
      alert('Erro ao reimportar: ' + (err instanceof Error ? err.message : String(err)))
    }
    setLoadingItens(false)
  }

  function bufferItem(itemId: string, campo: string, valor: unknown) {
    setEditItensBuffer(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [campo]: valor },
    }))
  }

  // ── Vincular NF ─────────────────────────────────────────────────────

  async function abrirVincular(pedido: Pedido) {
    setVincularId(pedido.id)
    setSearchNF('')
    const { data } = await supabase
      .from('entrada_notas_fiscais')
      .select('id, numero_nota, fornecedor, emitida_em, valor_total')
      .order('emitida_em', { ascending: false })
      .limit(200)
    setNotasDisponiveis(data ?? [])
  }

  async function vincularNota(nota: EntradaNota) {
    if (!vincularId) return
    const { error } = await supabase.from('pedidos').update({
      entrada_nota_id: nota.id, nota: nota.numero_nota,
      valor_nota: nota.valor_total, status: 'ENTREGUE',
    }).eq('id', vincularId)
    if (error) { alert('Erro: ' + error.message); return }
    setVincularId(null)
    await carregar()
  }

  async function desvincular(pedidoId: string) {
    if (!confirm('Desvincular a nota fiscal deste pedido?')) return
    await supabase.from('pedidos').update({
      entrada_nota_id: null, nota: null, valor_nota: null, status: 'PENDENTE',
    }).eq('id', pedidoId)
    await carregar()
  }

  // ── Conferência ─────────────────────────────────────────────────────

  async function abrirConferencia(pedido: Pedido) {
    const { data: nf } = await supabase
      .from('entrada_notas_fiscais')
      .select('id, numero_nota, fornecedor, emitida_em, valor_total')
      .eq('id', pedido.entrada_nota_id!)
      .single()
    if (nf) setConferencia({ pedido, nf })
  }

  // ── Form helpers ────────────────────────────────────────────────────

  function setPrazoItem(index: number, valor: number, setter: (fn: (f: FormState) => FormState) => void) {
    setter(f => { const p = [...f.prazo_pagamento]; p[index] = valor; return { ...f, prazo_pagamento: p } })
  }

  function setQtParcelas(n: number, setter: (fn: (f: FormState) => FormState) => void) {
    setter(f => ({ ...f, qt_parcelas: n, prazo_pagamento: Array.from({ length: n }, (_, i) => (i + 1) * 30) }))
  }

  const notasFiltradas = notasDisponiveis.filter(n =>
    !searchNF || n.numero_nota?.includes(searchNF) ||
    n.fornecedor?.toLowerCase().includes(searchNF.toLowerCase())
  )

  function FornecedorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const filtrados = value.trim()
      ? fornecedores.filter(f => f.toLowerCase().includes(value.toLowerCase()))
      : fornecedores
    const exibirAdicionar = value.trim() && !fornecedores.some(f => f.toLowerCase() === value.toLowerCase().trim())

    useEffect(() => {
      function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
      document.addEventListener('mousedown', fora)
      return () => document.removeEventListener('mousedown', fora)
    }, [])

    return (
      <div ref={ref} className="relative">
        <input
          className="input"
          placeholder="Buscar ou digitar fornecedor..."
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {open && (filtrados.length > 0 || exibirAdicionar) && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {filtrados.map(f => (
              <button key={f} type="button"
                onMouseDown={() => { onChange(f); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                {f}
              </button>
            ))}
            {exibirAdicionar && (
              <button type="button"
                onMouseDown={() => { onChange(value.trim()); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors border-t border-gray-100">
                + Adicionar "{value.trim()}" como novo fornecedor
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function ItensInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const filtrados = value.trim()
      ? itensList.filter(i => i.toLowerCase().includes(value.toLowerCase()))
      : itensList
    const exibirAdicionar = value.trim() && !itensList.some(i => i.toLowerCase() === value.toLowerCase().trim())

    useEffect(() => {
      function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
      document.addEventListener('mousedown', fora)
      return () => document.removeEventListener('mousedown', fora)
    }, [])

    return (
      <div ref={ref} className="relative">
        <input
          className="input"
          placeholder="Buscar ou digitar itens..."
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {open && (filtrados.length > 0 || exibirAdicionar) && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {filtrados.map(i => (
              <button key={i} type="button"
                onMouseDown={() => { onChange(i); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                {i}
              </button>
            ))}
            {exibirAdicionar && (
              <button type="button"
                onMouseDown={() => { onChange(value.trim()); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors border-t border-gray-100">
                + Adicionar "{value.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function PrazoEditor({ f, setter }: { f: FormState; setter: (fn: (f: FormState) => FormState) => void }) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <select className="input w-auto" value={f.qt_parcelas}
          onChange={e => setQtParcelas(parseInt(e.target.value), setter)}>
          {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}x</option>)}
        </select>
        {f.prazo_pagamento.map((dias, i) => (
          <input key={i} type="number" className="input w-16 text-center" value={dias}
            onChange={e => setPrazoItem(i, parseInt(e.target.value) || 0, setter)} />
        ))}
        <span className="text-xs text-gray-400">dias</span>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Package size={24} /> Pedidos</h1>
          <p className="text-sm text-gray-400">Pedidos e notas faturadas</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportarXlsx} />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleImportarXlsx({ target: { files: e.dataTransfer.files, value: '' } } as React.ChangeEvent<HTMLInputElement>)
            }}
            onClick={() => !importando && fileInputRef.current?.click()}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-all select-none
              ${dragOver
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50'
              } ${importando ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Upload size={15} />
            {importando ? 'Importando...' : dragOver ? 'Solte aqui' : 'Importar xlsx'}
          </div>
          <button onClick={abrirNovoGrupo} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo pedido
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Pesquisar por fornecedor, nº pedido, razão, itens, nota, valor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          className="input w-auto shrink-0 text-sm"
          value={ordem}
          onChange={e => setOrdem(e.target.value as typeof ordem)}
        >
          <option value="numero_desc">Nº ↓</option>
          <option value="numero_asc">Nº ↑</option>
          <option value="data_desc">Data ↓</option>
          <option value="data_asc">Data ↑</option>
          <option value="fornecedor_asc">Fornecedor A–Z</option>
          <option value="valor_desc">Maior valor</option>
        </select>
        <button
          onClick={() => setShowFiltros(v => !v)}
          className={`shrink-0 flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${
            filtrosAtivos
              ? 'border-brand-400 bg-brand-50 text-brand-700'
              : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filtros{filtrosAtivos ? ` (${Object.values(filtros).filter(v => v !== '').length})` : ''}
        </button>
      </div>

      {showFiltros && (
        <div className="card p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Fornecedor</label>
            <input className="input text-sm" placeholder="Ex: NIGRO" value={filtros.fornecedor}
              onChange={e => setFiltros(f => ({ ...f, fornecedor: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Data de</label>
            <input type="date" className="input text-sm" value={filtros.dataDe}
              onChange={e => setFiltros(f => ({ ...f, dataDe: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Data até</label>
            <input type="date" className="input text-sm" value={filtros.dataAte}
              onChange={e => setFiltros(f => ({ ...f, dataAte: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Valor mín.</label>
            <input type="number" className="input text-sm" placeholder="0,00" value={filtros.valorMin}
              onChange={e => setFiltros(f => ({ ...f, valorMin: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Valor máx.</label>
            <input type="number" className="input text-sm" placeholder="0,00" value={filtros.valorMax}
              onChange={e => setFiltros(f => ({ ...f, valorMax: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Loja</label>
            <select className="input text-sm" value={filtros.lojaId}
              onChange={e => setFiltros(f => ({ ...f, lojaId: e.target.value }))}>
              <option value="">Todas</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-4">
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Itens</label>
            <input className="input text-sm" placeholder="Ex: PASTAS, DIVERSOS..." value={filtros.itens}
              onChange={e => setFiltros(f => ({ ...f, itens: e.target.value }))} />
          </div>
          <div className="flex items-end col-span-2 lg:col-span-2">
            <button onClick={limparFiltros} disabled={!filtrosAtivos}
              className="btn-secondary text-sm w-full disabled:opacity-40">
              Limpar filtros
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-gray-400">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-30" />
          <p>Nenhum pedido cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([grupoId, itens]) => {
            const primeiro = itens[0]
            const totalPedido = itens.reduce((s, i) => s + (i.valor_pedido ?? 0), 0)
            const todosEntregues = itens.every(i => i.status === 'ENTREGUE')
            const todosCancelados = itens.every(i => i.status === 'CANCELADO')
            const statusGrupo = todosEntregues ? 'ENTREGUE' : todosCancelados ? 'CANCELADO' : 'PENDENTE'
            const sc = STATUS_CONFIG[statusGrupo as keyof typeof STATUS_CONFIG]
            const numStr = primeiro.numero_pedido != null
              ? `#${String(primeiro.numero_pedido).padStart(3, '0')}`
              : ''

            return (
              <div key={grupoId} className={`card overflow-hidden border-gray-400 ${todosCancelados ? 'opacity-60' : ''}`}>
                {/* ── Cabeçalho do pedido ── */}
                <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {numStr && (
                      <div className="shrink-0 pt-0.5">
                        <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-lg">{numStr}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 flex-1 min-w-0">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Pedido</p>
                        <p className="text-sm font-semibold text-gray-900">{fmtDate(primeiro.data_pedido)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Aprovação</p>
                        <p className="text-sm text-gray-700">{fmtDate(primeiro.data_aprovacao)}</p>
                      </div>
                      {primeiro.data_faturamento && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Faturar a partir de</p>
                          <p className="text-sm font-semibold text-blue-700">{fmtDate(primeiro.data_faturamento)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Fornecedor</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{primeiro.fornecedor ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Total do pedido</p>
                        <p className="text-sm font-semibold text-gray-900">{fmt(totalPedido || null)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.cor}`}>{sc.label}</span>
                    <button onClick={() => abrirVisualizacao(grupoId)}
                      className="p-1.5 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors" title="Visualizar itens do pedido">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => abrirNovaLoja(primeiro)}
                      className="text-xs text-brand-600 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 transition-colors whitespace-nowrap">
                      + Loja
                    </button>
                    {!todosCancelados && (
                      <button onClick={() => cancelarGrupo(grupoId)}
                        className="p-1.5 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors" title="Cancelar pedido">
                        <Ban size={14} />
                      </button>
                    )}
                    <button onClick={() => apagarGrupo(grupoId, primeiro.fornecedor, primeiro.data_pedido)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Apagar pedido">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* ── Tabela de lojas ── */}
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Razão / Loja</th>
                        <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Valor</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Parcelas</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">% Nota</th>
                        <th className="text-left px-4 py-2 font-medium">Itens</th>
                        <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Nota</th>
                        <th className="text-right px-4 py-2 font-medium whitespace-nowrap">Valor NF</th>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itens.map(pedido => {
                        const psc = STATUS_CONFIG[pedido.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.PENDENTE
                        return (
                          <tr key={pedido.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">
                              <span className={pedido.status === 'CANCELADO' ? 'line-through text-gray-400' : ''}>
                                {pedido.loja_nome ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                              {fmt(pedido.valor_pedido)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              {pedido.qt_parcelas}x · {(pedido.prazo_pagamento ?? []).join('/')}d
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              {pedido.percentual_nota ?? 100}%
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">
                              {pedido.itens ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-medium">
                              {pedido.nota ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                              {fmt(pedido.valor_nota)}
                            </td>
                            <td className="px-4 py-2.5">
                              <select value={pedido.status}
                                onChange={e => alterarStatus(pedido.id, e.target.value)}
                                className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none cursor-pointer appearance-none ${psc.cor}`}>
                                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                  <option key={k} value={k}>{v.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                {pedido.entrada_nota_id ? (
                                  <>
                                    <button onClick={() => abrirConferencia(pedido)}
                                      className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition-colors font-medium">
                                      <ClipboardCheck size={12} /> Conferir
                                    </button>
                                    <button onClick={() => desvincular(pedido.id)}
                                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors">
                                      <X size={11} /> Desvincular
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => abrirVincular(pedido)}
                                    className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
                                    <Link2 size={11} /> Vincular NF
                                  </button>
                                )}
                                <button onClick={() => { setEditandoId(pedido.id); setEditForm(pedidoParaForm(pedido)) }}
                                  className="p-1 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors" title="Editar">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => apagarLoja(pedido, itens.length)}
                                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Apagar">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {itens.length > 1 && (
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold text-gray-700">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2 text-right">{fmt(totalPedido || null)}</td>
                          <td colSpan={7} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal: Novo pedido / Nova loja ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-semibold text-gray-900">
                {form.grupo_id ? 'Adicionar loja ao pedido' : 'Novo pedido'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {!form.grupo_id && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data do pedido</label>
                      <input type="date" className="input" value={form.data_pedido}
                        onChange={e => setForm(f => ({ ...f, data_pedido: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Aprovação</label>
                      <input type="date" className="input" value={form.data_aprovacao}
                        onChange={e => setForm(f => ({ ...f, data_aprovacao: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                    <FornecedorInput value={form.fornecedor}
                      onChange={v => setForm(f => ({ ...f, fornecedor: v }))} />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão / Loja</label>
                <select className="input" value={form.loja_id}
                  onChange={e => setForm(f => ({ ...f, loja_id: e.target.value }))}>
                  <option value="">Selecione a loja</option>
                  {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor do pedido (desta loja)</label>
                <input className="input" inputMode="decimal" placeholder="0,00" value={form.valor_pedido}
                  onChange={e => setForm(f => ({ ...f, valor_pedido: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prazo de pagamento negociado</label>
                <PrazoEditor f={form} setter={setForm} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">% da nota</label>
                <input className="input" inputMode="decimal" placeholder="100" value={form.percentual_nota}
                  onChange={e => setForm(f => ({ ...f, percentual_nota: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Itens</label>
                <ItensInput value={form.itens} onChange={v => setForm(f => ({ ...f, itens: v }))} />
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar ────────────────────────────────────────────── */}
      {editandoId && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setEditandoId(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-semibold text-gray-900">Editar linha</h3>
              <button onClick={() => setEditandoId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                <strong>Data, Aprovação e Fornecedor</strong> são compartilhados e serão atualizados em todas as lojas do pedido.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data do pedido</label>
                  <input type="date" className="input" value={editForm.data_pedido}
                    onChange={e => setEditForm(f => ({ ...f, data_pedido: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aprovação</label>
                  <input type="date" className="input" value={editForm.data_aprovacao}
                    onChange={e => setEditForm(f => ({ ...f, data_aprovacao: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                <FornecedorInput value={editForm.fornecedor}
                  onChange={v => setEditForm(f => ({ ...f, fornecedor: v }))} />
              </div>
              <hr className="border-gray-100" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão / Loja</label>
                <select className="input" value={editForm.loja_id}
                  onChange={e => setEditForm(f => ({ ...f, loja_id: e.target.value }))}>
                  <option value="">Selecione a loja</option>
                  {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor do pedido (desta loja)</label>
                <input className="input" inputMode="decimal" value={editForm.valor_pedido}
                  onChange={e => setEditForm(f => ({ ...f, valor_pedido: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prazo de pagamento negociado</label>
                <PrazoEditor f={editForm} setter={setEditForm} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">% da nota</label>
                <input className="input" inputMode="decimal" value={editForm.percentual_nota}
                  onChange={e => setEditForm(f => ({ ...f, percentual_nota: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Itens</label>
                <ItensInput value={editForm.itens ?? ''} onChange={v => setEditForm(f => ({ ...f, itens: v }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="input" value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setEditandoId(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarEdicao} disabled={savingEdit} className="btn-primary flex-1">
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Vincular NF ────────────────────────────────────── */}
      {vincularId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setVincularId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-semibold text-gray-900">Vincular nota fiscal</h3>
              <button onClick={() => setVincularId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8" placeholder="Buscar por número ou fornecedor..."
                  value={searchNF} onChange={e => setSearchNF(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {notasFiltradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma nota encontrada.</p>
              ) : notasFiltradas.map(n => (
                <button key={n.id} onClick={() => vincularNota(n)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-left transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">NF {n.numero_nota ?? '?'}</p>
                    <p className="text-xs text-gray-400">{n.fornecedor} · {fmtDate(n.emitida_em)}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">{fmt(n.valor_total)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Conferência ────────────────────────────────────── */}
      {conferencia && (() => {
        const { pedido, nf } = conferencia
        const valorPedido = pedido.valor_pedido ?? 0
        const valorNF = nf.valor_total ?? 0
        const difValor = Math.abs(valorNF - valorPedido)
        const valorOk = difValor < 0.02
        const prazo = pedido.prazo_pagamento ?? []
        const faturamento = nf.emitida_em
        const numStr = pedido.numero_pedido != null
          ? ` #${String(pedido.numero_pedido).padStart(3, '0')}`
          : ''

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConferencia(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardCheck size={17} className="text-emerald-500" />
                  Conferência{numStr} — {pedido.loja_nome ?? '—'}
                </h3>
                <button onClick={() => setConferencia(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
              </div>

              <div className="p-5 space-y-4">
                {/* Cabeçalho */}
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p><span className="font-medium text-gray-700">NF:</span> {nf.numero_nota ?? '—'} · {nf.fornecedor ?? '—'}</p>
                  <p><span className="font-medium text-gray-700">Faturamento:</span> {fmtDate(nf.emitida_em)}</p>
                </div>

                {/* Checagem de valor */}
                <div className={`rounded-xl border p-4 ${valorOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {valorOk
                      ? <Check size={15} className="text-green-600" />
                      : <AlertTriangle size={15} className="text-red-500" />}
                    <p className={`text-sm font-semibold ${valorOk ? 'text-green-700' : 'text-red-700'}`}>
                      {valorOk ? 'Valores conferem' : 'Divergência de valor'}
                    </p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor do pedido</span>
                      <span className="font-medium text-gray-800">{fmt(valorPedido)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Valor da NF</span>
                      <span className="font-medium text-gray-800">{fmt(valorNF)}</span>
                    </div>
                    {!valorOk && (
                      <div className="flex justify-between pt-1 border-t border-red-200">
                        <span className="text-red-600 font-medium">Diferença</span>
                        <span className="font-bold text-red-600">{fmt(difValor)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checagem de prazo */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
                    <Clock size={14} className="text-gray-400" />
                    <p className="text-sm font-semibold text-gray-700">Datas de vencimento</p>
                  </div>
                  {!faturamento ? (
                    <p className="text-xs text-gray-400 text-center py-4">Data de faturamento não disponível na NF.</p>
                  ) : prazo.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Prazo não definido neste pedido.</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left px-4 py-2 font-medium">Parcela</th>
                          <th className="text-left px-4 py-2 font-medium">Prazo</th>
                          <th className="text-left px-4 py-2 font-medium">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {prazo.map((dias, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 font-medium text-gray-700">{i + 1}ª parcela</td>
                            <td className="px-4 py-2.5 text-gray-500">{dias} dias</td>
                            <td className="px-4 py-2.5 font-semibold text-gray-900">
                              {addDias(faturamento, dias)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {faturamento && prazo.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-[11px] text-gray-400">
                        Prazo contado a partir do faturamento: <strong>{fmtDate(faturamento)}</strong>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 pb-5">
                <button onClick={() => setConferencia(null)} className="btn-secondary w-full">Fechar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal: Confirmar import ──────────────────────────────── */}
      {pendingImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Upload size={16} className="text-brand-500" /> Importar pedido
              </h3>
              <button onClick={() => setPendingImport(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                <p><span className="text-gray-400">Fornecedor:</span> <span className="font-semibold text-gray-800">{pendingImport.fornecedor}</span></p>
                <p><span className="text-gray-400">Prazo:</span> <span className="font-semibold text-gray-800">{pendingImport.prazos.join('/')} dias</span></p>
                <p><span className="text-gray-400">Produtos:</span> <span className="font-semibold text-gray-800">{(pendingImport.dados as object[]).length} itens</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data do pedido <span className="text-red-500">*</span></label>
                <input type="date" className="input w-full" value={importData}
                  onChange={e => setImportData(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de aprovação</label>
                <input type="date" className="input w-full" value={importAprovacao}
                  onChange={e => setImportAprovacao(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Itens</label>
                <ItensInput value={importItens} onChange={setImportItens} />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setPendingImport(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={confirmarImport} disabled={!importData || importando}
                className="btn-primary flex-1">
                {importando ? 'Importando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Visualizar itens do pedido ────────────────────── */}
      {visualizarGrupoId && (() => {
        const primeiroPedido = pedidos.find(p => p.grupo_id === visualizarGrupoId)
        const numStr = primeiroPedido?.numero_pedido != null
          ? `#${String(primeiroPedido.numero_pedido).padStart(3, '0')} — `
          : ''

        // Coletar todas as lojas que aparecem nos itens
        const lojasNosItens = new Map<string, string>()
        for (const item of itensPedido) {
          for (const [lid, lv] of Object.entries(item.lojas ?? {})) {
            lojasNosItens.set(lid, lv.nome)
          }
        }
        const lojaCols = [...lojasNosItens.entries()]

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => { setVisualizarGrupoId(null); setEditandoItens(false); setMostrarHistorico(false) }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Eye size={17} className="text-brand-500" />
                  {numStr}{primeiroPedido?.fornecedor ?? 'Pedido'} — Itens
                </h3>
                <div className="flex items-center gap-2">
                  {!editandoItens ? (
                    <>
                      <input
                        ref={reimportFileRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={handleReimportarXlsx}
                      />
                      <button onClick={() => reimportFileRef.current?.click()}
                        className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                        <Upload size={13} /> Reimportar xlsx
                      </button>
                      <button onClick={() => carregarHistorico(visualizarGrupoId)}
                        className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                        <History size={13} /> Histórico
                      </button>
                      <button onClick={() => setEditandoItens(true)}
                        className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                        <Pencil size={13} /> Editar
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditandoItens(false); setEditItensBuffer({}) }}
                        className="btn-secondary text-xs py-1.5">Cancelar</button>
                      <button onClick={salvarEdicaoItens} disabled={salvandoItens}
                        className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
                        <Check size={13} /> {salvandoItens ? 'Salvando...' : 'Salvar alterações'}
                      </button>
                    </>
                  )}
                  <button onClick={() => { setVisualizarGrupoId(null); setEditandoItens(false); setMostrarHistorico(false) }}
                    className="p-1 hover:bg-gray-100 rounded ml-1"><X size={18} /></button>
                </div>
              </div>

              {loadingItens ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">Carregando...</div>
              ) : mostrarHistorico ? (
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <History size={15} /> Histórico de edições
                    </h4>
                    <button onClick={() => setMostrarHistorico(false)} className="text-xs text-brand-600 hover:underline">
                      ← Voltar aos itens
                    </button>
                  </div>
                  {historico.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Nenhuma edição registrada.</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead><tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Data</th>
                        <th className="text-left px-3 py-2 font-medium">Campo</th>
                        <th className="text-left px-3 py-2 font-medium">Antes</th>
                        <th className="text-left px-3 py-2 font-medium">Depois</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {historico.map(h => (
                          <tr key={h.id} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                              {new Date(h.criado_em).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-700">{h.campo}</td>
                            <td className="px-3 py-2 text-red-600 line-through">{h.valor_anterior ?? '—'}</td>
                            <td className="px-3 py-2 text-green-700 font-medium">{h.valor_novo ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : itensPedido.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum item cadastrado para este pedido.</p>
                    <p className="text-xs mt-1">Importe um xlsx para adicionar itens automaticamente.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-auto flex-1">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Código</th>
                        <th className="text-left px-3 py-2.5 font-medium">Descrição</th>
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Tamanho</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Cx</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Preço U.</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Preço F.</th>
                        {lojaCols.map(([lid, nome]) => (
                          <th key={lid} className="text-center px-3 py-2.5 font-medium whitespace-nowrap border-l border-gray-200">
                            {nome}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itensPedido.map(item => {
                        const buf = editItensBuffer[item.id] ?? {}
                        return (
                          <tr key={item.id} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{item.codigo ?? '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-800 min-w-[200px]">
                              {editandoItens ? (
                                <input className="input text-xs py-1 w-full"
                                  defaultValue={item.descricao ?? ''}
                                  onBlur={e => bufferItem(item.id, 'descricao', e.target.value)} />
                              ) : item.descricao}
                            </td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.tamanho || '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{item.qt_caixa ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                              {item.preco_unitario != null ? fmt(item.preco_unitario) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">
                              {editandoItens ? (
                                <input className="input text-xs py-1 w-20 text-right"
                                  type="number" step="0.01"
                                  defaultValue={item.preco_final ?? ''}
                                  onBlur={e => bufferItem(item.id, 'preco_final', parseFloat(e.target.value) || null)} />
                              ) : item.preco_final != null ? fmt(item.preco_final) : '—'}
                            </td>
                            {lojaCols.map(([lid, nome]) => {
                              const lv = (buf.lojas ?? item.lojas)?.[lid]
                              return (
                                <td key={lid} className="px-3 py-2 text-center border-l border-gray-100 whitespace-nowrap">
                                  {lv && lv.qty > 0 ? (
                                    editandoItens ? (
                                      <input className="input text-xs py-1 w-16 text-center"
                                        type="number"
                                        defaultValue={lv.qty}
                                        onBlur={e => {
                                          const newQty = parseInt(e.target.value) || 0
                                          const novasLojas = { ...(buf.lojas ?? item.lojas) }
                                          if (newQty === 0) {
                                            delete novasLojas[lid]
                                          } else {
                                            novasLojas[lid] = { ...novasLojas[lid], nome, qty: newQty, valor: Math.round(newQty * (item.preco_final ?? 0) * 100) / 100 }
                                          }
                                          bufferItem(item.id, 'lojas', novasLojas)
                                        }} />
                                    ) : (
                                      <span className="font-medium text-gray-800">{lv.qty}</span>
                                    )
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                    {/* Totais por loja */}
                    <tfoot className="sticky bottom-0 bg-gray-50">
                      <tr className="font-semibold text-gray-700 border-t-2 border-gray-200">
                        <td colSpan={6} className="px-3 py-2.5 text-right text-xs">Total (qtd)</td>
                        {lojaCols.map(([lid]) => {
                          const total = itensPedido.reduce((s, i) => s + (i.lojas?.[lid]?.qty ?? 0), 0)
                          return (
                            <td key={lid} className="px-3 py-2.5 text-center border-l border-gray-200 whitespace-nowrap">
                              {total > 0 ? total : '—'}
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="font-semibold text-gray-700 bg-gray-100">
                        <td colSpan={6} className="px-3 py-2.5 text-right text-xs">Total (valor)</td>
                        {lojaCols.map(([lid]) => {
                          const total = itensPedido.reduce((s, i) => s + (i.lojas?.[lid]?.valor ?? 0), 0)
                          return (
                            <td key={lid} className="px-3 py-2.5 text-center border-l border-gray-200 whitespace-nowrap text-brand-700">
                              {total > 0 ? fmt(total) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Chat do pedido */}
              {!mostrarHistorico && (
                <div className="shrink-0 border-t border-gray-100 px-5 py-4 max-h-80 overflow-y-auto">
                  <ChatPedido grupoId={visualizarGrupoId} fornecedor={primeiroPedido?.fornecedor ?? null} />
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

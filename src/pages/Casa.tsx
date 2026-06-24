import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, X, MessageCircle, CheckCircle2, Circle, ChevronDown, ChevronUp, ExternalLink, FileText, RefreshCw, TrendingDown, TrendingUp, Pencil, RepeatIcon, CalendarDays, List, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

type ItemRateio = { descricao: string; valor: number }
type Rateio = {
  id: string; titulo: string; valor_total: number; quantidade_pessoas: number
  chave_pix: string | null; data: string | null; tipo_divisao: 'pessoa' | 'casal' | null; criado_por: string; created_at: string
  itens?: ItemRateio[] | null
  participantes?: RateioParticipante[]
}
type RateioParticipante = { id: string; rateio_id: string; nome: string; valor_pago: number }
type ContaPagar = {
  id: string; titulo: string; valor: number; vencimento: string | null
  pago: boolean; recorrente: boolean; frequencia_recorrencia: string | null; created_at: string
}
type ContaReceber = {
  id: string; titulo: string; valor: number; vencimento: string | null
  recebido: boolean; recorrente: boolean; frequencia_recorrencia: string | null; created_at: string
}
type Rotina = { id: string; titulo: string; frequencia: string; criado_por: string }
type RotinaRegistro = { id: string; rotina_id: string; data: string; concluida: boolean }
type Documento = { id: string; titulo: string; descricao: string | null; url: string | null; categoria: string | null; criado_por: string; created_at: string }

type FormConta = { titulo: string; valor: string; vencimento: string; recorrente: boolean; frequencia_recorrencia: string }
const FORM_CONTA_VAZIO: FormConta = { titulo: '', valor: '', vencimento: '', recorrente: false, frequencia_recorrencia: 'mensal' }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hoje = () => new Date().toISOString().split('T')[0]
const fmtData = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const CHAVE_PIX_PADRAO = 'gui.vr.gomes@gmail.com'
type SubFinancas = 'resumo' | 'pagar' | 'receber' | 'rateios'
type ViewFinancas = 'lista' | 'calendario'
type OrdenacaoRateios = 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc' | 'nome_asc' | 'pendentes'

function FormContaUI({ form, onChange, onCancel, onSave, titulo, saving }: {
  form: FormConta; onChange: (f: FormConta) => void
  onCancel: () => void; onSave: () => void; titulo: string; saving: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800">{titulo}</h3>
        <button onClick={onCancel}><X size={16} className="text-gray-400" /></button>
      </div>
      <input className="input" placeholder="Título *" value={form.titulo} onChange={e => onChange({ ...form, titulo: e.target.value })} autoFocus />
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Valor (R$) *</label>
          <input className="input" type="number" min="0" step="0.01" placeholder="0,00" value={form.valor} onChange={e => onChange({ ...form, valor: e.target.value })} />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Vencimento</label>
          <input className="input" type="date" value={form.vencimento} onChange={e => onChange({ ...form, vencimento: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={form.recorrente} onChange={e => onChange({ ...form, recorrente: e.target.checked })} />
          <span className="text-sm text-gray-700">Recorrente</span>
        </label>
        {form.recorrente && (
          <select className="input flex-1 text-sm" value={form.frequencia_recorrencia} onChange={e => onChange({ ...form, frequencia_recorrencia: e.target.value })}>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancelar</button>
        <button onClick={onSave} disabled={saving || !form.titulo.trim() || !form.valor} className="btn-primary flex-1 text-sm">Salvar</button>
      </div>
    </div>
  )
}

const FREQ_LABELS: Record<string, string> = { mensal: 'Mensal', semanal: 'Semanal', quinzenal: 'Quinzenal', anual: 'Anual' }

function proximoVencimento(vencimento: string, freq: string): string {
  const d = new Date(vencimento + 'T12:00:00')
  if (freq === 'semanal') d.setDate(d.getDate() + 7)
  else if (freq === 'quinzenal') d.setDate(d.getDate() + 15)
  else if (freq === 'anual') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

function gerarOcorrencias(vencInicial: string, freq: string, quantidade: number): string[] {
  const datas: string[] = []
  let v = vencInicial
  for (let i = 0; i < quantidade; i++) {
    v = proximoVencimento(v, freq)
    datas.push(v)
  }
  return datas
}

function fimMesAtual(): string {
  const h = new Date()
  const ultimo = new Date(h.getFullYear(), h.getMonth() + 1, 0)
  return ultimo.toISOString().split('T')[0]
}

export default function Casa() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as 'financas' | 'rotinas' | 'documentos' | null
  const [aba, setAba] = useState<'financas' | 'rotinas' | 'documentos'>(tabParam ?? 'financas')
  const [subFinancas, setSubFinancas] = useState<SubFinancas>('resumo')
  const [viewFinancas, setViewFinancas] = useState<ViewFinancas>('lista')
  const [calMes, setCalMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() } })
  const [ordenacaoRateios, setOrdenacaoRateios] = useState<OrdenacaoRateios>('data_desc')

  // --- RATEIOS ---
  const [rateios, setRateios] = useState<Rateio[]>([])
  const [rateioAberto, setRateioAberto] = useState<string | null>(null)
  const [showNovoRateio, setShowNovoRateio] = useState(false)
  const [formRateio, setFormRateio] = useState({ titulo: '', valor_total: '', quantidade_pessoas: '', chave_pix: CHAVE_PIX_PADRAO, data: '', tipo_divisao: 'pessoa' as 'pessoa' | 'casal', itens: [] as ItemRateio[] })
  const [novoItem, setNovoItem] = useState({ descricao: '', valor: '' })
  const [novoNome, setNovoNome] = useState<Record<string, string>>({})
  const [editandoPago, setEditandoPago] = useState<Record<string, string>>({})

  // --- NOVO LANÇAMENTO (modal unificado) ---
  const [showNovoLancamento, setShowNovoLancamento] = useState(false)
  const [tipoLancamento, setTipoLancamento] = useState<'pagar' | 'receber'>('pagar')
  const [formLancamento, setFormLancamento] = useState<FormConta>(FORM_CONTA_VAZIO)

  // --- CONTAS A PAGAR ---
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [showNovaPagar, setShowNovaPagar] = useState(false)
  const [formPagar, setFormPagar] = useState<FormConta>(FORM_CONTA_VAZIO)
  const [editandoPagar, setEditandoPagar] = useState<ContaPagar | null>(null)
  const [formEditPagar, setFormEditPagar] = useState<FormConta>(FORM_CONTA_VAZIO)
  const [showModalEditPagar, setShowModalEditPagar] = useState(false)

  // --- CONTAS A RECEBER ---
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([])
  const [showNovaReceber, setShowNovaReceber] = useState(false)
  const [formReceber, setFormReceber] = useState<FormConta>(FORM_CONTA_VAZIO)
  const [editandoReceber, setEditandoReceber] = useState<ContaReceber | null>(null)
  const [formEditReceber, setFormEditReceber] = useState<FormConta>(FORM_CONTA_VAZIO)
  const [showModalEditReceber, setShowModalEditReceber] = useState(false)

  // --- SALDO ATUAL ---
  const [showVencidos, setShowVencidos] = useState(false)

  // --- CALENDÁRIO DIA ---
  const [diaSelecionado, setDiaSelecionado] = useState<{ ano: number; mes: number; dia: number } | null>(null)

  // --- MODAL RECORRÊNCIA (editar/apagar) ---
  type AcaoRecorrencia = { tipo: 'deletar' | 'editar'; tabela: 'pagar' | 'receber'; conta: ContaPagar | ContaReceber }
  const [acaoRecorrencia, setAcaoRecorrencia] = useState<AcaoRecorrencia | null>(null)

  // --- ROTINAS ---
  const [rotinas, setRotinas] = useState<Rotina[]>([])
  const [registros, setRegistros] = useState<RotinaRegistro[]>([])
  const [showNovaRotina, setShowNovaRotina] = useState(false)
  const [formRotina, setFormRotina] = useState({ titulo: '', frequencia: 'diaria' })

  // --- DOCUMENTOS ---
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({})
  const [showNovoDoc, setShowNovoDoc] = useState(false)
  const [formDoc, setFormDoc] = useState({ titulo: '', descricao: '', url: '', categoria: '' })

  const [saving, setSaving] = useState(false)

  useEffect(() => { if (tabParam) setAba(tabParam) }, [tabParam])
  useEffect(() => {
    if (!user) return
    loadRateios(); loadRotinas(); loadDocumentos(); loadContasPagar(); loadContasReceber()
    supabase.from('profiles').select('id, nome').then(({ data }) => {
      const map: Record<string, string> = {}
      for (const p of data ?? []) map[p.id] = p.nome
      setProfilesMap(map)
    })
  }, [user])

  // ===== NOVO LANÇAMENTO =====
  async function salvarNovoLancamento() {
    if (!formLancamento.titulo.trim() || !formLancamento.valor) return
    setSaving(true)
    const payload = {
      titulo: formLancamento.titulo.trim(), valor: parseFloat(formLancamento.valor),
      vencimento: formLancamento.vencimento || null,
      recorrente: formLancamento.recorrente,
      frequencia_recorrencia: formLancamento.recorrente ? formLancamento.frequencia_recorrencia : null,
      criado_por: user!.id,
    }
    if (tipoLancamento === 'pagar') {
      await supabase.from('contas_pagar').insert({ ...payload, pago: false })
      await loadContasPagar()
    } else {
      await supabase.from('contas_receber').insert({ ...payload, recebido: false })
      await loadContasReceber()
    }
    setFormLancamento(FORM_CONTA_VAZIO)
    setShowNovoLancamento(false)
    setSaving(false)
  }

  // ===== CONTAS A PAGAR =====
  async function loadContasPagar() {
    const { data } = await supabase.from('contas_pagar').select('*').order('vencimento', { ascending: true, nullsFirst: false })
    setContasPagar(data ?? [])
  }

  async function criarContaPagar() {
    if (!formPagar.titulo.trim() || !formPagar.valor) return
    setSaving(true)
    const freq = formPagar.recorrente ? formPagar.frequencia_recorrencia : null
    const venc = formPagar.vencimento || null
    const base = { titulo: formPagar.titulo.trim(), valor: parseFloat(formPagar.valor), recorrente: formPagar.recorrente, frequencia_recorrencia: freq, criado_por: user!.id }
    const rows: object[] = [{ ...base, vencimento: venc, pago: false }]
    if (formPagar.recorrente && venc && freq) {
      gerarOcorrencias(venc, freq, 24).forEach(v => rows.push({ ...base, vencimento: v, pago: false }))
    }
    await supabase.from('contas_pagar').insert(rows)
    setFormPagar(FORM_CONTA_VAZIO)
    setShowNovaPagar(false)
    await loadContasPagar()
    setSaving(false)
  }

  async function salvarEditPagar(escopo: 'este' | 'futuros' = 'este') {
    if (!editandoPagar || !formEditPagar.titulo.trim() || !formEditPagar.valor) return
    setSaving(true)
    const payload = {
      titulo: formEditPagar.titulo.trim(), valor: parseFloat(formEditPagar.valor),
      vencimento: formEditPagar.vencimento || null,
      recorrente: formEditPagar.recorrente,
      frequencia_recorrencia: formEditPagar.recorrente ? formEditPagar.frequencia_recorrencia : null,
    }
    if (escopo === 'futuros' && editandoPagar.recorrente && editandoPagar.vencimento) {
      await supabase.from('contas_pagar').update(payload)
        .eq('titulo', editandoPagar.titulo).eq('recorrente', true).gte('vencimento', editandoPagar.vencimento)
    } else {
      await supabase.from('contas_pagar').update(payload).eq('id', editandoPagar.id)
    }
    setEditandoPagar(null); setShowModalEditPagar(false)
    await loadContasPagar()
    setSaving(false)
  }

  async function togglePago(conta: ContaPagar) {
    const novoPago = !conta.pago
    await supabase.from('contas_pagar').update({ pago: novoPago }).eq('id', conta.id)
    if (novoPago && conta.recorrente && conta.frequencia_recorrencia) {
      // Descobre o último vencimento existente dessa série e cria mais um para manter o buffer
      const { data: ultimos } = await supabase.from('contas_pagar')
        .select('vencimento').eq('titulo', conta.titulo).eq('recorrente', true)
        .order('vencimento', { ascending: false }).limit(1)
      const ultimoVenc = ultimos?.[0]?.vencimento ?? conta.vencimento
      if (ultimoVenc) {
        await supabase.from('contas_pagar').insert({
          titulo: conta.titulo, valor: conta.valor,
          vencimento: proximoVencimento(ultimoVenc, conta.frequencia_recorrencia),
          pago: false, recorrente: true,
          frequencia_recorrencia: conta.frequencia_recorrencia,
          criado_por: user!.id,
        })
      }
    }
    await loadContasPagar()
  }

  async function deletarContaPagar(conta: ContaPagar) {
    if (conta.recorrente) { setAcaoRecorrencia({ tipo: 'deletar', tabela: 'pagar', conta }); return }
    if (!confirm('Apagar esta conta?')) return
    await supabase.from('contas_pagar').delete().eq('id', conta.id)
    await loadContasPagar()
  }

  async function executarAcaoRecorrencia(escopo: 'este' | 'futuros') {
    if (!acaoRecorrencia) return
    const { tipo, tabela, conta } = acaoRecorrencia
    const venc = (conta as ContaPagar).vencimento ?? (conta as ContaReceber).vencimento ?? ''
    if (tipo === 'deletar') {
      if (escopo === 'este') {
        await supabase.from(tabela === 'pagar' ? 'contas_pagar' : 'contas_receber').delete().eq('id', conta.id)
      } else {
        await supabase.from(tabela === 'pagar' ? 'contas_pagar' : 'contas_receber')
          .delete().eq('titulo', conta.titulo).eq('recorrente', true).gte('vencimento', venc)
      }
    } else {
      // editar — abre form de edição (já estava setado antes)
    }
    setAcaoRecorrencia(null)
    if (tabela === 'pagar') await loadContasPagar(); else await loadContasReceber()
  }

  // ===== CONTAS A RECEBER =====
  async function loadContasReceber() {
    const { data } = await supabase.from('contas_receber').select('*').order('vencimento', { ascending: true, nullsFirst: false })
    setContasReceber(data ?? [])
  }

  async function criarContaReceber() {
    if (!formReceber.titulo.trim() || !formReceber.valor) return
    setSaving(true)
    const freq = formReceber.recorrente ? formReceber.frequencia_recorrencia : null
    const venc = formReceber.vencimento || null
    const base = { titulo: formReceber.titulo.trim(), valor: parseFloat(formReceber.valor), recorrente: formReceber.recorrente, frequencia_recorrencia: freq, criado_por: user!.id }
    const rows: object[] = [{ ...base, vencimento: venc, recebido: false }]
    if (formReceber.recorrente && venc && freq) {
      gerarOcorrencias(venc, freq, 24).forEach(v => rows.push({ ...base, vencimento: v, recebido: false }))
    }
    await supabase.from('contas_receber').insert(rows)
    setFormReceber(FORM_CONTA_VAZIO)
    setShowNovaReceber(false)
    await loadContasReceber()
    setSaving(false)
  }

  async function salvarEditReceber(escopo: 'este' | 'futuros' = 'este') {
    if (!editandoReceber || !formEditReceber.titulo.trim() || !formEditReceber.valor) return
    setSaving(true)
    const payload = {
      titulo: formEditReceber.titulo.trim(), valor: parseFloat(formEditReceber.valor),
      vencimento: formEditReceber.vencimento || null,
      recorrente: formEditReceber.recorrente,
      frequencia_recorrencia: formEditReceber.recorrente ? formEditReceber.frequencia_recorrencia : null,
    }
    if (escopo === 'futuros' && editandoReceber.recorrente && editandoReceber.vencimento) {
      await supabase.from('contas_receber').update(payload)
        .eq('titulo', editandoReceber.titulo).eq('recorrente', true).gte('vencimento', editandoReceber.vencimento)
    } else {
      await supabase.from('contas_receber').update(payload).eq('id', editandoReceber.id)
    }
    setEditandoReceber(null); setShowModalEditReceber(false)
    await loadContasReceber()
    setSaving(false)
  }

  async function toggleRecebido(conta: ContaReceber) {
    const novoRecebido = !conta.recebido
    await supabase.from('contas_receber').update({ recebido: novoRecebido }).eq('id', conta.id)
    if (novoRecebido && conta.recorrente && conta.frequencia_recorrencia) {
      const { data: ultimos } = await supabase.from('contas_receber')
        .select('vencimento').eq('titulo', conta.titulo).eq('recorrente', true)
        .order('vencimento', { ascending: false }).limit(1)
      const ultimoVenc = ultimos?.[0]?.vencimento ?? conta.vencimento
      if (ultimoVenc) {
        await supabase.from('contas_receber').insert({
          titulo: conta.titulo, valor: conta.valor,
          vencimento: proximoVencimento(ultimoVenc, conta.frequencia_recorrencia),
          recebido: false, recorrente: true,
          frequencia_recorrencia: conta.frequencia_recorrencia,
          criado_por: user!.id,
        })
      }
    }
    await loadContasReceber()
  }

  async function deletarContaReceber(conta: ContaReceber) {
    if (conta.recorrente) { setAcaoRecorrencia({ tipo: 'deletar', tabela: 'receber', conta }); return }
    if (!confirm('Apagar esta conta?')) return
    await supabase.from('contas_receber').delete().eq('id', conta.id)
    await loadContasReceber()
  }

  // ===== RATEIOS =====
  async function loadRateios() {
    const { data } = await supabase.from('rateios').select('*, participantes:rateio_participantes(*)').order('created_at', { ascending: false })
    setRateios(data ?? [])
  }

  function adicionarItemRateio() {
    if (!novoItem.descricao.trim() || !novoItem.valor) return
    setFormRateio(f => ({ ...f, itens: [...f.itens, { descricao: novoItem.descricao.trim(), valor: parseFloat(novoItem.valor) }] }))
    setNovoItem({ descricao: '', valor: '' })
  }

  function removerItemRateio(idx: number) {
    setFormRateio(f => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }))
  }

  async function criarRateio() {
    const valorTotal = formRateio.itens.length > 0
      ? formRateio.itens.reduce((s, i) => s + i.valor, 0)
      : parseFloat(formRateio.valor_total || '0')
    if (!formRateio.titulo.trim() || !valorTotal || !formRateio.quantidade_pessoas) return
    setSaving(true)
    const { data } = await supabase.from('rateios').insert({
      titulo: formRateio.titulo.trim(), valor_total: valorTotal,
      quantidade_pessoas: parseInt(formRateio.quantidade_pessoas),
      chave_pix: formRateio.chave_pix.trim() || null,
      data: formRateio.data || null, criado_por: user!.id,
      itens: formRateio.itens.length > 0 ? formRateio.itens : null,
    }).select().single()
    if (data) {
      const participantesIniciais = formRateio.tipo_divisao === 'casal'
        ? [{ rateio_id: data.id, nome: 'Guilherme e Vitória', valor_pago: 0 }]
        : [
            { rateio_id: data.id, nome: 'Guilherme', valor_pago: 0 },
            { rateio_id: data.id, nome: 'Vitória', valor_pago: 0 },
          ]
      await supabase.from('rateio_participantes').insert(participantesIniciais)
    }
    setFormRateio({ titulo: '', valor_total: '', quantidade_pessoas: '', chave_pix: CHAVE_PIX_PADRAO, data: '', tipo_divisao: 'pessoa', itens: [] })
    setNovoItem({ descricao: '', valor: '' })
    setShowNovoRateio(false)
    await loadRateios()
    if (data) setRateioAberto(data.id)
    setSaving(false)
  }

  async function deletarRateio(id: string) {
    if (!confirm('Apagar este rateio?')) return
    await supabase.from('rateios').delete().eq('id', id)
    if (rateioAberto === id) setRateioAberto(null)
    await loadRateios()
  }

  async function adicionarParticipante(rateioId: string) {
    const nome = novoNome[rateioId]?.trim()
    if (!nome) return
    await supabase.from('rateio_participantes').insert({ rateio_id: rateioId, nome, valor_pago: 0 })
    setNovoNome(p => ({ ...p, [rateioId]: '' }))
    await loadRateios()
  }

  async function salvarPagamento(participanteId: string, _rateioId: string) {
    const val = parseFloat(editandoPago[participanteId] ?? '0') || 0
    await supabase.from('rateio_participantes').update({ valor_pago: val }).eq('id', participanteId)
    setEditandoPago(p => { const n = { ...p }; delete n[participanteId]; return n })
    await loadRateios()
  }

  async function deletarParticipante(id: string) {
    await supabase.from('rateio_participantes').delete().eq('id', id)
    await loadRateios()
  }

  function mensagemWhatsApp(r: Rateio) {
    const valorPessoa = r.valor_total / r.quantidade_pessoas
    const labelPessoas = r.tipo_divisao === 'casal' ? 'Casais' : 'Pessoas'
    const dataLinha = r.data ? `\nData: ${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''
    const msg = `*Rateio: ${r.titulo}*\n\nValor total: ${fmt(r.valor_total)}\n${labelPessoas}: ${r.quantidade_pessoas}\nValor por ${r.tipo_divisao === 'casal' ? 'casal' : 'pessoa'}: ${fmt(valorPessoa)}${dataLinha}${r.chave_pix ? `\n\nPix: ${r.chave_pix}` : ''}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ===== ROTINAS =====
  async function loadRotinas() {
    const { data: rots } = await supabase.from('rotinas').select('*').order('created_at')
    const { data: regs } = await supabase.from('rotina_registros').select('*').eq('data', hoje())
    setRotinas(rots ?? [])
    setRegistros(regs ?? [])
  }

  async function criarRotina() {
    if (!formRotina.titulo.trim()) return
    setSaving(true)
    await supabase.from('rotinas').insert({ titulo: formRotina.titulo.trim(), frequencia: formRotina.frequencia, criado_por: user!.id })
    setFormRotina({ titulo: '', frequencia: 'diaria' })
    setShowNovaRotina(false)
    await loadRotinas()
    setSaving(false)
  }

  async function toggleRotina(rotinaId: string) {
    const reg = registros.find(r => r.rotina_id === rotinaId)
    if (reg) {
      await supabase.from('rotina_registros').update({ concluida: !reg.concluida }).eq('id', reg.id)
    } else {
      await supabase.from('rotina_registros').insert({ rotina_id: rotinaId, data: hoje(), concluida: true })
    }
    await loadRotinas()
  }

  async function deletarRotina(id: string) {
    if (!confirm('Apagar esta rotina?')) return
    await supabase.from('rotinas').delete().eq('id', id)
    await loadRotinas()
  }

  // ===== DOCUMENTOS =====
  async function loadDocumentos() {
    const { data } = await supabase.from('documentos').select('*').order('created_at', { ascending: false })
    setDocumentos(data ?? [])
  }

  async function criarDocumento() {
    if (!formDoc.titulo.trim()) return
    setSaving(true)
    await supabase.from('documentos').insert({
      titulo: formDoc.titulo.trim(), descricao: formDoc.descricao.trim() || null,
      url: formDoc.url.trim() || null, categoria: formDoc.categoria.trim() || null, criado_por: user!.id,
    })
    setFormDoc({ titulo: '', descricao: '', url: '', categoria: '' })
    setShowNovoDoc(false)
    await loadDocumentos()
    setSaving(false)
  }

  async function deletarDocumento(id: string) {
    if (!confirm('Apagar este documento?')) return
    await supabase.from('documentos').delete().eq('id', id)
    await loadDocumentos()
  }

  const freqLabel: Record<string, string> = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }

  const vencendoHoje = (v: string | null) => v === hoje()
  const vencido = (v: string | null) => v ? v < hoje() : false

  // Filtra entradas futuras fora do mês atual (recorrentes pré-geradas)
  const fimMes = fimMesAtual()
  const contasPagarVisiveis = contasPagar.filter(c => !c.vencimento || c.vencimento <= fimMes)
  const contasReceberVisiveis = contasReceber.filter(c => !c.vencimento || c.vencimento <= fimMes)

  // Cálculos resumo
  const totalPagar = contasPagarVisiveis.filter(c => !c.pago).reduce((s, c) => s + c.valor, 0)
  const totalVencidoPagar = contasPagarVisiveis.filter(c => !c.pago && vencido(c.vencimento)).reduce((s, c) => s + c.valor, 0)
  const countVencidoPagar = contasPagarVisiveis.filter(c => !c.pago && vencido(c.vencimento)).length
  const totalContasReceber = contasReceberVisiveis.filter(c => !c.recebido).reduce((s, c) => s + c.valor, 0)
  const totalRateiosPendentes = rateios.reduce((s, r) => {
    const pago = (r.participantes ?? []).reduce((sp, p) => sp + (p.valor_pago ?? 0), 0)
    return s + Math.max(0, r.valor_total - pago)
  }, 0)
  const totalReceber = totalContasReceber + totalRateiosPendentes

  const saldoBase = contasReceber.filter(c => c.recebido).reduce((s, c) => s + c.valor, 0)
                  - contasPagar.filter(c => c.pago).reduce((s, c) => s + c.valor, 0)

  function saldoPeriodo(de: string, ate: string) {
    const pagar = contasPagar.filter(c => !c.pago && c.vencimento && c.vencimento >= de && c.vencimento <= ate).reduce((s, c) => s + c.valor, 0)
    const receber = contasReceber.filter(c => !c.recebido && c.vencimento && c.vencimento >= de && c.vencimento <= ate).reduce((s, c) => s + c.valor, 0)
    return { pagar, receber, saldo: saldoBase + receber - pagar }
  }

  const periodos = (() => {
    const h = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    const inicioSemana = new Date(h)
    inicioSemana.setDate(h.getDate() - h.getDay())
    const fimSemana = new Date(inicioSemana)
    fimSemana.setDate(inicioSemana.getDate() + 6)

    const inicioMes = `${h.getFullYear()}-${pad(h.getMonth() + 1)}-01`
    const fimMes = toStr(new Date(h.getFullYear(), h.getMonth() + 1, 0))

    const proxMes = new Date(h.getFullYear(), h.getMonth() + 1, 1)
    const inicioProxMes = toStr(proxMes)
    const fimProxMes = toStr(new Date(proxMes.getFullYear(), proxMes.getMonth() + 1, 0))

    return [
      { label: 'Esta semana', ...saldoPeriodo(toStr(inicioSemana), toStr(fimSemana)) },
      { label: 'Mês atual', ...saldoPeriodo(inicioMes, fimMes) },
      { label: 'Próximo mês', ...saldoPeriodo(inicioProxMes, fimProxMes) },
    ]
  })()

  const SUB_FINANCAS: { key: SubFinancas; label: string }[] = [
    { key: 'resumo', label: 'Resumo' },
    { key: 'pagar', label: 'Contas a pagar' },
    { key: 'receber', label: 'Contas a receber' },
    { key: 'rateios', label: 'Rateios' },
  ]

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Casa</h1>

      {/* ===== FINANÇAS ===== */}
      {aba === 'financas' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
              {SUB_FINANCAS.map(s => (
                <button key={s.key} onClick={() => setSubFinancas(s.key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${subFinancas === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex bg-gray-100 rounded-xl p-1 shrink-0">
              <button onClick={() => setViewFinancas('lista')} title="Lista"
                className={`p-1.5 rounded-lg transition-colors ${viewFinancas === 'lista' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                <List size={15} />
              </button>
              <button onClick={() => setViewFinancas('calendario')} title="Calendário"
                className={`p-1.5 rounded-lg transition-colors ${viewFinancas === 'calendario' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                <CalendarDays size={15} />
              </button>
            </div>
            <button onClick={() => { setShowNovoLancamento(true); setFormLancamento(FORM_CONTA_VAZIO) }}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3 shrink-0">
              <Plus size={15} /> Novo
            </button>
          </div>

          {/* MODAL VENCIDOS */}
          {showVencidos && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowVencidos(false)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} className="text-rose-500" />
                    <h3 className="font-semibold text-gray-900">Contas vencidas</h3>
                  </div>
                  <button onClick={() => setShowVencidos(false)}><X size={18} className="text-gray-400" /></button>
                </div>
                {countVencidoPagar === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">Nenhuma conta vencida</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {contasPagarVisiveis.filter(c => !c.pago && vencido(c.vencimento)).sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '')).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-rose-50 border border-rose-100 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.titulo}</p>
                          <p className="text-xs text-rose-500 mt-0.5">Venceu em {fmtData(c.vencimento)}</p>
                        </div>
                        <p className="text-sm font-bold text-rose-700">{fmt(c.valor)}</p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 mt-2">
                      <span className="text-sm font-semibold text-gray-700">Total</span>
                      <span className="text-sm font-bold text-rose-700">{fmt(totalVencidoPagar)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL DIA DO CALENDÁRIO */}
          {diaSelecionado && (() => {
            const { ano, mes, dia } = diaSelecionado
            const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
            const pagar = contasPagar.filter(c => c.vencimento === dataStr)
            const receber = contasReceber.filter(c => c.vencimento === dataStr)
            const total = receber.reduce((s, c) => s + c.valor, 0) - pagar.reduce((s, c) => s + c.valor, 0)
            return (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDiaSelecionado(null)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">{fmtData(dataStr)}</h3>
                    <button onClick={() => setDiaSelecionado(null)}><X size={18} className="text-gray-400" /></button>
                  </div>
                  {pagar.length === 0 && receber.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nenhum lançamento neste dia.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {pagar.map(c => (
                        <div key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border ${c.pago ? 'border-gray-100 opacity-60' : 'border-red-100 bg-red-50'}`}>
                          <button onClick={() => togglePago(c)} className="shrink-0">
                            {c.pago ? <CheckCircle2 size={20} className="text-green-500" /> : <Circle size={20} className="text-gray-300" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${c.pago ? 'line-through text-gray-400' : 'text-gray-800'}`}>{c.titulo}</p>
                            {c.recorrente && <span className="text-xs text-gray-400">{FREQ_LABELS[c.frequencia_recorrencia ?? 'mensal']}</span>}
                          </div>
                          <p className="text-sm font-semibold text-red-600 shrink-0">{fmt(c.valor)}</p>
                          <button onClick={() => { setEditandoPagar(c); setFormEditPagar({ titulo: c.titulo, valor: String(c.valor), vencimento: c.vencimento ?? '', recorrente: c.recorrente, frequencia_recorrencia: c.frequencia_recorrencia ?? 'mensal' }); setShowModalEditPagar(true); setDiaSelecionado(null) }}
                            className="text-gray-300 hover:text-brand-500 shrink-0"><Pencil size={14} /></button>
                          <button onClick={() => { deletarContaPagar(c); setDiaSelecionado(null) }} className="text-gray-300 hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                        </div>
                      ))}
                      {receber.map(c => (
                        <div key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border ${c.recebido ? 'border-gray-100 opacity-60' : 'border-green-100 bg-green-50'}`}>
                          <button onClick={() => toggleRecebido(c)} className="shrink-0">
                            {c.recebido ? <CheckCircle2 size={20} className="text-green-500" /> : <Circle size={20} className="text-gray-300" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${c.recebido ? 'line-through text-gray-400' : 'text-gray-800'}`}>{c.titulo}</p>
                            {c.recorrente && <span className="text-xs text-gray-400">{FREQ_LABELS[c.frequencia_recorrencia ?? 'mensal']}</span>}
                          </div>
                          <p className="text-sm font-semibold text-green-600 shrink-0">{fmt(c.valor)}</p>
                          <button onClick={() => { setEditandoReceber(c); setFormEditReceber({ titulo: c.titulo, valor: String(c.valor), vencimento: c.vencimento ?? '', recorrente: c.recorrente, frequencia_recorrencia: c.frequencia_recorrencia ?? 'mensal' }); setShowModalEditReceber(true); setDiaSelecionado(null) }}
                            className="text-gray-300 hover:text-brand-500 shrink-0"><Pencil size={14} /></button>
                          <button onClick={() => { deletarContaReceber(c); setDiaSelecionado(null) }} className="text-gray-300 hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 mt-1">
                        <span className="text-sm font-semibold text-gray-700">Saldo do dia</span>
                        <span className={`text-sm font-bold ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>{total >= 0 ? '+' : ''}{fmt(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* MODAL CONFIRMAÇÃO RECORRÊNCIA */}
          {acaoRecorrencia && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAcaoRecorrencia(null)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {acaoRecorrencia.tipo === 'deletar' ? 'Apagar lançamento recorrente' : 'Editar lançamento recorrente'}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  "{acaoRecorrencia.conta.titulo}" é recorrente. O que deseja {acaoRecorrencia.tipo === 'deletar' ? 'apagar' : 'editar'}?
                </p>
                <div className="space-y-2">
                  <button onClick={() => executarAcaoRecorrencia('este')}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                    <p className="text-sm font-medium text-gray-800">Somente este lançamento</p>
                    <p className="text-xs text-gray-400">{fmtData((acaoRecorrencia.conta as ContaPagar).vencimento ?? (acaoRecorrencia.conta as ContaReceber).vencimento)}</p>
                  </button>
                  <button onClick={() => executarAcaoRecorrencia('futuros')}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-red-400 hover:bg-red-50 transition-colors">
                    <p className="text-sm font-medium text-gray-800">Este e todos os futuros</p>
                    <p className="text-xs text-gray-400">A partir de {fmtData((acaoRecorrencia.conta as ContaPagar).vencimento ?? (acaoRecorrencia.conta as ContaReceber).vencimento)}</p>
                  </button>
                </div>
                <button onClick={() => setAcaoRecorrencia(null)} className="mt-3 w-full btn-secondary text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* MODAL EDITAR CONTA A PAGAR */}
          {showModalEditPagar && editandoPagar && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowModalEditPagar(false); setEditandoPagar(null) }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Editar conta a pagar</h3>
                  <button onClick={() => { setShowModalEditPagar(false); setEditandoPagar(null) }}><X size={18} className="text-gray-400" /></button>
                </div>
                <input className="input" placeholder="Título *" value={formEditPagar.titulo} onChange={e => setFormEditPagar(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Valor (R$) *</label>
                    <input className="input" type="number" min="0" step="0.01" value={formEditPagar.valor} onChange={e => setFormEditPagar(f => ({ ...f, valor: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Vencimento</label>
                    <input className="input" type="date" value={formEditPagar.vencimento} onChange={e => setFormEditPagar(f => ({ ...f, vencimento: e.target.value }))} />
                  </div>
                </div>
                {editandoPagar.recorrente ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-gray-500">Salvar alterações em:</p>
                    <button onClick={() => salvarEditPagar('este')} disabled={saving} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                      <p className="text-sm font-medium text-gray-800">Somente este lançamento</p>
                      <p className="text-xs text-gray-400">{fmtData(editandoPagar.vencimento)}</p>
                    </button>
                    <button onClick={() => salvarEditPagar('futuros')} disabled={saving} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                      <p className="text-sm font-medium text-gray-800">Este e todos os futuros</p>
                      <p className="text-xs text-gray-400">A partir de {fmtData(editandoPagar.vencimento)}</p>
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowModalEditPagar(false); setEditandoPagar(null) }} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={() => salvarEditPagar('este')} disabled={saving || !formEditPagar.titulo.trim() || !formEditPagar.valor} className="btn-primary flex-1 text-sm">Salvar</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL EDITAR CONTA A RECEBER */}
          {showModalEditReceber && editandoReceber && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowModalEditReceber(false); setEditandoReceber(null) }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Editar conta a receber</h3>
                  <button onClick={() => { setShowModalEditReceber(false); setEditandoReceber(null) }}><X size={18} className="text-gray-400" /></button>
                </div>
                <input className="input" placeholder="Título *" value={formEditReceber.titulo} onChange={e => setFormEditReceber(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Valor (R$) *</label>
                    <input className="input" type="number" min="0" step="0.01" value={formEditReceber.valor} onChange={e => setFormEditReceber(f => ({ ...f, valor: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Vencimento</label>
                    <input className="input" type="date" value={formEditReceber.vencimento} onChange={e => setFormEditReceber(f => ({ ...f, vencimento: e.target.value }))} />
                  </div>
                </div>
                {editandoReceber.recorrente ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-gray-500">Salvar alterações em:</p>
                    <button onClick={() => salvarEditReceber('este')} disabled={saving} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                      <p className="text-sm font-medium text-gray-800">Somente este lançamento</p>
                      <p className="text-xs text-gray-400">{fmtData(editandoReceber.vencimento)}</p>
                    </button>
                    <button onClick={() => salvarEditReceber('futuros')} disabled={saving} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors">
                      <p className="text-sm font-medium text-gray-800">Este e todos os futuros</p>
                      <p className="text-xs text-gray-400">A partir de {fmtData(editandoReceber.vencimento)}</p>
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowModalEditReceber(false); setEditandoReceber(null) }} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={() => salvarEditReceber('este')} disabled={saving || !formEditReceber.titulo.trim() || !formEditReceber.valor} className="btn-primary flex-1 text-sm">Salvar</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL NOVO LANÇAMENTO */}
          {showNovoLancamento && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNovoLancamento(false)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Novo lançamento</h3>
                  <button onClick={() => setShowNovoLancamento(false)}><X size={18} className="text-gray-400" /></button>
                </div>
                {/* Seletor tipo */}
                <div className="flex gap-2">
                  <button onClick={() => setTipoLancamento('pagar')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${tipoLancamento === 'pagar' ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <TrendingDown size={16} /> A pagar
                  </button>
                  <button onClick={() => setTipoLancamento('receber')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${tipoLancamento === 'receber' ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <TrendingUp size={16} /> A receber
                  </button>
                </div>
                <input className="input" placeholder="Título *" value={formLancamento.titulo} onChange={e => setFormLancamento(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Valor (R$) *</label>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0,00" value={formLancamento.valor} onChange={e => setFormLancamento(f => ({ ...f, valor: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Vencimento</label>
                    <input className="input" type="date" value={formLancamento.vencimento} onChange={e => setFormLancamento(f => ({ ...f, vencimento: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={formLancamento.recorrente} onChange={e => setFormLancamento(f => ({ ...f, recorrente: e.target.checked }))} />
                    <span className="text-sm text-gray-700">Recorrente</span>
                  </label>
                  {formLancamento.recorrente && (
                    <select className="input flex-1 text-sm" value={formLancamento.frequencia_recorrencia} onChange={e => setFormLancamento(f => ({ ...f, frequencia_recorrencia: e.target.value }))}>
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                      <option value="anual">Anual</option>
                    </select>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowNovoLancamento(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                  <button onClick={salvarNovoLancamento} disabled={saving || !formLancamento.titulo.trim() || !formLancamento.valor}
                    className={`flex-1 text-sm font-medium py-2 rounded-xl transition-colors text-white ${tipoLancamento === 'pagar' ? 'bg-red-500 hover:bg-red-600 disabled:opacity-50' : 'bg-green-500 hover:bg-green-600 disabled:opacity-50'}`}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CALENDÁRIO */}
          {viewFinancas === 'calendario' && (() => {
            const { ano, mes } = calMes
            const primeiroDia = new Date(ano, mes, 1).getDay()
            const diasNoMes = new Date(ano, mes + 1, 0).getDate()
            const hoje = new Date()
            const nomeMes = new Date(ano, mes, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
            const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

            const eventosPorDia: Record<number, { titulo: string; tipo: 'pagar' | 'receber'; valor: number; feito: boolean }[]> = {}
            contasPagar.forEach(c => {
              if (!c.vencimento) return
              const d = new Date(c.vencimento + 'T12:00:00')
              if (d.getFullYear() === ano && d.getMonth() === mes)
                (eventosPorDia[d.getDate()] ??= []).push({ titulo: c.titulo, tipo: 'pagar', valor: c.valor, feito: c.pago })
            })
            contasReceber.forEach(c => {
              if (!c.vencimento) return
              const d = new Date(c.vencimento + 'T12:00:00')
              if (d.getFullYear() === ano && d.getMonth() === mes)
                (eventosPorDia[d.getDate()] ??= []).push({ titulo: c.titulo, tipo: 'receber', valor: c.valor, feito: c.recebido })
            })

            const cells: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]
            while (cells.length % 7 !== 0) cells.push(null)

            return (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <button onClick={() => setCalMes(({ ano, mes }) => mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 })}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-semibold text-gray-800 capitalize">{nomeMes}</span>
                  <button onClick={() => setCalMes(({ ano, mes }) => mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 })}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-7">
                  {diasSemana.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-2 border-b border-gray-100">{d}</div>
                  ))}
                  {cells.map((dia, i) => {
                    const isHoje = dia !== null && dia === hoje.getDate() && ano === hoje.getFullYear() && mes === hoje.getMonth()
                    const eventos = dia ? (eventosPorDia[dia] ?? []) : []
                    const saldoDia = eventos.reduce((s, ev) => s + (ev.tipo === 'receber' ? ev.valor : -ev.valor), 0)
                    const temEventos = eventos.length > 0
                    return (
                      <div key={i} onClick={() => dia && setDiaSelecionado({ ano, mes, dia })} className={`min-h-[72px] p-1.5 border-b border-r border-gray-100 ${!dia ? 'bg-gray-50/50' : 'cursor-pointer hover:bg-gray-50 transition-colors'}`}>
                        {dia && (
                          <>
                            <span className={`text-xs font-medium inline-flex w-5 h-5 items-center justify-center rounded-full mb-1 ${isHoje ? 'bg-brand-600 text-white' : 'text-gray-600'}`}>
                              {dia}
                            </span>
                            {temEventos && (
                              <div className={`text-xs font-semibold px-1.5 py-1 rounded text-center ${
                                saldoDia > 0 ? 'bg-green-100 text-green-700' : saldoDia < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                              }`} title={eventos.map(ev => `${ev.tipo === 'pagar' ? '-' : '+'}${fmt(ev.valor)} ${ev.titulo}`).join('\n')}>
                                {saldoDia >= 0 ? '+' : ''}{fmt(saldoDia)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-green-100 inline-block" /> Saldo positivo</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-100 inline-block" /> Saldo negativo</span>
                </div>
              </div>
            )
          })()}

          {/* RESUMO */}
          {viewFinancas === 'lista' && subFinancas === 'resumo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {/* Saldo atual (calculado) */}
                {(() => {
                  const totalRecebido = contasReceber.filter(c => c.recebido).reduce((s, c) => s + c.valor, 0)
                  const totalPago = contasPagar.filter(c => c.pago).reduce((s, c) => s + c.valor, 0)
                  const saldo = totalRecebido - totalPago
                  return (
                    <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo atual</span>
                      </div>
                      <p className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmt(saldo)}</p>
                      <p className={`text-xs mt-0.5 ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Recebidos − Pagos</p>
                    </div>
                  )
                })()}

                {/* Vencidos */}
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 cursor-pointer hover:bg-rose-100 transition-colors" onClick={() => setShowVencidos(true)}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={16} className="text-rose-500" />
                    <span className="text-xs font-medium text-rose-600">Vencidos</span>
                  </div>
                  <p className="text-xl font-bold text-rose-700">{fmt(totalVencidoPagar)}</p>
                  <p className="text-xs text-rose-400 mt-0.5">{countVencidoPagar} conta{countVencidoPagar !== 1 ? 's' : ''} em atraso · clique para ver</p>
                </div>

                {/* A pagar hoje */}
                {(() => {
                  const hj = hoje()
                  const pagarHoje = contasPagarVisiveis.filter(c => !c.pago && c.vencimento === hj)
                  const totalPagarHoje = pagarHoje.reduce((s, c) => s + c.valor, 0)
                  return (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown size={16} className="text-red-500" />
                        <span className="text-xs font-medium text-red-600">A pagar hoje</span>
                      </div>
                      <p className="text-xl font-bold text-red-700">{fmt(totalPagarHoje)}</p>
                      <p className="text-xs text-red-400 mt-0.5">{pagarHoje.length} conta{pagarHoje.length !== 1 ? 's' : ''} para hoje</p>
                    </div>
                  )
                })()}

                {/* A receber hoje */}
                {(() => {
                  const hj = hoje()
                  const receberHoje = contasReceberVisiveis.filter(c => !c.recebido && c.vencimento === hj)
                  const totalReceberHoje = receberHoje.reduce((s, c) => s + c.valor, 0)
                  return (
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={16} className="text-green-500" />
                        <span className="text-xs font-medium text-green-600">A receber hoje</span>
                      </div>
                      <p className="text-xl font-bold text-green-700">{fmt(totalReceberHoje)}</p>
                      <p className="text-xs text-green-400 mt-0.5">{receberHoje.length} conta{receberHoje.length !== 1 ? 's' : ''} para hoje</p>
                    </div>
                  )
                })()}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Saldo previsto por período</p>
                <div className="space-y-2">
                  {periodos.map(p => (
                    <div key={p.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600 w-28">{p.label}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span className="text-red-500">−{fmt(p.pagar)}</span>
                        <span className="text-green-500">+{fmt(p.receber)}</span>
                      </div>
                      <span className={`text-sm font-bold w-24 text-right ${p.saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {p.saldo >= 0 ? '+' : ''}{fmt(p.saldo)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>


              {(() => {
                const proximos = [
                  ...contasPagarVisiveis.filter(c => !c.pago && c.vencimento).map(c => ({ ...c, tipo: 'pagar' as const })),
                  ...contasReceberVisiveis.filter(c => !c.recebido && c.vencimento).map(c => ({ ...c, tipo: 'receber' as const })),
                ].sort((a, b) => (a.vencimento ?? '') < (b.vencimento ?? '') ? -1 : 1).slice(0, 5)
                if (proximos.length === 0) return null
                return (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Próximos vencimentos</p>
                    <div className="space-y-2">
                      {proximos.map(c => {
                        const atrasado = vencido(c.vencimento)
                        const hoje_ = vencendoHoje(c.vencimento)
                        return (
                          <div key={c.id + c.tipo} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {c.tipo === 'pagar' ? <TrendingDown size={14} className="text-red-400" /> : <TrendingUp size={14} className="text-green-400" />}
                              <span className="text-sm text-gray-700">{c.titulo}</span>
                              {c.recorrente && <RepeatIcon size={11} className="text-gray-400" />}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${atrasado ? 'text-red-600' : hoje_ ? 'text-orange-500' : 'text-gray-500'}`}>
                                {atrasado ? '⚠ ' : ''}{fmtData(c.vencimento)}
                              </span>
                              <span className={`text-sm font-semibold ${c.tipo === 'pagar' ? 'text-red-600' : 'text-green-600'}`}>{fmt(c.valor)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* CONTAS A PAGAR */}
          {viewFinancas === 'lista' && subFinancas === 'pagar' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">Contas a pagar</h2>
                  <p className="text-xs text-gray-400">Pendente: {fmt(totalPagar)}</p>
                </div>
                <button onClick={() => { setShowNovaPagar(true); setEditandoPagar(null) }} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                  <Plus size={15} /> Nova conta
                </button>
              </div>

              {showNovaPagar && (
                <FormContaUI form={formPagar} onChange={setFormPagar} titulo="Nova conta a pagar" saving={saving}
                  onCancel={() => setShowNovaPagar(false)} onSave={criarContaPagar} />
              )}

              {contasPagarVisiveis.length === 0 && !showNovaPagar && (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhuma conta cadastrada.</div>
              )}

              <div className="space-y-2">
                {contasPagarVisiveis.map(c => {
                  const atrasado = !c.pago && vencido(c.vencimento)
                  const hoje_ = !c.pago && vencendoHoje(c.vencimento)
                  const editando = editandoPagar?.id === c.id
                  if (editando) return (
                    <FormContaUI key={c.id} form={formEditPagar} onChange={setFormEditPagar} titulo="Editar conta" saving={saving}
                      onCancel={() => setEditandoPagar(null)} onSave={salvarEditPagar} />
                  )
                  return (
                    <div key={c.id} className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${c.pago ? 'border-gray-100 opacity-60' : atrasado ? 'border-red-200' : 'border-gray-200'}`}>
                      <button onClick={() => togglePago(c)} className="shrink-0">
                        {c.pago ? <CheckCircle2 size={22} className="text-green-500" /> : <Circle size={22} className="text-gray-300 hover:text-gray-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`font-medium ${c.pago ? 'line-through text-gray-400' : 'text-gray-800'}`}>{c.titulo}</p>
                          {c.recorrente && <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><RepeatIcon size={11} />{FREQ_LABELS[c.frequencia_recorrencia ?? 'mensal']}</span>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {c.vencimento ? (
                            <span className={atrasado ? 'text-red-500 font-medium' : hoje_ ? 'text-orange-500 font-medium' : ''}>
                              {atrasado ? '⚠ Venceu ' : hoje_ ? '⚡ Vence hoje ' : 'Vence '}{fmtData(c.vencimento)}
                            </span>
                          ) : 'Sem vencimento'}
                        </p>
                      </div>
                      <p className={`font-semibold text-sm shrink-0 ${c.pago ? 'text-gray-400' : 'text-red-600'}`}>{fmt(c.valor)}</p>
                      <button onClick={() => { setEditandoPagar(c); setFormEditPagar({ titulo: c.titulo, valor: String(c.valor), vencimento: c.vencimento ?? '', recorrente: c.recorrente, frequencia_recorrencia: c.frequencia_recorrencia ?? 'mensal' }); setShowModalEditPagar(true) }}
                        className="text-gray-300 hover:text-brand-500 transition-colors shrink-0">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deletarContaPagar(c)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* CONTAS A RECEBER */}
          {viewFinancas === 'lista' && subFinancas === 'receber' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">Contas a receber</h2>
                  <p className="text-xs text-gray-400">Pendente: {fmt(totalReceber)}</p>
                </div>
                <button onClick={() => { setShowNovaReceber(true); setEditandoReceber(null) }} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                  <Plus size={15} /> Nova conta
                </button>
              </div>

              {showNovaReceber && (
                <FormContaUI form={formReceber} onChange={setFormReceber} titulo="Nova conta a receber" saving={saving}
                  onCancel={() => setShowNovaReceber(false)} onSave={criarContaReceber} />
              )}

              {contasReceberVisiveis.length === 0 && !showNovaReceber && (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhuma conta cadastrada.</div>
              )}

              <div className="space-y-2">
                {contasReceberVisiveis.map(c => {
                  const atrasado = !c.recebido && vencido(c.vencimento)
                  const hoje_ = !c.recebido && vencendoHoje(c.vencimento)
                  const editando = editandoReceber?.id === c.id
                  if (editando) return (
                    <FormContaUI key={c.id} form={formEditReceber} onChange={setFormEditReceber} titulo="Editar conta" saving={saving}
                      onCancel={() => setEditandoReceber(null)} onSave={salvarEditReceber} />
                  )
                  return (
                    <div key={c.id} className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${c.recebido ? 'border-gray-100 opacity-60' : atrasado ? 'border-orange-200' : 'border-gray-200'}`}>
                      <button onClick={() => toggleRecebido(c)} className="shrink-0">
                        {c.recebido ? <CheckCircle2 size={22} className="text-green-500" /> : <Circle size={22} className="text-gray-300 hover:text-gray-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`font-medium ${c.recebido ? 'line-through text-gray-400' : 'text-gray-800'}`}>{c.titulo}</p>
                          {c.recorrente && <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><RepeatIcon size={11} />{FREQ_LABELS[c.frequencia_recorrencia ?? 'mensal']}</span>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {c.vencimento ? (
                            <span className={atrasado ? 'text-orange-500 font-medium' : hoje_ ? 'text-orange-500 font-medium' : ''}>
                              {atrasado ? '⚠ Previsto ' : hoje_ ? '⚡ Hoje ' : 'Previsto '}{fmtData(c.vencimento)}
                            </span>
                          ) : 'Sem data prevista'}
                        </p>
                      </div>
                      <p className={`font-semibold text-sm shrink-0 ${c.recebido ? 'text-gray-400' : 'text-green-600'}`}>{fmt(c.valor)}</p>
                      <button onClick={() => { setEditandoReceber(c); setFormEditReceber({ titulo: c.titulo, valor: String(c.valor), vencimento: c.vencimento ?? '', recorrente: c.recorrente, frequencia_recorrencia: c.frequencia_recorrencia ?? 'mensal' }); setShowModalEditReceber(true) }}
                        className="text-gray-300 hover:text-brand-500 transition-colors shrink-0">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deletarContaReceber(c)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* RATEIOS */}
          {viewFinancas === 'lista' && subFinancas === 'rateios' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-800 flex-1">Rateios</h2>
                <select
                  value={ordenacaoRateios}
                  onChange={e => setOrdenacaoRateios(e.target.value as OrdenacaoRateios)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-brand-400">
                  <option value="data_desc">Data ↓</option>
                  <option value="data_asc">Data ↑</option>
                  <option value="valor_desc">Maior valor</option>
                  <option value="valor_asc">Menor valor</option>
                  <option value="nome_asc">Nome A→Z</option>
                  <option value="pendentes">Pendentes primeiro</option>
                </select>
                <button onClick={() => setShowNovoRateio(true)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                  <Plus size={15} /> Novo rateio
                </button>
              </div>

              {showNovoRateio && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-gray-800">Novo rateio</h3>
                    <button onClick={() => setShowNovoRateio(false)}><X size={16} className="text-gray-400" /></button>
                  </div>
                  <input className="input" placeholder="Título *" value={formRateio.titulo} onChange={e => setFormRateio(f => ({ ...f, titulo: e.target.value }))} autoFocus />

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Itens (opcional — some várias compras no mesmo rateio)</label>
                    {formRateio.itens.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {formRateio.itens.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                            <span className="text-sm text-gray-700">{item.descricao}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-600">{fmt(item.valor)}</span>
                              <button onClick={() => removerItemRateio(idx)} className="text-gray-300 hover:text-red-400">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 pt-1">
                          <span className="text-xs font-semibold text-gray-500">Total dos itens</span>
                          <span className="text-sm font-bold text-brand-600">{fmt(formRateio.itens.reduce((s, i) => s + i.valor, 0))}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input className="input flex-1" placeholder="Ex: Pizza, Refri, Sobremesa..." value={novoItem.descricao}
                        onChange={e => setNovoItem(i => ({ ...i, descricao: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarItemRateio() } }} />
                      <input className="input w-28" type="number" min="0" step="0.01" placeholder="0,00" value={novoItem.valor}
                        onChange={e => setNovoItem(i => ({ ...i, valor: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarItemRateio() } }} />
                      <button onClick={adicionarItemRateio} disabled={!novoItem.descricao.trim() || !novoItem.valor} className="btn-secondary px-3 shrink-0">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Valor total (R$) *</label>
                      <input className="input" type="number" min="0" step="0.01" placeholder="0,00"
                        value={formRateio.itens.length > 0 ? formRateio.itens.reduce((s, i) => s + i.valor, 0).toFixed(2) : formRateio.valor_total}
                        disabled={formRateio.itens.length > 0}
                        onChange={e => setFormRateio(f => ({ ...f, valor_total: e.target.value }))} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Nº de {formRateio.tipo_divisao === 'casal' ? 'casais' : 'pessoas'} *</label>
                      <input className="input" type="number" min="1" placeholder="Ex: 4" value={formRateio.quantidade_pessoas} onChange={e => setFormRateio(f => ({ ...f, quantidade_pessoas: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data</label>
                    <input type="date" className="input" value={formRateio.data} onChange={e => setFormRateio(f => ({ ...f, data: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Divisão</label>
                    <div className="flex gap-2">
                      {(['pessoa', 'casal'] as const).map(tipo => (
                        <button key={tipo} type="button"
                          onClick={() => setFormRateio(f => ({ ...f, tipo_divisao: tipo }))}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${formRateio.tipo_divisao === tipo ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                          {tipo === 'pessoa' ? 'Por pessoa' : 'Por casal'}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {formRateio.tipo_divisao === 'casal' ? 'Inclui: Guilherme e Vitória (como casal)' : 'Inclui: Guilherme, Vitória (individualmente)'}
                    </p>
                  </div>
                  <input className="input" placeholder="Chave Pix (opcional)" value={formRateio.chave_pix} onChange={e => setFormRateio(f => ({ ...f, chave_pix: e.target.value }))} />
                  {(() => {
                    const valorTotalCalc = formRateio.itens.length > 0 ? formRateio.itens.reduce((s, i) => s + i.valor, 0) : parseFloat(formRateio.valor_total || '0')
                    if (!valorTotalCalc || !formRateio.quantidade_pessoas || parseInt(formRateio.quantidade_pessoas) <= 0) return null
                    return (
                      <p className="text-sm text-brand-600 font-medium">
                        Valor por {formRateio.tipo_divisao === 'casal' ? 'casal' : 'pessoa'}: {fmt(valorTotalCalc / parseInt(formRateio.quantidade_pessoas))}
                      </p>
                    )
                  })()}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowNovoRateio(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={criarRateio} disabled={saving || !formRateio.titulo.trim() || (formRateio.itens.length === 0 && !formRateio.valor_total) || !formRateio.quantidade_pessoas} className="btn-primary flex-1 text-sm">Criar</button>
                  </div>
                </div>
              )}

              {rateios.length === 0 && !showNovoRateio && (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhum rateio ainda.</div>
              )}

              {(() => {
                const sorted = [...rateios].sort((a, b) => {
                  const totalPagoA = (a.participantes ?? []).reduce((s, p) => s + (p.valor_pago ?? 0), 0)
                  const totalPagoB = (b.participantes ?? []).reduce((s, p) => s + (p.valor_pago ?? 0), 0)
                  const quitadoA = totalPagoA >= a.valor_total
                  const quitadoB = totalPagoB >= b.valor_total
                  switch (ordenacaoRateios) {
                    case 'data_asc':  return (a.data ?? a.created_at).localeCompare(b.data ?? b.created_at)
                    case 'data_desc': return (b.data ?? b.created_at).localeCompare(a.data ?? a.created_at)
                    case 'valor_desc': return b.valor_total - a.valor_total
                    case 'valor_asc': return a.valor_total - b.valor_total
                    case 'nome_asc': return a.titulo.localeCompare(b.titulo)
                    case 'pendentes': return (quitadoA === quitadoB ? 0 : quitadoA ? 1 : -1)
                    default: return 0
                  }
                })
                const pendentes = sorted.filter(r => (r.participantes ?? []).reduce((s, p) => s + (p.valor_pago ?? 0), 0) < r.valor_total)
                const concluidos = sorted.filter(r => (r.participantes ?? []).reduce((s, p) => s + (p.valor_pago ?? 0), 0) >= r.valor_total)
                const renderRateio = (r: Rateio) => {
                const valorPessoa = r.valor_total / r.quantidade_pessoas
                const participantes = r.participantes ?? []
                const totalPago = participantes.reduce((s, p) => s + (p.valor_pago ?? 0), 0)
                const faltaTotal = r.valor_total - totalPago
                const aberto = rateioAberto === r.id
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setRateioAberto(aberto ? null : r.id)}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{r.titulo}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-500 flex-wrap">
                          {r.data && <span>{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                          {r.data && <span>•</span>}
                          <span>Total: <span className="font-medium text-gray-700">{fmt(r.valor_total)}</span></span>
                          <span>•</span><span>{r.quantidade_pessoas} {r.tipo_divisao === 'casal' ? 'casais' : 'pessoas'}</span>
                          <span>•</span><span>{fmt(valorPessoa)}/{r.tipo_divisao === 'casal' ? 'casal' : 'pessoa'}</span>
                        </div>
                        <div className="mt-1">
                          <span className={`text-xs font-medium ${faltaTotal <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                            {faltaTotal <= 0 ? '✓ Quitado' : `Falta receber: ${fmt(faltaTotal)}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button onClick={e => { e.stopPropagation(); mensagemWhatsApp(r) }}
                          className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors">
                          <MessageCircle size={16} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deletarRateio(r.id) }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                        {aberto ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </div>
                    {aberto && (
                      <div className="border-t border-gray-100 p-4 space-y-3">
                        {r.chave_pix && <p className="text-sm text-gray-500">🔑 Pix: <span className="font-medium text-gray-700">{r.chave_pix}</span></p>}
                        {r.itens && r.itens.length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                            <p className="text-xs font-semibold text-gray-500 mb-1">Itens</p>
                            {r.itens.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{item.descricao}</span>
                                <span className="font-medium text-gray-700">{fmt(item.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Recebido: {fmt(totalPago)}</span>
                            <span>Falta: {fmt(Math.max(0, faltaTotal))}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (totalPago / r.valor_total) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {participantes.map(p => {
                            const falta = valorPessoa - (p.valor_pago ?? 0)
                            const quitou = falta <= 0.01
                            return (
                              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${quitou ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                                  <p className="text-xs text-gray-500">
                                    Pago: {fmt(p.valor_pago ?? 0)} · {quitou ? <span className="text-green-600 font-medium">Quitado</span> : <span className="text-orange-600">Falta: {fmt(falta)}</span>}
                                  </p>
                                </div>
                                {editandoPago[p.id] !== undefined ? (
                                  <div className="flex items-center gap-1">
                                    <input className="input text-xs py-1 w-24" type="number" min="0" step="0.01"
                                      value={editandoPago[p.id]}
                                      onChange={e => setEditandoPago(prev => ({ ...prev, [p.id]: e.target.value }))} autoFocus />
                                    <button onClick={() => salvarPagamento(p.id, r.id)} className="text-xs px-2 py-1 bg-brand-600 text-white rounded-lg">OK</button>
                                    <button onClick={() => setEditandoPago(prev => { const n = { ...prev }; delete n[p.id]; return n })} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => setEditandoPago(prev => ({ ...prev, [p.id]: String(valorPessoa.toFixed(2)) }))}
                                      className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">
                                      Registrar pagamento
                                    </button>
                                    <button onClick={() => deletarParticipante(p.id)} className="p-1 text-gray-400 hover:text-red-500"><X size={13} /></button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-2">
                          <input className="input text-sm flex-1" placeholder={`Nome do ${r.tipo_divisao === 'casal' ? 'casal' : 'participante'}`}
                            value={novoNome[r.id] ?? ''}
                            onChange={e => setNovoNome(prev => ({ ...prev, [r.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && adicionarParticipante(r.id)} />
                          <button onClick={() => adicionarParticipante(r.id)} disabled={!novoNome[r.id]?.trim()} className="btn-primary text-sm px-3 py-1.5">
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
                }
                return (
                  <>
                    {pendentes.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Em andamento ({pendentes.length})</p>
                        {pendentes.map(r => renderRateio(r))}
                      </div>
                    )}
                    {concluidos.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Concluídos ({concluidos.length})</p>
                        {concluidos.map(r => renderRateio(r))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ===== ROTINAS ===== */}
      {aba === 'rotinas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Rotinas de hoje</h2>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadRotinas} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><RefreshCw size={15} /></button>
              <button onClick={() => setShowNovaRotina(true)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                <Plus size={15} /> Nova rotina
              </button>
            </div>
          </div>
          {showNovaRotina && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-gray-800">Nova rotina</h3>
                <button onClick={() => setShowNovaRotina(false)}><X size={16} className="text-gray-400" /></button>
              </div>
              <input className="input" placeholder="Título *" value={formRotina.titulo} onChange={e => setFormRotina(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              <select className="input" value={formRotina.frequencia} onChange={e => setFormRotina(f => ({ ...f, frequencia: e.target.value }))}>
                <option value="diaria">Diária</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
              <div className="flex gap-2">
                <button onClick={() => setShowNovaRotina(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={criarRotina} disabled={saving || !formRotina.titulo.trim()} className="btn-primary flex-1 text-sm">Criar</button>
              </div>
            </div>
          )}
          {rotinas.length === 0 && !showNovaRotina && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma rotina cadastrada.</div>
          )}
          <div className="space-y-2">
            {rotinas.map(r => {
              const reg = registros.find(reg => reg.rotina_id === r.id)
              const concluida = reg?.concluida ?? false
              return (
                <div key={r.id} className={`flex items-center gap-3 p-4 rounded-xl border bg-white transition-colors ${concluida ? 'border-green-100 bg-green-50' : 'border-gray-200'}`}>
                  <button onClick={() => toggleRotina(r.id)} className="shrink-0">
                    {concluida ? <CheckCircle2 size={22} className="text-green-500" /> : <Circle size={22} className="text-gray-300 hover:text-gray-400" />}
                  </button>
                  <div className="flex-1">
                    <p className={`font-medium ${concluida ? 'line-through text-gray-400' : 'text-gray-800'}`}>{r.titulo}</p>
                    <p className="text-xs text-gray-400">{freqLabel[r.frequencia]}</p>
                  </div>
                  <button onClick={() => deletarRotina(r.id)} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== DOCUMENTOS ===== */}
      {aba === 'documentos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Documentos</h2>
            <button onClick={() => setShowNovoDoc(true)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
              <Plus size={15} /> Novo
            </button>
          </div>
          {showNovoDoc && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-gray-800">Novo documento</h3>
                <button onClick={() => setShowNovoDoc(false)}><X size={16} className="text-gray-400" /></button>
              </div>
              <input className="input" placeholder="Título *" value={formDoc.titulo} onChange={e => setFormDoc(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              <input className="input" placeholder="Categoria (ex: Imóvel, Veículo, Saúde)" value={formDoc.categoria} onChange={e => setFormDoc(f => ({ ...f, categoria: e.target.value }))} />
              <textarea className="input resize-none" rows={2} placeholder="Descrição / observações" value={formDoc.descricao} onChange={e => setFormDoc(f => ({ ...f, descricao: e.target.value }))} />
              <input className="input" placeholder="Link (opcional)" value={formDoc.url} onChange={e => setFormDoc(f => ({ ...f, url: e.target.value }))} />
              <div className="flex gap-2">
                <button onClick={() => setShowNovoDoc(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={criarDocumento} disabled={saving || !formDoc.titulo.trim()} className="btn-primary flex-1 text-sm">Salvar</button>
              </div>
            </div>
          )}
          {documentos.length === 0 && !showNovoDoc && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum documento cadastrado.</div>
          )}
          {(() => {
            const cats = [...new Set(documentos.map(d => d.categoria ?? 'Geral'))].sort()
            return cats.map(cat => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{cat}</p>
                <div className="space-y-2">
                  {documentos.filter(d => (d.categoria ?? 'Geral') === cat).map(d => (
                    <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 group">
                      <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-brand-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800">{d.titulo}</p>
                        {d.descricao && <p className="text-sm text-gray-500 mt-0.5">{d.descricao}</p>}
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline mt-1">
                            <ExternalLink size={11} /> Abrir link
                          </a>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">
                          {profilesMap[d.criado_por] ?? 'Desconhecido'} • {new Date(d.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button onClick={() => deletarDocumento(d.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </div>
  )
}

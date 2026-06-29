import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { Landmark, Link2, AlertCircle, Lock, Eye, CheckCircle2, Settings, X, ChevronLeft, ChevronRight, ChevronDown, Plus, CreditCard, Upload, Banknote, Printer, FileText, Receipt, Wallet, AlertTriangle, CalendarOff, CalendarDays, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcularConferenciaCartao, calcularConferenciaDinheiro, calcularVendaPixTotal, LinhaConferencia, LinhaDinheiro, LOJAS_CARTAO } from '../lib/conferenciaCartaoHelpers'
import { calcularSaldoDepoisPagamentos, buscarNotasPixDosDias } from '../lib/saldoDiaHelper'
import { sincronizarLancamentos } from '../lib/financeiroSyncHelper'

type LinhaDinheiroEditavel = LinhaDinheiro & { fechamentoCaixa: number; diferenca: number; deposito: number; contaDeposito: string }

type NotaFiscal = {
  id: string
  loja: string
  valor: number
  forma_pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro'
}

const FORMAS_PAGAMENTO_NOTA: { valor: NotaFiscal['forma_pagamento']; label: string }[] = [
  { valor: 'pix', label: 'PIX' },
  { valor: 'credito', label: 'Cartão de crédito' },
  { valor: 'debito', label: 'Cartão de débito' },
  { valor: 'dinheiro', label: 'Dinheiro' },
]

type DespesaLoja = {
  id: string
  loja: string
  valor: number
  descricao: string
}

type ErroCaixa = {
  id: string
  loja: string
  valor: number
  operadora: string
}

type DinheiroGuardado = {
  id: string
  origem: string
  valor: number
  destino: 'deposito' | 'escritorio'
  conta_deposito: string | null
  automatico: boolean
}
const ESCRITORIO = 'Escritório'

const MICROSOFT_CLIENT_ID = '631a503a-8b6c-4215-ab27-3f09c1e16bc7'

type Lancamento = {
  id?: string
  data_dig: string | null
  empresa: string | null
  vencimento: string | null
  fornecedor: string | null
  nota: string | null
  descricao: string | null
  pagamento: string | null
  valor: number | null
  tipo: string | null
  observacao: string | null
  pagar_em?: string | null
  pago?: boolean
  juros?: number | null
  importado_de_id?: string | null
  importado_de_dia?: string | null
  dia?: string
  fechado?: boolean
  redirecionado_para?: string | null
  aprovado?: boolean
  origem_manual?: boolean
}

const BANCOS = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB', 'PESSOAL BRADESCO', 'PESSOAL ITAU', 'DINHEIRO']
const CONTAS_DEPOSITO = ['FAPS ITAU', 'FAPS SICOOB']
const CONTAS_SALDO_INICIAL = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB']

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

const fmt = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
// Algumas faturas vêm da planilha como data (a célula foi formatada como data por engano) — o Excel
// guarda isso como um número serial (dias desde 1899-12-30). Detecta esse padrão e mostra mês/ano
// em vez do número cru.
function fmtNota(nota: string | null | undefined): string {
  if (!nota) return ''
  const texto = String(nota).trim()
  if (!/^\d{4,6}$/.test(texto)) return texto
  const serial = Number(texto)
  const ms = (serial - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return texto
  return d.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}
function hojeYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somarDias(dataISO: string, n: number) {
  const d = new Date(dataISO + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ehFimDeSemana(dataISO: string): boolean {
  const diaSemana = new Date(dataISO + 'T12:00:00').getDay()
  return diaSemana === 0 || diaSemana === 6
}
// Último dia em que o banco efetivamente moveu dinheiro antes de `dia` — pula fins de semana e feriados.
// Numa segunda-feira, isso é sexta; se sexta for feriado, vai pro dia útil anterior a ela.
function diaUtilAnterior(dia: string, feriados: Set<string>): string {
  let atual = somarDias(dia, -1)
  while (ehFimDeSemana(atual) || feriados.has(atual)) atual = somarDias(atual, -1)
  return atual
}
// Todos os dias "pulados" entre o último dia útil e hoje (fim de semana, feriado) — as vendas desses
// dias (ex.: sábado) ainda precisam ser somadas no pix, mesmo que o saldo bancário só reflita na sexta.
function diasNaoUteisEntre(diaUtil: string, dia: string): string[] {
  const dias: string[] = []
  let atual = somarDias(diaUtil, 1)
  while (atual < dia) { dias.push(atual); atual = somarDias(atual, 1) }
  return dias
}

export default function Financeiro() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { dia } = useParams<{ dia: string }>()
  const diaSelecionado = dia ?? hojeYYYYMMDD()

  const [conectado, setConectado] = useState<boolean | null>(null)
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [pastaOnedrive, setPastaOnedrive] = useState('')
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [fechado, setFechado] = useState<{ fechado_em: string } | null>(null)
  const [lancamentosSalvos, setLancamentosSalvos] = useState<Lancamento[]>([])
  const [previa, setPrevia] = useState<Lancamento[] | null>(null)
  const [ordenacao, setOrdenacao] = useState<{ campo: keyof Lancamento; asc: boolean } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const sincronizandoRef = useRef(false)
  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState('')
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [editBufferSaldo, setEditBufferSaldo] = useState<Record<string, string>>({})
  const [editBufferValor, setEditBufferValor] = useState<Record<string, string>>({})
  const [editBufferJuros, setEditBufferJuros] = useState<Record<string, string>>({})
  const [showNovoLancamento, setShowNovoLancamento] = useState(false)
  const [novoLancamento, setNovoLancamento] = useState({
    empresa: '', fornecedor: '', nota: '', descricao: '', valor: '', tipo: '', pagar_em: '',
  })
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [showImportar, setShowImportar] = useState(false)
  const [feriados, setFeriados] = useState<Set<string>>(new Set())
  const [marcandoFeriado, setMarcandoFeriado] = useState(false)
  const [apagandoDuplicados, setApagandoDuplicados] = useState(false)
  const [diaImportar, setDiaImportar] = useState('')
  const [lancamentosImportar, setLancamentosImportar] = useState<Lancamento[] | null>(null)
  const [buscandoImportar, setBuscandoImportar] = useState(false)
  const [movendoId, setMovendoId] = useState<string | null>(null)
  const [showCP, setShowCP] = useState(false)
  const [abrirNotas, setAbrirNotas] = useState(false)
  const [abrirDespesas, setAbrirDespesas] = useState(false)
  const [abrirErros, setAbrirErros] = useState(false)
  const [dataMover, setDataMover] = useState('')
  const [resumoDiaMover, setResumoDiaMover] = useState<{ total: number; itens: Lancamento[] } | null>(null)
  const [carregandoResumoMover, setCarregandoResumoMover] = useState(false)
  const [conferenciaSalva, setConferenciaSalva] = useState<LinhaConferencia[] | null>(null)
  const [conferenciaPreviaCalc, setConferenciaPreviaCalc] = useState<LinhaConferencia[] | null>(null)
  const [dinheiroSalvo, setDinheiroSalvo] = useState<LinhaDinheiroEditavel[] | null>(null)
  const [dinheiroPreviaCalc, setDinheiroPreviaCalc] = useState<LinhaDinheiroEditavel[] | null>(null)
  const [arquivoSistema, setArquivoSistema] = useState<File | null>(null)
  const [arquivoRede, setArquivoRede] = useState<File | null>(null)
  const [calculandoConferencia, setCalculandoConferencia] = useState(false)
  const [arrastandoSobre, setArrastandoSobre] = useState<'sistema' | 'rede' | null>(null)
  const [erroConferencia, setErroConferencia] = useState('')
  const [vendaPixPreviaCalc, setVendaPixPreviaCalc] = useState<number | null>(null)
  const [vendaPixSalva, setVendaPixSalva] = useState<number | null>(null)
  const [saldoEsperadoOntem, setSaldoEsperadoOntem] = useState<number | null>(null)
  const [notasPixOntem, setNotasPixOntem] = useState(0)
  const [carregandoVerificacaoSaldo, setCarregandoVerificacaoSaldo] = useState(false)
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([])
  const [novaNota, setNovaNota] = useState<{ loja: string; valor: string; forma_pagamento: NotaFiscal['forma_pagamento'] }>({
    loja: LOJAS_CARTAO[0].nome, valor: '', forma_pagamento: 'credito',
  })
  const [despesasLoja, setDespesasLoja] = useState<DespesaLoja[]>([])
  const [novaDespesa, setNovaDespesa] = useState({ loja: LOJAS_CARTAO[0].nome, valor: '', descricao: '' })
  const [errosCaixa, setErrosCaixa] = useState<ErroCaixa[]>([])
  const [novoErro, setNovoErro] = useState({ loja: LOJAS_CARTAO[0].nome, valor: '', operadora: '' })
  const [dinheiroGuardado, setDinheiroGuardado] = useState<DinheiroGuardado[]>([])
  const [abrirDinheiroGuardado, setAbrirDinheiroGuardado] = useState(false)
  const [novoDinheiroGuardado, setNovoDinheiroGuardado] = useState<{ origem: string; valor: string; destino: 'deposito' | 'escritorio'; conta_deposito: string }>({
    origem: LOJAS_CARTAO[0].nome, valor: '', destino: 'deposito', conta_deposito: CONTAS_DEPOSITO[0],
  })

  useEffect(() => { carregarConfig(); carregarFeriados() }, [])
  useEffect(() => {
    carregarDia(); carregarSaldos(); carregarConferencia(); carregarNotasFiscais(); carregarDespesasLoja(); carregarErrosCaixa(); carregarDinheiroGuardado(); carregarVerificacaoSaldo()
  }, [diaSelecionado])

  useEffect(() => {
    document.body.classList.toggle('modo-impressao-cp', showCP)
    return () => document.body.classList.remove('modo-impressao-cp')
  }, [showCP])

  async function atualizarAprovado(id: string, valor: boolean) {
    setLancamentosSalvos(prev => prev.map(l => l.id === id ? { ...l, aprovado: valor } : l))
    await supabase.from('financeiro_lancamentos').update({ aprovado: valor }).eq('id', id)
  }

  async function carregarErrosCaixa() {
    const { data } = await supabase.from('financeiro_erros_caixa').select('*').eq('dia', diaSelecionado).order('criado_em')
    setErrosCaixa(data ?? [])
  }

  async function adicionarErroCaixa() {
    const valor = parseValorBR(novoErro.valor)
    if (!valor || !novoErro.operadora.trim()) return
    await supabase.from('financeiro_erros_caixa').insert({
      dia: diaSelecionado, loja: novoErro.loja, valor, operadora: novoErro.operadora.trim(), usuario_id: user!.id,
    })
    setNovoErro(e => ({ ...e, valor: '', operadora: '' }))
    await carregarErrosCaixa()
  }

  async function removerErroCaixa(id: string) {
    await supabase.from('financeiro_erros_caixa').delete().eq('id', id)
    await carregarErrosCaixa()
  }

  function erroPorLoja(loja: string) {
    return errosCaixa.filter(e => e.loja === loja).reduce((s, e) => s + e.valor, 0)
  }

  async function carregarDinheiroGuardado() {
    const { data } = await supabase.from('financeiro_dinheiro_guardado').select('*').eq('dia', diaSelecionado).order('criado_em')
    setDinheiroGuardado(data ?? [])
  }

  async function adicionarDinheiroGuardado() {
    const valor = parseValorBR(novoDinheiroGuardado.valor)
    if (!valor) return
    const ehEscritorio = novoDinheiroGuardado.origem === ESCRITORIO
    await supabase.from('financeiro_dinheiro_guardado').insert({
      dia: diaSelecionado, origem: novoDinheiroGuardado.origem, valor,
      destino: ehEscritorio ? novoDinheiroGuardado.destino : 'deposito',
      conta_deposito: ehEscritorio && novoDinheiroGuardado.destino === 'deposito' ? novoDinheiroGuardado.conta_deposito : null,
      usuario_id: user!.id,
    })
    setNovoDinheiroGuardado(d => ({ ...d, valor: '' }))
    await carregarDinheiroGuardado()
  }

  async function removerDinheiroGuardado(id: string) {
    await supabase.from('financeiro_dinheiro_guardado').delete().eq('id', id)
    await carregarDinheiroGuardado()
  }

  // Dinheiro guardado de uma loja específica (dias anteriores) que agora entra junto no depósito de hoje.
  function dinheiroGuardadoPorLoja(loja: string) {
    return dinheiroGuardado.filter(d => d.origem === loja).reduce((s, d) => s + d.valor, 0)
  }
  // Dinheiro guardado no escritório que o usuário decidiu depositar agora numa conta específica.
  function dinheiroGuardadoEscritorioPorConta(conta: string) {
    return dinheiroGuardado.filter(d => d.origem === ESCRITORIO && d.destino === 'deposito' && d.conta_deposito === conta).reduce((s, d) => s + d.valor, 0)
  }
  // Dinheiro guardado no escritório que continua lá, só pra exibição (não entra em conta nenhuma).
  function dinheiroGuardadoNoEscritorio() {
    return dinheiroGuardado.filter(d => d.origem === ESCRITORIO && d.destino === 'escritorio').reduce((s, d) => s + d.valor, 0)
  }

  async function carregarDespesasLoja() {
    const { data } = await supabase.from('financeiro_despesas_loja').select('*').eq('dia', diaSelecionado).order('criado_em')
    setDespesasLoja(data ?? [])
  }

  async function adicionarDespesaLoja() {
    const valor = parseValorBR(novaDespesa.valor)
    if (!valor || !novaDespesa.descricao.trim()) return
    await supabase.from('financeiro_despesas_loja').insert({
      dia: diaSelecionado, loja: novaDespesa.loja, valor, descricao: novaDespesa.descricao.trim(), usuario_id: user!.id,
    })
    setNovaDespesa(d => ({ ...d, valor: '', descricao: '' }))
    await carregarDespesasLoja()
  }

  async function removerDespesaLoja(id: string) {
    await supabase.from('financeiro_despesas_loja').delete().eq('id', id)
    await carregarDespesasLoja()
  }

  function despesaPorLoja(loja: string) {
    return despesasLoja.filter(d => d.loja === loja).reduce((s, d) => s + d.valor, 0)
  }

  async function carregarNotasFiscais() {
    const { data } = await supabase.from('financeiro_notas_fiscais').select('*').eq('dia', diaSelecionado).order('criado_em')
    setNotasFiscais(data ?? [])
  }

  async function adicionarNotaFiscal() {
    const valor = parseValorBR(novaNota.valor)
    if (!valor) return
    await supabase.from('financeiro_notas_fiscais').insert({
      dia: diaSelecionado, loja: novaNota.loja, valor, forma_pagamento: novaNota.forma_pagamento, usuario_id: user!.id,
    })
    setNovaNota(n => ({ ...n, valor: '' }))
    await carregarNotasFiscais()
    if (novaNota.forma_pagamento === 'pix') await carregarVerificacaoSaldo()
  }

  async function removerNotaFiscal(id: string) {
    const nota = notasFiscais.find(n => n.id === id)
    await supabase.from('financeiro_notas_fiscais').delete().eq('id', id)
    await carregarNotasFiscais()
    if (nota?.forma_pagamento === 'pix') await carregarVerificacaoSaldo()
  }

  function notasPorLoja(loja: string) {
    const doDia = notasFiscais.filter(n => n.loja === loja)
    const cartao = doDia.filter(n => n.forma_pagamento === 'credito' || n.forma_pagamento === 'debito').reduce((s, n) => s + n.valor, 0)
    const dinheiro = doDia.filter(n => n.forma_pagamento === 'dinheiro').reduce((s, n) => s + n.valor, 0)
    return { cartao, dinheiro }
  }

  async function carregarConferencia() {
    setConferenciaPreviaCalc(null)
    setDinheiroPreviaCalc(null)
    setArquivoSistema(null)
    setArquivoRede(null)
    setErroConferencia('')
    setVendaPixPreviaCalc(null)
    const [{ data: cartao }, { data: dinheiro }, { data: pix }] = await Promise.all([
      supabase.from('financeiro_conferencia_cartao').select('*').eq('dia', diaSelecionado),
      supabase.from('financeiro_conferencia_dinheiro').select('*').eq('dia', diaSelecionado),
      supabase.from('financeiro_venda_pix').select('valor').eq('dia', diaSelecionado).maybeSingle(),
    ])
    if (cartao && cartao.length > 0) {
      setConferenciaSalva(cartao.map(r => ({ loja: r.loja, vendaCartao: r.venda_cartao, recebidoRede: r.recebido_rede, taxaRede: r.taxa_rede, diferenca: r.diferenca })))
    } else {
      setConferenciaSalva(null)
    }
    if (dinheiro && dinheiro.length > 0) {
      setDinheiroSalvo(dinheiro.map(r => ({ loja: r.loja, vendaDinheiro: r.venda_dinheiro, fechamentoCaixa: r.fechamento_caixa, diferenca: r.diferenca, deposito: r.deposito, contaDeposito: r.conta_deposito ?? (LOJAS_CARTAO.find(lj => lj.nome === r.loja)?.contaDepositoPadrao ?? 'FAPS ITAU') })))
    } else {
      setDinheiroSalvo(null)
    }
    setVendaPixSalva(pix?.valor ?? null)
  }

  // Dias cujo PIX precisa ser somado pra verificar o saldo inicial de `diaSelecionado`: o último dia
  // útil anterior (cujo "saldo depois dos pagamentos" nunca incluiu o próprio pix dele) + qualquer fim
  // de semana/feriado pulado no meio (ex.: sábado, que tem venda mas nenhum saldo digitado pra ele).
  function diasParaVerificarPix(): string[] {
    const diaUtil = diaUtilAnterior(diaSelecionado, feriados)
    return [diaUtil, ...diasNaoUteisEntre(diaUtil, diaSelecionado)]
  }

  async function carregarVerificacaoSaldo() {
    setCarregandoVerificacaoSaldo(true)
    const diaUtil = diaUtilAnterior(diaSelecionado, feriados)
    // As notas fiscais ficam salvas no dia em que são lançadas (hoje, diaSelecionado), não no dia
    // da venda em si — diferente do pix do relatório do sistema, que é filtrado pela data da venda.
    const [saldoOntem, notasPix] = await Promise.all([
      calcularSaldoDepoisPagamentos(diaUtil, ['FAPS SICOOB', 'FAPS ITAU']),
      buscarNotasPixDosDias([diaSelecionado]),
    ])
    setSaldoEsperadoOntem((saldoOntem['FAPS SICOOB'] ?? 0) + (saldoOntem['FAPS ITAU'] ?? 0))
    setNotasPixOntem(notasPix)
    setCarregandoVerificacaoSaldo(false)
  }

  async function calcularConferencia() {
    if (!arquivoSistema || !arquivoRede) { setErroConferencia('Selecione os dois relatórios.'); return }
    setCalculandoConferencia(true)
    setErroConferencia('')
    try {
      // Mesma lista de dias usada na verificação do pix: numa segunda-feira isso cobre
      // sexta + sábado + domingo, não só o dia literalmente anterior (que pode ter sido
      // um dia sem vendas, como domingo).
      const diasVenda = diasParaVerificarPix()
      const [linhasCartao, linhasDinheiro, totalPix] = await Promise.all([
        calcularConferenciaCartao(arquivoSistema, arquivoRede, diasVenda),
        calcularConferenciaDinheiro(arquivoSistema, diasVenda),
        calcularVendaPixTotal(arquivoSistema, diasVenda),
      ])
      setVendaPixPreviaCalc(totalPix)
      setConferenciaPreviaCalc(linhasCartao)
      setDinheiroPreviaCalc(linhasDinheiro.map(l => ({ ...l, fechamentoCaixa: 0, diferenca: 0 - l.vendaDinheiro, deposito: 0, contaDeposito: LOJAS_CARTAO.find(lj => lj.nome === l.loja)?.contaDepositoPadrao ?? 'FAPS ITAU' })))
    } catch (err) {
      setErroConferencia('Não consegui ler os arquivos. Confere se são os relatórios certos. ' + String(err))
    }
    setCalculandoConferencia(false)
  }

  function atualizarFechamentoCaixa(loja: string, valorStr: string, salvar: boolean) {
    const fechamentoCaixa = parseValorBR(valorStr)
    const deposito = Math.ceil(fechamentoCaixa)
    const atualizar = (lista: LinhaDinheiroEditavel[]) => lista.map(l => l.loja === loja ? { ...l, fechamentoCaixa, diferenca: fechamentoCaixa - l.vendaDinheiro, deposito } : l)
    if (salvar && dinheiroSalvo) {
      const novaLista = atualizar(dinheiroSalvo)
      setDinheiroSalvo(novaLista)
      const linha = novaLista.find(l => l.loja === loja)!
      supabase.from('financeiro_conferencia_dinheiro').update({ fechamento_caixa: linha.fechamentoCaixa, diferenca: linha.diferenca, deposito: linha.deposito }).eq('dia', diaSelecionado).eq('loja', loja)
    } else if (dinheiroPreviaCalc) {
      setDinheiroPreviaCalc(atualizar(dinheiroPreviaCalc))
    }
  }

  function atualizarDeposito(loja: string, valorStr: string, salvar: boolean) {
    const deposito = parseValorBR(valorStr)
    const atualizar = (lista: LinhaDinheiroEditavel[]) => lista.map(l => l.loja === loja ? { ...l, deposito } : l)
    if (salvar && dinheiroSalvo) {
      const novaLista = atualizar(dinheiroSalvo)
      setDinheiroSalvo(novaLista)
      supabase.from('financeiro_conferencia_dinheiro').update({ deposito }).eq('dia', diaSelecionado).eq('loja', loja)
    } else if (dinheiroPreviaCalc) {
      setDinheiroPreviaCalc(atualizar(dinheiroPreviaCalc))
    }
  }

  function atualizarLinhaCartao(loja: string, campo: 'vendaCartao' | 'recebidoRede' | 'taxaRede', valorStr: string, salvar: boolean) {
    const valor = parseValorBR(valorStr)
    const atualizar = (lista: LinhaConferencia[]) => lista.map(l => {
      if (l.loja !== loja) return l
      const atualizada = { ...l, [campo]: valor }
      atualizada.diferenca = (atualizada.recebidoRede + atualizada.taxaRede) - atualizada.vendaCartao
      return atualizada
    })
    if (salvar && conferenciaSalva) {
      const novaLista = atualizar(conferenciaSalva)
      setConferenciaSalva(novaLista)
      const linha = novaLista.find(l => l.loja === loja)!
      supabase.from('financeiro_conferencia_cartao').update({
        venda_cartao: linha.vendaCartao, recebido_rede: linha.recebidoRede, taxa_rede: linha.taxaRede, diferenca: linha.diferenca,
      }).eq('dia', diaSelecionado).eq('loja', loja)
    } else if (conferenciaPreviaCalc) {
      setConferenciaPreviaCalc(atualizar(conferenciaPreviaCalc))
    }
  }

  function atualizarContaDeposito(loja: string, contaDeposito: string, salvar: boolean) {
    const atualizar = (lista: LinhaDinheiroEditavel[]) => lista.map(l => l.loja === loja ? { ...l, contaDeposito } : l)
    if (salvar && dinheiroSalvo) {
      const novaLista = atualizar(dinheiroSalvo)
      setDinheiroSalvo(novaLista)
      supabase.from('financeiro_conferencia_dinheiro').update({ conta_deposito: contaDeposito }).eq('dia', diaSelecionado).eq('loja', loja)
    } else if (dinheiroPreviaCalc) {
      setDinheiroPreviaCalc(atualizar(dinheiroPreviaCalc))
    }
  }

  async function fecharConferenciaCartao() {
    // Sempre regrava a lista inteira a partir do que está na tela agora (conferenciaSalva, se já existir
    // e estiver sendo editada de novo, ou conferenciaPreviaCalc na primeira vez). Isso evita perder edições
    // recentes que ainda não tinham sido confirmadas no banco quando o botão de fechar foi clicado.
    const linhasCartao = conferenciaSalva ?? conferenciaPreviaCalc
    if (!linhasCartao) return
    await supabase.from('financeiro_conferencia_cartao').delete().eq('dia', diaSelecionado)
    await supabase.from('financeiro_conferencia_cartao').insert(
      linhasCartao.map(l => ({
        dia: diaSelecionado, loja: l.loja,
        venda_cartao: l.vendaCartao, recebido_rede: l.recebidoRede, taxa_rede: l.taxaRede, diferenca: l.diferenca,
        usuario_id: user!.id,
      }))
    )
    // O dinheiro pode continuar em aberto (os valores vão sendo recebidos aos poucos),
    // mas já salva o que tiver preenchido até agora pra não perder o trabalho.
    const linhasDinheiro = dinheiroSalvo ?? dinheiroPreviaCalc
    if (linhasDinheiro) {
      await supabase.from('financeiro_conferencia_dinheiro').delete().eq('dia', diaSelecionado)
      await supabase.from('financeiro_conferencia_dinheiro').insert(
        linhasDinheiro.map(l => ({
          dia: diaSelecionado, loja: l.loja,
          venda_dinheiro: l.vendaDinheiro, fechamento_caixa: l.fechamentoCaixa, diferenca: l.diferenca, deposito: l.deposito, conta_deposito: l.contaDeposito,
          usuario_id: user!.id,
        }))
      )
    }
    const totalPix = vendaPixSalva ?? vendaPixPreviaCalc
    if (totalPix != null) {
      await supabase.from('financeiro_venda_pix').upsert(
        { dia: diaSelecionado, valor: totalPix, usuario_id: user!.id },
        { onConflict: 'dia' }
      )
    }
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIA_CARTAO_FECHADA', valor: 1, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIA_CARTAO_FECHADA: 1 }))
    setArquivoSistema(null)
    setArquivoRede(null)
    setConferenciaPreviaCalc(null)
    setDinheiroPreviaCalc(null)
    await carregarConferencia()
    await carregarVerificacaoSaldo()
  }

  async function fecharConferenciaDinheiro() {
    // Mesma lógica do cartão: regrava a partir do estado atual da tela, não confia que
    // edições feitas há poucos segundos já tenham sido confirmadas no banco.
    const linhasDinheiro = dinheiroSalvo ?? dinheiroPreviaCalc
    if (linhasDinheiro) {
      await supabase.from('financeiro_conferencia_dinheiro').delete().eq('dia', diaSelecionado)
      await supabase.from('financeiro_conferencia_dinheiro').insert(
        linhasDinheiro.map(l => ({
          dia: diaSelecionado, loja: l.loja,
          venda_dinheiro: l.vendaDinheiro, fechamento_caixa: l.fechamentoCaixa, diferenca: l.diferenca, deposito: l.deposito, conta_deposito: l.contaDeposito,
          usuario_id: user!.id,
        }))
      )

      // O que devia ter sido depositado (fechamento de caixa + qualquer dinheiro já guardado de antes)
      // e não foi (depósito zerado ou a menor) vira "dinheiro guardado" automaticamente pro dia seguinte,
      // pra entrar de novo na conta do depósito de lá. Se de novo não for depositado, soma e empurra
      // mais um dia — e assim por diante, até ser de fato depositado.
      const diaSeguinte = somarDias(diaSelecionado, 1)
      await supabase.from('financeiro_dinheiro_guardado').delete().eq('dia', diaSeguinte).eq('automatico', true)
      const novasGuardadas = linhasDinheiro
        .map(l => ({ origem: l.loja, valor: Math.round((l.fechamentoCaixa + dinheiroGuardadoPorLoja(l.loja) - l.deposito) * 100) / 100 }))
        .filter(g => g.valor > 0.01)
      if (novasGuardadas.length > 0) {
        await supabase.from('financeiro_dinheiro_guardado').insert(novasGuardadas.map(g => ({
          dia: diaSeguinte, origem: g.origem, valor: g.valor, destino: 'deposito', conta_deposito: null,
          usuario_id: user!.id, automatico: true,
        })))
      }
    }
    const totalPix = vendaPixSalva ?? vendaPixPreviaCalc
    if (totalPix != null) {
      await supabase.from('financeiro_venda_pix').upsert(
        { dia: diaSelecionado, valor: totalPix, usuario_id: user!.id },
        { onConflict: 'dia' }
      )
    }
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIA_DINHEIRO_FECHADA', valor: 1, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIA_DINHEIRO_FECHADA: 1 }))
    setDinheiroPreviaCalc(null)
    await carregarConferencia()
    await carregarVerificacaoSaldo()
  }

  async function reabrirConferenciaCartao() {
    // Só libera a edição — os valores salvos continuam lá, não apaga nada.
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIA_CARTAO_FECHADA', valor: 0, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIA_CARTAO_FECHADA: 0 }))
  }

  async function reabrirConferenciaDinheiro() {
    // Só libera a edição — os valores salvos continuam lá, não apaga nada. O rollover automático
    // pro dia seguinte fica desatualizado até fechar de novo, então remove pra não duplicar/ficar errado.
    const diaSeguinte = somarDias(diaSelecionado, 1)
    await supabase.from('financeiro_dinheiro_guardado').delete().eq('dia', diaSeguinte).eq('automatico', true)
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIA_DINHEIRO_FECHADA', valor: 0, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIA_DINHEIRO_FECHADA: 0 }))
  }

  async function carregarSaldos() {
    setEditBufferSaldo({})
    const { data } = await supabase.from('financeiro_saldos').select('campo, valor').eq('dia', diaSelecionado)
    const mapa: Record<string, number> = {}
    for (const row of data ?? []) mapa[row.campo] = row.valor
    setSaldos(mapa)
  }

  async function salvarSaldo(campo: string, valorStr: string) {
    const valor = parseValorBR(valorStr)
    setSaldos(prev => ({ ...prev, [campo]: valor }))
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo, valor, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
  }

  const saldoInicialFechado = (saldos['SALDO_INICIAL_FECHADO'] ?? 0) === 1
  // Compatibilidade com dias antigos que usavam uma única trava combinada: se ela estiver marcada,
  // tratamos as duas conferências como fechadas mesmo sem a trava nova específica.
  const conferenciaCartaoFechada = (saldos['CONFERENCIA_CARTAO_FECHADA'] ?? saldos['CONFERENCIAS_FECHADAS'] ?? 0) === 1
  const conferenciaDinheiroFechada = (saldos['CONFERENCIA_DINHEIRO_FECHADA'] ?? saldos['CONFERENCIAS_FECHADAS'] ?? 0) === 1
  const conferenciasAmbasFechadas = conferenciaCartaoFechada && conferenciaDinheiroFechada

  async function fecharSaldoInicial() {
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'SALDO_INICIAL_FECHADO', valor: 1, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, SALDO_INICIAL_FECHADO: 1 }))
  }

  async function reabrirSaldoInicial() {
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'SALDO_INICIAL_FECHADO', valor: 0, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, SALDO_INICIAL_FECHADO: 0 }))
  }

  async function carregarConfig() {
    const [{ data: tok }, { data: cfg }] = await Promise.all([
      supabase.from('microsoft_tokens').select('usuario_id').eq('usuario_id', user!.id).maybeSingle(),
      supabase.from('financeiro_config').select('arquivo_url, pasta_onedrive').eq('usuario_id', user!.id).maybeSingle(),
    ])
    setConectado(!!tok)
    setArquivoUrl(cfg?.arquivo_url ?? '')
    setPastaOnedrive(cfg?.pasta_onedrive ?? '')
    if (!cfg?.arquivo_url) setMostrarConfig(true)
  }

  async function carregarFeriados() {
    const { data } = await supabase.from('financeiro_feriados').select('dia')
    setFeriados(new Set((data ?? []).map(r => r.dia)))
  }

  async function marcarFeriado() {
    setMarcandoFeriado(true)
    const ehFeriado = feriados.has(diaSelecionado)
    if (ehFeriado) {
      await supabase.from('financeiro_feriados').delete().eq('dia', diaSelecionado)
    } else {
      await supabase.from('financeiro_feriados').insert({ dia: diaSelecionado, usuario_id: user!.id })
    }
    await carregarFeriados()
    await visualizar()
    setMarcandoFeriado(false)
  }

  async function apagarDuplicados() {
    setApagandoDuplicados(true)
    const { data, error } = await supabase.rpc('apagar_lancamentos_duplicados')
    setApagandoDuplicados(false)
    if (error) { alert('Erro ao apagar duplicados: ' + error.message); return }
    alert(`${data ?? 0} lançamento(s) duplicado(s) apagado(s).`)
    await carregarDia()
  }

  async function carregarDia() {
    setPrevia(null)
    setErro('')
    const { data } = await supabase.from('financeiro_lancamentos').select('*').eq('dia', diaSelecionado).order('fornecedor')
    const fechados = (data ?? []).filter(r => r.fechado)
    if (fechados.length > 0) {
      setLancamentosSalvos(fechados)
      setFechado({ fechado_em: fechados[0].criado_em })
    } else {
      setLancamentosSalvos([])
      setFechado(null)
      const naoFechados = data ?? []
      if (naoFechados.length > 0) setPrevia(naoFechados)
    }
  }

  function conectarMicrosoft() {
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      redirect_uri: 'https://g-gomes.vercel.app/auth/microsoft/callback',
      response_type: 'code',
      response_mode: 'query',
      prompt: 'consent',
      scope: 'Files.ReadWrite offline_access User.Read',
    })
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  }

  async function salvarArquivo() {
    await supabase.from('financeiro_config').upsert({ usuario_id: user!.id, arquivo_url: arquivoUrl, pasta_onedrive: pastaOnedrive, updated_at: new Date().toISOString() }, { onConflict: 'usuario_id' })
  }

  async function visualizar() {
    if (fechado || sincronizandoRef.current) return
    if (!arquivoUrl) { setErro('Configure o link da planilha primeiro.'); setMostrarConfig(true); return }
    sincronizandoRef.current = true
    setSincronizando(true)
    setErro('')
    const { erro } = await sincronizarLancamentos(user!.id, arquivoUrl)
    if (erro) {
      setErro(erro)
      sincronizandoRef.current = false
      setSincronizando(false)
      return
    }
    sincronizandoRef.current = false
    setSincronizando(false)
    await carregarDia()
  }

  async function fecharDia() {
    if (!previa) return
    setFechando(true)
    // Busca os não-fechados direto do banco nesse instante, em vez de confiar no array `previa`
    // já carregado na tela — evita fechar com base em dados desatualizados (ex.: lançamento
    // adicionado por outra pessoa enquanto a tela estava aberta) e deixar sobra pra trás.
    const { data: todosAtuais } = await supabase.from('financeiro_lancamentos').select('*').eq('dia', diaSelecionado).eq('fechado', false)
    // Lançamentos já redirecionados pra outro dia não fazem mais parte dos pagamentos de hoje —
    // fechá-los de novo só criaria uma cópia fechada duplicada e inútil. Deixa como estão.
    const atuais = (todosAtuais ?? []).filter(l => !l.redirecionado_para)
    const idsAtuais = atuais.map(l => l.id)
    if (idsAtuais.length > 0) {
      await supabase.from('financeiro_lancamentos').delete().in('id', idsAtuais)
    }
    await supabase.from('financeiro_lancamentos').insert(
      atuais.map(({ id, criado_em, ...l }: any) => ({ ...l, dia: diaSelecionado, usuario_id: user!.id, fechado: true }))
    )
    setFechando(false)
    setPrevia(null)
    await carregarDia()
  }

  async function reabrirDia() {
    if (!confirm('Reabrir esse dia? Os lançamentos voltam a ficar editáveis (nada é apagado).')) return
    const norm = (v: unknown) => String(v ?? '').trim()
    const chave = (l: any) => `${norm(l.empresa)}|${norm(l.fornecedor)}|${norm(l.nota)}|${norm(l.vencimento)}`

    const [{ data: fechados }, { data: abertos }] = await Promise.all([
      supabase.from('financeiro_lancamentos').select('*').eq('dia', diaSelecionado).eq('fechado', true),
      supabase.from('financeiro_lancamentos').select('*').eq('dia', diaSelecionado).eq('fechado', false),
    ])
    if (!fechados || fechados.length === 0) {
      alert('Nenhum lançamento fechado encontrado. Pode ser bloqueio de permissão (RLS) na tabela financeiro_lancamentos.')
      return
    }
    const abertosPorChave = new Map((abertos ?? []).map(a => [chave(a), a]))

    // Reabre um por um em vez de um update só: se dois lançamentos tiverem a mesma identidade
    // (empresa/fornecedor/nota/vencimento) não dá pra ter os dois em aberto no mesmo dia.
    // Quando isso acontece, a cópia ABERTA já é a que representa o estado atual (pode até ter sido
    // referenciada por um lançamento movido pra outro dia via importado_de_id) — então quem é
    // descartado é a cópia FECHADA, que é a sobra redundante criada por engano num fechamento
    // anterior (ex.: um lançamento que já tinha sido redirecionado, mas acabou sendo fechado de novo).
    const bloqueados: string[] = []
    for (const l of fechados) {
      const conflito = abertosPorChave.get(chave(l))
      if (conflito) {
        await supabase.from('financeiro_lancamentos').delete().eq('id', l.id)
        continue
      }
      const { error } = await supabase.from('financeiro_lancamentos').update({ fechado: false }).eq('id', l.id)
      if (error) {
        if ((error as any).code === '23505') {
          bloqueados.push(`${l.empresa ?? ''} ${l.fornecedor ?? ''} (${fmt(l.valor)})`.trim())
        } else {
          alert('Erro ao reabrir: ' + error.message)
          return
        }
      }
    }
    if (bloqueados.length > 0) {
      alert(`Reabri os demais, mas ${bloqueados.length} lançamento(s) não puderam ser reabertos porque já existe outro igual em aberto nesse dia:\n\n${bloqueados.join('\n')}\n\nApague um dos duplicados (em "Apagar duplicados") e tente reabrir de novo.`)
    }
    await carregarDia()
  }

  async function adicionarLancamento() {
    if (!novoLancamento.empresa.trim() && !novoLancamento.fornecedor.trim()) return
    setSalvandoNovo(true)
    await supabase.from('financeiro_lancamentos').insert({
      dia: diaSelecionado,
      vencimento: diaSelecionado,
      empresa: novoLancamento.empresa.trim() || null,
      fornecedor: novoLancamento.fornecedor.trim() || null,
      nota: novoLancamento.nota.trim() || null,
      descricao: novoLancamento.descricao.trim() || null,
      valor: parseValorBR(novoLancamento.valor),
      tipo: novoLancamento.tipo || null,
      pagar_em: novoLancamento.pagar_em || null,
      usuario_id: user!.id,
      origem_manual: true,
    })
    setSalvandoNovo(false)
    setShowNovoLancamento(false)
    setNovoLancamento({ empresa: '', fornecedor: '', nota: '', descricao: '', valor: '', tipo: '', pagar_em: '' })
    await carregarDia()
  }

  async function deletarLancamento(l: Lancamento) {
    if (!l.id) return
    if (!confirm(`Apagar o lançamento "${l.empresa ?? l.fornecedor}"? Essa ação não pode ser desfeita.`)) return
    await supabase.from('financeiro_lancamentos').delete().eq('id', l.id)
    await carregarDia()
  }

  async function buscarLancamentosImportar() {
    if (!diaImportar) return
    setBuscandoImportar(true)
    const { data } = await supabase.from('financeiro_lancamentos').select('*').eq('dia', diaImportar).is('importado_de_id', null).order('fornecedor')
    setLancamentosImportar(data ?? [])
    setBuscandoImportar(false)
  }

  async function importarLancamento(original: Lancamento) {
    await supabase.from('financeiro_lancamentos').insert({
      dia: diaSelecionado,
      vencimento: original.vencimento,
      empresa: original.empresa,
      fornecedor: original.fornecedor,
      nota: original.nota,
      descricao: original.descricao,
      valor: original.valor,
      tipo: original.tipo,
      pagar_em: original.pagar_em,
      pago: original.pago,
      importado_de_id: original.id,
      importado_de_dia: original.dia ?? diaImportar,
      usuario_id: user!.id,
    })
    await carregarDia()
  }

  async function carregarResumoDiaMover(dia: string) {
    setCarregandoResumoMover(true)
    const { data } = await supabase.from('financeiro_lancamentos').select('*').eq('dia', dia)
    const itens = (data ?? []).filter((l: Lancamento) => !l.redirecionado_para)
    const total = itens.reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
    setResumoDiaMover({ total, itens })
    setCarregandoResumoMover(false)
  }

  useEffect(() => {
    if (!dataMover) { setResumoDiaMover(null); return }
    carregarResumoDiaMover(dataMover)
  }, [dataMover])

  async function cancelarRedirecionamento(original: Lancamento) {
    if (!original.id || !original.redirecionado_para) return
    if (!confirm(`Trazer "${original.empresa ?? original.fornecedor}" de volta pra ${fmtData(diaSelecionado)}?`)) return
    await supabase.from('financeiro_lancamentos').delete().eq('importado_de_id', original.id).eq('dia', original.redirecionado_para)
    await supabase.from('financeiro_lancamentos').update({ redirecionado_para: null }).eq('id', original.id)
    await carregarDia()
  }

  async function moverParaOutroDia(original: Lancamento, novaData: string) {
    if (!original.id || !novaData) return
    await supabase.from('financeiro_lancamentos').insert({
      dia: novaData,
      vencimento: original.vencimento,
      empresa: original.empresa,
      fornecedor: original.fornecedor,
      nota: original.nota,
      descricao: original.descricao,
      valor: original.valor,
      tipo: original.tipo,
      pagar_em: original.pagar_em,
      pago: original.pago,
      importado_de_id: original.id,
      importado_de_dia: original.dia ?? diaSelecionado,
      usuario_id: user!.id,
    })
    await supabase.from('financeiro_lancamentos').update({ redirecionado_para: novaData }).eq('id', original.id)
    setMovendoId(null)
    setDataMover('')
    setResumoDiaMover(null)
    await carregarDia()
  }

  async function atualizarCampo(id: string, campo: 'pagar_em' | 'pago' | 'valor' | 'juros', valor: string | boolean | number) {
    const linha = lancamentosSalvos.find(l => l.id === id) ?? previa?.find(l => l.id === id)
    setLancamentosSalvos(prev => prev.map(l => l.id === id ? { ...l, [campo]: valor } : l))
    setPrevia(prev => prev ? prev.map(l => l.id === id ? { ...l, [campo]: valor } : l) : prev)
    await supabase.from('financeiro_lancamentos').update({ [campo]: valor }).eq('id', id)
    if (campo === 'pago' && linha?.importado_de_id) {
      await supabase.from('financeiro_lancamentos').update({ pago: valor }).eq('id', linha.importado_de_id)
    }
  }

  if (conectado === null) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  const diaDaSemana = new Date(diaSelecionado + 'T12:00:00').getDay()
  if (diaDaSemana === 0 || diaDaSemana === 6) {
    let proximaSegunda = diaSelecionado
    while (new Date(proximaSegunda + 'T12:00:00').getDay() !== 1) proximaSegunda = somarDias(proximaSegunda, 1)
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Financeiro</h1>
        </div>
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-600 mb-3">Vencimentos de sábado e domingo são agrupados na segunda-feira seguinte. Esse dia não tem lançamentos próprios.</p>
          <button onClick={() => navigate(`/financeiro/${proximaSegunda}`)} className="btn-primary">
            Ir para segunda-feira ({new Date(proximaSegunda + 'T12:00:00').toLocaleDateString('pt-BR')})
          </button>
        </div>
      </div>
    )
  }

  const listaExibida = fechado ? lancamentosSalvos : previa
  const total = listaExibida?.filter(l => !l.redirecionado_para).reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0) ?? 0

  function alternarOrdenacao(campo: keyof Lancamento) {
    setOrdenacao(prev => prev?.campo === campo ? { campo, asc: !prev.asc } : { campo, asc: true })
  }

  function thOrdenavel(campo: keyof Lancamento, label: string, alinhar: 'left' | 'right' = 'left') {
    const ativo = ordenacao?.campo === campo
    return (
      <th className={`p-2 ${alinhar === 'right' ? 'text-right' : 'text-left'}`}>
        <button onClick={() => alternarOrdenacao(campo)}
          className={`flex items-center gap-1 hover:text-gray-900 transition-colors ${alinhar === 'right' ? 'ml-auto' : ''} ${ativo ? 'text-gray-900 font-semibold' : ''}`}>
          {label}
          <ChevronDown size={11} className={`transition-transform shrink-0 ${ativo && !ordenacao!.asc ? 'rotate-180' : ''} ${ativo ? 'opacity-100' : 'opacity-30'}`} />
        </button>
      </th>
    )
  }

  // Lista usada só na tabela em tela — as outras contas (total, pagamentos por conta, CP etc.)
  // continuam usando listaExibida na ordem original, pra não depender de como o usuário ordenou a tela.
  const listaExibidaOrdenada = (() => {
    if (!ordenacao || !listaExibida) return listaExibida
    const { campo, asc } = ordenacao
    const copia = [...listaExibida]
    copia.sort((a, b) => {
      const va = a[campo] as any
      const vb = b[campo] as any
      if (va == null && vb == null) return 0
      if (va == null) return asc ? -1 : 1
      if (vb == null) return asc ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va
      return asc ? String(va).localeCompare(String(vb), 'pt-BR') : String(vb).localeCompare(String(va), 'pt-BR')
    })
    return copia
  })()

  function pagamentosPorConta(conta: string) {
    return (listaExibida ?? []).filter(l => l.pagar_em === conta && !l.redirecionado_para).reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
  }
  function recebidoRedeTotal() {
    const linhas = conferenciaSalva ?? conferenciaPreviaCalc
    return (linhas ?? []).reduce((s, l) => s + l.recebidoRede, 0)
  }
  function depositoPorConta(conta: string) {
    const linhas = dinheiroSalvo ?? dinheiroPreviaCalc
    const depositoLojas = (linhas ?? []).filter(l => l.contaDeposito === conta)
      .reduce((s, l) => s + l.deposito + dinheiroGuardadoPorLoja(l.loja), 0)
    return depositoLojas + dinheiroGuardadoEscritorioPorConta(conta)
  }

  // "Loja 01" representa o fluxo que antes passava pela FAPS ITAU: saldo inicial + depósitos - pagamentos.
  // O recebido da rede (lojas físicas) agora vai direto para a FAPS SICOOB, então não entra mais nessa conta.
  const transfItauParaSicoob = (saldos['FAPS ITAU'] ?? 0) + depositoPorConta('FAPS ITAU') - pagamentosPorConta('FAPS ITAU')
  const transfSicoobParaGGomes = pagamentosPorConta('G GOMES SICOOB') - (saldos['G GOMES SICOOB'] ?? 0)
  const transfSicoobParaTS = pagamentosPorConta('TS SICOOB') - (saldos['TS SICOOB'] ?? 0)
  const transfSicoobParaPessoalBradesco = pagamentosPorConta('PESSOAL BRADESCO')
  const transfSicoobParaPessoalItau = pagamentosPorConta('PESSOAL ITAU')
  const saqueSicoobDinheiro = pagamentosPorConta('DINHEIRO')

  const saldoSicoobAntes = (saldos['FAPS SICOOB'] ?? 0) + transfItauParaSicoob + recebidoRedeTotal()
    - transfSicoobParaGGomes - transfSicoobParaTS - transfSicoobParaPessoalBradesco - transfSicoobParaPessoalItau - saqueSicoobDinheiro

  const CONTAS_RESUMO = ['FAPS ITAU', 'FAPS SICOOB', 'G GOMES SICOOB', 'TS SICOOB', 'PESSOAL BRADESCO', 'PESSOAL ITAU', 'DINHEIRO']

  // Cada loja com recebido na rede entra como uma transferência direta para a FAPS SICOOB.
  const transferenciasRedeLista = (conferenciaSalva ?? conferenciaPreviaCalc ?? [])
    .filter(l => l.recebidoRede > 0)
    .map(l => ({ de: l.loja, para: 'FAPS SICOOB', valor: l.recebidoRede }))

  const transferenciasLista = [
    { de: '01 - DEPOSITO 180', para: 'FAPS SICOOB', valor: transfItauParaSicoob },
    ...transferenciasRedeLista,
    { de: 'FAPS SICOOB', para: 'G GOMES SICOOB', valor: transfSicoobParaGGomes },
    { de: 'FAPS SICOOB', para: 'TS SICOOB', valor: transfSicoobParaTS },
    { de: 'FAPS SICOOB', para: 'PESSOAL BRADESCO', valor: transfSicoobParaPessoalBradesco },
    { de: 'FAPS SICOOB', para: 'PESSOAL ITAU', valor: transfSicoobParaPessoalItau },
  ].filter(t => t.valor > 0)

  // Cor por conta de origem: lojas 01-08 (e FAPS ITAU) em laranja, FAPS SICOOB em verde,
  // G GOMES SICOOB em roxo, TS SICOOB em amarelo. Demais contas ficam num cinza neutro.
  // `bg`/`text` = versão suave (pra preencher linhas inteiras). `headerBg`/`headerText` = versão forte (pra títulos/cabeçalhos).
  function corConta(nome: string): { bg: string; text: string; bar: string; headerBg: string; headerText: string } {
    if (/^0[1-8]\b/.test(nome) || nome === 'FAPS ITAU') return { bg: 'bg-orange-50', text: 'text-orange-800', bar: 'bg-orange-400', headerBg: 'bg-orange-500', headerText: 'text-white' }
    if (nome === 'FAPS SICOOB') return { bg: 'bg-green-50', text: 'text-green-800', bar: 'bg-green-400', headerBg: 'bg-green-600', headerText: 'text-white' }
    if (nome === 'G GOMES SICOOB') return { bg: 'bg-purple-50', text: 'text-purple-800', bar: 'bg-purple-400', headerBg: 'bg-purple-600', headerText: 'text-white' }
    if (nome === 'TS SICOOB') return { bg: 'bg-yellow-50', text: 'text-yellow-800', bar: 'bg-yellow-400', headerBg: 'bg-yellow-400', headerText: 'text-yellow-950' }
    if (nome === 'Não pagar') return { bg: 'bg-gray-100', text: 'text-gray-500', bar: 'bg-gray-300', headerBg: 'bg-gray-400', headerText: 'text-white' }
    return { bg: 'bg-slate-50', text: 'text-slate-700', bar: 'bg-slate-400', headerBg: 'bg-slate-500', headerText: 'text-white' }
  }

  const pagamentosCPAgrupados = (() => {
    const lista = (listaExibida ?? []).filter(l => !l.redirecionado_para)
    const ordemContas = [...BANCOS, '']
    const grupos: { conta: string; itens: Lancamento[] }[] = []
    for (const conta of ordemContas) {
      const itens = lista.filter(l => (l.pagar_em ?? '') === conta).sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0))
      if (itens.length > 0) grupos.push({ conta: conta || 'Não pagar', itens })
    }
    return grupos
  })()

  // Lançamentos adiados para outro dia: mostramos só os dados do lançamento + a nova data,
  // sem informação de pagamento (pagar_em/tipo), já que não vão ser pagos nesta data.
  const pagamentosAdiados = (listaExibida ?? []).filter(l => !!l.redirecionado_para)
    .sort((a, b) => (a.redirecionado_para ?? '').localeCompare(b.redirecionado_para ?? ''))

  function saldoAntesPagamentos(conta: string): number {
    if (conta === 'FAPS ITAU') return (saldos['FAPS ITAU'] ?? 0) + depositoPorConta('FAPS ITAU') - transfItauParaSicoob
    if (conta === 'FAPS SICOOB') return saldoSicoobAntes
    if (conta === 'G GOMES SICOOB') return (saldos['G GOMES SICOOB'] ?? 0) + transfSicoobParaGGomes
    if (conta === 'TS SICOOB') return (saldos['TS SICOOB'] ?? 0) + transfSicoobParaTS
    if (conta === 'PESSOAL BRADESCO') return (saldos['PESSOAL BRADESCO'] ?? 0) + transfSicoobParaPessoalBradesco
    if (conta === 'PESSOAL ITAU') return (saldos['PESSOAL ITAU'] ?? 0) + transfSicoobParaPessoalItau
    if (conta === 'DINHEIRO') return saqueSicoobDinheiro
    return 0
  }

  function saldoDepoisPagamentos(conta: string): number {
    return saldoAntesPagamentos(conta) - pagamentosPorConta(conta)
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Financeiro</h1>
          <p className="text-sm text-gray-400">Contas a pagar com vencimento no dia, vindas da planilha</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/financeiro')} title="Ver calendário"
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <CalendarDays size={14} /> Calendário
          </button>
          <button onClick={() => setMostrarConfig(true)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {!conectado ? (
        <div className="card p-6 max-w-lg">
          <p className="text-sm text-gray-600 mb-4">Conecte sua conta Microsoft pra buscar os lançamentos automaticamente do OneDrive.</p>
          <button onClick={conectarMicrosoft} className="btn-primary flex items-center gap-2">
            <Link2 size={15} /> Conectar Microsoft
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button onClick={() => navigate(`/financeiro/${somarDias(diaSelecionado, -1)}`)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={16} />
            </button>
            <input type="date" className="input w-44" value={diaSelecionado} onChange={e => navigate(`/financeiro/${e.target.value}`)} />
            <button onClick={() => navigate(`/financeiro/${somarDias(diaSelecionado, 1)}`)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => navigate(`/financeiro/${hojeYYYYMMDD()}`)} className="text-xs text-brand-600 hover:underline ml-1">Hoje</button>

            <button onClick={marcarFeriado} disabled={marcandoFeriado}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 ${
                feriados.has(diaSelecionado) ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              <CalendarOff size={13} />
              {marcandoFeriado ? 'Atualizando...' : feriados.has(diaSelecionado) ? 'Feriado (clique pra desmarcar)' : 'Feriado'}
            </button>

            <div className="flex-1" />

            <button onClick={apagarDuplicados} disabled={apagandoDuplicados} className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {apagandoDuplicados ? 'Apagando...' : 'Apagar duplicados'}
            </button>

            {!fechado && (
              <button onClick={visualizar} disabled={sincronizando} className="btn-secondary flex items-center gap-2">
                <Eye size={15} className={sincronizando ? 'animate-pulse' : ''} /> {sincronizando ? 'Atualizando...' : 'Atualizar lançamentos'}
              </button>
            )}
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-6 flex items-center gap-2">
              <AlertCircle size={15} /> {erro}
            </div>
          )}

          {/* Saldo inicial */}
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-orange-800">Saldo inicial (saldo final do dia anterior)</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-orange-700 font-medium whitespace-nowrap">
                  Total em banco: {fmt(CONTAS_SALDO_INICIAL.reduce((s, c) => s + (saldos[c] ?? 0), 0))}
                </p>
                {saldoInicialFechado ? (
                  <>
                    <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1 rounded-lg whitespace-nowrap flex items-center gap-1">
                      <CheckCircle2 size={12} /> Fechado
                    </span>
                    <button onClick={reabrirSaldoInicial} className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap">
                      Reabrir
                    </button>
                  </>
                ) : (
                  <button onClick={fecharSaldoInicial} className="text-xs px-2.5 py-1 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors whitespace-nowrap">
                    Fechar saldo inicial
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CONTAS_SALDO_INICIAL.map(conta => {
                const key = conta
                return (
                  <div key={conta}>
                    <label className="block text-[11px] text-orange-700 mb-1">{conta}</label>
                    <input type="text" inputMode="decimal" disabled={saldoInicialFechado}
                      className="no-spin w-full text-right border border-orange-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-orange-400 disabled:bg-orange-100/60 disabled:text-gray-500"
                      value={editBufferSaldo[key] ?? (saldos[key] ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      onChange={e => setEditBufferSaldo(b => ({ ...b, [key]: e.target.value }))}
                      onBlur={e => {
                        salvarSaldo(key, e.target.value)
                        setEditBufferSaldo(b => { const n = { ...b }; delete n[key]; return n })
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                  </div>
                )
              })}
              <div>
                <label className="block text-[11px] text-orange-700 mb-1">Aplicado (FAPS Sicoob)</label>
                <input type="text" inputMode="decimal" disabled={saldoInicialFechado}
                  className="no-spin w-full text-right border border-orange-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-orange-400 disabled:bg-orange-100/60 disabled:text-gray-500"
                  value={editBufferSaldo['APLICADO_FAPS_SICOOB'] ?? (saldos['APLICADO_FAPS_SICOOB'] ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => setEditBufferSaldo(b => ({ ...b, APLICADO_FAPS_SICOOB: e.target.value }))}
                  onBlur={e => {
                    salvarSaldo('APLICADO_FAPS_SICOOB', e.target.value)
                    setEditBufferSaldo(b => { const n = { ...b }; delete n['APLICADO_FAPS_SICOOB']; return n })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              </div>
            </div>

            {/* Verificação do saldo inicial: a soma do PIX de ontem (sistema + notas) deveria ser exatamente
                a diferença entre (saldo inicial hoje) e (saldo final de ontem), somando FAPS ITAU + FAPS SICOOB
                juntas — assim não importa pra qual das duas o PIX caiu, o total bate igual. */}
            {(() => {
              const vendaPix = vendaPixSalva ?? vendaPixPreviaCalc
              if (carregandoVerificacaoSaldo) {
                return <p className="text-xs text-orange-600 mt-3">Calculando verificação do saldo...</p>
              }
              if (saldoEsperadoOntem == null) return null
              const pixTotal = (vendaPix ?? 0) + notasPixOntem
              const saldoInicialHoje = (saldos['FAPS SICOOB'] ?? 0) + (saldos['FAPS ITAU'] ?? 0)
              const diferencaSaldo = saldoInicialHoje - saldoEsperadoOntem
              const sobra = diferencaSaldo - pixTotal
              const bateu = Math.abs(sobra) < 1
              const passou = !bateu && sobra > 0
              const cor = bateu ? 'green' : passou ? 'yellow' : 'red'
              const corClasses = {
                green: 'bg-green-50 border-green-200 text-green-700',
                yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
                red: 'bg-red-50 border-red-200 text-red-700',
              }[cor]
              return (
                <div className={`mt-3 rounded-lg border p-3 ${corClasses}`}>
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    {bateu ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    Verificação do saldo inicial (FAPS ITAU + FAPS SICOOB) {bateu ? '— bateu' : passou ? '— passou' : '— faltou'}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div><span className="block opacity-70">Saldo inicial hoje</span><span className="font-semibold">{fmt(saldoInicialHoje)}</span></div>
                    <div><span className="block opacity-70">Pix esperado</span><span className="font-semibold">{vendaPix != null ? fmt(pixTotal) : '— calcule a conferência'}</span></div>
                    <div><span className="block opacity-70">Diferença</span><span className="font-semibold">{fmt(sobra)}</span></div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Conferência de cartão (Rede) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5"><CreditCard size={15} /> Conferência rede (cartão) — venda de ontem</h2>
                {diasParaVerificarPix().length > 1 && (
                  <p className="text-[11px] text-blue-600 mt-0.5">
                    Considerando {diasParaVerificarPix().map(d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')).join(', ')} (fim de semana/feriado no meio)
                  </p>
                )}
              </div>
            </div>

            {!conferenciaSalva && (
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] text-blue-800 mb-1">Relatório do sistema (PDV)</label>
                  <label
                    onDragOver={e => { e.preventDefault(); setArrastandoSobre('sistema') }}
                    onDragLeave={() => setArrastandoSobre(null)}
                    onDrop={e => {
                      e.preventDefault()
                      setArrastandoSobre(null)
                      const f = e.dataTransfer.files?.[0]
                      if (f) setArquivoSistema(f)
                    }}
                    className={`flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-3 bg-white text-xs text-gray-600 cursor-pointer transition-colors ${arrastandoSobre === 'sistema' ? 'border-blue-500 bg-blue-100' : 'border-blue-300 hover:bg-blue-50'}`}>
                    <Upload size={13} />
                    <span className="truncate">{arquivoSistema?.name ?? 'Arraste o arquivo aqui ou clique para escolher'}</span>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setArquivoSistema(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <div>
                  <label className="block text-[11px] text-blue-800 mb-1">Relatório da operadora (Rede)</label>
                  <label
                    onDragOver={e => { e.preventDefault(); setArrastandoSobre('rede') }}
                    onDragLeave={() => setArrastandoSobre(null)}
                    onDrop={e => {
                      e.preventDefault()
                      setArrastandoSobre(null)
                      const f = e.dataTransfer.files?.[0]
                      if (f) setArquivoRede(f)
                    }}
                    className={`flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-3 bg-white text-xs text-gray-600 cursor-pointer transition-colors ${arrastandoSobre === 'rede' ? 'border-blue-500 bg-blue-100' : 'border-blue-300 hover:bg-blue-50'}`}>
                    <Upload size={13} />
                    <span className="truncate">{arquivoRede?.name ?? 'Arraste o arquivo aqui ou clique para escolher'}</span>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setArquivoRede(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              </div>
            )}

            {erroConferencia && (
              <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5"><AlertCircle size={13} /> {erroConferencia}</p>
            )}

            {!conferenciaSalva && !conferenciaPreviaCalc && (
              <button onClick={calcularConferencia} disabled={calculandoConferencia || !arquivoSistema || !arquivoRede}
                className="btn-secondary text-xs flex items-center gap-2 disabled:opacity-40">
                <Eye size={13} className={calculandoConferencia ? 'animate-pulse' : ''} /> {calculandoConferencia ? 'Calculando...' : 'Calcular'}
              </button>
            )}

            {(conferenciaSalva || conferenciaPreviaCalc) && (() => {
              const linhas = conferenciaSalva ?? conferenciaPreviaCalc!
              const linhasComNota = linhas.map(l => ({ ...l, diferencaFinal: l.diferenca - notasPorLoja(l.loja).cartao }))
              const totais = linhasComNota.reduce((acc, l) => ({
                vendaCartao: acc.vendaCartao + l.vendaCartao, recebidoRede: acc.recebidoRede + l.recebidoRede,
                taxaRede: acc.taxaRede + l.taxaRede, diferencaFinal: acc.diferencaFinal + l.diferencaFinal,
              }), { vendaCartao: 0, recebidoRede: 0, taxaRede: 0, diferencaFinal: 0 })
              return (
                <div className="overflow-x-auto bg-white rounded-lg border border-blue-200">
                  <table className="min-w-full text-xs">
                    <thead><tr className="bg-blue-100 text-blue-800">
                      <th className="text-left p-2">Loja</th>
                      <th className="text-right p-2">Venda cartão</th>
                      <th className="text-right p-2">Recebido na rede</th>
                      <th className="text-right p-2">Taxa rede</th>
                      <th className="text-right p-2">Notas</th>
                      <th className="text-right p-2">Diferença</th>
                    </tr></thead>
                    <tbody>
                      {linhasComNota.map(l => (
                        <tr key={l.loja} className="border-t border-blue-100 bg-blue-50/60">
                          <td className="p-2 whitespace-nowrap font-medium">{l.loja}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciaCartaoFechada} defaultValue={l.vendaCartao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-vendaCartao-${l.vendaCartao}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-transparent disabled:border-transparent disabled:text-gray-700"
                              onBlur={e => atualizarLinhaCartao(l.loja, 'vendaCartao', e.target.value, !!conferenciaSalva)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciaCartaoFechada} defaultValue={l.recebidoRede.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-recebidoRede-${l.recebidoRede}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-transparent disabled:border-transparent disabled:text-gray-700"
                              onBlur={e => atualizarLinhaCartao(l.loja, 'recebidoRede', e.target.value, !!conferenciaSalva)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciaCartaoFechada} defaultValue={l.taxaRede.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-taxaRede-${l.taxaRede}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-transparent disabled:border-transparent disabled:text-gray-700"
                              onBlur={e => atualizarLinhaCartao(l.loja, 'taxaRede', e.target.value, !!conferenciaSalva)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap text-gray-500">{fmt(notasPorLoja(l.loja).cartao)}</td>
                          <td className={`p-2 text-right whitespace-nowrap font-medium ${Math.abs(l.diferencaFinal) > 0.5 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(l.diferencaFinal)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-blue-300 bg-blue-100 font-semibold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{fmt(totais.vendaCartao)}</td>
                        <td className="p-2 text-right">{fmt(totais.recebidoRede)}</td>
                        <td className="p-2 text-right">{fmt(totais.taxaRede)}</td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right">{fmt(totais.diferencaFinal)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 border-t border-blue-200 bg-white">
                    {conferenciaCartaoFechada ? (
                      <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                        <CheckCircle2 size={12} /> Cartão fechado
                      </span>
                    ) : conferenciaPreviaCalc ? (
                      <button onClick={() => { setConferenciaPreviaCalc(null); setDinheiroPreviaCalc(null) }} className="btn-secondary text-xs">Recalcular</button>
                    ) : <span />}
                    <div className="flex gap-2">
                      {conferenciaCartaoFechada && (
                        <button onClick={reabrirConferenciaCartao} className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap">
                          Reabrir cartão
                        </button>
                      )}
                      {!conferenciaCartaoFechada && conferenciaPreviaCalc && (
                        <button onClick={fecharConferenciaCartao} className="btn-primary text-xs flex items-center gap-1.5"><Lock size={12} /> Fechar conferência do cartão</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Conferência de dinheiro */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-6">
            {(dinheiroSalvo || dinheiroPreviaCalc) && (() => {
              const linhas = dinheiroSalvo ?? dinheiroPreviaCalc!
              const linhasComNota = linhas.map(l => ({ ...l, diferencaFinal: l.diferenca + despesaPorLoja(l.loja) + erroPorLoja(l.loja) - notasPorLoja(l.loja).dinheiro }))
              const totais = linhasComNota.reduce((acc, l) => ({
                vendaDinheiro: acc.vendaDinheiro + l.vendaDinheiro, fechamentoCaixa: acc.fechamentoCaixa + l.fechamentoCaixa, deposito: acc.deposito + l.deposito, diferencaFinal: acc.diferencaFinal + l.diferencaFinal,
              }), { vendaDinheiro: 0, fechamentoCaixa: 0, deposito: 0, diferencaFinal: 0 })
              return (
                <div className="overflow-x-auto bg-white rounded-lg border border-emerald-200">
                  <div className="px-3 pt-3 text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><Banknote size={14} /> Conferência de dinheiro</div>
                  <table className="min-w-full text-xs">
                    <thead><tr className="bg-emerald-100 text-emerald-800">
                      <th className="text-left p-2">Loja</th>
                      <th className="text-right p-2">Venda dinheiro</th>
                      <th className="text-right p-2">Fechamento de caixa</th>
                      <th className="text-right p-2">Depósito</th>
                      <th className="text-left p-2">Conta depósito</th>
                      <th className="text-right p-2">Despesas</th>
                      <th className="text-right p-2">Erros caixa</th>
                      <th className="text-right p-2">Notas</th>
                      <th className="text-right p-2">Diferença</th>
                    </tr></thead>
                    <tbody>
                      {linhasComNota.map(l => (
                        <tr key={l.loja} className="border-t border-emerald-100 bg-emerald-50/60">
                          <td className="p-2 whitespace-nowrap font-medium">{l.loja}</td>
                          <td className="p-2 text-right whitespace-nowrap">{fmt(l.vendaDinheiro)}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciaDinheiroFechada} defaultValue={l.fechamentoCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-${l.fechamentoCaixa}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                              onBlur={e => atualizarFechamentoCaixa(l.loja, e.target.value, !!dinheiroSalvo)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciaDinheiroFechada} defaultValue={l.deposito.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-deposito-${l.deposito}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                              onBlur={e => atualizarDeposito(l.loja, e.target.value, !!dinheiroSalvo)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                            {dinheiroGuardadoPorLoja(l.loja) > 0 && (
                              <p className="text-[10px] text-cyan-700 mt-0.5">+ {fmt(dinheiroGuardadoPorLoja(l.loja))} guardado</p>
                            )}
                          </td>
                          <td className="p-2">
                            <select disabled={conferenciaDinheiroFechada} className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-500"
                              value={l.contaDeposito} onChange={e => atualizarContaDeposito(l.loja, e.target.value, !!dinheiroSalvo)}>
                              {CONTAS_DEPOSITO.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="p-2 text-right whitespace-nowrap text-gray-500">{fmt(despesaPorLoja(l.loja))}</td>
                          <td className="p-2 text-right whitespace-nowrap text-gray-500">{fmt(erroPorLoja(l.loja))}</td>
                          <td className="p-2 text-right whitespace-nowrap text-gray-500">{fmt(notasPorLoja(l.loja).dinheiro)}</td>
                          <td className={`p-2 text-right whitespace-nowrap font-medium ${Math.abs(l.diferencaFinal) > 4 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(l.diferencaFinal)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-emerald-300 bg-emerald-100 font-semibold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{fmt(totais.vendaDinheiro)}</td>
                        <td className="p-2 text-right">{fmt(totais.fechamentoCaixa)}</td>
                        <td className="p-2 text-right">{fmt(totais.deposito)}</td>
                        <td className="p-2"></td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right"></td>
                        <td className="p-2 text-right">{fmt(totais.diferencaFinal)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 border-t border-emerald-200 bg-white">
                    {conferenciaDinheiroFechada ? (
                      <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                        <CheckCircle2 size={12} /> Dinheiro fechado
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-700">Pode deixar em aberto e ir completando os valores conforme for recebendo.</span>
                    )}
                    <div className="flex gap-2">
                      {conferenciaDinheiroFechada && (
                        <button onClick={reabrirConferenciaDinheiro} className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap">
                          Reabrir dinheiro
                        </button>
                      )}
                      {!conferenciaDinheiroFechada && (
                        <button onClick={fecharConferenciaDinheiro} className="btn-primary text-xs flex items-center gap-1.5"><Lock size={12} /> Fechar conferência do dinheiro</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Notas fiscais */}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 mb-6">
            <button onClick={() => setAbrirNotas(v => !v)} className="w-full flex items-center justify-between text-left">
              <h3 className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                <Receipt size={15} /> Notas fiscais {notasFiscais.length > 0 && <span className="text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full">{notasFiscais.length}</span>}
              </h3>
              <ChevronDown size={16} className={`text-purple-700 transition-transform ${abrirNotas ? 'rotate-180' : ''}`} />
            </button>
            {abrirNotas && (
            <div className="mt-3">
              <p className="text-xs text-purple-700 mb-2">Vendas fora do relatório de forma de pagamento.</p>
              {!conferenciasAmbasFechadas && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="input text-xs py-1.5 w-44" value={novaNota.loja} onChange={e => setNovaNota(n => ({ ...n, loja: e.target.value }))}>
                    {LOJAS_CARTAO.map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                  </select>
                  <input type="text" inputMode="decimal" placeholder="Valor" className="no-spin input text-xs py-1.5 w-28"
                    value={novaNota.valor} onChange={e => setNovaNota(n => ({ ...n, valor: e.target.value }))} />
                  <select className="input text-xs py-1.5 w-40" value={novaNota.forma_pagamento} onChange={e => setNovaNota(n => ({ ...n, forma_pagamento: e.target.value as NotaFiscal['forma_pagamento'] }))}>
                    {FORMAS_PAGAMENTO_NOTA.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                  </select>
                  <button onClick={adicionarNotaFiscal} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Adicionar</button>
                </div>
              )}
              {notasFiscais.length > 0 && (
                <div className="space-y-1">
                  {notasFiscais.map(n => (
                    <div key={n.id} className="flex items-center gap-2 text-xs bg-white border border-purple-100 rounded-lg px-3 py-1.5">
                      <span className="font-medium flex-1">{n.loja}</span>
                      <span className="text-gray-600">{FORMAS_PAGAMENTO_NOTA.find(f => f.valor === n.forma_pagamento)?.label}</span>
                      <span className="font-medium w-24 text-right">{fmt(n.valor)}</span>
                      {!conferenciasAmbasFechadas && (
                        <button onClick={() => removerNotaFiscal(n.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Despesas pagas em loja */}
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 mb-6">
            <button onClick={() => setAbrirDespesas(v => !v)} className="w-full flex items-center justify-between text-left">
              <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5">
                <Wallet size={15} /> Despesas pagas em loja {despesasLoja.length > 0 && <span className="text-[10px] bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded-full">{despesasLoja.length}</span>}
              </h3>
              <ChevronDown size={16} className={`text-rose-700 transition-transform ${abrirDespesas ? 'rotate-180' : ''}`} />
            </button>
            {abrirDespesas && (
            <div className="mt-3">
              {!conferenciaDinheiroFechada && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="input text-xs py-1.5 w-44" value={novaDespesa.loja} onChange={e => setNovaDespesa(d => ({ ...d, loja: e.target.value }))}>
                    {LOJAS_CARTAO.map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                  </select>
                  <input type="text" inputMode="decimal" placeholder="Valor" className="no-spin input text-xs py-1.5 w-28"
                    value={novaDespesa.valor} onChange={e => setNovaDespesa(d => ({ ...d, valor: e.target.value }))} />
                  <input type="text" placeholder="Descrição da despesa" className="input text-xs py-1.5 flex-1 min-w-[160px]"
                    value={novaDespesa.descricao} onChange={e => setNovaDespesa(d => ({ ...d, descricao: e.target.value }))} />
                  <button onClick={adicionarDespesaLoja} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Adicionar</button>
                </div>
              )}
              {despesasLoja.length > 0 && (
                <div className="space-y-1">
                  {despesasLoja.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-xs bg-white border border-rose-100 rounded-lg px-3 py-1.5">
                      <span className="font-medium w-44 truncate">{d.loja}</span>
                      <span className="text-gray-600 flex-1 truncate">{d.descricao}</span>
                      <span className="font-medium w-24 text-right">{fmt(d.valor)}</span>
                      {!conferenciaDinheiroFechada && (
                        <button onClick={() => removerDespesaLoja(d.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Erros de caixa */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
            <button onClick={() => setAbrirErros(v => !v)} className="w-full flex items-center justify-between text-left">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={15} /> Erros de caixa {errosCaixa.length > 0 && <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">{errosCaixa.length}</span>}
              </h3>
              <ChevronDown size={16} className={`text-amber-700 transition-transform ${abrirErros ? 'rotate-180' : ''}`} />
            </button>
            {abrirErros && (
            <div className="mt-3">
              {!conferenciaDinheiroFechada && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="input text-xs py-1.5 w-44" value={novoErro.loja} onChange={e => setNovoErro(n => ({ ...n, loja: e.target.value }))}>
                    {LOJAS_CARTAO.map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                  </select>
                  <input type="text" inputMode="decimal" placeholder="Valor" className="no-spin input text-xs py-1.5 w-28"
                    value={novoErro.valor} onChange={e => setNovoErro(n => ({ ...n, valor: e.target.value }))} />
                  <input type="text" placeholder="Nome da operadora" className="input text-xs py-1.5 flex-1 min-w-[160px]"
                    value={novoErro.operadora} onChange={e => setNovoErro(n => ({ ...n, operadora: e.target.value }))} />
                  <button onClick={adicionarErroCaixa} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Adicionar</button>
                </div>
              )}
              {errosCaixa.length > 0 && (
                <div className="space-y-1">
                  {errosCaixa.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-xs bg-white border border-amber-100 rounded-lg px-3 py-1.5">
                      <span className="font-medium w-44 truncate">{e.loja}</span>
                      <span className="text-gray-600 flex-1 truncate">{e.operadora}</span>
                      <span className="font-medium w-24 text-right">{fmt(e.valor)}</span>
                      {!conferenciaDinheiroFechada && (
                        <button onClick={() => removerErroCaixa(e.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Dinheiro guardado a ser depositado */}
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 mb-6">
            <button onClick={() => setAbrirDinheiroGuardado(v => !v)} className="w-full flex items-center justify-between text-left">
              <h3 className="text-sm font-semibold text-cyan-800 flex items-center gap-1.5">
                <Banknote size={15} /> Dinheiro guardado a ser depositado {dinheiroGuardado.length > 0 && <span className="text-[10px] bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded-full">{dinheiroGuardado.length}</span>}
              </h3>
              <ChevronDown size={16} className={`text-cyan-700 transition-transform ${abrirDinheiroGuardado ? 'rotate-180' : ''}`} />
            </button>
            {abrirDinheiroGuardado && (
            <div className="mt-3">
              <p className="text-xs text-cyan-700 mb-2">Dinheiro de dias anteriores que estava guardado e vai ser depositado agora.</p>
              {dinheiroGuardadoNoEscritorio() > 0 && (
                <p className="text-xs text-cyan-800 bg-cyan-100 rounded-lg px-3 py-1.5 mb-2 inline-block">
                  Total guardado no escritório (sem depositar): <strong>{fmt(dinheiroGuardadoNoEscritorio())}</strong>
                </p>
              )}
              {!conferenciaDinheiroFechada && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="input text-xs py-1.5 w-44" value={novoDinheiroGuardado.origem}
                    onChange={e => setNovoDinheiroGuardado(d => ({ ...d, origem: e.target.value }))}>
                    {LOJAS_CARTAO.map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                    <option value={ESCRITORIO}>{ESCRITORIO}</option>
                  </select>
                  <input type="text" inputMode="decimal" placeholder="Valor" className="no-spin input text-xs py-1.5 w-28"
                    value={novoDinheiroGuardado.valor} onChange={e => setNovoDinheiroGuardado(d => ({ ...d, valor: e.target.value }))} />
                  {novoDinheiroGuardado.origem === ESCRITORIO && (
                    <select className="input text-xs py-1.5 w-40" value={novoDinheiroGuardado.destino}
                      onChange={e => setNovoDinheiroGuardado(d => ({ ...d, destino: e.target.value as 'deposito' | 'escritorio' }))}>
                      <option value="deposito">Depositar</option>
                      <option value="escritorio">Guardar no escritório</option>
                    </select>
                  )}
                  {novoDinheiroGuardado.origem === ESCRITORIO && novoDinheiroGuardado.destino === 'deposito' && (
                    <select className="input text-xs py-1.5 w-40" value={novoDinheiroGuardado.conta_deposito}
                      onChange={e => setNovoDinheiroGuardado(d => ({ ...d, conta_deposito: e.target.value }))}>
                      {CONTAS_DEPOSITO.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <button onClick={adicionarDinheiroGuardado} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Adicionar</button>
                </div>
              )}
              {dinheiroGuardado.length > 0 && (
                <div className="space-y-1">
                  {dinheiroGuardado.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-xs bg-white border border-cyan-100 rounded-lg px-3 py-1.5">
                      <span className="font-medium w-44 truncate">{d.origem}</span>
                      <span className="text-gray-600 flex-1 truncate flex items-center gap-1.5">
                        {d.origem === ESCRITORIO ? (d.destino === 'deposito' ? `Depositar em ${d.conta_deposito}` : 'Guardado no escritório') : 'Soma no depósito da loja'}
                        {d.automatico && <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">não depositado ontem</span>}
                      </span>
                      <span className="font-medium w-24 text-right">{fmt(d.valor)}</span>
                      {!conferenciaDinheiroFechada && (
                        <button onClick={() => removerDinheiroGuardado(d.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>

          {/* Transferências */}
          {(() => {
            const transferencias = transferenciasLista
            if (transferencias.length === 0 && saqueSicoobDinheiro <= 0) return null
            return (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-6">
                {transferencias.length > 0 && (
                  <>
                    <h2 className="text-sm font-semibold text-indigo-800 mb-3 flex items-center gap-1.5"><Wallet size={15} /> Transferências entre contas</h2>
                    <div className="overflow-x-auto bg-white rounded-lg border border-indigo-200">
                      <table className="min-w-full text-xs">
                        <thead><tr className="bg-indigo-100 text-indigo-800">
                          <th className="text-left p-2">De</th>
                          <th className="text-left p-2">Para</th>
                          <th className="text-right p-2">Valor</th>
                        </tr></thead>
                        <tbody>
                          {transferencias.map(t => (
                            <tr key={t.para} className="border-t border-indigo-100">
                              <td className="p-2 whitespace-nowrap">{t.de}</td>
                              <td className="p-2 whitespace-nowrap font-medium">{t.para}</td>
                              <td className="p-2 text-right whitespace-nowrap font-medium">{fmt(t.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {saqueSicoobDinheiro > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-indigo-800 mt-4 mb-2">Saque</h3>
                    <div className="overflow-x-auto bg-white rounded-lg border border-indigo-200">
                      <table className="min-w-full text-xs">
                        <thead><tr className="bg-indigo-100 text-indigo-800">
                          <th className="text-left p-2">De</th>
                          <th className="text-left p-2">Para</th>
                          <th className="text-right p-2">Valor</th>
                        </tr></thead>
                        <tbody>
                          <tr className="border-t border-indigo-100">
                            <td className="p-2 whitespace-nowrap">FAPS SICOOB</td>
                            <td className="p-2 whitespace-nowrap font-medium">DINHEIRO</td>
                            <td className="p-2 text-right whitespace-nowrap font-medium">{fmt(saqueSicoobDinheiro)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {/* Resumo de saldo antes dos pagamentos */}
          <div className="rounded-xl border border-gray-300 bg-gray-50 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Saldo antes dos pagamentos</h2>
            <div className="grid grid-cols-2 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
              {CONTAS_RESUMO.map(c => (
                <div key={c} className="bg-white p-2.5 flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-600 truncate">{c}</span>
                  <span className="font-medium whitespace-nowrap">{fmt(saldoAntesPagamentos(c))}</span>
                </div>
              ))}
              <div className="bg-gray-100 p-2.5 flex items-center justify-between text-xs font-semibold col-span-2">
                <span>Total</span>
                <span>{fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoAntesPagamentos(c), 0))}</span>
              </div>
            </div>
          </div>

          {listaExibida && (
            <div className="rounded-xl border border-gray-300 overflow-hidden">
              <div className="bg-gray-700 text-white text-center text-sm font-semibold py-2 capitalize">
                {fmtData(diaSelecionado)}
              </div>
              <div className="bg-red-50 border-b border-red-100 text-red-800 text-sm font-semibold px-4 py-2 flex items-center justify-between flex-wrap gap-2">
                <span>Pagamentos previstos: {fmt(total)}</span>
                <div className="flex gap-2 items-center">
                  {!fechado && (
                    <>
                      <button onClick={() => setShowNovoLancamento(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors flex items-center gap-1.5 whitespace-nowrap">
                        <Plus size={12} /> Adicionar lançamento
                      </button>
                      <button onClick={() => { setShowImportar(true); setLancamentosImportar(null); setDiaImportar('') }} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors flex items-center gap-1.5 whitespace-nowrap">
                        <Upload size={12} /> Importar de outro dia
                      </button>
                    </>
                  )}
                  {previa && !fechado && (
                    <button onClick={fecharDia} disabled={fechando} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-700 text-white hover:bg-red-800 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
                      <Lock size={12} /> {fechando ? 'Fechando...' : `Fechar pagamentos (${previa.length})`}
                    </button>
                  )}
                  {fechado && (
                    <>
                      <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                        <CheckCircle2 size={12} /> Fechado em {new Date(fechado.fechado_em).toLocaleString('pt-BR')}
                      </span>
                      <button onClick={reabrirDia} className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 transition-colors whitespace-nowrap">
                        Reabrir
                      </button>
                    </>
                  )}
                </div>
              </div>
              {listaExibida.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 bg-white">Nenhum lançamento com vencimento nesse dia.</p>
              ) : (
                <div className="overflow-x-auto bg-white">
                  <table className="min-w-full text-xs">
                    <thead><tr className="bg-gray-100 text-gray-600">
                      {thOrdenavel('empresa', 'Loja')}
                      {thOrdenavel('vencimento', 'Data venc.')}
                      {thOrdenavel('fornecedor', 'Empresa')}
                      {thOrdenavel('nota', 'Fatura')}
                      {thOrdenavel('valor', 'Valor', 'right')}
                      {thOrdenavel('juros', 'Juros', 'right')}
                      {thOrdenavel('tipo', 'Tipo')}
                      {thOrdenavel('pagar_em', 'Pagar em')}
                      <th className="text-center p-2">✓</th>
                      <th className="text-center p-2"></th>
                    </tr></thead>
                    <tbody>
                      {(listaExibidaOrdenada ?? []).map((l, i) => {
                        const efetivamentePago = !!l.pago || !!l.pagamento
                        return (
                        <tr key={l.id ?? i} className={`border-t border-gray-100 ${l.redirecionado_para ? 'bg-gray-50 text-gray-400' : efetivamentePago ? 'bg-green-100/70 border-l-4 border-l-green-500' : i % 2 === 0 ? 'bg-emerald-50/40' : 'bg-white'}`}>
                          <td className={`p-2 whitespace-nowrap font-medium ${l.redirecionado_para ? 'line-through' : efetivamentePago ? 'text-green-800' : ''}`} title={l.descricao ?? ''}>
                            {efetivamentePago && <CheckCircle2 size={13} className="inline mr-1 -mt-0.5 text-green-600" />}
                            {l.empresa}
                          </td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`}>
                            {l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                            {l.importado_de_dia && (
                              <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap" title={`Importado do dia ${l.importado_de_dia}`}>
                                importado
                              </span>
                            )}
                            {l.origem_manual && (
                              <span className="ml-1.5 text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full whitespace-nowrap" title="Adicionado manualmente pelo app, não vem da planilha">
                                manual
                              </span>
                            )}
                            {l.redirecionado_para && (
                              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full whitespace-nowrap no-underline">
                                → {new Date(l.redirecionado_para + 'T12:00:00').toLocaleDateString('pt-BR')}
                                {!fechado && (
                                  <button onClick={() => cancelarRedirecionamento(l)} title="Cancelar e trazer de volta pra hoje"
                                    className="text-purple-500 hover:text-purple-800 no-underline">
                                    <X size={10} />
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`}>{l.fornecedor}</td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`} title={l.observacao ?? ''}>{fmtNota(l.nota)}</td>
                          <td className="p-2 text-right whitespace-nowrap font-medium">
                            {l.id ? (
                              <input type="text" inputMode="decimal" disabled={!!fechado} className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                                value={editBufferValor[l.id] ?? (l.valor != null ? l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                                onChange={e => setEditBufferValor(b => ({ ...b, [l.id!]: e.target.value }))}
                                onBlur={e => {
                                  atualizarCampo(l.id!, 'valor', parseValorBR(e.target.value))
                                  setEditBufferValor(b => { const n = { ...b }; delete n[l.id!]; return n })
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                            ) : fmt(l.valor)}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {l.id ? (
                              <input type="text" inputMode="decimal" disabled={!!fechado} className="no-spin w-20 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                                value={editBufferJuros[l.id] ?? (l.juros ? l.juros.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                                onChange={e => setEditBufferJuros(b => ({ ...b, [l.id!]: e.target.value }))}
                                onBlur={e => {
                                  atualizarCampo(l.id!, 'juros', parseValorBR(e.target.value))
                                  setEditBufferJuros(b => { const n = { ...b }; delete n[l.id!]; return n })
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                            ) : fmt(l.juros ?? 0)}
                          </td>
                          <td className="p-2 whitespace-nowrap">{l.tipo}</td>
                          <td className="p-2">
                            {l.id ? (
                              <select disabled={!!fechado} className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-500" value={l.pagar_em ?? ''}
                                onChange={e => atualizarCampo(l.id!, 'pagar_em', e.target.value)}>
                                <option value="">—</option>
                                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="p-2 text-center">
                            {l.id ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <input type="checkbox" className="accent-green-600 w-5 h-5 border-2 border-green-600 rounded"
                                  checked={!!l.pago || !!l.pagamento} disabled={!!l.pagamento}
                                  onChange={e => atualizarCampo(l.id!, 'pago', e.target.checked)} />
                                {l.pagamento && (
                                  <span className="text-[9px] text-green-700 bg-green-100 px-1 rounded whitespace-nowrap" title="Data de pagamento informada na planilha">
                                    pago {new Date(l.pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="p-2 text-center">
                            {l.id && l.origem_manual && !fechado && movendoId !== l.id && (
                              <button onClick={() => deletarLancamento(l)} title="Apagar lançamento" className="text-gray-400 hover:text-red-500 mr-1">
                                <Trash2 size={14} />
                              </button>
                            )}
                            {l.id && !l.redirecionado_para && !l.importado_de_id && !fechado && (
                              movendoId === l.id ? (
                                <div className="relative flex items-center gap-1">
                                  <input type="date" className="input text-xs py-1 px-1.5 w-28" value={dataMover} onChange={e => setDataMover(e.target.value)} autoFocus />
                                  <button onClick={() => moverParaOutroDia(l, dataMover)} disabled={!dataMover} className="text-green-600 hover:text-green-700 disabled:opacity-40"><CheckCircle2 size={15} /></button>
                                  <button onClick={() => { setMovendoId(null); setDataMover(''); setResumoDiaMover(null) }} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
                                  {dataMover && (
                                    <div className="absolute z-20 top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-left">
                                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
                                        Resumo de {new Date(dataMover + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </p>
                                      {carregandoResumoMover ? (
                                        <p className="text-xs text-gray-400">Carregando...</p>
                                      ) : (
                                        <>
                                          <div className="max-h-36 overflow-y-auto space-y-0.5 mb-1.5">
                                            {(resumoDiaMover?.itens.length ?? 0) === 0 && (
                                              <p className="text-xs text-gray-400 italic">Nenhum lançamento nesse dia.</p>
                                            )}
                                            {resumoDiaMover?.itens.map((it, i) => (
                                              <div key={it.id ?? i} className="flex items-center justify-between gap-2 text-xs">
                                                <span className="text-gray-600 truncate">{it.fornecedor}</span>
                                                <span className="text-gray-700 font-medium whitespace-nowrap">{fmt((it.valor ?? 0) + (it.juros ?? 0))}</span>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                                            <span className="text-xs font-semibold text-gray-700">Total no dia</span>
                                            <span className="text-sm font-bold text-red-600">{fmt(resumoDiaMover?.total ?? 0)}</span>
                                          </div>
                                          <p className="text-[10px] text-gray-400 mt-1">+ {fmt((l.valor ?? 0) + (l.juros ?? 0))} deste lançamento = {fmt((resumoDiaMover?.total ?? 0) + (l.valor ?? 0) + (l.juros ?? 0))}</p>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button onClick={() => { setMovendoId(l.id!); setDataMover('') }} title="Mover para outro dia" className="text-gray-400 hover:text-brand-600">
                                  <ChevronRight size={15} />
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Resumo de saldo depois dos pagamentos */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 mt-6">
            <h2 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-1.5">
              <Wallet size={15} /> Saldo depois dos pagamentos
            </h2>
            <div className="grid grid-cols-2 gap-px bg-teal-200 rounded-lg overflow-hidden border border-teal-200">
              {CONTAS_RESUMO.map(c => (
                <div key={c} className="bg-white p-2.5 flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-600 truncate">{c}</span>
                  <span className="font-medium whitespace-nowrap text-teal-700">{fmt(saldoDepoisPagamentos(c))}</span>
                </div>
              ))}
              <div className="bg-teal-100 p-2.5 flex items-center justify-between text-xs font-semibold col-span-2 text-teal-900">
                <span>Total</span>
                <span>{fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoDepoisPagamentos(c), 0))}</span>
              </div>
            </div>
          </div>

          {/* Pagamentos por conta */}
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 mt-6">
            <h2 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-1.5">
              <Banknote size={15} /> Pagamentos por conta
            </h2>
            {BANCOS.filter(c => pagamentosPorConta(c) > 0).length === 0 ? (
              <p className="text-xs text-orange-700/70 italic">Nenhum pagamento neste dia.</p>
            ) : (
              <div className="grid grid-cols-2 gap-px bg-orange-200 rounded-lg overflow-hidden border border-orange-200">
                {BANCOS.filter(c => pagamentosPorConta(c) > 0).map(c => (
                  <div key={c} className="bg-white p-2.5 flex items-center justify-between text-xs gap-2">
                    <span className="text-gray-600 truncate">{c}</span>
                    <span className="font-medium whitespace-nowrap text-orange-700">{fmt(pagamentosPorConta(c))}</span>
                  </div>
                ))}
                <div className="bg-orange-100 p-2.5 flex items-center justify-between text-xs font-semibold col-span-2 text-orange-900">
                  <span>Total</span>
                  <span>{fmt(BANCOS.reduce((s, c) => s + pagamentosPorConta(c), 0))}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <button onClick={() => setShowCP(true)} className="btn-primary flex items-center gap-2">
              <FileText size={16} /> Fechar CP de hoje
            </button>
          </div>

          {(saldos['DIA_FINALIZADO_AUTO'] ?? 0) === 1 && (
            <div className="flex justify-end mt-3">
              <span className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Dia finalizado automaticamente às 22h — relatório salvo no OneDrive
              </span>
            </div>
          )}
        </>
      )}

      {showCP && createPortal(
        <div className="fixed inset-0 bg-white z-[200] overflow-y-auto p-6 print:static print:inset-auto print:overflow-visible print:p-0 print:h-auto print:w-auto">
          <div className="flex items-center justify-between mb-6 print:hidden">
            <h1 className="text-xl font-bold text-gray-900">CP do dia — {fmtData(diaSelecionado)}</h1>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
                <Printer size={16} /> Imprimir / Salvar PDF
              </button>
              <button onClick={() => setShowCP(false)} className="btn-secondary flex items-center gap-2">
                <X size={16} /> Fechar
              </button>
            </div>
          </div>

          <h1 className="hidden print:block text-xl font-bold text-gray-900 mb-4 capitalize">CP — {fmtData(diaSelecionado)}</h1>

          {/* Transferências (inclui o recebido na rede de cada loja, direto para a FAPS SICOOB) */}
          {transferenciasLista.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-gray-800 mt-4 mb-2 uppercase flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-blue-400" /> Transferências
              </h2>
              <table className="min-w-full text-[10px] border border-gray-300 mb-6">
                <thead><tr className="bg-gray-100">
                  <th className="text-left p-1.5 border border-gray-300">De</th>
                  <th className="text-left p-1.5 border border-gray-300">Para</th>
                  <th className="text-right p-1.5 border border-gray-300">Valor</th>
                  <th className="text-center p-1.5 border border-gray-300 w-10">✓</th>
                  <th className="text-left p-1.5 border border-gray-300">De</th>
                  <th className="text-left p-1.5 border border-gray-300">Para</th>
                  <th className="text-right p-1.5 border border-gray-300">Valor</th>
                  <th className="text-center p-1.5 border border-gray-300 w-10">✓</th>
                </tr></thead>
                <tbody>
                  {(() => {
                    const pares: (typeof transferenciasLista[number] | null)[][] = []
                    for (let i = 0; i < transferenciasLista.length; i += 2) pares.push([transferenciasLista[i], transferenciasLista[i + 1] ?? null])
                    return pares.map((par, i) => (
                      <tr key={i}>
                        {par.map((t, j) => {
                          if (!t) return (
                            <Fragment key={j}>
                              <td className="p-1.5 border border-gray-300" />
                              <td className="p-1.5 border border-gray-300" />
                              <td className="p-1.5 border border-gray-300" />
                              <td className="p-1.5 border border-gray-300" />
                            </Fragment>
                          )
                          const cor = corConta(t.de)
                          return (
                            <Fragment key={j}>
                              <td className={`p-1.5 border border-gray-300 ${cor.bg}`}>
                                <span className={`inline-flex items-center gap-1 font-semibold ${cor.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cor.bar}`} />{t.de}
                                </span>
                              </td>
                              <td className={`p-1.5 border border-gray-300 ${cor.bg} ${cor.text}`}>{t.para}</td>
                              <td className={`p-1.5 border border-gray-300 text-right font-medium ${cor.bg} ${cor.text}`}>{fmt(t.valor)}</td>
                              <td className={`p-1.5 border border-gray-300 text-center ${cor.bg}`}><span className="caixa-caneta" /></td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </>
          )}

          {/* Pagamentos previstos */}
          <h2 className="text-sm font-bold text-gray-800 mt-4 mb-2 uppercase flex items-center gap-2">
            <span className="w-1.5 h-4 rounded bg-slate-500" /> Pagamentos previstos
          </h2>
          <table className="min-w-full text-[10px] border border-gray-300 mb-6">
            <thead><tr className="bg-gray-100">
              <th className="text-center p-1 border border-gray-300">Loja</th>
              <th className="text-center p-1 border border-gray-300">Venc.</th>
              <th className="text-center p-1 border border-gray-300">Fornecedor</th>
              <th className="text-center p-1 border border-gray-300">Fatura</th>
              <th className="text-center p-1 border border-gray-300">Descrição</th>
              <th className="text-center p-1 border border-gray-300">Observação</th>
              <th className="text-center p-1 border border-gray-300">Valor</th>
              <th className="text-center p-1 border border-gray-300">Tipo</th>
              <th className="text-center p-1 border border-gray-300">Pagar em</th>
              <th className="text-center p-1 border border-gray-300 w-12">Incluído</th>
            </tr></thead>
            <tbody>
              {pagamentosCPAgrupados.map(grupo => {
                const cor = corConta(grupo.conta)
                return (
                <Fragment key={grupo.conta}>
                  <tr className={cor.headerBg}>
                    <td colSpan={10} className={`p-1 border border-gray-300 font-bold uppercase text-center ${cor.headerText}`}>{grupo.conta}</td>
                  </tr>
                  {grupo.itens.map((l, i) => (
                    <tr key={l.id ?? `${grupo.conta}-${i}`} className={`${cor.bg} ${grupo.conta === 'Não pagar' || l.pago || l.pagamento ? 'line-through text-gray-400' : ''}`}>
                      <td className="p-1 border border-gray-300 text-center">{l.empresa}</td>
                      <td className="p-1 border border-gray-300 text-center whitespace-nowrap">{l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.fornecedor}</td>
                      <td className="p-1 border border-gray-300 text-center">{fmtNota(l.nota)}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.descricao}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.observacao}</td>
                      <td className="p-1 border border-gray-300 text-center whitespace-nowrap">{fmt(l.valor)}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.tipo}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.pagar_em}</td>
                      <td className="p-1 border border-gray-300 text-center">
                        {l.id && (
                          <input type="checkbox" className="accent-green-600 w-4 h-4 print:hidden" checked={!!l.aprovado}
                            onChange={e => atualizarAprovado(l.id!, e.target.checked)} />
                        )}
                        <span className="caixa-caneta hidden print:inline-block" />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )})}
            </tbody>
          </table>

          {/* Adiados: lançamentos movidos para outro dia — sem dados de pagamento, só lançamento + nova data */}
          {pagamentosAdiados.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-gray-800 mt-4 mb-2 uppercase flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-red-400" /> Adiados
              </h2>
              <table className="min-w-full text-sm border border-gray-300 mb-6">
                <thead><tr className="bg-red-50">
                  <th className="text-center p-1.5 border border-gray-300">Loja</th>
                  <th className="text-center p-1.5 border border-gray-300">Venc.</th>
                  <th className="text-center p-1.5 border border-gray-300">Fornecedor</th>
                  <th className="text-center p-1.5 border border-gray-300">Fatura</th>
                  <th className="text-center p-1.5 border border-gray-300">Descrição</th>
                  <th className="text-center p-1.5 border border-gray-300">Observação</th>
                  <th className="text-center p-1.5 border border-gray-300">Valor</th>
                  <th className="text-center p-1.5 border border-gray-300 text-red-700">Nova data</th>
                </tr></thead>
                <tbody>
                  {pagamentosAdiados.map((l, i) => (
                    <tr key={l.id ?? `adiado-${i}`}>
                      <td className="p-1.5 border border-gray-300 text-center">{l.empresa}</td>
                      <td className="p-1.5 border border-gray-300 text-center whitespace-nowrap">{l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="p-1.5 border border-gray-300 text-center">{l.fornecedor}</td>
                      <td className="p-1.5 border border-gray-300 text-center">{fmtNota(l.nota)}</td>
                      <td className="p-1.5 border border-gray-300 text-center">{l.descricao}</td>
                      <td className="p-1.5 border border-gray-300 text-center">{l.observacao}</td>
                      <td className="p-1.5 border border-gray-300 text-center whitespace-nowrap">{fmt(l.valor)}</td>
                      <td className="p-1.5 border border-gray-300 text-center whitespace-nowrap font-semibold text-red-700 bg-red-50">{l.redirecionado_para ? new Date(l.redirecionado_para + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>,
        document.body
      )}

      {showImportar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowImportar(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Upload size={18} /> Importar lançamento de outro dia</h3>
              <button onClick={() => setShowImportar(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Os dados de outros dias são atualizados automaticamente sempre que você clica em "Atualizar lançamentos" em qualquer dia.</p>
            <div className="flex gap-2 mb-4">
              <input type="date" className="input text-sm flex-1" value={diaImportar} onChange={e => setDiaImportar(e.target.value)} />
              <button onClick={buscarLancamentosImportar} disabled={!diaImportar || buscandoImportar} className="btn-secondary text-sm">
                {buscandoImportar ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {lancamentosImportar && lancamentosImportar.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum lançamento encontrado nesse dia.</p>
            )}
            {lancamentosImportar && lancamentosImportar.length > 0 && (
              <div className="space-y-2">
                {lancamentosImportar.map(l => (
                  <div key={l.id} className="flex items-center gap-2 text-xs border border-gray-200 rounded-lg px-3 py-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${l.pago || l.pagamento ? 'bg-green-500' : 'bg-gray-300'}`} title={l.pago || l.pagamento ? 'Pago' : 'Não pago'} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{l.empresa} — {l.fornecedor}</p>
                      <p className="text-gray-400 truncate">{fmtNota(l.nota)} · vencimento {l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                    <span className="font-medium whitespace-nowrap">{fmt(l.valor)}</span>
                    <button onClick={() => importarLancamento(l)} className="btn-secondary text-xs px-2.5 py-1.5 whitespace-nowrap">Importar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarConfig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMostrarConfig(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Settings size={18} /> Configurações</h3>
              <button onClick={() => setMostrarConfig(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <label className="block text-xs text-gray-500 mb-1">Link da planilha "Contas a Pagar" (OneDrive)</label>
            <input className="input text-sm" placeholder="https://1drv.ms/x/..." value={arquivoUrl} onChange={e => setArquivoUrl(e.target.value)} onBlur={salvarArquivo} />

            <label className="block text-xs text-gray-500 mb-1 mt-4">Pasta no OneDrive para salvar o relatório do dia</label>
            <input className="input text-sm" placeholder="Financeiro/Relatórios" value={pastaOnedrive} onChange={e => setPastaOnedrive(e.target.value)} onBlur={salvarArquivo} />
            <p className="text-[11px] text-gray-400 mt-1">A pasta precisa já existir no seu OneDrive. Use barra para subpastas, ex: Financeiro/Relatórios.</p>

            <button onClick={conectarMicrosoft} className="text-xs text-brand-600 hover:underline mt-3 block">
              {conectado ? 'Reconectar Microsoft (liberar permissão de escrita no OneDrive)' : 'Conectar Microsoft'}
            </button>

            <button onClick={() => setMostrarConfig(false)} className="btn-primary w-full mt-4">Pronto</button>
          </div>
        </div>
      )}

      {showNovoLancamento && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNovoLancamento(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Plus size={18} /> Adicionar lançamento</h3>
              <button onClick={() => setShowNovoLancamento(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Loja / Empresa</label>
                <input className="input text-sm" value={novoLancamento.empresa} onChange={e => setNovoLancamento(f => ({ ...f, empresa: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fornecedor</label>
                <input className="input text-sm" value={novoLancamento.fornecedor} onChange={e => setNovoLancamento(f => ({ ...f, fornecedor: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fatura / Nota</label>
                  <input className="input text-sm" value={novoLancamento.nota} onChange={e => setNovoLancamento(f => ({ ...f, nota: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor</label>
                  <input type="text" inputMode="decimal" className="no-spin input text-sm text-right" placeholder="0,00" value={novoLancamento.valor} onChange={e => setNovoLancamento(f => ({ ...f, valor: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                <input className="input text-sm" value={novoLancamento.descricao} onChange={e => setNovoLancamento(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <input className="input text-sm" placeholder="PIX, BOLETO..." value={novoLancamento.tipo} onChange={e => setNovoLancamento(f => ({ ...f, tipo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pagar em</label>
                  <select className="input text-sm" value={novoLancamento.pagar_em} onChange={e => setNovoLancamento(f => ({ ...f, pagar_em: e.target.value }))}>
                    <option value="">—</option>
                    {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNovoLancamento(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={adicionarLancamento} disabled={salvandoNovo} className="btn-primary flex-1">
                {salvandoNovo ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { Landmark, Link2, AlertCircle, Lock, Eye, CheckCircle2, Settings, X, ChevronLeft, ChevronRight, ChevronDown, Plus, CreditCard, Upload, Banknote, Printer, FileText, Receipt, Wallet, AlertTriangle, CalendarOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcularConferenciaCartao, calcularConferenciaDinheiro, LinhaConferencia, LinhaDinheiro, LOJAS_CARTAO } from '../lib/conferenciaCartaoHelpers'
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
function hojeYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somarDias(dataISO: string, n: number) {
  const d = new Date(dataISO + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Financeiro() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { dia } = useParams<{ dia: string }>()
  const diaSelecionado = dia ?? hojeYYYYMMDD()

  const [conectado, setConectado] = useState<boolean | null>(null)
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [pastaOnedrive, setPastaOnedrive] = useState('')
  const [finalizandoDia, setFinalizandoDia] = useState(false)
  const [erroFinalizar, setErroFinalizar] = useState('')
  const [diaFinalizado, setDiaFinalizado] = useState(false)
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [fechado, setFechado] = useState<{ fechado_em: string } | null>(null)
  const [lancamentosSalvos, setLancamentosSalvos] = useState<Lancamento[]>([])
  const [previa, setPrevia] = useState<Lancamento[] | null>(null)
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
  const [conferenciaSalva, setConferenciaSalva] = useState<LinhaConferencia[] | null>(null)
  const [conferenciaPreviaCalc, setConferenciaPreviaCalc] = useState<LinhaConferencia[] | null>(null)
  const [dinheiroSalvo, setDinheiroSalvo] = useState<LinhaDinheiroEditavel[] | null>(null)
  const [dinheiroPreviaCalc, setDinheiroPreviaCalc] = useState<LinhaDinheiroEditavel[] | null>(null)
  const [arquivoSistema, setArquivoSistema] = useState<File | null>(null)
  const [arquivoRede, setArquivoRede] = useState<File | null>(null)
  const [calculandoConferencia, setCalculandoConferencia] = useState(false)
  const [arrastandoSobre, setArrastandoSobre] = useState<'sistema' | 'rede' | null>(null)
  const [erroConferencia, setErroConferencia] = useState('')
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([])
  const [novaNota, setNovaNota] = useState<{ loja: string; valor: string; forma_pagamento: NotaFiscal['forma_pagamento'] }>({
    loja: LOJAS_CARTAO[0].nome, valor: '', forma_pagamento: 'credito',
  })
  const [despesasLoja, setDespesasLoja] = useState<DespesaLoja[]>([])
  const [novaDespesa, setNovaDespesa] = useState({ loja: LOJAS_CARTAO[0].nome, valor: '', descricao: '' })
  const [errosCaixa, setErrosCaixa] = useState<ErroCaixa[]>([])
  const [novoErro, setNovoErro] = useState({ loja: LOJAS_CARTAO[0].nome, valor: '', operadora: '' })

  useEffect(() => { carregarConfig(); carregarFeriados() }, [])
  useEffect(() => {
    carregarDia(); carregarSaldos(); carregarConferencia(); carregarNotasFiscais(); carregarDespesasLoja(); carregarErrosCaixa()
    setDiaFinalizado(false)
    setErroFinalizar('')
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
  }

  async function removerNotaFiscal(id: string) {
    await supabase.from('financeiro_notas_fiscais').delete().eq('id', id)
    await carregarNotasFiscais()
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
    const [{ data: cartao }, { data: dinheiro }] = await Promise.all([
      supabase.from('financeiro_conferencia_cartao').select('*').eq('dia', diaSelecionado),
      supabase.from('financeiro_conferencia_dinheiro').select('*').eq('dia', diaSelecionado),
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
  }

  async function calcularConferencia() {
    if (!arquivoSistema || !arquivoRede) { setErroConferencia('Selecione os dois relatórios.'); return }
    setCalculandoConferencia(true)
    setErroConferencia('')
    try {
      const diaVenda = somarDias(diaSelecionado, -1)
      const [linhasCartao, linhasDinheiro] = await Promise.all([
        calcularConferenciaCartao(arquivoSistema, arquivoRede, diaVenda),
        calcularConferenciaDinheiro(arquivoSistema, diaVenda),
      ])
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

  async function fecharConferencia() {
    if (!conferenciaPreviaCalc || !dinheiroPreviaCalc) return
    await Promise.all([
      supabase.from('financeiro_conferencia_cartao').delete().eq('dia', diaSelecionado),
      supabase.from('financeiro_conferencia_dinheiro').delete().eq('dia', diaSelecionado),
    ])
    await Promise.all([
      supabase.from('financeiro_conferencia_cartao').insert(
        conferenciaPreviaCalc.map(l => ({
          dia: diaSelecionado, loja: l.loja,
          venda_cartao: l.vendaCartao, recebido_rede: l.recebidoRede, taxa_rede: l.taxaRede, diferenca: l.diferenca,
          usuario_id: user!.id,
        }))
      ),
      supabase.from('financeiro_conferencia_dinheiro').insert(
        dinheiroPreviaCalc.map(l => ({
          dia: diaSelecionado, loja: l.loja,
          venda_dinheiro: l.vendaDinheiro, fechamento_caixa: l.fechamentoCaixa, diferenca: l.diferenca, deposito: l.deposito, conta_deposito: l.contaDeposito,
          usuario_id: user!.id,
        }))
      ),
    ])
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIAS_FECHADAS', valor: 1, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIAS_FECHADAS: 1 }))
    setArquivoSistema(null)
    setArquivoRede(null)
    setConferenciaPreviaCalc(null)
    setDinheiroPreviaCalc(null)
    await carregarConferencia()
  }

  async function reabrirConferencia() {
    if (!confirm('Reabrir todas as conferências desse dia (cartão, dinheiro, notas, despesas e erros)? Os valores salvos serão apagados.')) return
    await Promise.all([
      supabase.from('financeiro_conferencia_cartao').delete().eq('dia', diaSelecionado),
      supabase.from('financeiro_conferencia_dinheiro').delete().eq('dia', diaSelecionado),
    ])
    await supabase.from('financeiro_saldos').upsert(
      { dia: diaSelecionado, campo: 'CONFERENCIAS_FECHADAS', valor: 0, usuario_id: user!.id, updated_at: new Date().toISOString() },
      { onConflict: 'dia,campo' }
    )
    setSaldos(prev => ({ ...prev, CONFERENCIAS_FECHADAS: 0 }))
    await carregarConferencia()
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
  const conferenciasFechadas = (saldos['CONFERENCIAS_FECHADAS'] ?? 0) === 1

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
    await supabase.from('financeiro_lancamentos').delete().eq('dia', diaSelecionado).eq('fechado', false)
    await supabase.from('financeiro_lancamentos').insert(
      previa.map(({ id, criado_em, ...l }: any) => ({ ...l, dia: diaSelecionado, usuario_id: user!.id, fechado: true }))
    )
    setFechando(false)
    setPrevia(null)
    await carregarDia()
  }

  async function reabrirDia() {
    if (!confirm('Reabrir esse dia? Os lançamentos voltam a ficar editáveis (nada é apagado).')) return
    const { error, data } = await supabase.from('financeiro_lancamentos').update({ fechado: false }).eq('dia', diaSelecionado).eq('fechado', true).select()
    if (error) {
      alert('Erro ao reabrir: ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Nenhum lançamento foi alterado. Pode ser bloqueio de permissão (RLS) na tabela financeiro_lancamentos.')
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

  function pagamentosPorConta(conta: string) {
    return (listaExibida ?? []).filter(l => l.pagar_em === conta && !l.redirecionado_para).reduce((s, l) => s + (l.valor ?? 0) + (l.juros ?? 0), 0)
  }
  function recebidoRedeTotal() {
    const linhas = conferenciaSalva ?? conferenciaPreviaCalc
    return (linhas ?? []).reduce((s, l) => s + l.recebidoRede, 0)
  }
  function depositoPorConta(conta: string) {
    const linhas = dinheiroSalvo ?? dinheiroPreviaCalc
    return (linhas ?? []).filter(l => l.contaDeposito === conta).reduce((s, l) => s + l.deposito, 0)
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

  function gerarRelatorioCompletoHTML(): string {
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const linhasCartao = conferenciaSalva ?? conferenciaPreviaCalc ?? []
    const linhasDinheiro = dinheiroSalvo ?? dinheiroPreviaCalc ?? []
    const css = `
      body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px;max-width:1100px;margin:0 auto}
      h1{font-size:20px;margin-bottom:4px}
      h2{font-size:14px;text-transform:uppercase;margin:24px 0 8px;color:#374151}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
      th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left}
      th{background:#f3f4f6}
      .num{text-align:right}
      .total{font-weight:bold;background:#f3f4f6}
      .grupo{font-weight:bold;text-transform:uppercase;background:#e5e7eb}
      .naopagar td{text-decoration:line-through;color:#9ca3af}
    `
    const linhasSaldoInicial = CONTAS_SALDO_INICIAL.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldos[c] ?? 0))}</td></tr>`).join('')
    const linhasCartaoHtml = linhasCartao.map(l => `<tr><td>${esc(l.loja)}</td><td class="num">${esc(fmt(l.vendaCartao))}</td><td class="num">${esc(fmt(l.recebidoRede))}</td><td class="num">${esc(fmt(l.taxaRede))}</td><td class="num">${esc(fmt(l.diferenca - notasPorLoja(l.loja).cartao))}</td></tr>`).join('')
    const linhasDinheiroHtml = linhasDinheiro.map(l => `<tr><td>${esc(l.loja)}</td><td class="num">${esc(fmt(l.vendaDinheiro))}</td><td class="num">${esc(fmt(l.fechamentoCaixa))}</td><td class="num">${esc(fmt(l.deposito))}</td><td>${esc(l.contaDeposito)}</td><td class="num">${esc(fmt(l.diferenca + despesaPorLoja(l.loja) + erroPorLoja(l.loja) - notasPorLoja(l.loja).dinheiro))}</td></tr>`).join('')
    const linhasNotas = notasFiscais.map(n => `<tr><td>${esc(n.loja)}</td><td>${esc(FORMAS_PAGAMENTO_NOTA.find(f => f.valor === n.forma_pagamento)?.label)}</td><td class="num">${esc(fmt(n.valor))}</td></tr>`).join('')
    const linhasDespesas = despesasLoja.map(d => `<tr><td>${esc(d.loja)}</td><td>${esc(d.descricao)}</td><td class="num">${esc(fmt(d.valor))}</td></tr>`).join('')
    const linhasErros = errosCaixa.map(e => `<tr><td>${esc(e.loja)}</td><td>${esc(e.operadora)}</td><td class="num">${esc(fmt(e.valor))}</td></tr>`).join('')
    const linhasTransf = transferenciasLista.map(t => `<tr><td>${esc(t.de)}</td><td>${esc(t.para)}</td><td class="num">${esc(fmt(t.valor))}</td></tr>`).join('') +
      (saqueSicoobDinheiro > 0 ? `<tr><td>FAPS SICOOB</td><td>DINHEIRO (saque)</td><td class="num">${esc(fmt(saqueSicoobDinheiro))}</td></tr>` : '')
    const linhasSaldoAntes = CONTAS_RESUMO.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldoAntesPagamentos(c)))}</td></tr>`).join('')
    const linhasSaldoDepois = CONTAS_RESUMO.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(saldoDepoisPagamentos(c)))}</td></tr>`).join('')
    const linhasPagPorConta = BANCOS.map(c => `<tr><td>${esc(c)}</td><td class="num">${esc(fmt(pagamentosPorConta(c)))}</td></tr>`).join('')
    const linhasPagamentos = pagamentosCPAgrupados.map(g => `<tr class="grupo"><td colspan="10">${esc(g.conta)}</td></tr>` +
      g.itens.map(l => `<tr${g.conta === 'Não pagar' ? ' class="naopagar"' : ''}><td>${esc(l.empresa)}</td><td>${l.vencimento ? esc(new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.nota)}</td><td>${esc(l.descricao)}</td><td>${esc(l.observacao)}</td><td class="num">${esc(fmt(l.valor))}</td><td>${esc(l.tipo)}</td><td>${esc(l.pagar_em)}</td><td>${l.pago ? 'Pago' : '—'}</td></tr>`).join('')).join('')
    const linhasAdiados = pagamentosAdiados.map(l => `<tr><td>${esc(l.empresa)}</td><td>${l.vencimento ? esc(new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.nota)}</td><td>${esc(l.descricao)}</td><td>${esc(l.observacao)}</td><td class="num">${esc(fmt(l.valor))}</td><td>${l.redirecionado_para ? esc(new Date(l.redirecionado_para + 'T12:00:00').toLocaleDateString('pt-BR')) : '—'}</td></tr>`).join('')

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório financeiro — ${esc(diaSelecionado)}</title><style>${css}</style></head><body>
      <h1>Relatório financeiro completo</h1>
      <p>${esc(fmtData(diaSelecionado))}</p>

      <h2>Saldo inicial</h2>
      <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoInicial}</tbody></table>

      <h2>Conferência rede (cartão)</h2>
      <table><thead><tr><th>Loja</th><th>Venda cartão</th><th>Recebido na rede</th><th>Taxa rede</th><th>Diferença</th></tr></thead><tbody>${linhasCartaoHtml}</tbody></table>

      <h2>Conferência de dinheiro</h2>
      <table><thead><tr><th>Loja</th><th>Venda dinheiro</th><th>Fechamento de caixa</th><th>Depósito</th><th>Conta depósito</th><th>Diferença</th></tr></thead><tbody>${linhasDinheiroHtml}</tbody></table>

      ${notasFiscais.length > 0 ? `<h2>Notas fiscais</h2><table><thead><tr><th>Loja</th><th>Forma de pagamento</th><th>Valor</th></tr></thead><tbody>${linhasNotas}</tbody></table>` : ''}
      ${despesasLoja.length > 0 ? `<h2>Despesas pagas em loja</h2><table><thead><tr><th>Loja</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${linhasDespesas}</tbody></table>` : ''}
      ${errosCaixa.length > 0 ? `<h2>Erros de caixa</h2><table><thead><tr><th>Loja</th><th>Operadora</th><th>Valor</th></tr></thead><tbody>${linhasErros}</tbody></table>` : ''}
      ${(transferenciasLista.length > 0 || saqueSicoobDinheiro > 0) ? `<h2>Transferências</h2><table><thead><tr><th>De</th><th>Para</th><th>Valor</th></tr></thead><tbody>${linhasTransf}</tbody></table>` : ''}

      <h2>Saldo antes dos pagamentos</h2>
      <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoAntes}<tr class="total"><td>Total</td><td class="num">${esc(fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoAntesPagamentos(c), 0)))}</td></tr></tbody></table>

      <h2>Pagamentos previstos — total ${esc(fmt(total))}</h2>
      <table><thead><tr><th>Loja</th><th>Venc.</th><th>Fornecedor</th><th>Fatura</th><th>Descrição</th><th>Observação</th><th>Valor</th><th>Tipo</th><th>Pagar em</th><th>Pago</th></tr></thead><tbody>${linhasPagamentos}</tbody></table>

      ${pagamentosAdiados.length > 0 ? `<h2>Adiados</h2><table><thead><tr><th>Loja</th><th>Venc.</th><th>Fornecedor</th><th>Fatura</th><th>Descrição</th><th>Observação</th><th>Valor</th><th>Nova data</th></tr></thead><tbody>${linhasAdiados}</tbody></table>` : ''}

      <h2>Pagamentos por conta</h2>
      <table><thead><tr><th>Conta</th><th>Total</th></tr></thead><tbody>${linhasPagPorConta}<tr class="total"><td>Total</td><td class="num">${esc(fmt(BANCOS.reduce((s, c) => s + pagamentosPorConta(c), 0)))}</td></tr></tbody></table>

      <h2>Saldo depois dos pagamentos</h2>
      <table><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>${linhasSaldoDepois}<tr class="total"><td>Total</td><td class="num">${esc(fmt(CONTAS_RESUMO.reduce((s, c) => s + saldoDepoisPagamentos(c), 0)))}</td></tr></tbody></table>
    </body></html>`
  }

  async function finalizarDia() {
    if (!pastaOnedrive.trim()) { setErroFinalizar('Configure a pasta do OneDrive nas configurações primeiro.'); setMostrarConfig(true); return }
    setFinalizandoDia(true)
    setErroFinalizar('')
    const conteudo_html = gerarRelatorioCompletoHTML()
    const nome_arquivo = `Relatorio-${diaSelecionado}.html`
    const { data, error } = await supabase.functions.invoke('financeiro-upload', {
      body: { user_id: user!.id, pasta: pastaOnedrive.trim(), nome_arquivo, conteudo_html },
    })
    let corpoErro: any = data?.error ? data : null
    if (error && (error as any).context?.json) {
      try { corpoErro = await (error as any).context.json() } catch { /* ignora */ }
    }
    if (corpoErro || error) {
      const codigo = corpoErro?.error
      const mensagem = codigo === 'not_connected' ? 'Conexão com a Microsoft expirou ou não tem permissão de escrita. Reconecte nas configurações.'
        : codigo === 'pasta_nao_encontrada' ? `Não encontrei a pasta "${pastaOnedrive}" no seu OneDrive. Crie essa pasta primeiro.`
        : codigo ? `${codigo}${corpoErro?.details ? ' — ' + JSON.stringify(corpoErro.details).slice(0, 300) : ''}`
        : error?.message ?? 'Erro ao salvar no OneDrive'
      setErroFinalizar(mensagem)
      setFinalizandoDia(false)
      return
    }
    setFinalizandoDia(false)
    setDiaFinalizado(true)
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={24} /> Financeiro</h1>
          <p className="text-sm text-gray-400">Contas a pagar com vencimento no dia, vindas da planilha</p>
        </div>
        <button onClick={() => setMostrarConfig(true)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Settings size={18} />
        </button>
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
          </div>

          {/* Conferência de cartão (Rede) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5"><CreditCard size={15} /> Conferência rede (cartão) — venda de ontem</h2>
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
                          <td className="p-2 text-right whitespace-nowrap">{fmt(l.vendaCartao)}</td>
                          <td className="p-2 text-right whitespace-nowrap">{fmt(l.recebidoRede)}</td>
                          <td className="p-2 text-right whitespace-nowrap">{fmt(l.taxaRede)}</td>
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
                            <input type="text" inputMode="decimal" disabled={conferenciasFechadas} defaultValue={l.fechamentoCaixa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-${l.fechamentoCaixa}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                              onBlur={e => atualizarFechamentoCaixa(l.loja, e.target.value, !!dinheiroSalvo)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <input type="text" inputMode="decimal" disabled={conferenciasFechadas} defaultValue={l.deposito.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              key={`${l.loja}-deposito-${l.deposito}`}
                              className="no-spin w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400 disabled:bg-gray-100 disabled:text-gray-500"
                              onBlur={e => atualizarDeposito(l.loja, e.target.value, !!dinheiroSalvo)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                          </td>
                          <td className="p-2">
                            <select disabled={conferenciasFechadas} className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-500"
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
                </div>
              )
            })()}
          </div>

          {/* Ação compartilhada: fecha cartão + dinheiro + notas + despesas + erros de uma vez */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-6 px-1">
            {conferenciaSalva ? (
              <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1">
                <CheckCircle2 size={12} /> Conferências fechadas
              </span>
            ) : <span />}
            <div className="flex gap-2">
              {conferenciaSalva && (
                <button onClick={reabrirConferencia} className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap">
                  Reabrir conferências
                </button>
              )}
              {!conferenciaSalva && (conferenciaPreviaCalc || dinheiroPreviaCalc) && (
                <>
                  <button onClick={() => { setConferenciaPreviaCalc(null); setDinheiroPreviaCalc(null) }} className="btn-secondary text-xs">Recalcular</button>
                  <button onClick={fecharConferencia} className="btn-primary text-xs flex items-center gap-1.5"><Lock size={12} /> Fechar conferências (cartão + dinheiro)</button>
                </>
              )}
            </div>
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
              {!conferenciasFechadas && (
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
                      {!conferenciasFechadas && (
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
              {!conferenciasFechadas && (
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
                      {!conferenciasFechadas && (
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
              {!conferenciasFechadas && (
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
                      {!conferenciasFechadas && (
                        <button onClick={() => removerErroCaixa(e.id)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
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
                      <th className="text-left p-2">Loja</th>
                      <th className="text-left p-2">Data venc.</th>
                      <th className="text-left p-2">Empresa</th>
                      <th className="text-left p-2">Fatura</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-right p-2">Juros</th>
                      <th className="text-left p-2">Tipo</th>
                      <th className="text-left p-2">Pagar em</th>
                      <th className="text-center p-2">✓</th>
                      <th className="text-center p-2"></th>
                    </tr></thead>
                    <tbody>
                      {listaExibida.map((l, i) => (
                        <tr key={l.id ?? i} className={`border-t border-gray-100 ${l.redirecionado_para ? 'bg-gray-50 text-gray-400' : l.pago ? 'bg-green-50' : i % 2 === 0 ? 'bg-emerald-50/40' : 'bg-white'}`}>
                          <td className={`p-2 whitespace-nowrap font-medium ${l.redirecionado_para ? 'line-through' : ''}`} title={l.descricao ?? ''}>{l.empresa}</td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`}>
                            {l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                            {l.importado_de_dia && (
                              <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full whitespace-nowrap" title={`Importado do dia ${l.importado_de_dia}`}>
                                importado
                              </span>
                            )}
                            {l.redirecionado_para && (
                              <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full whitespace-nowrap no-underline inline-block">
                                → {new Date(l.redirecionado_para + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`}>{l.fornecedor}</td>
                          <td className={`p-2 whitespace-nowrap ${l.redirecionado_para ? 'line-through' : ''}`} title={l.observacao ?? ''}>{l.nota}</td>
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
                                <input type="checkbox" className="accent-green-600 w-4 h-4" checked={!!l.pago}
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
                            {l.id && !l.redirecionado_para && !l.importado_de_id && !fechado && (
                              movendoId === l.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="date" className="input text-xs py-1 px-1.5 w-28" value={dataMover} onChange={e => setDataMover(e.target.value)} />
                                  <button onClick={() => moverParaOutroDia(l, dataMover)} disabled={!dataMover} className="text-green-600 hover:text-green-700 disabled:opacity-40"><CheckCircle2 size={15} /></button>
                                  <button onClick={() => { setMovendoId(null); setDataMover('') }} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
                                </div>
                              ) : (
                                <button onClick={() => { setMovendoId(l.id!); setDataMover('') }} title="Mover para outro dia" className="text-gray-400 hover:text-brand-600">
                                  <ChevronRight size={15} />
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

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

          <div className="flex justify-end mt-6">
            <button onClick={() => setShowCP(true)} className="btn-primary flex items-center gap-2">
              <FileText size={16} /> Fechar CP de hoje
            </button>
          </div>

          <div className="flex flex-col items-end gap-2 mt-3">
            {erroFinalizar && (
              <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} /> {erroFinalizar}</p>
            )}
            {diaFinalizado ? (
              <span className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Relatório salvo no OneDrive
              </span>
            ) : (
              <button onClick={finalizarDia} disabled={finalizandoDia} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                <CheckCircle2 size={16} /> {finalizandoDia ? 'Salvando no OneDrive...' : 'Finalizar o dia'}
              </button>
            )}
          </div>
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
                    <tr key={l.id ?? `${grupo.conta}-${i}`} className={`${cor.bg} ${grupo.conta === 'Não pagar' ? 'line-through text-gray-400' : ''}`}>
                      <td className="p-1 border border-gray-300 text-center">{l.empresa}</td>
                      <td className="p-1 border border-gray-300 text-center whitespace-nowrap">{l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.fornecedor}</td>
                      <td className="p-1 border border-gray-300 text-center">{l.nota}</td>
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
                      <td className="p-1.5 border border-gray-300 text-center">{l.nota}</td>
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
                    <span className={`w-2 h-2 rounded-full shrink-0 ${l.pago ? 'bg-green-500' : 'bg-gray-300'}`} title={l.pago ? 'Pago' : 'Não pago'} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{l.empresa} — {l.fornecedor}</p>
                      <p className="text-gray-400 truncate">{l.nota} · vencimento {l.vencimento ? new Date(l.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
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

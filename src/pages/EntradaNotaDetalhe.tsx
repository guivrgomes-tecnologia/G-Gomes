import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Plus, X, Upload, Printer, HandCoins, Truck, Tags, Store } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { supabase } from '../lib/supabase'
import { parseNFeXML, custoBaseItem, arredondar99 } from '../lib/nfeXmlHelper'
import type { ConfigLoja } from './Configuracoes'

type Nota = {
  id: string
  razao_social: string | null
  loja: string | null
  fornecedor: string | null
  numero_nota: string | null
  emitida_em: string | null
  valor_total: number
  valor_adiantamento: number
  frete_manual: number
  vprod_nf: number
  vfrete_nf: number
  vseg_nf: number
  voutro_nf: number
  vdesc_nf: number
}

type Item = {
  id: string
  cprod: string | null
  cean: string | null
  xprod: string | null
  qcom: number
  vuntrib: number
  vprod: number
  vipi: number
  vicmsst: number
  vfcpst: number
  vdesc: number
  quebra: number
}

type Margem = { id: string; nome: string; percentual: number; ordem: number }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Uma cor por lista de preço, pra diferenciar visualmente quando há mais de uma margem.
const CORES_MARGEM = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
const CORES_MARGEM_BG = ['#d1fae5', '#dbeafe', '#fef3c7', '#fce7f3', '#ede9fe']
const CORES_MARGEM_BG_SUAVE = ['#ecfdf5', '#eff6ff', '#fffbeb', '#fdf2f8', '#f5f3ff']
const CORES_MARGEM_TEXT = ['#047857', '#1d4ed8', '#b45309', '#be185d', '#6d28d9']

// Desenha o código de barras de um item pra impressão. Usa o formato certo conforme o tamanho do
// EAN (a maioria das NFe vem com EAN13); cai pra CODE128 se não for um EAN/UPC padrão.
function Barcode({ value }: { value: string | null }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value || /^(sem gtin|0+)$/i.test(value.trim())) return
    const limpo = value.trim()
    const formato = /^\d{13}$/.test(limpo) ? 'EAN13' : /^\d{12}$/.test(limpo) ? 'UPC' : /^\d{8}$/.test(limpo) ? 'EAN8' : 'CODE128'
    try {
      JsBarcode(ref.current, limpo, { format: formato, height: 28, width: 1.3, fontSize: 10, margin: 2, displayValue: true })
    } catch { /* código inválido pro formato — deixa em branco */ }
  }, [value])
  if (!value || /^(sem gtin|0+)$/i.test(value.trim())) return <span className="text-gray-300 text-[10px]">—</span>
  return <svg ref={ref} />
}

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

export default function EntradaNotaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [nota, setNota] = useState<Nota | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [margens, setMargens] = useState<Margem[]>([])
  const [loading, setLoading] = useState(true)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarImpressao, setMostrarImpressao] = useState(false)
  const [lojasConfig, setLojasConfig] = useState<ConfigLoja[]>([])
  const [mostrarSeletorLoja, setMostrarSeletorLoja] = useState(false)

  useEffect(() => { carregar() }, [id])
  useEffect(() => { supabase.from('config_lojas').select('*').order('ordem').then(({ data }) => setLojasConfig(data ?? [])) }, [])

  useEffect(() => {
    document.body.classList.toggle('modo-impressao-notas', mostrarImpressao)
    return () => document.body.classList.remove('modo-impressao-notas')
  }, [mostrarImpressao])

  async function carregar() {
    setLoading(true)
    const [{ data: n }, { data: its }, { data: margs }] = await Promise.all([
      supabase.from('entrada_notas_fiscais').select('*').eq('id', id).single(),
      supabase.from('entrada_notas_itens').select('*').eq('nota_id', id).order('ordem'),
      supabase.from('entrada_notas_margens').select('*').eq('nota_id', id).order('ordem'),
    ])
    setNota(n)
    setItens(its ?? [])
    if (margs && margs.length > 0) {
      setMargens(margs)
    } else if (n) {
      const { data: novaMargem } = await supabase.from('entrada_notas_margens')
        .insert({ nota_id: id, nome: 'Lojas', percentual: n.margem_padrao ?? 120, ordem: 0 }).select().single()
      setMargens(novaMargem ? [novaMargem] : [])
    }
    setLoading(false)
  }

  async function anexarXML(file: File) {
    setEnviando(true)
    setErro('')
    const texto = await file.text()
    const parsed = parseNFeXML(texto)
    if (!parsed) { setErro('Esse arquivo não é um XML de NFe válido.'); setEnviando(false); return }
    if (parsed.itens.length === 0) { setErro('O XML não tem nenhum item.'); setEnviando(false); return }
    await supabase.from('entrada_notas_fiscais').update({
      vprod_nf: parsed.vprod_nf, vfrete_nf: parsed.vfrete_nf, vseg_nf: parsed.vseg_nf, voutro_nf: parsed.voutro_nf, vdesc_nf: parsed.vdesc_nf,
      chave_acesso: parsed.chave_acesso, valor_total: parsed.valor_total || nota?.valor_total,
    }).eq('id', id)
    await supabase.from('entrada_notas_itens').insert(parsed.itens.map((it, ordem) => ({
      nota_id: id, cprod: it.cprod, cean: it.cean, xprod: it.xprod, qcom: it.qcom,
      vuntrib: it.vuntrib, vprod: it.vprod, vipi: it.vipi, vicmsst: it.vicmsst, vfcpst: it.vfcpst, vdesc: it.vdesc, ordem,
    })))
    setEnviando(false)
    await carregar()
  }

  async function atualizarNota(campo: 'frete_manual' | 'valor_adiantamento', valor: string) {
    const num = parseValorBR(valor)
    setNota(prev => prev ? { ...prev, [campo]: num } : prev)
    await supabase.from('entrada_notas_fiscais').update({ [campo]: num }).eq('id', id)
  }

  async function adicionarMargem(nome?: string, percentual?: number) {
    const ordem = margens.length
    const { data } = await supabase.from('entrada_notas_margens')
      .insert({ nota_id: id, nome: nome ?? `Lojas ${ordem + 1}`, percentual: percentual ?? 120, ordem }).select().single()
    if (data) setMargens(prev => [...prev, data])
    setMostrarSeletorLoja(false)
  }

  async function removerMargem(margemId: string) {
    if (margens.length <= 1) return
    await supabase.from('entrada_notas_margens').delete().eq('id', margemId)
    setMargens(prev => prev.filter(m => m.id !== margemId))
  }

  async function atualizarMargem(margemId: string, campo: 'nome' | 'percentual', valor: string) {
    const valorSalvo = campo === 'percentual' ? parseValorBR(valor) : valor
    setMargens(prev => prev.map(m => m.id === margemId ? { ...m, [campo]: valorSalvo } : m))
    await supabase.from('entrada_notas_margens').update({ [campo]: valorSalvo }).eq('id', margemId)
  }

  async function atualizarQuebra(itemId: string, valor: string) {
    const num = parseValorBR(valor)
    const quebra = num > 0 ? num : 1
    setItens(prev => prev.map(it => it.id === itemId ? { ...it, quebra } : it))
    await supabase.from('entrada_notas_itens').update({ quebra }).eq('id', itemId)
  }

  if (loading) return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  if (!nota) return <div className="p-8"><div className="card p-12 text-center text-gray-400">Nota não encontrada.</div></div>

  const adiantamentoPct = nota.vprod_nf > 0 ? nota.valor_adiantamento / nota.vprod_nf : 0
  const baseFrete = nota.vprod_nf + nota.valor_adiantamento
  const fretePct = baseFrete > 0 ? nota.frete_manual / baseFrete : 0

  const linhas = itens.map(item => {
    const custoBase = custoBaseItem(item, nota)
    const custoComAdiantamento = custoBase * (1 + adiantamentoPct)
    const custoComFrete = custoComAdiantamento * (1 + fretePct)
    // Quebra: alguns produtos vêm na nota por caixa, mas são vendidos por unidade — divide o custo
    // da caixa pela quantidade de unidades dentro dela pra chegar no custo de venda real.
    const custoFinal = custoComFrete / (item.quebra > 0 ? item.quebra : 1)
    const precos = margens.map(m => arredondar99(custoFinal * (1 + m.percentual / 100)))
    return { item, custoFinal, precos }
  })

  return (
    <div className="p-4 sm:p-8">
      <button onClick={() => navigate('/entrada-notas')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft size={16} /> Voltar
      </button>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cálculo de preços — {nota.fornecedor ?? 'Nota'} #{nota.numero_nota}</h1>
          <p className="text-sm text-gray-400">{nota.razao_social} · {nota.loja ?? '—'} · valor da nota {fmt(nota.valor_total)}</p>
        </div>
        {itens.length > 0 && (
          <button onClick={() => setMostrarImpressao(true)} className="btn-primary flex items-center gap-2 text-sm shrink-0">
            <Printer size={15} /> Imprimir pra conferência
          </button>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">Essa nota não tem itens cadastrados ainda (foi lançada sem XML). Anexe o XML pra calcular os preços.</p>
          <label className="inline-flex items-center gap-2 btn-secondary cursor-pointer text-sm">
            <Upload size={15} /> {enviando ? 'Processando...' : 'Anexar XML'}
            <input type="file" accept=".xml" className="hidden" disabled={enviando}
              onChange={e => { if (e.target.files?.[0]) anexarXML(e.target.files[0]); e.target.value = '' }} />
          </label>
          {erro && <p className="text-xs text-red-600 mt-3">{erro}</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <label className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1.5">
                <HandCoins size={14} /> Adiantamento ao fornecedor
              </label>
              <input type="text" inputMode="decimal" className="no-spin w-full text-right border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-amber-500"
                value={editBuffer.adiantamento ?? (nota.valor_adiantamento ? nota.valor_adiantamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                onChange={e => setEditBuffer(b => ({ ...b, adiantamento: e.target.value }))}
                onBlur={e => { atualizarNota('valor_adiantamento', e.target.value); setEditBuffer(b => { const x = { ...b }; delete x.adiantamento; return x }) }} />
              <p className="text-[11px] text-amber-700/80 mt-1.5">
                <span className="font-semibold">{(adiantamentoPct * 100).toFixed(2)}%</span> sobre o total de produtos ({fmt(nota.vprod_nf)})
              </p>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
              <label className="text-xs font-semibold text-sky-700 flex items-center gap-1.5 mb-1.5">
                <Truck size={14} /> Frete dessa nota (manual)
              </label>
              <input type="text" inputMode="decimal" className="no-spin w-full text-right border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-sky-500"
                value={editBuffer.frete ?? (nota.frete_manual ? nota.frete_manual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                onChange={e => setEditBuffer(b => ({ ...b, frete: e.target.value }))}
                onBlur={e => { atualizarNota('frete_manual', e.target.value); setEditBuffer(b => { const x = { ...b }; delete x.frete; return x }) }} />
              <p className="text-[11px] text-sky-700/80 mt-1.5">
                <span className="font-semibold">{(fretePct * 100).toFixed(2)}%</span> sobre produtos + adiantamento ({fmt(baseFrete)})
              </p>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <label className="text-xs font-semibold text-violet-700 flex items-center gap-1.5 mb-1.5">
                <Tags size={14} /> Listas de preço (margem)
              </label>
              <div className="space-y-1.5">
                {margens.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CORES_MARGEM[i % CORES_MARGEM.length] }} />
                    <input className="flex-1 border border-violet-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-violet-500" value={m.nome}
                      onChange={e => atualizarMargem(m.id, 'nome', e.target.value)} />
                    <input type="text" inputMode="decimal" className="no-spin w-16 text-right border border-violet-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-violet-500"
                      value={editBuffer[`margem-${m.id}`] ?? String(m.percentual)}
                      onChange={e => setEditBuffer(b => ({ ...b, [`margem-${m.id}`]: e.target.value }))}
                      onBlur={e => { atualizarMargem(m.id, 'percentual', e.target.value); setEditBuffer(b => { const x = { ...b }; delete x[`margem-${m.id}`]; return x }) }} />
                    <span className="text-xs text-violet-500">%</span>
                    {margens.length > 1 && (
                      <button onClick={() => removerMargem(m.id)} className="text-violet-300 hover:text-red-500"><X size={13} /></button>
                    )}
                  </div>
                ))}
                <div className="relative">
                  <button onClick={() => setMostrarSeletorLoja(v => !v)} className="flex items-center gap-1 text-xs text-violet-700 font-medium hover:underline mt-1">
                    <Plus size={12} /> Nova lista de preço
                  </button>
                  {mostrarSeletorLoja && (
                    <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {lojasConfig.length === 0 ? (
                        <div className="p-3 text-xs text-gray-400">
                          Nenhuma loja cadastrada. <Link to="/configuracoes" className="text-brand-600 hover:underline">Cadastrar em Configurações</Link>.
                        </div>
                      ) : (
                        <>
                          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-1"><Store size={11} /> Lojas cadastradas</p>
                          {lojasConfig.map(l => (
                            <button key={l.id} onClick={() => adicionarMargem(l.nome, l.percentual_padrao)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-violet-50 flex items-center justify-between">
                              {l.nome} <span className="text-gray-400 text-xs">{l.percentual_padrao}%</span>
                            </button>
                          ))}
                        </>
                      )}
                      <button onClick={() => adicionarMargem()} className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100">
                        Outra (em branco)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left p-3 sticky left-0 bg-gray-50 min-w-[200px] border-r border-gray-200">Produto</th>
                  <th className="text-right p-3" title="Se o produto vem na nota por caixa mas é vendido por unidade, informe quantas unidades tem em cada caixa">Quebrar em</th>
                  <th className="text-right p-3 border-r-2 border-gray-200">Custo final unit.</th>
                  {margens.map((m, i) => (
                    <th key={m.id} className="text-right p-3 font-semibold whitespace-nowrap" style={{ background: CORES_MARGEM_BG[i % CORES_MARGEM_BG.length], color: CORES_MARGEM_TEXT[i % CORES_MARGEM_TEXT.length] }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: CORES_MARGEM[i % CORES_MARGEM.length] }} />
                        {m.nome} ({m.percentual}%)
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ item, custoFinal, precos }, idx) => (
                  <tr key={item.id} className={`border-t border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="p-3 sticky left-0 border-r border-gray-100" style={{ background: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <p className="font-medium text-gray-800">{item.xprod}</p>
                      <p className="text-xs text-gray-400">{item.cprod}</p>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <input type="text" inputMode="decimal" className="no-spin w-16 text-right border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-brand-400"
                        value={editBuffer[`quebra-${item.id}`] ?? String(item.quebra)}
                        onChange={e => setEditBuffer(b => ({ ...b, [`quebra-${item.id}`]: e.target.value }))}
                        onBlur={e => { atualizarQuebra(item.id, e.target.value); setEditBuffer(b => { const x = { ...b }; delete x[`quebra-${item.id}`]; return x }) }} />
                    </td>
                    <td className="p-3 text-right text-gray-700 font-medium whitespace-nowrap border-r-2 border-gray-200">{fmt(custoFinal)}</td>
                    {precos.map((p, i) => (
                      <td key={i} className="p-3 text-right font-semibold whitespace-nowrap" style={{ background: CORES_MARGEM_BG_SUAVE[i % CORES_MARGEM_BG_SUAVE.length], color: CORES_MARGEM_TEXT[i % CORES_MARGEM_TEXT.length] }}>
                        {fmt(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mostrarImpressao && createPortal(
        <div className="fixed inset-0 bg-white z-[200] overflow-y-auto p-6 print:p-0">
          <div className="flex items-center justify-between mb-6 print:hidden">
            <h1 className="text-xl font-bold text-gray-900">Conferência de preços — {nota.fornecedor} #{nota.numero_nota}</h1>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer size={16} /> Imprimir / Salvar PDF</button>
              <button onClick={() => setMostrarImpressao(false)} className="btn-secondary flex items-center gap-2"><X size={16} /> Fechar</button>
            </div>
          </div>
          <h1 className="hidden print:block text-lg font-bold text-gray-900 mb-1">Conferência de preços — {nota.fornecedor} #{nota.numero_nota}</h1>
          <p className="hidden print:block text-xs text-gray-500 mb-4">{nota.razao_social} · {nota.loja ?? '—'} · {new Date().toLocaleDateString('pt-BR')}</p>
          <table className="min-w-full text-xs border border-gray-300">
            <thead>
              <tr>
                <th className="text-left p-1.5 border border-gray-300 bg-gray-100">Produto</th>
                <th className="text-center p-1.5 border border-gray-300 bg-gray-100">Código de barras</th>
                <th className="text-right p-1.5 border border-gray-300 bg-gray-100">Custo final</th>
                {margens.map((m, i) => (
                  <th key={m.id} className="text-right p-1.5 border border-gray-300 whitespace-nowrap" style={{ background: CORES_MARGEM_BG[i % CORES_MARGEM_BG.length], color: CORES_MARGEM_TEXT[i % CORES_MARGEM_TEXT.length] }}>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: CORES_MARGEM[i % CORES_MARGEM.length] }} />
                      {m.nome} ({m.percentual}%)
                    </span>
                  </th>
                ))}
                <th className="text-left p-1.5 border border-gray-300 w-28 bg-gray-100">Novo valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ item, custoFinal, precos }, idx) => (
                <tr key={item.id} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td className="p-1.5 border border-gray-300">{item.xprod}</td>
                  <td className="p-1.5 border border-gray-300 text-center"><Barcode value={item.cean} /></td>
                  <td className="p-1.5 border border-gray-300 text-right whitespace-nowrap font-medium">{fmt(custoFinal)}</td>
                  {precos.map((p, i) => (
                    <td key={i} className="p-1.5 border border-gray-300 text-right whitespace-nowrap font-semibold" style={{ background: CORES_MARGEM_BG_SUAVE[i % CORES_MARGEM_BG_SUAVE.length], color: CORES_MARGEM_TEXT[i % CORES_MARGEM_TEXT.length] }}>
                      {fmt(p)}
                    </td>
                  ))}
                  <td className="p-1.5 border border-gray-300"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
        document.body
      )}
    </div>
  )
}

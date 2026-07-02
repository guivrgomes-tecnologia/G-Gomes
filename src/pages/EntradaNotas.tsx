import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Trash2, FileText, AlertCircle, Plus, X, Calculator, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parseNFeXML, FILIAL_SIGLA, type NotaParseada } from '../lib/nfeXmlHelper'

type NotaEntrada = {
  id: string
  razao_social: string | null
  loja: string | null
  fornecedor: string | null
  numero_nota: string | null
  emitida_em: string | null
  data_recebimento: string | null
  entregue_por: string | null
  chave_acesso: string | null
  valor_total: number
  valor_adiantamento: number
}

const LOJAS_OPCOES = Object.values(FILIAL_SIGLA)

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataBR = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

export default function EntradaNotas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notas, setNotas] = useState<NotaEntrada[]>([])
  const [loading, setLoading] = useState(true)
  const [mesAtivo, setMesAtivo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const [pendingXml, setPendingXml] = useState<NotaParseada[]>([])
  const [stValues, setStValues] = useState<number[]>([]) // valor ST guia separada por nota
  const [pedidoVinculo, setPedidoVinculo] = useState<string>('') // grupo_id selecionado para vincular
  const [pedidosDisponiveis, setPedidosDisponiveis] = useState<{ grupo_id: string; numero_pedido: number | null; fornecedor: string | null }[]>([])
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})
  const [showManual, setShowManual] = useState(false)
  const [salvandoManual, setSalvandoManual] = useState(false)
  const [erroManual, setErroManual] = useState('')
  const [formManual, setFormManual] = useState({
    razao_social: '', loja: '', fornecedor: '', numero_nota: '', emitida_em: '', chave_acesso: '', valor_total: '',
  })

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (pendingXml.length === 0) { setPedidoVinculo(''); return }
    supabase.from('pedidos').select('grupo_id, numero_pedido, fornecedor')
      .in('status', ['PENDENTE', 'APROVADO'])
      .order('numero_pedido', { ascending: false })
      .then(({ data }) => {
        // Deduplica por grupo_id
        const vistos = new Set<string>()
        const lista = (data ?? []).filter((p: { grupo_id: string }) => {
          if (vistos.has(p.grupo_id)) return false
          vistos.add(p.grupo_id); return true
        })
        setPedidosDisponiveis(lista as { grupo_id: string; numero_pedido: number | null; fornecedor: string | null }[])
      })
  }, [pendingXml])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('entrada_notas_fiscais').select('*').order('emitida_em', { ascending: false })
    const lista = (data ?? []) as NotaEntrada[]
    setNotas(lista)
    const meses = Array.from(new Set(lista.filter(n => n.emitida_em).map(n => n.emitida_em!.slice(0, 7)))).sort((a, b) => b.localeCompare(a))
    setMesAtivo(prev => prev && meses.includes(prev) ? prev : (meses[0] ?? null))
    setLoading(false)
  }

  async function processarArquivos(files: FileList | File[]) {
    const lista = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'))
    if (lista.length === 0) return
    setEnviando(true)
    setErro('')
    const parsedList: NotaParseada[] = []
    let falhas = 0
    for (const file of lista) {
      const texto = await file.text()
      const parsed = parseNFeXML(texto)
      if (!parsed) { falhas++; continue }
      parsedList.push(parsed)
    }
    setEnviando(false)
    if (falhas > 0) setErro(`${falhas} arquivo(s) não eram XML de NFe válido e foram ignorados.`)
    if (parsedList.length > 0) {
      setPendingXml(parsedList)
      setStValues(Array(parsedList.length).fill(0))
    }
  }

  async function confirmarXml() {
    if (pendingXml.length === 0) return
    setEnviando(true)
    let duplicadas = 0
    for (let i = 0; i < pendingXml.length; i++) {
      const parsed = pendingXml[i]
      const valor_st_guia = stValues[i] ?? 0
      if (parsed.chave_acesso) {
        const { data: existente } = await supabase.from('entrada_notas_fiscais').select('id').eq('chave_acesso', parsed.chave_acesso).maybeSingle()
        if (existente) { duplicadas++; continue }
      }
      const { data: notaCriada } = await supabase.from('entrada_notas_fiscais').insert({
        razao_social: parsed.razao_social, loja: parsed.loja, fornecedor: parsed.fornecedor,
        numero_nota: parsed.numero_nota, emitida_em: parsed.emitida_em, chave_acesso: parsed.chave_acesso,
        valor_total: parsed.valor_total, usuario_id: user!.id,
        vprod_nf: parsed.vprod_nf, vfrete_nf: parsed.vfrete_nf, vseg_nf: parsed.vseg_nf, voutro_nf: parsed.voutro_nf, vdesc_nf: parsed.vdesc_nf,
        valor_st_guia: valor_st_guia || null,
        pedido_grupo_id: pedidoVinculo || null,
      }).select('id').single()
      if (notaCriada && parsed.itens.length > 0) {
        await supabase.from('entrada_notas_itens').insert(parsed.itens.map((it, ordem) => ({
          nota_id: notaCriada.id, cprod: it.cprod, cean: it.cean, xprod: it.xprod, qcom: it.qcom,
          vuntrib: it.vuntrib, vprod: it.vprod, vipi: it.vipi, vicmsst: it.vicmsst, vfcpst: it.vfcpst, vdesc: it.vdesc, ordem,
        })))
      }
    }
    setEnviando(false)
    setPendingXml([])
    setStValues([])
    setPedidoVinculo('')
    if (duplicadas > 0) setErro(`${duplicadas} nota(s) já existiam e foram ignoradas.`)
    await carregar()
  }

  async function salvarManual() {
    if (!formManual.razao_social.trim() || !formManual.fornecedor.trim() || !formManual.valor_total.trim()) {
      setErroManual('Preencha pelo menos razão social, fornecedor e valor total.')
      return
    }
    setSalvandoManual(true)
    setErroManual('')
    const chave = formManual.chave_acesso.trim() || null
    if (chave) {
      const { data: existente } = await supabase.from('entrada_notas_fiscais').select('id').eq('chave_acesso', chave).maybeSingle()
      if (existente) {
        setErroManual('Já existe uma nota com essa chave de acesso.')
        setSalvandoManual(false)
        return
      }
    }
    await supabase.from('entrada_notas_fiscais').insert({
      razao_social: formManual.razao_social.trim(),
      loja: formManual.loja || null,
      fornecedor: formManual.fornecedor.trim(),
      numero_nota: formManual.numero_nota.trim() || null,
      emitida_em: formManual.emitida_em || null,
      chave_acesso: chave,
      valor_total: parseValorBR(formManual.valor_total),
      usuario_id: user!.id,
    })
    setSalvandoManual(false)
    setShowManual(false)
    setFormManual({ razao_social: '', loja: '', fornecedor: '', numero_nota: '', emitida_em: '', chave_acesso: '', valor_total: '' })
    await carregar()
  }

  async function atualizarCampo(id: string, campo: 'data_recebimento' | 'entregue_por' | 'valor_adiantamento' | 'loja', valor: string) {
    const valorSalvo = campo === 'valor_adiantamento' ? parseValorBR(valor) : (valor.trim() || null)
    setNotas(prev => prev.map(n => n.id === id ? { ...n, [campo]: valorSalvo } : n))
    await supabase.from('entrada_notas_fiscais').update({ [campo]: valorSalvo }).eq('id', id)
  }

  async function deletarNota(id: string) {
    if (!confirm('Apagar esta nota fiscal de entrada?')) return
    await supabase.from('entrada_notas_fiscais').delete().eq('id', id)
    await carregar()
  }

  const meses = Array.from(new Set(notas.filter(n => n.emitida_em).map(n => n.emitida_em!.slice(0, 7)))).sort((a, b) => b.localeCompare(a))
  const notasDoMes = mesAtivo ? notas.filter(n => n.emitida_em?.slice(0, 7) === mesAtivo) : notas
  const totalDoMes = notasDoMes.reduce((s, n) => s + n.valor_total + n.valor_adiantamento, 0)

  function nomeMes(chave: string) {
    const [ano, mes] = chave.split('-')
    return new Date(Number(ano), Number(mes) - 1, 2).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  if (loading) {
    return <div className="p-8"><div className="card p-12 text-center text-gray-400">Carregando...</div></div>
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm text-gray-400">Anexe o XML das notas de entrada e controle a chegada de cada uma no escritório</p>
        </div>
        <button onClick={() => setShowManual(true)} className="btn-secondary flex items-center gap-2 text-sm shrink-0">
          <Plus size={15} /> Lançar manualmente
        </button>
      </div>

      {/* Upload de XML */}
      <label
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault()
          setArrastando(false)
          if (e.dataTransfer.files?.length) processarArquivos(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 mb-6 cursor-pointer transition-colors text-center ${arrastando ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:bg-gray-50'}`}>
        <Upload size={24} className="text-gray-400" />
        <p className="text-sm text-gray-600 font-medium">{enviando ? 'Processando...' : 'Arraste os XMLs aqui ou clique para escolher'}</p>
        <p className="text-xs text-gray-400">Pode soltar vários arquivos de uma vez. Se não tiver o XML, use "Lançar manualmente".</p>
        <input type="file" accept=".xml" multiple className="hidden" disabled={enviando}
          onChange={e => { if (e.target.files?.length) processarArquivos(e.target.files); e.target.value = '' }} />
      </label>

      {erro && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-1.5">
          <AlertCircle size={13} className="shrink-0" /> {erro}
        </p>
      )}

      {meses.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhuma nota cadastrada ainda.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {meses.map(m => (
              <button key={m} onClick={() => setMesAtivo(m)}
                className={`text-sm py-1.5 px-3.5 rounded-lg border font-medium capitalize transition-colors ${m === mesAtivo ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                {nomeMes(m)}
              </button>
            ))}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 inline-block">
            <p className="text-xs font-medium text-gray-500">Total do mês ({notasDoMes.length} nota{notasDoMes.length !== 1 ? 's' : ''})</p>
            <p className="text-xl font-bold text-gray-800">{fmt(totalDoMes)}</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left p-3 sticky left-0 bg-gray-50 min-w-[90px]">Razão</th>
                  <th className="text-left p-3">Loja</th>
                  <th className="text-left p-3 min-w-[140px]">Fornecedor</th>
                  <th className="text-left p-3">Número</th>
                  <th className="text-left p-3">Emitida em</th>
                  <th className="text-left p-3 bg-amber-50 text-amber-700 font-semibold min-w-[130px]">Recebimento</th>
                  <th className="text-left p-3 bg-amber-50 text-amber-700 font-semibold min-w-[130px]">Entregue por</th>
                  <th className="text-left p-3 min-w-[180px]">Chave de acesso</th>
                  <th className="text-right p-3">Valor total</th>
                  <th className="text-right p-3 bg-amber-50 text-amber-700 font-semibold min-w-[120px]">Adiantamento</th>
                  <th className="text-right p-3 bg-emerald-50 text-emerald-700 font-semibold">Total fornecedor</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {notasDoMes.map(n => (
                  <tr key={n.id} className="border-t border-gray-400 hover:bg-gray-50/60">
                    <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap">{n.razao_social ?? '—'}</td>
                    <td className="p-2">
                      <select className="border border-gray-200 rounded-lg px-1.5 py-1 text-xs bg-white" value={n.loja ?? ''}
                        onChange={e => atualizarCampo(n.id, 'loja', e.target.value)}>
                        <option value="">—</option>
                        {LOJAS_OPCOES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-gray-700 whitespace-nowrap">{n.fornecedor ?? '—'}</td>
                    <td className="p-3 text-gray-700 whitespace-nowrap">{n.numero_nota ?? '—'}</td>
                    <td className="p-3 text-gray-500 whitespace-nowrap">{fmtDataBR(n.emitida_em)}</td>
                    <td className="p-2 bg-amber-50/40">
                      <input type="date" className="border border-amber-200 rounded-lg px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-amber-400"
                        value={n.data_recebimento ?? ''} onChange={e => atualizarCampo(n.id, 'data_recebimento', e.target.value)} />
                    </td>
                    <td className="p-2 bg-amber-50/40">
                      <input type="text" placeholder="Quem entregou" className="w-full border border-amber-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-amber-400"
                        value={editBuffer[`${n.id}-entregue`] ?? n.entregue_por ?? ''}
                        onChange={e => setEditBuffer(b => ({ ...b, [`${n.id}-entregue`]: e.target.value }))}
                        onBlur={e => {
                          atualizarCampo(n.id, 'entregue_por', e.target.value)
                          setEditBuffer(b => { const x = { ...b }; delete x[`${n.id}-entregue`]; return x })
                        }} />
                    </td>
                    <td className="p-3 text-gray-400 text-xs whitespace-nowrap" title={n.chave_acesso ?? ''}>{n.chave_acesso ?? '—'}</td>
                    <td className="p-3 text-right text-gray-700 whitespace-nowrap">{fmt(n.valor_total)}</td>
                    <td className="p-2 bg-amber-50/40">
                      <input type="text" inputMode="decimal" className="no-spin w-24 text-right border border-amber-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:border-amber-400"
                        value={editBuffer[`${n.id}-adiant`] ?? (n.valor_adiantamento ? n.valor_adiantamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                        onChange={e => setEditBuffer(b => ({ ...b, [`${n.id}-adiant`]: e.target.value }))}
                        onBlur={e => {
                          atualizarCampo(n.id, 'valor_adiantamento', e.target.value)
                          setEditBuffer(b => { const x = { ...b }; delete x[`${n.id}-adiant`]; return x })
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    </td>
                    <td className="p-3 text-right font-semibold text-emerald-700 bg-emerald-50/40 whitespace-nowrap">{fmt(n.valor_total + n.valor_adiantamento)}</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <button onClick={() => navigate(`/entrada-notas/${n.id}`)} title="Calcular preços dos itens" className="text-gray-400 hover:text-brand-600 mr-2"><Calculator size={14} /></button>
                      <button onClick={() => deletarNota(n.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-400 font-semibold bg-gray-50">
                  <td colSpan={10} className="p-3 text-right">Total do mês</td>
                  <td className="p-3 text-right text-emerald-700">{fmt(totalDoMes)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Preview de notas XML antes de salvar */}
      {pendingXml.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPendingXml([])}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <FileText size={16} className="text-brand-500" />
                {pendingXml.length === 1 ? 'Confirmar nota fiscal' : `Confirmar ${pendingXml.length} notas fiscais`}
              </h3>
              <button onClick={() => setPendingXml([])} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {pendingXml.map((n, i) => (
                <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{n.fornecedor ?? n.razao_social ?? '—'}</p>
                      <p className="text-xs text-gray-500">{n.razao_social}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-600">{fmt(n.valor_total)}</p>
                      {n.loja && <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-medium">{n.loja}</span>}
                    </div>
                  </div>
                  <div className="px-4 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {n.numero_nota && <div><span className="text-gray-400">Nº nota:</span> <span className="font-medium">{n.numero_nota}</span></div>}
                    {n.emitida_em && <div><span className="text-gray-400">Emissão:</span> <span className="font-medium">{fmtDataBR(n.emitida_em)}</span></div>}
                    <div><span className="text-gray-400">Itens:</span> <span className="font-medium">{n.itens.length}</span></div>
                    {n.vfrete_nf > 0 && <div><span className="text-gray-400">Frete NF:</span> <span className="font-medium">{fmt(n.vfrete_nf)}</span></div>}
                    {n.vdesc_nf > 0 && <div><span className="text-gray-400">Desconto:</span> <span className="font-medium text-green-600">-{fmt(n.vdesc_nf)}</span></div>}
                  </div>
                  {/* Campo ST guia separada */}
                  <div className="px-4 pb-3 flex items-center gap-3 border-t border-gray-100 pt-2.5">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        ST guia separada <span className="text-gray-400 font-normal">(se houver)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                        <input
                          type="number" min="0" step="0.01"
                          placeholder="0,00"
                          className="input w-full pl-7 text-xs py-1.5"
                          value={stValues[i] || ''}
                          onChange={e => setStValues(prev => prev.map((v, idx) => idx === i ? parseFloat(e.target.value) || 0 : v))}
                        />
                      </div>
                    </div>
                    {(stValues[i] ?? 0) > 0 && (
                      <div className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 shrink-0">
                        <p className="font-medium">ST: {fmt(stValues[i])}</p>
                        <p className="text-orange-400">Rateado por produto</p>
                      </div>
                    )}
                  </div>
                  {n.itens.length > 0 && (
                    <div className="border-t border-gray-100 max-h-48 overflow-y-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Produto</th>
                            <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Qtd</th>
                            <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {n.itens.map((it, j) => (
                            <tr key={j} className="hover:bg-gray-50/50">
                              <td className="px-3 py-1.5 text-gray-700 leading-tight">{it.xprod ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right text-gray-500">{it.qcom}</td>
                              <td className="px-3 py-1.5 text-right font-medium text-gray-800">{fmt(it.vprod)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 pb-3 shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Vincular a um pedido <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select
                className="input w-full"
                value={pedidoVinculo}
                onChange={e => setPedidoVinculo(e.target.value)}
              >
                <option value="">— Sem vínculo —</option>
                {pedidosDisponiveis.map(p => (
                  <option key={p.grupo_id} value={p.grupo_id}>
                    {p.numero_pedido != null ? `#${String(p.numero_pedido).padStart(3, '0')} — ` : ''}{p.fornecedor ?? 'Sem nome'}
                  </option>
                ))}
              </select>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => { setPendingXml([]); setPedidoVinculo('') }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={confirmarXml} disabled={enviando} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <CheckCircle2 size={15} />
                {enviando ? 'Salvando...' : `Salvar ${pendingXml.length > 1 ? pendingXml.length + ' notas' : 'nota'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowManual(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Plus size={18} /> Lançar nota manualmente</h3>
              <button onClick={() => setShowManual(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Use quando não tiver o XML da nota. Recebimento, entregue por e adiantamento dá pra preencher depois, direto na lista.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Razão social (minha empresa) *</label>
                <input className="input text-sm" value={formManual.razao_social} onChange={e => setFormManual(f => ({ ...f, razao_social: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Loja</label>
                  <select className="input text-sm" value={formManual.loja} onChange={e => setFormManual(f => ({ ...f, loja: e.target.value }))}>
                    <option value="">—</option>
                    {LOJAS_OPCOES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Número da nota</label>
                  <input className="input text-sm" value={formManual.numero_nota} onChange={e => setFormManual(f => ({ ...f, numero_nota: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fornecedor *</label>
                <input className="input text-sm" value={formManual.fornecedor} onChange={e => setFormManual(f => ({ ...f, fornecedor: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Emitida em</label>
                  <input type="date" className="input text-sm" value={formManual.emitida_em} onChange={e => setFormManual(f => ({ ...f, emitida_em: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor total *</label>
                  <input type="text" inputMode="decimal" className="no-spin input text-sm text-right" placeholder="0,00" value={formManual.valor_total} onChange={e => setFormManual(f => ({ ...f, valor_total: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Chave de acesso (opcional)</label>
                <input className="input text-sm" value={formManual.chave_acesso} onChange={e => setFormManual(f => ({ ...f, chave_acesso: e.target.value }))} />
              </div>
            </div>
            {erroManual && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 flex items-center gap-1.5">
                <AlertCircle size={13} className="shrink-0" /> {erroManual}
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowManual(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={salvarManual} disabled={salvandoManual} className="btn-primary flex-1">
                {salvandoManual ? 'Salvando...' : 'Lançar nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

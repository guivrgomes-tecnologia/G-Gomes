import { useEffect, useState } from 'react'
import { Upload, Trash2, FileText, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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

// Filial do CNPJ do destinatário (eu, comprador) → sigla da loja.
const FILIAL_SIGLA: Record<string, string> = {
  '0001': 'DP', '0004': '3R', '0005': 'AT', '0006': 'RT',
  '0007': 'AP', '0008': 'VL', '0009': 'PF', '0010': '33',
}
const LOJAS_OPCOES = Object.values(FILIAL_SIGLA)

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataBR = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

function parseValorBR(valor: string): number {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

type NotaParseada = {
  razao_social: string | null
  loja: string | null
  fornecedor: string | null
  numero_nota: string | null
  emitida_em: string | null
  chave_acesso: string | null
  valor_total: number
}

function parseNFeXML(texto: string): NotaParseada | null {
  const doc = new DOMParser().parseFromString(texto, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  const ide = doc.getElementsByTagName('ide')[0]
  const emit = doc.getElementsByTagName('emit')[0]
  const dest = doc.getElementsByTagName('dest')[0]
  const icmsTot = doc.getElementsByTagName('ICMSTot')[0]
  if (!infNFe || !ide || !emit || !dest) return null

  const idAttr = infNFe.getAttribute('Id') ?? ''
  const chave_acesso = idAttr.replace(/^NFe/i, '') || doc.getElementsByTagName('chNFe')[0]?.textContent || null

  const numero_nota = ide.getElementsByTagName('nNF')[0]?.textContent ?? null
  const dataEmissao = ide.getElementsByTagName('dhEmi')[0]?.textContent ?? ide.getElementsByTagName('dEmi')[0]?.textContent ?? null
  const emitida_em = dataEmissao ? dataEmissao.slice(0, 10) : null

  const fornecedor = emit.getElementsByTagName('xNome')[0]?.textContent ?? null

  const razaoCompleta = dest.getElementsByTagName('xNome')[0]?.textContent ?? ''
  const razao_social = razaoCompleta.trim().split(/\s+/)[0] || null
  const cnpj = dest.getElementsByTagName('CNPJ')[0]?.textContent ?? ''
  const filial = cnpj.length === 14 ? cnpj.slice(8, 12) : ''
  const loja = FILIAL_SIGLA[filial] ?? null

  const valor_total = parseFloat(icmsTot?.getElementsByTagName('vNF')[0]?.textContent ?? '0') || 0

  return { razao_social, loja, fornecedor, numero_nota, emitida_em, chave_acesso, valor_total }
}

export default function EntradaNotas() {
  const { user } = useAuth()
  const [notas, setNotas] = useState<NotaEntrada[]>([])
  const [loading, setLoading] = useState(true)
  const [mesAtivo, setMesAtivo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({})

  useEffect(() => { carregar() }, [])

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
    let falhas = 0
    let duplicadas = 0
    for (const file of lista) {
      const texto = await file.text()
      const parsed = parseNFeXML(texto)
      if (!parsed) { falhas++; continue }
      if (parsed.chave_acesso) {
        const { data: existente } = await supabase.from('entrada_notas_fiscais').select('id').eq('chave_acesso', parsed.chave_acesso).maybeSingle()
        if (existente) { duplicadas++; continue }
      }
      await supabase.from('entrada_notas_fiscais').insert({
        razao_social: parsed.razao_social, loja: parsed.loja, fornecedor: parsed.fornecedor,
        numero_nota: parsed.numero_nota, emitida_em: parsed.emitida_em, chave_acesso: parsed.chave_acesso,
        valor_total: parsed.valor_total, usuario_id: user!.id,
      })
    }
    setEnviando(false)
    if (falhas > 0) setErro(`${falhas} arquivo(s) não eram XML de NFe válido e foram ignorados.${duplicadas > 0 ? ` ${duplicadas} já existiam (chave de acesso repetida) e também foram ignoradas.` : ''}`)
    else if (duplicadas > 0) setErro(`${duplicadas} nota(s) já existiam (chave de acesso repetida) e foram ignoradas.`)
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Entrada de Notas</h1>
        <p className="text-sm text-gray-400">Anexe o XML das notas de entrada e controle a chegada de cada uma no escritório</p>
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
        <p className="text-xs text-gray-400">Pode soltar vários arquivos de uma vez</p>
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
                  <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50/60">
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
                    <td className="p-3 text-center">
                      <button onClick={() => deletarNota(n.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                  <td colSpan={10} className="p-3 text-right">Total do mês</td>
                  <td className="p-3 text-right text-emerald-700">{fmt(totalDoMes)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// Filial do CNPJ do destinatário (eu, comprador) → sigla da loja.
export const FILIAL_SIGLA: Record<string, string> = {
  '0001': 'DP', '0004': '3R', '0005': 'AT', '0006': 'RT',
  '0007': 'AP', '0008': 'VL', '0009': 'PF', '0010': '33',
}

export type ItemNFe = {
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
}

export type NotaParseada = {
  razao_social: string | null
  loja: string | null
  fornecedor: string | null
  numero_nota: string | null
  emitida_em: string | null
  chave_acesso: string | null
  valor_total: number
  vprod_nf: number
  vfrete_nf: number
  vseg_nf: number
  voutro_nf: number
  vdesc_nf: number
  itens: ItemNFe[]
}

function num(texto: string | null | undefined): number {
  const v = parseFloat(texto ?? '0')
  return Number.isFinite(v) ? v : 0
}

export function parseNFeXML(texto: string): NotaParseada | null {
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

  const valor_total = num(icmsTot?.getElementsByTagName('vNF')[0]?.textContent)
  const vprod_nf = num(icmsTot?.getElementsByTagName('vProd')[0]?.textContent)
  const vfrete_nf = num(icmsTot?.getElementsByTagName('vFrete')[0]?.textContent)
  const vseg_nf = num(icmsTot?.getElementsByTagName('vSeg')[0]?.textContent)
  const voutro_nf = num(icmsTot?.getElementsByTagName('vOutro')[0]?.textContent)
  const vdesc_nf = num(icmsTot?.getElementsByTagName('vDesc')[0]?.textContent)

  const itens: ItemNFe[] = Array.from(doc.getElementsByTagName('det')).map(det => {
    const prod = det.getElementsByTagName('prod')[0]
    return {
      cprod: prod?.getElementsByTagName('cProd')[0]?.textContent ?? null,
      cean: prod?.getElementsByTagName('cEAN')[0]?.textContent ?? null,
      xprod: prod?.getElementsByTagName('xProd')[0]?.textContent ?? null,
      qcom: num(prod?.getElementsByTagName('qCom')[0]?.textContent),
      vuntrib: num(prod?.getElementsByTagName('vUnTrib')[0]?.textContent),
      vprod: num(prod?.getElementsByTagName('vProd')[0]?.textContent),
      vipi: num(det.getElementsByTagName('vIPI')[0]?.textContent),
      vicmsst: num(det.getElementsByTagName('vICMSST')[0]?.textContent),
      vfcpst: num(det.getElementsByTagName('vFCPST')[0]?.textContent),
      vdesc: num(prod?.getElementsByTagName('vDesc')[0]?.textContent),
    }
  })

  return { razao_social, loja, fornecedor, numero_nota, emitida_em, chave_acesso, valor_total, vprod_nf, vfrete_nf, vseg_nf, voutro_nf, vdesc_nf, itens }
}

// Custo do item POR UNIDADE, antes de adiantamento/frete manual: vProd + vIPI + vICMSST + vFCPST do
// item, mais a parte proporcional (por participação no vProd total da nota) do frete/seguro/outras
// despesas menos desconto que vierem no total da NF — tudo isso vem como total da linha (qCom
// unidades) na própria NFe, por isso divide por qCom no final pra chegar no custo unitário.
export function custoBaseItem(item: Pick<ItemNFe, 'vprod' | 'vipi' | 'vicmsst' | 'vfcpst' | 'vdesc' | 'qcom'>, nota: { vprod_nf: number; vfrete_nf: number; vseg_nf: number; voutro_nf: number; vdesc_nf: number }): number {
  const rateioNF = nota.vfrete_nf + nota.vseg_nf + nota.voutro_nf - nota.vdesc_nf
  const proporcao = nota.vprod_nf > 0 ? item.vprod / nota.vprod_nf : 0
  const custoLinha = item.vprod + item.vipi + item.vicmsst + item.vfcpst - item.vdesc + rateioNF * proporcao
  return item.qcom > 0 ? custoLinha / item.qcom : custoLinha
}

// Preço quebrado em ,99 — sempre arredonda pra cima até o próximo inteiro e tira 1 centavo.
export function arredondar99(valor: number): number {
  if (valor <= 0) return 0
  return Math.ceil(valor) - 0.01
}

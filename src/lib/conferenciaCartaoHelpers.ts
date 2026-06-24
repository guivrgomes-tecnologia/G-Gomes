import * as XLSX from 'xlsx'

// Mapeamento entre o código de loja do sistema PDV, o "estabelecimento" da Rede e o nome da loja.
export const LOJAS_CARTAO = [
  { nome: '02 - TRÊS RIOS', codloja: 2, estabelecimento: '102205965', contaDepositoPadrao: 'FAPS ITAU' },
  { nome: '03 - ATERRADO 56', codloja: 3, estabelecimento: '102236062', contaDepositoPadrao: 'FAPS ITAU' },
  { nome: '04 - RETIRO', codloja: 4, estabelecimento: '102178364', contaDepositoPadrao: 'FAPS ITAU' },
  { nome: '05 - AMARAL P.', codloja: 5, estabelecimento: '102179069', contaDepositoPadrao: 'FAPS ITAU' },
  { nome: '06 - VILA', codloja: 6, estabelecimento: '102183139', contaDepositoPadrao: 'FAPS ITAU' },
  { nome: '07 - ATERRADO 968', codloja: 7, estabelecimento: '102237220', contaDepositoPadrao: 'FAPS SICOOB' },
  { nome: '08 - FEITO DOCE 33', codloja: 8, estabelecimento: '102183155', contaDepositoPadrao: 'FAPS ITAU' },
]

export type LinhaConferencia = {
  loja: string
  vendaCartao: number
  recebidoRede: number
  taxaRede: number
  diferenca: number
}

function lerAba(file: File, nomeAbaPreferida?: string): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array', cellDates: true })
        let nomeAba = wb.SheetNames[0]
        if (nomeAbaPreferida) {
          const encontrada = wb.SheetNames.find(n => n.trim().toLowerCase() === nomeAbaPreferida.toLowerCase())
          if (encontrada) nomeAba = encontrada
        }
        const ws = wb.Sheets[nomeAba]
        const linhas = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true })
        resolve(linhas)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function paraDDMMYYYY(diaISO: string) {
  const [y, m, d] = diaISO.split('-')
  return `${d}/${m}/${y}`
}

function dataParaISO(v: any): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

// Relatório do sistema PDV ("Filtro Sistema"): CODLOJA, DATA, DESCRICAO_LOJA, CODCAIXA, SEQUENCIAL, COO, DESCRICAO, VALOR, ...
async function calcularVendaCartaoPorLoja(file: File, diaISO: string): Promise<Map<number, number>> {
  const linhas = await lerAba(file, 'Dados')
  const diaBR = paraDDMMYYYY(diaISO)
  const resultado = new Map<number, number>()

  for (const row of linhas) {
    const codloja = Number(row[0])
    if (!Number.isFinite(codloja) || codloja <= 0) continue
    const dataRow = row[1]
    const dataISORow = dataParaISO(dataRow)
    const bateData = dataISORow === diaISO || String(dataRow).trim() === diaBR
    if (!bateData) continue
    const descricao = String(row[6] ?? '').trim().toUpperCase()
    if (!descricao.includes('CARTOES') || descricao.includes('PIX')) continue
    const valor = Number(row[7])
    if (!Number.isFinite(valor)) continue
    resultado.set(codloja, (resultado.get(codloja) ?? 0) + valor)
  }
  return resultado
}

// Relatório da operadora Rede ("Filtro Rede"): data do recebimento, data original da venda, data original de vencimento,
// valor bruto da parcela original, valor bruto da parcela atualizada, taxa MDR, valor MDR descontado, valor líquido da parcela, ...,
// nome do estabelecimento(15), estabelecimento(16)
// Soma todos os lançamentos do arquivo por estabelecimento, sem filtrar por data: cartões passados no fim do dia
// podem só aparecer no relatório da Rede dois dias depois, então a data da venda não é um filtro confiável aqui.
async function calcularRedePorEstabelecimento(file: File): Promise<Map<string, { liquido: number; mdr: number }>> {
  const linhas = await lerAba(file, 'pagamentos')
  const resultado = new Map<string, { liquido: number; mdr: number }>()

  for (const row of linhas) {
    const estabelecimento = String(row[16] ?? '').trim()
    if (!estabelecimento) continue
    const mdr = Number(row[6])
    const liquido = Number(row[7])
    if (!Number.isFinite(liquido) && !Number.isFinite(mdr)) continue
    const atual = resultado.get(estabelecimento) ?? { liquido: 0, mdr: 0 }
    atual.liquido += Number.isFinite(liquido) ? liquido : 0
    atual.mdr += Number.isFinite(mdr) ? mdr : 0
    resultado.set(estabelecimento, atual)
  }
  return resultado
}

export type LinhaDinheiro = {
  loja: string
  vendaDinheiro: number
}

// Coluna J ("Total Recebido Cupom") do relatório do sistema, filtrando por DESCRICAO contendo "DINHEIRO" e pela data da venda.
async function calcularVendaDinheiroPorLoja(file: File, diaISO: string): Promise<Map<number, number>> {
  const linhas = await lerAba(file, 'Dados')
  const diaBR = paraDDMMYYYY(diaISO)
  const resultado = new Map<number, number>()

  for (const row of linhas) {
    const codloja = Number(row[0])
    if (!Number.isFinite(codloja) || codloja <= 0) continue
    const dataRow = row[1]
    const dataISORow = dataParaISO(dataRow)
    const bateData = dataISORow === diaISO || String(dataRow).trim() === diaBR
    if (!bateData) continue
    const descricao = String(row[6] ?? '').trim().toUpperCase()
    if (!descricao.includes('DINHEIRO')) continue
    const valor = Number(row[9])
    if (!Number.isFinite(valor)) continue
    resultado.set(codloja, (resultado.get(codloja) ?? 0) + valor)
  }
  return resultado
}

export async function calcularConferenciaDinheiro(arquivoSistema: File, diaISO: string): Promise<LinhaDinheiro[]> {
  const vendaPorLoja = await calcularVendaDinheiroPorLoja(arquivoSistema, diaISO)
  return LOJAS_CARTAO.map(({ nome, codloja }) => ({ loja: nome, vendaDinheiro: vendaPorLoja.get(codloja) ?? 0 }))
}

export async function calcularConferenciaCartao(arquivoSistema: File, arquivoRede: File, diaISO: string): Promise<LinhaConferencia[]> {
  const [vendaPorLoja, redePorEstabelecimento] = await Promise.all([
    calcularVendaCartaoPorLoja(arquivoSistema, diaISO),
    calcularRedePorEstabelecimento(arquivoRede),
  ])

  return LOJAS_CARTAO.map(({ nome, codloja, estabelecimento }) => {
    const vendaCartao = vendaPorLoja.get(codloja) ?? 0
    const rede = redePorEstabelecimento.get(estabelecimento) ?? { liquido: 0, mdr: 0 }
    const recebidoRede = rede.liquido
    const taxaRede = rede.mdr
    const diferenca = (recebidoRede + taxaRede) - vendaCartao
    return { loja: nome, vendaCartao, recebidoRede, taxaRede, diferenca }
  })
}

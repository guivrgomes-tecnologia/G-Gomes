import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  nome: string
  email: string
  cargo: string | null
  avatar_url: string | null
  is_admin: boolean
  modulos: string[] | null
  created_at: string
}

export type CategoriaEvento = {
  id: string
  nome: string
  cor: string
  criado_por: string | null
  created_at: string
}

export type Evento = {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string
  data_fim: string | null
  dia_inteiro: boolean
  cor: string
  concluido: boolean
  categoria_id: string | null
  recorrencia_grupo: string | null
  lembrete_minutos: number
  lembretes_minutos: number[]
  criado_por: string
  google_event_id: string | null
  created_at: string
  categoria?: CategoriaEvento
}

export type Processo = {
  id: string
  titulo: string
  descricao: string | null
  categoria: string
  status: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'
  prioridade: 'baixa' | 'media' | 'alta'
  responsavel_id: string | null
  prazo: string | null
  criado_por: string
  created_at: string
  updated_at: string
  responsavel?: Profile
}

export type Setor = {
  id: string
  nome: string
  descricao: string | null
  cor: string
  criado_por: string | null
  created_at: string
}

export type Pendencia = {
  id: string
  titulo: string
  descricao: string | null
  status: 'aberta' | 'em_andamento' | 'solucao_apresentada' | 'resolvida'
  solucao: string | null
  prioridade: 'baixa' | 'media' | 'alta'
  de_usuario_id: string
  para_usuario_id: string
  setor_id: string | null
  evento_id: string | null
  prazo: string | null
  criado_por: string
  created_at: string
  updated_at: string
  de_usuario?: Profile
  para_usuario?: Profile
  setor?: Setor
  pendencia_participantes?: { usuario_id: string; profile: Profile }[]
  pendencia_tarefas?: PendenciaTarefa[]
  pendencia_comentarios?: { id: string }[]
}

export type PendenciaComentario = {
  id: string
  pendencia_id: string
  autor_id: string
  mensagem: string
  imagem_url?: string | null
  tarefa_id?: string | null
  tarefa_texto?: string | null
  created_at: string
  autor?: Profile
}

export type PendenciaAnexo = {
  id: string
  pendencia_id: string
  nome_arquivo: string
  url: string
  path: string
  tipo: string | null
  tamanho: number | null
  criado_por: string
  created_at: string
  autor?: Profile
}

export type PendenciaLeitura = {
  pendencia_id: string
  usuario_id: string
  lido_em: string
}

export type Notificacao = {
  id: string
  usuario_id: string
  tipo: string
  titulo: string
  mensagem: string | null
  link: string | null
  lida: boolean
  created_at: string
}

export async function criarNotificacoes(rows: { usuario_id: string; tipo: string; titulo: string; mensagem?: string | null; link?: string | null }[]) {
  const unicos = rows.filter((r, i) => r.usuario_id && rows.findIndex(x => x.usuario_id === r.usuario_id) === i)
  if (unicos.length === 0) return
  await supabase.from('notificacoes').insert(unicos)
}

export type ReuniaPasta = {
  id: string
  nome: string
  cor: string
  pautas_fixas: string | null
  criado_por: string | null
  created_at: string
}

export type Reuniao = {
  id: string
  titulo: string
  data: string | null
  pasta_id: string
  pauta: string | null
  transcricao: string | null
  tipo: 'presencial' | 'online'
  link_video: string | null
  evento_id: string | null
  criado_por: string
  created_at: string
  updated_at: string
  pasta?: ReuniaPasta
  dados_importados?: DadosImportados[] | null
  pauta_topicos?: PautaTopico[] | null
  google_event_id?: string | null
}

export type PautaTopico = {
  id: string
  titulo: string
  duracao: string
  descricao: string
}

export type DadosImportadosMetas = {
  id: string
  tipo: 'metas'
  titulo: string
  criado_em: string
  mesTitulo: string
  blocos: {
    label: string
    lojas: { nome: string; gerente: string | null; meta: number; realizado: number | null }[]
    totalMeta: number
    totalRealizado: number
  }[]
}
export type DadosImportadosHistorico = {
  id: string
  tipo: 'historico'
  titulo: string
  criado_em: string
  ano: number
  mesLabel: string
  lojas: { nome: string; valor: number; var1: number | null; var2: number | null }[]
  totalRede: number
  totalVar1: number | null
  totalVar2: number | null
}
export type DadosImportados = DadosImportadosMetas | DadosImportadosHistorico

export type PendenciaTarefa = {
  id: string
  pendencia_id: string
  texto: string
  concluida: boolean
  ordem: number
  created_at: string
}

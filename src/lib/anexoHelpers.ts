import { supabase } from './supabase'

const TAMANHO_MAXIMO = 20 * 1024 * 1024 // 20MB

export async function uploadAnexoPendencia(file: File, pasta: string): Promise<{ url: string; path: string } | null> {
  if (file.size > TAMANHO_MAXIMO) {
    alert('Arquivo muito grande (máximo 20MB).')
    return null
  }
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${pasta}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('pendencia-anexos').upload(path, file)
  if (error) { alert('Erro ao enviar arquivo: ' + error.message); return null }
  const { data } = supabase.storage.from('pendencia-anexos').getPublicUrl(path)
  return { url: data.publicUrl, path }
}

export async function deletarAnexoPendencia(path: string) {
  await supabase.storage.from('pendencia-anexos').remove([path])
}

export function formatTamanhoArquivo(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

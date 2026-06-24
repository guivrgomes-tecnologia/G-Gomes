import { supabase } from './supabase'

export async function uploadImagemChat(file: File, pasta: string): Promise<string | null> {
  if (!file.type.startsWith('image/')) {
    alert('Só é possível enviar imagens.')
    return null
  }
  if (file.size > 8 * 1024 * 1024) {
    alert('Imagem muito grande (máximo 8MB).')
    return null
  }
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${pasta}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('chat-imagens').upload(path, file)
  if (error) { alert('Erro ao enviar imagem: ' + error.message); return null }
  const { data } = supabase.storage.from('chat-imagens').getPublicUrl(path)
  return data.publicUrl
}

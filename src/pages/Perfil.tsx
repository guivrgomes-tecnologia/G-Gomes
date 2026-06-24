import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { User, Mail, Lock, Check, Camera } from 'lucide-react'
import Avatar from '../components/Avatar'

export default function Perfil() {
  const { profile, user, refreshProfile } = useAuth()

  const [nome, setNome] = useState(profile?.nome ?? '')
  const [cargo, setCargo] = useState(profile?.cargo ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  const [savingPerfil, setSavingPerfil] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingSenha, setSavingSenha] = useState(false)
  const [msgPerfil, setMsgPerfil] = useState('')
  const [msgEmail, setMsgEmail] = useState('')
  const [msgSenha, setMsgSenha] = useState('')
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [msgFoto, setMsgFoto] = useState('')

  async function selecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (file.size > 5 * 1024 * 1024) { setMsgFoto('Imagem muito grande (máx. 5MB).'); return }
    setUploadingFoto(true)
    setMsgFoto('')
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setUploadingFoto(false)
      setMsgFoto('Erro ao enviar imagem.')
      return
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${pub.publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    setUploadingFoto(false)
    if (updateError) { setMsgFoto('Erro ao salvar foto.'); return }
    await refreshProfile()
    setMsgFoto('Foto atualizada!')
    setTimeout(() => setMsgFoto(''), 3000)
  }

  async function salvarPerfil() {
    if (!nome.trim()) return
    setSavingPerfil(true)
    setMsgPerfil('')
    const { error } = await supabase.from('profiles').update({ nome: nome.trim(), cargo: cargo.trim() || null }).eq('id', profile!.id)
    setSavingPerfil(false)
    setMsgPerfil(error ? 'Erro ao salvar.' : 'Salvo com sucesso!')
    setTimeout(() => setMsgPerfil(''), 3000)
  }

  async function salvarEmail() {
    if (!email.trim() || email === user?.email) return
    setSavingEmail(true)
    setMsgEmail('')
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setSavingEmail(false)
    setMsgEmail(error ? 'Erro ao atualizar e-mail.' : 'Confirmação enviada para o novo e-mail.')
    setTimeout(() => setMsgEmail(''), 5000)
  }

  async function salvarSenha() {
    if (!novaSenha || novaSenha !== confirmarSenha) {
      setMsgSenha('As senhas não coincidem.')
      return
    }
    if (novaSenha.length < 6) {
      setMsgSenha('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setSavingSenha(true)
    setMsgSenha('')
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSavingSenha(false)
    if (error) {
      setMsgSenha('Erro ao alterar senha.')
    } else {
      setMsgSenha('Senha alterada com sucesso!')
      setNovaSenha(''); setConfirmarSenha('')
    }
    setTimeout(() => setMsgSenha(''), 4000)
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Meu perfil</h1>

      {/* Foto de perfil */}
      <div className="card p-6 mb-6 flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar nome={profile?.nome ?? '?'} avatarUrl={profile?.avatar_url} size={64} className="text-xl" />
          <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center cursor-pointer hover:bg-brand-700 transition-colors">
            <Camera size={12} />
            <input type="file" accept="image/*" className="hidden" onChange={selecionarFoto} disabled={uploadingFoto} />
          </label>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">Foto de perfil</p>
          <p className="text-xs text-gray-400">{uploadingFoto ? 'Enviando...' : 'Clique no ícone da câmera para trocar'}</p>
          {msgFoto && <p className={`text-xs mt-0.5 ${msgFoto.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>{msgFoto}</p>}
        </div>
      </div>

      {/* Dados pessoais */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <User size={15} /> Dados pessoais
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
            <input className="input" placeholder="Ex: Diretor, Gerente..." value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={salvarPerfil} disabled={savingPerfil || !nome.trim()} className="btn-primary">
            {savingPerfil ? 'Salvando...' : 'Salvar'}
          </button>
          {msgPerfil && (
            <span className="text-sm text-green-600 flex items-center gap-1"><Check size={14} /> {msgPerfil}</span>
          )}
        </div>
      </div>

      {/* E-mail */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <Mail size={15} /> E-mail
        </h2>
        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <div className="flex items-center gap-3 mt-4">
          <button onClick={salvarEmail} disabled={savingEmail || email === user?.email} className="btn-primary">
            {savingEmail ? 'Salvando...' : 'Atualizar e-mail'}
          </button>
          {msgEmail && (
            <span className={`text-sm flex items-center gap-1 ${msgEmail.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
              <Check size={14} /> {msgEmail}
            </span>
          )}
        </div>
      </div>

      {/* Senha */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <Lock size={15} /> Alterar senha
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
            <input className="input" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={salvarSenha} disabled={savingSenha || !novaSenha || !confirmarSenha} className="btn-primary">
            {savingSenha ? 'Salvando...' : 'Alterar senha'}
          </button>
          {msgSenha && (
            <span className={`text-sm flex items-center gap-1 ${msgSenha.includes('Erro') || msgSenha.includes('não') ? 'text-red-600' : 'text-green-600'}`}>
              {msgSenha}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

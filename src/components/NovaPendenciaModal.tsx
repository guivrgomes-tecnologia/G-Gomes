import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase, Pendencia, Profile, Setor, criarNotificacoes } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'

type FormState = {
  titulo: string; descricao: string; status: Pendencia['status']
  prioridade: Pendencia['prioridade']; para_usuario_ids: string[]
  prazo: string; hora: string; setor_id: string; reuniao_id: string
}
const FORM_INITIAL: FormState = {
  titulo: '', descricao: '', status: 'aberta', prioridade: 'media',
  para_usuario_ids: [], prazo: '', hora: '', setor_id: '', reuniao_id: '',
}

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function todayYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localToISO(dt: string) { return new Date(dt).toISOString() }

const PENDENCIA_COR = '#1e293b'

async function criarEventoDaPendencia(titulo: string, descricao: string | null, prazo: string, hora: string, userId: string, pendenciaId: string, participantesIds: string[] = []) {
  const dataInicio = hora ? localToISO(`${prazo}T${hora}`) : prazo
  let horaFim: string | null = null
  if (hora) {
    const [h, m] = hora.split(':').map(Number)
    const d = new Date(2000, 0, 1, h, m + 1)
    horaFim = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const dataFim = horaFim ? localToISO(`${prazo}T${horaFim}`) : null
  const { data: evento } = await supabase.from('eventos').insert({
    titulo: `📌 ${titulo}`, descricao: descricao || null,
    data_inicio: dataInicio, data_fim: dataFim,
    dia_inteiro: !hora, cor: PENDENCIA_COR, concluido: false, criado_por: userId,
  }).select('id').single()
  if (evento) {
    await supabase.from('pendencias').update({ evento_id: evento.id }).eq('id', pendenciaId)
    // Inclui todos os destinatários como participantes, inclusive o próprio criador
    // quando ele se marcou como destinatário (necessário pra Agenda decidir se o
    // evento deve aparecer pra ele, já que eventos de pendência só aparecem pro
    // criador se ele também for participante).
    if (participantesIds.length > 0) {
      await supabase.from('evento_participantes').insert(participantesIds.map(uid => ({ evento_id: evento.id, usuario_id: uid })))
    }

    const { data: gtok } = await supabase.from('google_tokens').select('usuario_id').eq('usuario_id', userId).single()
    if (gtok) {
      await supabase.functions.invoke('google-calendar-sync', {
        body: {
          action: 'create', user_id: userId,
          evento: {
            id: evento.id, titulo_google: `P - ${titulo}`, descricao: descricao || null,
            data_inicio: dataInicio, data_fim: dataFim, dia_inteiro: !hora,
          },
        },
      })
    }
  }
}

async function salvarParticipantes(pendenciaId: string, ids: string[]) {
  await supabase.from('pendencia_participantes').delete().eq('pendencia_id', pendenciaId)
  if (ids.length > 0) {
    await supabase.from('pendencia_participantes').insert(ids.map(uid => ({ pendencia_id: pendenciaId, usuario_id: uid })))
  }
}


function SeletorUsuarios({ selecionados, equipe, userId, onChange }: {
  selecionados: string[]; equipe: Profile[]; userId: string; onChange: (ids: string[]) => void
}) {
  function toggle(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter(x => x !== id) : [...selecionados, id])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {equipe.map(p => {
        const sel = selecionados.includes(p.id)
        return (
          <button key={p.id} type="button" onClick={() => toggle(p.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm border transition-colors ${sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
            <Avatar nome={p.nome} avatarUrl={p.avatar_url} size={24} />
            {p.nome.split(' ')[0]}{p.id === userId ? ' (eu)' : ''}
          </button>
        )
      })}
    </div>
  )
}

export default function NovaPendenciaModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { user, profile } = useAuth()
  const [equipe, setEquipe] = useState<Profile[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [reunioes, setReunioes] = useState<{ id: string; titulo: string; pasta?: { nome: string } }[]>([])
  const [form, setForm] = useState<FormState>({ ...FORM_INITIAL, prazo: todayYYYYMMDD(), hora: nowHHMM() })
  const [saving, setSaving] = useState(false)
  const [tarefas, setTarefas] = useState<string[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')

  function adicionarTarefaLocal() {
    const texto = novaTarefa.trim()
    if (!texto) return
    setTarefas(t => [...t, texto])
    setNovaTarefa('')
  }
  function removerTarefaLocal(idx: number) {
    setTarefas(t => t.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('setores').select('*').order('nome'),
      supabase.from('reunioes').select('id, titulo, pasta:reuniao_pastas(nome)').order('created_at', { ascending: false }),
    ]).then(([{ data: perfis }, { data: setsData }, { data: reunData }]) => {
      setEquipe(perfis ?? [])
      setSetores(setsData ?? [])
      setReunioes((reunData ?? []) as any)
    })
  }, [])

  async function salvar() {
    if (!form.titulo || form.para_usuario_ids.length === 0) return
    setSaving(true)
    const prazoSalvo = form.prazo ? (form.hora ? localToISO(`${form.prazo}T${form.hora}`) : form.prazo) : null
    const { data: inserted, error } = await supabase.from('pendencias').insert({
      titulo: form.titulo, descricao: form.descricao || null,
      status: form.status, prioridade: form.prioridade,
      de_usuario_id: user!.id, para_usuario_id: form.para_usuario_ids[0],
      setor_id: form.setor_id || null, prazo: prazoSalvo, criado_por: user!.id,
    }).select('id').single()

    if (error) {
      alert('Erro ao salvar pendência: ' + error.message)
      setSaving(false)
      return
    }

    if (inserted) {
      await salvarParticipantes(inserted.id, form.para_usuario_ids)
      if (form.reuniao_id) {
        await supabase.from('reuniao_pendencias').insert({ reuniao_id: form.reuniao_id, pendencia_id: inserted.id })
      }
      await criarNotificacoes(form.para_usuario_ids.filter(id => id !== user!.id).map(uid => ({
        usuario_id: uid, tipo: 'pendencia_nova',
        titulo: `Nova pendência: ${form.titulo}`,
        mensagem: `${profile?.nome ?? 'Alguém'} te marcou em uma pendência`,
        link: `/pendencias?abrir=${inserted.id}`,
      })))
    }

    if (form.prazo && inserted) {
      await criarEventoDaPendencia(form.titulo, form.descricao || null, form.prazo, form.hora, user!.id, inserted.id, form.para_usuario_ids)
    }

    if (inserted && tarefas.length > 0) {
      await supabase.from('pendencia_tarefas').insert(tarefas.map((texto, ordem) => ({ pendencia_id: inserted.id, texto, ordem })))
    }

    setSaving(false)
    onCreated?.()
    onClose()
  }

  const f = form
  const setF = setForm

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Nova Pendência</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input className="input" value={f.titulo} onChange={e => setF(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Enviar relatório mensal" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea className="input resize-none" rows={2} value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Para quem * <span className="text-gray-400 font-normal">(pode selecionar mais de um)</span></label>
            <SeletorUsuarios selecionados={f.para_usuario_ids} equipe={equipe} userId={user!.id} onChange={ids => setF(p => ({ ...p, para_usuario_ids: ids }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
              <select className="input" value={f.prioridade} onChange={e => setF(p => ({ ...p, prioridade: e.target.value as Pendencia['prioridade'] }))}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input" value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value as Pendencia['status'] }))}>
                <option value="aberta">A resolver</option>
                <option value="em_andamento">Em andamento</option>
                <option value="solucao_apresentada">Solução apresentada</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select className="input" value={f.setor_id} onChange={e => setF(p => ({ ...p, setor_id: e.target.value }))}>
                <option value="">Nenhum</option>
                {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" className="input" value={f.prazo} onChange={e => setF(p => ({ ...p, prazo: e.target.value }))} />
            </div>
          </div>
          {f.prazo && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
              {f.hora ? (
                <div className="flex gap-2">
                  <input type="time" className="input flex-1" value={f.hora} onChange={e => setF(p => ({ ...p, hora: e.target.value }))} />
                  <button type="button" onClick={() => setF(p => ({ ...p, hora: '' }))} className="btn-secondary text-xs px-3 whitespace-nowrap">Sem hora definida</button>
                </div>
              ) : (
                <button type="button" onClick={() => setF(p => ({ ...p, hora: nowHHMM() }))} className="input text-left text-gray-400">
                  Sem hora definida — toque para definir
                </button>
              )}
            </div>
          )}
          {f.prazo && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PENDENCIA_COR }} />
              <p className="text-xs text-indigo-600">Esta pendência vai aparecer automaticamente na agenda.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tarefas <span className="text-gray-400 font-normal">(opcional)</span></label>
            {tarefas.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {tarefas.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="flex-1 text-sm text-gray-700">{t}</span>
                    <button type="button" onClick={() => removerTarefaLocal(idx)} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="+ Adicionar tarefa" value={novaTarefa}
                onChange={e => setNovaTarefa(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarTarefaLocal() } }} />
              {novaTarefa.trim() && (
                <button type="button" onClick={adicionarTarefaLocal} className="text-xs text-brand-600 font-medium hover:underline shrink-0 px-2">Adicionar</button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vincular a uma reunião <span className="text-gray-400 font-normal">(opcional)</span></label>
            <select className="input" value={f.reuniao_id} onChange={e => setF(p => ({ ...p, reuniao_id: e.target.value }))}>
              <option value="">Nenhuma</option>
              {reunioes.map(r => <option key={r.id} value={r.id}>{(r.pasta as any)?.nome ? `${(r.pasta as any).nome} · ` : ''}{r.titulo}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={salvar} disabled={saving || !f.titulo || f.para_usuario_ids.length === 0} className="btn-primary flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

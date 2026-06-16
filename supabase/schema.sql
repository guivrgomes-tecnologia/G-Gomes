-- =============================================
-- BRASIL LAR — Schema do Supabase
-- Cole este SQL no SQL Editor do Supabase
-- =============================================

-- 1. PROFILES (extensão da tabela auth.users)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text not null,
  cargo      text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Qualquer usuário autenticado pode ver os perfis (para selects de responsável/equipe)
create policy "profiles: leitura por autenticados"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Cada usuário edita apenas seu próprio perfil
create policy "profiles: edição própria"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger: cria perfil automaticamente ao criar usuário no Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. EVENTOS (Agenda)
create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,
  data_inicio timestamptz not null,
  data_fim    timestamptz,
  dia_inteiro boolean default true,
  cor         text default '#0ea5e9',
  criado_por  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz default now()
);

alter table public.eventos enable row level security;

-- Todos os autenticados veem todos os eventos
create policy "eventos: leitura"
  on public.eventos for select
  using (auth.role() = 'authenticated');

-- Autenticados podem criar
create policy "eventos: inserção"
  on public.eventos for insert
  with check (auth.role() = 'authenticated');

-- Só quem criou pode atualizar/deletar
create policy "eventos: atualização própria"
  on public.eventos for update
  using (auth.uid() = criado_por);

create policy "eventos: deleção própria"
  on public.eventos for delete
  using (auth.uid() = criado_por);


-- 3. PROCESSOS
create table public.processos (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  categoria       text default 'Geral',
  status          text not null default 'pendente'
                    check (status in ('pendente','em_andamento','concluido','cancelado')),
  prioridade      text not null default 'media'
                    check (prioridade in ('baixa','media','alta')),
  responsavel_id  uuid references public.profiles(id) on delete set null,
  prazo           date,
  criado_por      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.processos enable row level security;

create policy "processos: leitura"
  on public.processos for select
  using (auth.role() = 'authenticated');

create policy "processos: inserção"
  on public.processos for insert
  with check (auth.role() = 'authenticated');

create policy "processos: atualização"
  on public.processos for update
  using (auth.role() = 'authenticated');

create policy "processos: deleção própria"
  on public.processos for delete
  using (auth.uid() = criado_por);


-- 4. PENDÊNCIAS
create table public.pendencias (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  descricao        text,
  status           text not null default 'aberta'
                     check (status in ('aberta','em_andamento','resolvida')),
  prioridade       text not null default 'media'
                     check (prioridade in ('baixa','media','alta')),
  de_usuario_id    uuid not null references public.profiles(id) on delete cascade,
  para_usuario_id  uuid not null references public.profiles(id) on delete cascade,
  prazo            date,
  criado_por       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.pendencias enable row level security;

-- Usuário vê as pendências que criou OU que são para ele
create policy "pendencias: leitura"
  on public.pendencias for select
  using (
    auth.uid() = de_usuario_id or
    auth.uid() = para_usuario_id
  );

create policy "pendencias: inserção"
  on public.pendencias for insert
  with check (auth.uid() = de_usuario_id);

create policy "pendencias: atualização"
  on public.pendencias for update
  using (
    auth.uid() = de_usuario_id or
    auth.uid() = para_usuario_id
  );

create policy "pendencias: deleção própria"
  on public.pendencias for delete
  using (auth.uid() = criado_por);

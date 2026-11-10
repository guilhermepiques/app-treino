-- App Treino: banco na nuvem (Supabase)
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- Ideia: o app continua guardando tudo no celular. A nuvem guarda uma cópia, uma linha por registro
-- (exercício, ficha, treino, série), com o registro inteiro em JSON.
-- - Cada pessoa só lê e grava as próprias linhas (regras RLS abaixo).
-- - Nada é apagado de verdade: excluir vira deleted = true (assim a exclusão chega nos outros aparelhos).
-- - Se dois aparelhos mexerem no mesmo registro, vale a alteração mais recente (updated_at).

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,               -- quando foi alterado no aparelho (ms)
  deleted boolean not null default false,
  server_at timestamptz not null default now(), -- quando chegou na nuvem
  primary key (user_id, collection, id)
);

create index if not exists records_user_server_at on public.records (user_id, server_at);

alter table public.records enable row level security;

drop policy if exists "ler os proprios" on public.records;
drop policy if exists "criar os proprios" on public.records;
drop policy if exists "alterar os proprios" on public.records;

create policy "ler os proprios" on public.records
  for select to authenticated using (user_id = (select auth.uid()));

create policy "criar os proprios" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "alterar os proprios" on public.records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Sem regra de delete: ninguém apaga linhas pelo app.

-- Carimba a hora de chegada e impede que uma versão mais velha sobrescreva uma mais nova.
create or replace function public.records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_guard on public.records;
create trigger records_guard
  before insert or update on public.records
  for each row execute function public.records_guard();

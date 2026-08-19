-- =========================================================
-- RastreConcreto - Fase 1
-- handle_new_user(): cria o profile logo apos o signup no Supabase Auth.
-- Rodar DEPOIS de db/schemas.sql (depende da tabela public.profiles).
-- Ver docs/FUNCTIONS.md > handle_new_user().
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_role text;
begin
  -- Nome vem dos metadados do signup; sem eles, usa a parte local do e-mail
  -- para nunca violar o NOT NULL de profiles.full_name.
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Sem nome'
  );

  -- Papel so e aceito dos metadados se for um dos valores validos; caso
  -- contrario cai no default 'field_tech'. O papel EFETIVO de trabalho vem de
  -- site_members.site_role, definido pelo gestor por obra.
  v_role := coalesce(new.raw_user_meta_data ->> 'role', '');
  if v_role not in ('receiving_tech', 'slab_tech', 'field_tech', 'production_manager') then
    v_role := 'field_tech';
  end if;

  insert into public.profiles (id, full_name, email, role, phone, is_active)
  values (
    new.id,
    v_full_name,
    coalesce(new.email, ''),
    v_role,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

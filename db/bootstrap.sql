-- =========================================================
-- RastreConcreto - bootstrap da primeira obra (rodar UMA vez)
--
-- Por que existe: a policy `sites_insert` so deixa criar obra quem ja e
-- gestor de producao, e `handle_new_user()` cria todo mundo como
-- 'field_tech'. Entao o primeiro gestor precisa ser promovido aqui, pelo SQL
-- Editor do Supabase, antes de a plataforma se sustentar sozinha.
--
-- Como usar:
--   1. Crie o usuario do gestor pelo /login do app (ou em Authentication >
--      Users no painel do Supabase).
--   2. Troque os valores do bloco abaixo e rode o script inteiro.
--   3. Entre no app com esse usuario: a obra ja aparece no seletor.
-- =========================================================

do $$
declare
  -- >>> TROQUE ESTES TRES VALORES <<<
  v_manager_email  text := 'gestor@suaempresa.com.br';
  v_site_name      text := 'Obra Exemplo';
  v_site_code      text := 'OBRA-01';

  v_profile_id uuid;
  v_site_id    uuid;
begin
  select id into v_profile_id
  from public.profiles
  where lower(email) = lower(v_manager_email);

  if v_profile_id is null then
    raise exception
      'Nenhum profile com o e-mail %. Faca o cadastro pelo /login antes de rodar o bootstrap.',
      v_manager_email;
  end if;

  -- 1. promove o profile a gestor de producao
  update public.profiles
     set role = 'production_manager', is_active = true
   where id = v_profile_id;

  -- 2. cria a obra (idempotente pelo nome)
  select id into v_site_id from public.sites where name = v_site_name;

  if v_site_id is null then
    insert into public.sites (name, code, created_by)
    values (v_site_name, v_site_code, v_profile_id)
    returning id into v_site_id;
  end if;

  -- 3. vincula o gestor a obra com o papel efetivo de gestor de producao
  insert into public.site_members (site_id, profile_id, site_role)
  values (v_site_id, v_profile_id, 'production_manager')
  on conflict (site_id, profile_id)
  do update set site_role = excluded.site_role;

  raise notice 'Obra % (%) pronta para o gestor %.', v_site_name, v_site_id, v_manager_email;
end;
$$;

-- Depois disso, o gestor cadastra os demais membros da equipe pelo app:
--   insert into public.site_members (site_id, profile_id, site_role)
--   values ('<site_id>', '<profile_id>', 'receiving_tech');  -- ou 'slab_tech'

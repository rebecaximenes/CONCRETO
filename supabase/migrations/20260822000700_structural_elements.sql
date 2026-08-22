-- =========================================================
-- RastreConcreto - Elementos estruturais: previsto x realizado
--
-- Modelado a partir do controle que a obra faz hoje no Excel
-- (Controle.SALSA.Concreto), abas PROJETO, ACOMPANHAMENTO e CONCRETAGENS:
--
--   VOLUME PREVISTO (m³)  +  PERDA PREVISTA (%)
--        = PERDA PREVISTA (m³)  e  MÁXIMO A SER UTILIZADO (m³)
--   REALIZADO (m³) = soma do volume dos caminhoes recebidos
--   SALDO = realizado - previsto      (mesmo sinal do Excel: negativo = falta)
--
-- Os dois volumes calculados NUNCA sao digitados — saem da conta, como as
-- formulas da planilha.
-- =========================================================

create table if not exists public.structural_elements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,

  -- Colunas espelhando a aba ACOMPANHAMENTO
  location text not null,                    -- LOCAL: FUNDAÇÃO, CONTENÇÃO, ESTRUTURA
  floor_level text,                          -- PAVIMENTO: SUBSOLO, TÉRREO...
  name text not null,                        -- LOCAL DE APLICAÇÃO: ESTACAS DE FUNDAÇÃO
  concrete_spec text,                        -- TIPO DE CONCRETO: "Fck 30 - Slump 24cm"
  placement_method text not null default 'bombeado'
    check (placement_method in ('bombeado','convencional')),
  drawing_sheet text,                        -- Nº FOLHA + SETOR: SAL FUN LOC 002 R06
  drawing_revision text,                     -- REVISÃO: 6

  planned_volume_m3 numeric(10,2) not null check (planned_volume_m3 >= 0),
  waste_percent numeric(6,3) not null default 0 check (waste_percent >= 0),

  -- PERDA PREVISTA (m³)
  planned_waste_m3 numeric(10,2)
    generated always as (round(planned_volume_m3 * waste_percent / 100, 2)) stored,
  -- MÁXIMO A SER UTILIZADO (m³) = previsto + perda
  max_volume_m3 numeric(10,2)
    generated always as (round(planned_volume_m3 * (1 + waste_percent / 100), 2)) stored,

  status text not null default 'nao_iniciado'
    check (status in ('nao_iniciado','andamento','concluido')),

  drawing_path text,                         -- planta de indicação (PDF) no Storage
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_structural_elements_site on public.structural_elements (site_id);
create index if not exists idx_structural_elements_status on public.structural_elements (status);

drop trigger if exists trg_structural_elements_updated_at on public.structural_elements;
create trigger trg_structural_elements_updated_at
  before update on public.structural_elements
  for each row execute function public.set_updated_at();

-- Elemento de cada concretagem (aba CONCRETAGENS: ELEMENTO ESTRUTURAL).
alter table public.concretings
  add column if not exists structural_element_id uuid
    references public.structural_elements(id) on delete set null;
create index if not exists idx_concretings_element
  on public.concretings (structural_element_id);

-- Volume por caminhao (aba CONCRETAGENS: VOLUME M³) e a cor com que ele foi
-- marcado na planta de indicacao — uma cor por caminhao, como voces fazem.
alter table public.truck_receipts
  add column if not exists volume_m3 numeric(6,2)
    check (volume_m3 is null or volume_m3 > 0),
  add column if not exists marking_color text;

comment on column public.truck_receipts.volume_m3 is
  'Volume entregue pelo caminhao em m³, conforme a nota fiscal.';
comment on column public.truck_receipts.marking_color is
  'Cor da area marcada na planta de indicacao para este caminhao (#RRGGBB).';

-- ---------------------------------------------------------
-- RLS: membro da obra le; gestor de producao cadastra e edita.
-- ---------------------------------------------------------
alter table public.structural_elements enable row level security;

drop policy if exists structural_elements_select on public.structural_elements;
create policy structural_elements_select on public.structural_elements
  for select to authenticated using (public.is_site_member(site_id));

drop policy if exists structural_elements_insert on public.structural_elements;
create policy structural_elements_insert on public.structural_elements
  for insert to authenticated with check (public.is_production_manager(site_id));

drop policy if exists structural_elements_update on public.structural_elements;
create policy structural_elements_update on public.structural_elements
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

drop policy if exists structural_elements_delete on public.structural_elements;
create policy structural_elements_delete on public.structural_elements
  for delete to authenticated using (public.is_production_manager(site_id));

-- ---------------------------------------------------------
-- A aba ACOMPANHAMENTO virada consulta: previsto x realizado por elemento.
-- security_invoker para a view respeitar a RLS de quem consulta.
-- ---------------------------------------------------------
create or replace view public.element_volume_progress
with (security_invoker = true) as
select
  e.id                          as structural_element_id,
  e.site_id,
  e.location,
  e.floor_level,
  e.name,
  e.concrete_spec,
  e.placement_method,
  e.status,
  e.planned_volume_m3,
  e.waste_percent,
  e.planned_waste_m3,
  e.max_volume_m3,
  coalesce(sum(t.volume_m3), 0)::numeric(12,2)  as realized_volume_m3,
  -- Saldo contra o previsto (negativo = ainda falta concretar)
  round(coalesce(sum(t.volume_m3), 0) - e.planned_volume_m3, 2)  as balance_vs_planned_m3,
  -- Saldo contra o maximo (positivo = estourou o previsto com perda)
  round(coalesce(sum(t.volume_m3), 0) - e.max_volume_m3, 2)      as balance_vs_max_m3,
  -- Perda real: quanto o consumo passou do volume de projeto, em %
  case when e.planned_volume_m3 > 0
       then round((coalesce(sum(t.volume_m3), 0) / e.planned_volume_m3 - 1) * 100, 2)
       else null end                                             as actual_waste_percent,
  -- Avanco sobre o maximo a ser utilizado (0 a 1)
  case when e.max_volume_m3 > 0
       then round(coalesce(sum(t.volume_m3), 0) / e.max_volume_m3, 4)
       else null end                                             as progress_ratio,
  count(distinct c.id)          as concretings_count,
  count(t.id)                   as trucks_count,
  max(c.concreting_date)        as last_concreting_date
from public.structural_elements e
left join public.concretings c on c.structural_element_id = e.id
left join public.truck_receipts t on t.concreting_id = c.id
group by e.id;

-- Bucket privado das plantas de indicacao.
insert into storage.buckets (id, name, public)
values ('element-drawings', 'element-drawings', false)
on conflict (id) do nothing;

drop policy if exists element_drawings_select on storage.objects;
create policy element_drawings_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'element-drawings'
    and public.is_site_member(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid end
    )
  );

drop policy if exists element_drawings_write on storage.objects;
create policy element_drawings_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'element-drawings'
    and public.is_production_manager(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid end
    )
  );

drop policy if exists element_drawings_delete on storage.objects;
create policy element_drawings_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'element-drawings'
    and public.is_production_manager(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid end
    )
  );

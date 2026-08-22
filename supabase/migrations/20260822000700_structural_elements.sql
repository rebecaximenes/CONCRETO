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

  -- Guarda a precisao do projeto (a planilha traz 1310,6410391...).
  planned_volume_m3 numeric(12,4) not null check (planned_volume_m3 >= 0),
  waste_percent numeric(6,3) not null default 0 check (waste_percent >= 0),

  -- PERDA PREVISTA (m³) — a planilha arredonda em 1 casa: ROUND(F*G;1)
  planned_waste_m3 numeric(12,4)
    generated always as (round(planned_volume_m3 * waste_percent / 100, 1)) stored,
  -- MÁXIMO A SER UTILIZADO = previsto + perda arredondada (I = F + H)
  max_volume_m3 numeric(12,4)
    generated always as (
      planned_volume_m3 + round(planned_volume_m3 * waste_percent / 100, 1)
    ) stored,

  -- CICLO FINALIZADO da planilha: 'concluido' equivale a "SIM".
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
with realizado as (
  select c.structural_element_id,
         coalesce(sum(t.volume_m3), 0)::numeric(12,4) as volume_aplicado,
         count(distinct c.id)   as concretings_count,
         count(t.id)            as trucks_count,
         max(c.concreting_date) as last_concreting_date
    from public.concretings c
    left join public.truck_receipts t on t.concreting_id = c.id
   where c.structural_element_id is not null
   group by c.structural_element_id
)
select
  e.id                          as structural_element_id,
  e.site_id,
  e.location,
  e.floor_level,
  e.name,
  e.concrete_spec,
  e.placement_method,
  e.status,
  e.planned_volume_m3,                                   -- F: VOLUME PREVISTO
  e.waste_percent,                                       -- G: PERDA PREVISTA (%)
  e.planned_waste_m3,                                    -- H: PERDA PREVISTA (m³)
  e.max_volume_m3,                                       -- I: MÁXIMO A SER UTILIZADO
  coalesce(r.volume_aplicado, 0)                as realized_volume_m3,   -- K
  -- M: PERDA REALIZADA (m³) = aplicado - previsto, so depois de comecar
  case when coalesce(r.volume_aplicado, 0) = 0 then null
       else round(r.volume_aplicado - e.planned_volume_m3, 4) end
                                                as actual_waste_m3,
  -- N: PERDA (%) = M / previsto
  case when coalesce(r.volume_aplicado, 0) = 0 or e.planned_volume_m3 = 0 then null
       else round((r.volume_aplicado - e.planned_volume_m3) / e.planned_volume_m3 * 100, 2) end
                                                as actual_waste_percent,
  -- O: VOLUME TENDÊNCIA — se estourou o maximo, o proprio aplicado; se o ciclo
  -- terminou, o aplicado; senao, projeta o maximo previsto.
  case when e.max_volume_m3 < coalesce(r.volume_aplicado, 0) then r.volume_aplicado
       when e.status = 'concluido' then coalesce(r.volume_aplicado, 0)
       else e.max_volume_m3 end                 as trend_volume_m3,
  -- PERDA REAL (%) do RESUMO = (tendência - previsto) / previsto
  case when e.planned_volume_m3 = 0 then null
       else round((
         (case when e.max_volume_m3 < coalesce(r.volume_aplicado, 0) then r.volume_aplicado
               when e.status = 'concluido' then coalesce(r.volume_aplicado, 0)
               else e.max_volume_m3 end) - e.planned_volume_m3
       ) / e.planned_volume_m3 * 100, 2) end    as trend_waste_percent,
  -- Avanco sobre o maximo a ser utilizado (0 a 1)
  case when e.max_volume_m3 > 0
       then round(coalesce(r.volume_aplicado, 0) / e.max_volume_m3, 4)
       else null end                            as progress_ratio,
  coalesce(r.concretings_count, 0)              as concretings_count,
  coalesce(r.trucks_count, 0)                   as trucks_count,
  r.last_concreting_date
from public.structural_elements e
left join realizado r on r.structural_element_id = e.id;

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

-- ---------------------------------------------------------
-- Marcacao colorida na planta de indicacao.
--
-- Hoje a equipe imprime a planta e pinta a area concretada, anotando na
-- legenda a DATA e a NOTA FISCAL de cada cor — uma cor por caminhao. Aqui a
-- marcacao vira dado: cada area e um poligono ligado ao recebimento.
--
-- Os pontos ficam NORMALIZADOS (0 a 1) em relacao a pagina, entao a marcacao
-- aparece no lugar certo em qualquer zoom, tela ou impressao.
-- ---------------------------------------------------------
create table if not exists public.element_drawing_marks (
  id uuid primary key default gen_random_uuid(),
  structural_element_id uuid not null
    references public.structural_elements(id) on delete cascade,
  -- De qual caminhao e esta area (a cor sai do recebimento).
  truck_receipt_id uuid references public.truck_receipts(id) on delete set null,
  page_number int not null default 1 check (page_number > 0),
  -- [{"x":0.12,"y":0.44}, ...] — minimo de 3 pontos para fechar a area
  points jsonb not null check (jsonb_array_length(points) >= 3),
  color text not null,
  label text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drawing_marks_element
  on public.element_drawing_marks (structural_element_id);
create index if not exists idx_drawing_marks_receipt
  on public.element_drawing_marks (truck_receipt_id);

drop trigger if exists trg_drawing_marks_updated_at on public.element_drawing_marks;
create trigger trg_drawing_marks_updated_at
  before update on public.element_drawing_marks
  for each row execute function public.set_updated_at();

alter table public.element_drawing_marks enable row level security;

drop policy if exists drawing_marks_select on public.element_drawing_marks;
create policy drawing_marks_select on public.element_drawing_marks
  for select to authenticated
  using (
    exists (
      select 1 from public.structural_elements e
      where e.id = structural_element_id and public.is_site_member(e.site_id)
    )
  );

-- Quem marca e o tecnico em campo, entao qualquer membro da obra insere.
drop policy if exists drawing_marks_insert on public.element_drawing_marks;
create policy drawing_marks_insert on public.element_drawing_marks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.structural_elements e
      where e.id = structural_element_id and public.is_site_member(e.site_id)
    )
  );

drop policy if exists drawing_marks_update on public.element_drawing_marks;
create policy drawing_marks_update on public.element_drawing_marks
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists drawing_marks_delete on public.element_drawing_marks;
create policy drawing_marks_delete on public.element_drawing_marks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.structural_elements e
      where e.id = structural_element_id and public.is_production_manager(e.site_id)
    )
  );

-- Legenda da planta, pronta como voces preenchem hoje: DATA | NOTA FISCAL | COR.
create or replace view public.element_drawing_legend
with (security_invoker = true) as
select
  m.structural_element_id,
  m.id                                as mark_id,
  m.page_number,
  m.color,
  m.label,
  t.id                                as truck_receipt_id,
  t.invoice_number,
  t.truck_number,
  t.volume_m3,
  coalesce(t.discharge_start_at, t.created_at)::date as marked_date
from public.element_drawing_marks m
left join public.truck_receipts t on t.id = m.truck_receipt_id;

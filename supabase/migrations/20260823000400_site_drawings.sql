-- =========================================================
-- RastreConcreto - a planta e da OBRA, nao da peca
--
-- Eu tinha amarrado a planta a peca estrutural: um arquivo por peca, no
-- campo structural_elements.drawing_path. A obra descreveu outro uso, que e
-- o certo:
--
--   "inserir na plataforma varias plantas, e quando a gente fosse registrar
--    o lancamento, a gente puxava a planta que queria; as plantas terao as
--    nomenclaturas. E quando eu fosse fazer outro registro e puxasse a mesma
--    planta, ela teria que aparecer ja com a atualizacao do ultimo lancamento"
--
-- Ou seja: a planta e um documento da obra, com nome proprio ("ESTACAS DE
-- FUNDAÇÃO 60cm TRECHO 1"), reaberto a cada lancamento e sempre acumulando
-- as marcacoes anteriores. Uma planta atende varios dias e varias
-- concretagens; nao existe "a planta daquela peca".
--
-- As marcacoes passam a pertencer a PLANTA. A peca e o previsto x realizado
-- continuam alcancaveis pelo caminhao:
--   drawing_marks -> truck_receipts -> concretings -> structural_elements
-- =========================================================

create table if not exists public.site_drawings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,

  -- A nomenclatura que a obra ja usa no carimbo da prancha.
  name text not null,
  sheet_code text,                          -- "SAL FUN LOC 002"
  revision text,                            -- "R06"

  file_path text not null,                  -- caminho no bucket element-drawings
  page_count int not null default 1 check (page_count > 0),

  -- Vinculo opcional com a peca, so para filtrar a lista. Uma planta pode
  -- cobrir mais de uma peca, entao isto nunca e obrigatorio.
  structural_element_id uuid
    references public.structural_elements(id) on delete set null,

  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duas plantas com o mesmo nome na mesma obra tornariam a escolha no
-- lancamento uma adivinhacao.
create unique index if not exists idx_site_drawings_site_name
  on public.site_drawings (site_id, lower(name));
create index if not exists idx_site_drawings_site on public.site_drawings (site_id);
create index if not exists idx_site_drawings_element
  on public.site_drawings (structural_element_id);

drop trigger if exists trg_site_drawings_updated_at on public.site_drawings;
create trigger trg_site_drawings_updated_at
  before update on public.site_drawings
  for each row execute function public.set_updated_at();

alter table public.site_drawings enable row level security;

drop policy if exists site_drawings_select on public.site_drawings;
create policy site_drawings_select on public.site_drawings
  for select to authenticated using (public.is_site_member(site_id));

drop policy if exists site_drawings_insert on public.site_drawings;
create policy site_drawings_insert on public.site_drawings
  for insert to authenticated with check (public.is_production_manager(site_id));

drop policy if exists site_drawings_update on public.site_drawings;
create policy site_drawings_update on public.site_drawings
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

drop policy if exists site_drawings_delete on public.site_drawings;
create policy site_drawings_delete on public.site_drawings
  for delete to authenticated using (public.is_production_manager(site_id));

-- ---------------------------------------------------------
-- As marcacoes passam a pertencer a planta.
-- ---------------------------------------------------------
alter table public.element_drawing_marks
  add column if not exists drawing_id uuid
    references public.site_drawings(id) on delete cascade;

-- Nao ha marcacao gravada em lugar nenhum ainda (conferido antes de migrar),
-- entao a coluna ja nasce obrigatoria e a antiga sai.
delete from public.element_drawing_marks where drawing_id is null;

-- A view e as policies antigas leem structural_element_id e seguram a coluna.
-- Saem antes; as novas, que olham para a planta, sao criadas mais abaixo.
drop view if exists public.element_drawing_legend;
drop policy if exists drawing_marks_select on public.element_drawing_marks;
drop policy if exists drawing_marks_insert on public.element_drawing_marks;
drop policy if exists drawing_marks_update on public.element_drawing_marks;
drop policy if exists drawing_marks_delete on public.element_drawing_marks;

alter table public.element_drawing_marks
  alter column drawing_id set not null;

alter table public.element_drawing_marks
  drop column if exists structural_element_id;

alter table public.structural_elements drop column if exists drawing_path;

alter table public.element_drawing_marks rename to drawing_marks;

create index if not exists idx_drawing_marks_drawing
  on public.drawing_marks (drawing_id);

-- As policies precisam olhar para a planta agora, e nao mais para a peca.
drop policy if exists drawing_marks_select on public.drawing_marks;
create policy drawing_marks_select on public.drawing_marks
  for select to authenticated
  using (
    exists (
      select 1 from public.site_drawings d
      where d.id = drawing_id and public.is_site_member(d.site_id)
    )
  );

-- Quem marca e o tecnico em campo: qualquer membro da obra insere.
drop policy if exists drawing_marks_insert on public.drawing_marks;
create policy drawing_marks_insert on public.drawing_marks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.site_drawings d
      where d.id = drawing_id and public.is_site_member(d.site_id)
    )
  );

drop policy if exists drawing_marks_update on public.drawing_marks;
create policy drawing_marks_update on public.drawing_marks
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists drawing_marks_delete on public.drawing_marks;
create policy drawing_marks_delete on public.drawing_marks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.site_drawings d
      where d.id = drawing_id and public.is_production_manager(d.site_id)
    )
  );

-- ---------------------------------------------------------
-- A legenda da planta: e o que a obra escreve a mao ao lado do desenho.
-- Reabrir a planta mostra TODAS as marcacoes ja feitas nela, de qualquer
-- dia e de qualquer concretagem — que e o pedido do "aparecer ja com a
-- atualizacao do ultimo lancamento".
-- ---------------------------------------------------------
create view public.drawing_legend
with (security_invoker = true) as
select
  m.drawing_id,
  m.id                                as mark_id,
  m.page_number,
  m.shape,
  m.points,
  m.radius,
  m.color,
  m.label,
  t.id                                as truck_receipt_id,
  t.invoice_number,
  t.truck_number,
  t.volume_m3,
  coalesce(t.discharge_start_at, t.created_at)::date as marked_date,
  c.id                                as concreting_id,
  c.concreting_date,
  e.id                                as structural_element_id,
  e.name                              as structural_element_name
from public.drawing_marks m
left join public.truck_receipts t   on t.id = m.truck_receipt_id
left join public.concretings c      on c.id = t.concreting_id
left join public.structural_elements e on e.id = c.structural_element_id;

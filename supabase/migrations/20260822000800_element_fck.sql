-- =========================================================
-- RastreConcreto - o fck e da peca estrutural
--
-- Cada peca estrutural tem o seu fck de projeto ("Fck 30 - Slump 24cm" na
-- aba PROJETO). Antes o fck vivia num cadastro separado de tracos, o que
-- obrigava a manter a mesma informacao em dois lugares. Agora ele fica na
-- propria peca e o recebimento do caminhao compara a nota fiscal com ela.
-- =========================================================

alter table public.structural_elements
  add column if not exists fck_required numeric(6,2)
    check (fck_required is null or fck_required > 0),
  add column if not exists slump_target numeric(5,2)
    check (slump_target is null or slump_target > 0),
  add column if not exists supplier text;

comment on column public.structural_elements.fck_required is
  'fck de projeto da peca, em MPa. Conferido contra a nota fiscal no recebimento.';
comment on column public.structural_elements.slump_target is
  'Slump de projeto da peca, em cm.';

-- Backfill a partir do texto da planilha: "Fck 30 - Slump 24cm".
update public.structural_elements
   set fck_required = coalesce(
         fck_required,
         nullif(substring(concrete_spec from '[Ff]ck[^0-9]*([0-9]+(?:[.,][0-9]+)?)'), '')::numeric
       ),
       slump_target = coalesce(
         slump_target,
         nullif(substring(concrete_spec from '[Ss]lump[^0-9]*([0-9]+(?:[.,][0-9]+)?)'), '')::numeric
       )
 where concrete_spec is not null;

-- A peca da concretagem passa a ser a referencia do fck no recebimento.
-- Recriada do zero porque create or replace so aceita colunas novas no fim.
drop view if exists public.element_volume_progress;
create view public.element_volume_progress
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
  e.fck_required,
  e.slump_target,
  e.placement_method,
  e.status,
  e.planned_volume_m3,                                   -- F: VOLUME PREVISTO
  e.waste_percent,                                       -- G: PERDA PREVISTA (%)
  e.planned_waste_m3,                                    -- H: PERDA PREVISTA (m³)
  e.max_volume_m3,                                       -- I: MÁXIMO A SER UTILIZADO
  coalesce(r.volume_aplicado, 0)                as realized_volume_m3,   -- K
  case when coalesce(r.volume_aplicado, 0) = 0 then null
       else round(r.volume_aplicado - e.planned_volume_m3, 4) end
                                                as actual_waste_m3,      -- M
  case when coalesce(r.volume_aplicado, 0) = 0 or e.planned_volume_m3 = 0 then null
       else round((r.volume_aplicado - e.planned_volume_m3) / e.planned_volume_m3 * 100, 2) end
                                                as actual_waste_percent, -- N
  case when e.max_volume_m3 < coalesce(r.volume_aplicado, 0) then r.volume_aplicado
       when e.status = 'concluido' then coalesce(r.volume_aplicado, 0)
       else e.max_volume_m3 end                 as trend_volume_m3,      -- O
  case when e.planned_volume_m3 = 0 then null
       else round((
         (case when e.max_volume_m3 < coalesce(r.volume_aplicado, 0) then r.volume_aplicado
               when e.status = 'concluido' then coalesce(r.volume_aplicado, 0)
               else e.max_volume_m3 end) - e.planned_volume_m3
       ) / e.planned_volume_m3 * 100, 2) end    as trend_waste_percent,
  case when e.max_volume_m3 > 0
       then round(coalesce(r.volume_aplicado, 0) / e.max_volume_m3, 4)
       else null end                            as progress_ratio,
  coalesce(r.concretings_count, 0)              as concretings_count,
  coalesce(r.trucks_count, 0)                   as trucks_count,
  r.last_concreting_date
from public.structural_elements e
left join realizado r on r.structural_element_id = e.id;

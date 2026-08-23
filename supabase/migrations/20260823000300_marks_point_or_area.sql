-- =========================================================
-- RastreConcreto - a marcacao pode ser um ponto ou uma area
--
-- Eu tinha modelado a marcacao so como poligono (minimo 3 pontos). A planta
-- real da obra mostra outra coisa: em "ESTACAS DE FUNDAÇÃO φ 60cm TRECHO 1"
-- cada estaca e um circulo pequeno (E346, E347, E348...) e a equipe PINTA O
-- CIRCULO com a cor do caminhao. Poligono nao serve para isso.
--
-- Uma laje ou um bloco, ao contrario, sao area. Entao a marcacao passa a ter
-- forma: 'ponto' para a estaca, 'area' para o trecho de laje.
--
-- Os pontos continuam normalizados de 0 a 1 em relacao a pagina, para a
-- marcacao cair no lugar certo em qualquer zoom, no celular e na impressao.
-- =========================================================

alter table public.element_drawing_marks
  add column if not exists shape text not null default 'ponto',
  -- Raio do circulo, tambem normalizado (fracao da largura da pagina).
  -- So vale para 'ponto'; a area e desenhada pelos proprios pontos.
  add column if not exists radius numeric(6,5) not null default 0.006;

-- A regra antiga exigia 3 pontos sempre; agora depende da forma.
alter table public.element_drawing_marks
  drop constraint if exists element_drawing_marks_points_check;

alter table public.element_drawing_marks
  drop constraint if exists element_drawing_marks_shape_check;
alter table public.element_drawing_marks
  add constraint element_drawing_marks_shape_check
  check (shape in ('ponto', 'area'));

alter table public.element_drawing_marks
  drop constraint if exists element_drawing_marks_shape_points_check;
alter table public.element_drawing_marks
  add constraint element_drawing_marks_shape_points_check
  check (
    case shape
      when 'ponto' then jsonb_array_length(points) = 1
      when 'area'  then jsonb_array_length(points) >= 3
    end
  );

alter table public.element_drawing_marks
  drop constraint if exists element_drawing_marks_radius_check;
alter table public.element_drawing_marks
  add constraint element_drawing_marks_radius_check
  check (radius > 0 and radius <= 0.2);

comment on column public.element_drawing_marks.shape is
  'ponto = uma estaca marcada; area = trecho de laje ou bloco.';
comment on column public.element_drawing_marks.label is
  'Identificacao do trecho como a obra escreve: "E346", "Bloco B12".';

-- A legenda da planta, no formato que a obra ja imprime ao lado do desenho:
-- COR | DATA | NOTA FISCAL. Acrescenta a forma e o rotulo do trecho.
-- Recriada do zero: create or replace so aceita coluna nova no fim.
drop view if exists public.element_drawing_legend;
create view public.element_drawing_legend
with (security_invoker = true) as
select
  m.structural_element_id,
  m.id                                as mark_id,
  m.page_number,
  m.shape,
  m.color,
  m.label,
  t.id                                as truck_receipt_id,
  t.invoice_number,
  t.truck_number,
  t.volume_m3,
  coalesce(t.discharge_start_at, t.created_at)::date as marked_date
from public.element_drawing_marks m
left join public.truck_receipts t on t.id = m.truck_receipt_id;

-- =========================================================
-- RastreConcreto - uma peca so
--
-- Existiam dois cadastros quase iguais: `pieces` (da primeira fase, antes de
-- conhecermos a planilha da obra) e `structural_elements` (a aba PROJETO).
-- Os dois guardavam o fck, com nomes indistinguiveis na tela — "Peças" e
-- "Peças estruturais" — e quem usa o site nao tinha como saber qual era qual.
--
-- Fica so a peca estrutural. O "onde exatamente" nao se perde: quem responde
-- isso e a marcacao colorida na planta (element_drawing_marks), que e o
-- controle que a obra ja faz no papel.
--
-- Nenhuma coluna nova de vinculo e necessaria: o lancamento pertence a uma
-- concretagem, e a concretagem ja aponta para a peca estrutural.
--   placement_records -> concretings -> structural_elements
-- =========================================================

-- A peca especial dispara corpo de prova extra e temperatura obrigatoria.
-- E a unica informacao de `pieces` que nao existia na peca estrutural.
alter table public.structural_elements
  add column if not exists is_special boolean not null default false;

comment on column public.structural_elements.is_special is
  'Peca especial: exige temperatura no recebimento e corpos de prova extras.';

create index if not exists idx_structural_elements_is_special
  on public.structural_elements (is_special) where is_special;

-- Solta os dois vinculos com a tabela antiga.
alter table public.placement_records drop column if exists piece_id;
alter table public.strength_results  drop column if exists piece_id;

drop table if exists public.pieces cascade;
